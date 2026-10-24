"""Live team authorization. JWTs identify users, never their permissions."""
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.user import User

ROLES = {"OWNER", "ADMIN", "MEMBER"}


async def membership(db: AsyncSession, tenant_id: int, user: User, roles=None) -> TenantMember:
    if not user.is_verified:
        raise HTTPException(403, "Verify your email before accessing a team.")
    member = await db.scalar(select(TenantMember).where(
        TenantMember.tenant_id == tenant_id, TenantMember.user_id == user.id,
    ).execution_options(populate_existing=True))
    if member is None or member.role not in (roles or ROLES):
        raise HTTPException(403, "You do not have permission to access this team or perform this action.")
    return member


async def lock_team(db: AsyncSession, tenant_id: int) -> Tenant:
    team = await db.scalar(select(Tenant).where(Tenant.id == tenant_id).with_for_update())
    if team is None:
        raise HTTPException(404, "Team not found.")
    return team


async def authorize_team_request(
    request: Request, tenant_id: int,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    roles = ROLES if request.method in {"GET", "HEAD", "OPTIONS"} else {"OWNER", "ADMIN"}
    actor = await membership(db, tenant_id, user, roles)
    if actor.role == "MEMBER" and ("/github/" in request.url.path or request.url.path.endswith("/github") or request.url.path.endswith("/repositories/available")):
        raise HTTPException(403, "Only owners and admins can manage GitHub connections.")
    return actor


def can_manage_member(actor_role: str, target_role: str, new_role: str = "MEMBER") -> bool:
    return actor_role == "OWNER" or (actor_role == "ADMIN" and target_role == new_role == "MEMBER")
