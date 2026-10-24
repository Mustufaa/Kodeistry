import logging
import secrets
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.github_installation import (
    associate_installation_with_tenant,
    build_github_app_install_url,
    create_installation_state,
    get_verified_installation,
    matching_personal_installation,
    require_owner,
)
from app.core.auth import get_current_user
from app.core.config import settings
from app.api.onboarding import _workspace_for_user
from app.db.session import get_db
from app.github.auth import get_github_app_installations
from app.models.github_installation import GitHubInstallation
from app.models.tenant_member import TenantMember
from app.models.user import User

router = APIRouter(prefix="/api/github", tags=["GitHub Setup"])
logger = logging.getLogger(__name__)


def _frontend_redirect(path: str, query: dict[str, str] | None = None) -> RedirectResponse:
    url = f"{settings.FRONTEND_URL.rstrip('/')}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"
    response = RedirectResponse(url)
    response.delete_cookie(
        settings.GITHUB_SETUP_STATE_COOKIE_NAME,
        path="/api/github/setup",
        secure=settings.AUTH_COOKIE_SECURE,
        httponly=True,
        samesite="lax",
    )
    return response


@router.get("/install")
async def start_github_app_installation(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace = await _workspace_for_user(db, current_user)
    current_user.onboarding_tenant_id = workspace.id
    await require_owner(db, workspace.id, current_user)
    await db.commit()

    try:
        existing = matching_personal_installation(
            await get_github_app_installations(),
            current_user,
        )
        if existing is not None:
            installation, sync_summary = await associate_installation_with_tenant(
                db,
                workspace.id,
                int(existing['id']),
                existing,
            )
            await db.commit()
            logger.info(
                'Recovered existing GitHub installation tenant_id=%s installation_id=%s repositories=%s',
                workspace.id,
                installation.installation_id,
                sync_summary.total,
            )
            return _frontend_redirect('/dashboard')
    except HTTPException as exc:
        await db.rollback()
        return _frontend_redirect('/onboarding/setup', {'github_error': str(exc.detail)})
    except (RuntimeError, ValueError, FileNotFoundError) as exc:
        await db.rollback()
        logger.warning(
            'Existing GitHub installation lookup failed user_id=%s error=%s; continuing with install flow',
            current_user.id,
            type(exc).__name__,
        )

    state_token = create_installation_state(workspace.id, current_user)
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


@router.get("/setup/callback")
async def github_app_setup_callback(
    request: Request,
    installation_id: int = Query(..., gt=0),
    setup_action: str = Query(default="install"),
    state: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cookie_state = request.cookies.get(settings.GITHUB_SETUP_STATE_COOKIE_NAME)
    if not state:
        return _frontend_redirect(
            "/onboarding/setup",
            {"github_error": "The GitHub installation session expired. Return to Kodeistry and try again."},
        )
    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("purpose") != "github_installation":
            raise JWTError("invalid state purpose")
        tenant_id = int(payload["tenant_id"])
        user_id = int(payload["user_id"])
    except (JWTError, KeyError, TypeError, ValueError):
        return _frontend_redirect("/onboarding/setup", {"github_error": "Invalid GitHub installation session."})

    if user_id != current_user.id:
        return _frontend_redirect(
            "/onboarding/setup",
            {"github_error": "This GitHub installation session belongs to another user."},
        )

    state_matches = bool(cookie_state and secrets.compare_digest(state, cookie_state))
    if not state_matches:
        existing = await db.scalar(
            select(GitHubInstallation).where(
                GitHubInstallation.installation_id == installation_id,
                GitHubInstallation.tenant_id == tenant_id,
                GitHubInstallation.is_active.is_(True),
            )
        )
        if existing is not None:
            return _frontend_redirect("/dashboard")
        return _frontend_redirect(
            "/onboarding/setup",
            {"github_error": "The GitHub installation session expired. Return to Kodeistry and try again."},
        )

    membership = await db.scalar(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == user_id,
            TenantMember.role == "OWNER",
        )
    )
    if membership is None:
        return _frontend_redirect(
            "/onboarding/setup",
            {"github_error": "You do not have permission to connect GitHub for this workspace."},
        )

    try:
        verified = await get_verified_installation(installation_id)
        installation, sync_summary = await associate_installation_with_tenant(
            db, tenant_id, installation_id, verified
        )
        await db.commit()
        logger.info(
            "GitHub setup completed tenant_id=%s installation_id=%s repositories=%s action=%s",
            tenant_id,
            installation_id,
            sync_summary.total,
            setup_action,
        )
        return _frontend_redirect("/dashboard")
    except HTTPException as exc:
        await db.rollback()
        return _frontend_redirect("/onboarding/setup", {"github_error": str(exc.detail)})
    except Exception as exc:
        await db.rollback()
        logger.exception(
            "GitHub setup failed tenant_id=%s installation_id=%s error=%s",
            tenant_id,
            installation_id,
            type(exc).__name__,
        )
        return _frontend_redirect(
            "/onboarding/setup",
            {"github_error": "GitHub connected, but repositories could not be synchronized."},
        )
