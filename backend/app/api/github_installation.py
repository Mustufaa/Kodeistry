from datetime import datetime, timedelta, timezone
import logging
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.github.auth import delete_github_app_installation, get_github_app_installation
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.user import User
from app.schemas.github_installation import GitHubInstallationResponse, GitHubSyncResponse
from app.services.repository_service import (
    RepositorySyncSummary,
    sync_installation_repositories,
)

router = APIRouter(prefix="/api/tenants", tags=["GitHub Installations"])
logger = logging.getLogger(__name__)


def build_github_app_install_url(state: str) -> str:
    app_slug = settings.GITHUB_APP_SLUG.strip()
    if not app_slug:
        raise ValueError("GITHUB_APP_SLUG is not configured.")
    return f"https://github.com/apps/{app_slug}/installations/new?{urlencode({'state': state})}"


def create_installation_state(tenant_id: int, user: User) -> str:
    return jwt.encode(
        {
            "purpose": "github_installation",
            "tenant_id": tenant_id,
            "user_id": user.id,
            "nonce": secrets.token_urlsafe(32),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def matching_personal_installation(
    installations: list[dict],
    user: User,
) -> dict | None:
    if user.github_id is None:
        return None
    for installation in installations:
        account = installation.get('account') or {}
        if (
            account.get('type') == 'User'
            and account.get('id') == user.github_id
            and not installation.get('suspended_at')
        ):
            return installation
    return None


async def get_tenant_membership(db: AsyncSession, tenant_id: int, user: User) -> TenantMember:
    if await db.scalar(select(Tenant.id).where(Tenant.id == tenant_id)) is None:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    membership = await db.scalar(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == user.id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=403, detail="You are not a member of this tenant.")
    return membership


async def require_owner(db: AsyncSession, tenant_id: int, user: User) -> TenantMember:
    membership = await get_tenant_membership(db, tenant_id, user)
    if membership.role != "OWNER":
        raise HTTPException(status_code=403, detail="Only workspace owners can manage GitHub.")
    return membership


async def get_verified_installation(installation_id: int) -> dict:
    logger.info("Verifying GitHub installation installation_id=%s", installation_id)
    try:
        return await get_github_app_installation(installation_id)
    except (RuntimeError, ValueError, FileNotFoundError) as exc:
        logger.warning(
            "GitHub installation verification failed installation_id=%s error=%s",
            installation_id,
            type(exc).__name__,
        )
        raise HTTPException(status_code=502, detail="Unable to verify the GitHub App installation.") from exc


def apply_installation_account(installation: GitHubInstallation, payload: dict) -> None:
    account = payload.get("account") or {}
    if not account.get("login") or not account.get("type"):
        raise HTTPException(status_code=502, detail="GitHub returned incomplete installation account data.")
    installation.account_login = account["login"]
    installation.account_type = account["type"]
    installation.account_id = account.get("id") if isinstance(account.get("id"), int) else None
    installation.account_avatar_url = account.get("avatar_url")
    installation.is_active = True
    installation.disconnected_at = None


def management_url(installation: GitHubInstallation) -> str:
    if installation.account_type.lower() == "organization":
        return f"https://github.com/organizations/{installation.account_login}/settings/installations/{installation.installation_id}"
    return f"https://github.com/settings/installations/{installation.installation_id}"


async def build_installation_response(db: AsyncSession, installation: GitHubInstallation) -> GitHubInstallationResponse:
    repository_count = await db.scalar(
        select(func.count())
        .select_from(Repository)
        .where(
            Repository.github_installation_id == installation.id,
            Repository.is_active.is_(True),
        )
    ) or 0
    response = GitHubInstallationResponse.model_validate(installation)
    response.repository_count = repository_count
    response.repository_selection = "selected" if repository_count else None
    response.management_url = management_url(installation)
    return response


async def synchronize_installation(
    db: AsyncSession,
    installation: GitHubInstallation,
) -> RepositorySyncSummary:
    try:
        summary = await sync_installation_repositories(db, installation)
    except RuntimeError as exc:
        logger.warning(
            "Repository sync failed installation_id=%s error=%s",
            installation.installation_id,
            type(exc).__name__,
        )
        raise HTTPException(status_code=502, detail="Unable to synchronize GitHub repositories.") from exc
    logger.info(
        "Repository sync completed installation_id=%s total=%s created=%s updated=%s removed=%s",
        installation.installation_id,
        summary.total,
        summary.created,
        summary.updated,
        summary.removed,
    )
    return summary


async def associate_installation_with_tenant(
    db: AsyncSession,
    tenant_id: int,
    installation_id: int,
    github_installation: dict,
) -> tuple[GitHubInstallation, RepositorySyncSummary]:
    installation = await db.scalar(
        select(GitHubInstallation).where(GitHubInstallation.installation_id == installation_id)
    )
    if installation is not None and installation.tenant_id != tenant_id:
        raise HTTPException(status_code=409, detail="This GitHub installation is already connected to another workspace.")
    if installation is None:
        installation = GitHubInstallation(
            tenant_id=tenant_id,
            installation_id=installation_id,
            account_login="pending",
            account_type="User",
        )
        db.add(installation)
        await db.flush()
    apply_installation_account(installation, github_installation)
    summary = await synchronize_installation(db, installation)
    return installation, summary


@router.get("/{tenant_id}/github/installations", response_model=list[GitHubInstallationResponse])
async def list_github_installations(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await get_tenant_membership(db, tenant_id, current_user)
    installations = (await db.execute(
        select(GitHubInstallation)
        .where(
            GitHubInstallation.tenant_id == tenant_id,
            GitHubInstallation.is_active.is_(True),
        )
        .order_by(GitHubInstallation.id.desc())
    )).scalars().all()
    return [await build_installation_response(db, item) for item in installations]


@router.post("/{tenant_id}/github/installations/sync", response_model=GitHubSyncResponse)
async def sync_github_installations(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_owner(db, tenant_id, current_user)
    installations = (await db.execute(
        select(GitHubInstallation)
        .where(
            GitHubInstallation.tenant_id == tenant_id,
            GitHubInstallation.is_active.is_(True),
        )
        .order_by(GitHubInstallation.id.desc())
    )).scalars().all()
    if not installations:
        raise HTTPException(status_code=400, detail="No GitHub installation is connected to this workspace.")
    total = created = updated = removed = 0
    for installation in installations:
        verified = await get_verified_installation(installation.installation_id)
        apply_installation_account(installation, verified)
        summary = await synchronize_installation(db, installation)
        total += summary.total
        created += summary.created
        updated += summary.updated
        removed += summary.removed
    await db.commit()
    return GitHubSyncResponse(
        installation=await build_installation_response(db, installations[0]),
        repositories_synced=total,
        total=total,
        created=created,
        updated=updated,
        removed=removed,
    )


@router.get("/{tenant_id}/github/installations/url")
async def get_github_installation_url(
    tenant_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_owner(db, tenant_id, current_user)
    try:
        state_token = create_installation_state(tenant_id, current_user)
        response.set_cookie(
            settings.GITHUB_SETUP_STATE_COOKIE_NAME,
            state_token,
            max_age=900,
            httponly=True,
            secure=settings.AUTH_COOKIE_SECURE,
            samesite="lax",
            path="/api/github/setup",
        )
        return {"install_url": build_github_app_install_url(state_token)}
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/{tenant_id}/github/install")
async def start_tenant_github_installation(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_owner(db, tenant_id, current_user)
    current_user.onboarding_tenant_id = tenant_id
    await db.commit()
    state_token = create_installation_state(tenant_id, current_user)
    response = RedirectResponse(build_github_app_install_url(state_token), status_code=302)
    response.set_cookie(
        settings.GITHUB_SETUP_STATE_COOKIE_NAME,
        state_token,
        max_age=900,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite="lax",
        path="/api/github/setup",
    )
    return response


@router.delete("/{tenant_id}/github/installations/{installation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_github_installation(
    tenant_id: int,
    installation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await require_owner(db, tenant_id, current_user)
    installation = await db.scalar(
        select(GitHubInstallation).where(
            GitHubInstallation.tenant_id == tenant_id,
            GitHubInstallation.installation_id == installation_id,
            GitHubInstallation.is_active.is_(True),
        )
    )
    if installation is None:
        raise HTTPException(status_code=404, detail="GitHub installation not found.")
    try:
        await delete_github_app_installation(installation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail="GitHub could not remove the installation.") from exc
    installation.is_active = False
    installation.disconnected_at = datetime.now(timezone.utc)
    repositories = await db.scalars(
        select(Repository).where(Repository.github_installation_id == installation.id)
    )
    for repository in repositories.all():
        repository.is_active = False
    await db.commit()
    logger.info("GitHub installation disconnected tenant_id=%s installation_id=%s", tenant_id, installation_id)
