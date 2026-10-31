from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.membership import membership
from app.crud.tenant import create_personal_workspace
from app.db.session import get_db
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.user import User

router = APIRouter(prefix="/api/onboarding", tags=["Onboarding"])


class TutorialUpdate(BaseModel):
    status: Literal["IN_PROGRESS", "SKIPPED", "COMPLETED"]


@router.post("/tour/claim")
async def claim_tour_invitation(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # The conditional UPDATE, not an earlier read, arbitrates concurrent tabs.
    result = await db.execute(
        update(User).where(User.id == current_user.id, User.onboarding_prompt_shown_at.is_(None))
        .values(onboarding_prompt_shown_at=func.now()).returning(User.id)
        .execution_options(synchronize_session=False)
    )
    claimed = result.scalar_one_or_none() is not None
    await db.commit()
    return {"show_invitation": claimed}


@router.put("/tour/status")
async def update_tutorial_status(
    payload: TutorialUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Manual starts also consume any unshown invitation, but NEVER reset it.
    await db.execute(update(User).where(User.id == current_user.id).values(
        tutorial_status=payload.status,
        onboarding_prompt_shown_at=func.coalesce(User.onboarding_prompt_shown_at, func.now()),
    ).execution_options(synchronize_session=False))
    await db.commit()
    return {"tutorial_status": payload.status}


class OnboardingUser(BaseModel):
    id: int
    github_login: str | None
    avatar_url: str | None


class OnboardingWorkspace(BaseModel):
    id: int
    name: str


class OnboardingGitHub(BaseModel):
    connected: bool
    installation_id: int | None
    account_login: str | None
    account_type: str | None


class OnboardingRepositories(BaseModel):
    count: int
    synced: bool


class OnboardingStatus(BaseModel):
    authenticated: bool = True
    user: OnboardingUser
    workspace: OnboardingWorkspace
    github: OnboardingGitHub
    repositories: OnboardingRepositories
    onboarding_complete: bool
    next_step: Literal["github_install", "syncing", "dashboard", "error"]
    error_code: str | None = None


class WorkspaceSelection(BaseModel):
    tenant_id: int


async def _workspace_for_user(
    db: AsyncSession,
    current_user: User,
    requested_tenant_id: int | None = None,
) -> Tenant:
    tenant_id = requested_tenant_id or current_user.onboarding_tenant_id
    workspace = None
    if tenant_id is not None:
        workspace = await db.scalar(
            select(Tenant)
            .join(TenantMember, TenantMember.tenant_id == Tenant.id)
            .where(Tenant.id == tenant_id, TenantMember.user_id == current_user.id)
        )
        if requested_tenant_id is not None and workspace is None:
            raise HTTPException(
                status_code=403,
                detail="You are not a member of this workspace.",
            )

    if workspace is None:
        workspace = await db.scalar(
            select(Tenant).join(TenantMember, TenantMember.tenant_id == Tenant.id)
            .where(TenantMember.user_id == current_user.id).order_by(TenantMember.created_at, Tenant.id).limit(1)
        )
    if workspace is None:
        workspace = await create_personal_workspace(db, current_user)
    if current_user.onboarding_tenant_id != workspace.id:
        current_user.onboarding_tenant_id = workspace.id
        await db.commit()
    return workspace


async def get_onboarding_status(
    db: AsyncSession,
    current_user: User,
    tenant_id: int | None = None,
) -> OnboardingStatus:
    workspace = await _workspace_for_user(db, current_user, tenant_id)
    installation = await db.scalar(
        select(GitHubInstallation)
        .where(
            GitHubInstallation.tenant_id == workspace.id,
            GitHubInstallation.is_active.is_(True),
        )
        .order_by(GitHubInstallation.id.desc())
    )
    repository_count = await db.scalar(
        select(func.count())
        .select_from(Repository)
        .where(Repository.tenant_id == workspace.id, Repository.is_active.is_(True))
    ) or 0
    connected = installation is not None
    synced = connected and installation.last_synced_at is not None
    member = await membership(db, workspace.id, current_user)
    # Shared teams can be used even while an owner is reconnecting GitHub.
    complete = bool(connected and synced) or member.role != "OWNER" or workspace.workspace_type == "ORGANIZATION"
    next_step = "dashboard" if complete else ("syncing" if connected else "github_install")
    if member.role == "MEMBER":
        installation = None
        connected = False
        synced = False

    return OnboardingStatus(
        user=OnboardingUser(
            id=current_user.id,
            github_login=current_user.github_login,
            avatar_url=current_user.github_avatar_url,
        ),
        workspace=OnboardingWorkspace(id=workspace.id, name=workspace.name),
        github=OnboardingGitHub(
            connected=connected,
            installation_id=installation.installation_id if installation else None,
            account_login=installation.account_login if installation else None,
            account_type=installation.account_type if installation else None,
        ),
        repositories=OnboardingRepositories(count=repository_count, synced=synced),
        onboarding_complete=complete,
        next_step=next_step,
    )


@router.get("/status", response_model=OnboardingStatus)
async def onboarding_status(
    tenant_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_onboarding_status(db, current_user, tenant_id)


@router.post("/workspace", response_model=OnboardingStatus)
async def select_current_workspace(
    selection: WorkspaceSelection,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace = await _workspace_for_user(db, current_user, selection.tenant_id)
    current_user.onboarding_tenant_id = workspace.id
    await db.commit()
    return await get_onboarding_status(db, current_user, workspace.id)
