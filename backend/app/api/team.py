from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _set_auth_cookie
from app.core.auth import create_access_token, get_current_user
from app.core.membership import lock_team, membership
from app.db.session import get_db
from app.models.team_invitation import TeamInvitation
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.user import User
from app.models.repository import Repository
from app.models.repository_member import RepositoryMember
from app.core.repository_access import validate_assignments
from app.schemas.team import RepositoryAssignments, ChangeRole, InvitationRegistration, InvitationToken, InvitationView, InviteMember, MemberView
from app.services.team_service import accept_invitation, assert_manage, change_member, invitation_for_token, issue_invitation, now

router = APIRouter(prefix="/api", tags=["Team Members"])


@router.get("/tenants/{tenant_id}/members", response_model=list[MemberView])
async def members(tenant_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await membership(db, tenant_id, user, {"OWNER", "ADMIN"})
    rows = (await db.execute(select(User, TenantMember).join(TenantMember, TenantMember.user_id == User.id)
                            .where(TenantMember.tenant_id == tenant_id).order_by(User.full_name))).all()
    grants = (await db.execute(select(RepositoryMember.member_id, RepositoryMember.repository_id).where(RepositoryMember.tenant_id == tenant_id))).all()
    return [MemberView(user_id=u.id, full_name=u.full_name, email=u.email, role=m.role, joined_at=m.created_at,
                       repository_ids=[rid for mid, rid in grants if mid == m.id]) for u, m in rows]


@router.get("/tenants/{tenant_id}/invitations", response_model=list[InvitationView])
async def invitations(tenant_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await membership(db, tenant_id, user, {"OWNER", "ADMIN"})
    return (await db.scalars(select(TeamInvitation).where(
        TeamInvitation.tenant_id == tenant_id, TeamInvitation.accepted_at.is_(None),
        TeamInvitation.revoked_at.is_(None),
    ).order_by(TeamInvitation.created_at.desc()))).all()


@router.post("/tenants/{tenant_id}/invitations", response_model=InvitationView, status_code=201)
async def invite(tenant_id: int, body: InviteMember, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await issue_invitation(db, tenant_id, user, body.email, body.role, repository_ids=body.repository_ids)


@router.post("/tenants/{tenant_id}/invitations/{invitation_id}/resend", response_model=InvitationView)
async def resend(tenant_id: int, invitation_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await issue_invitation(db, tenant_id, user, invitation_id=invitation_id)


@router.delete("/tenants/{tenant_id}/invitations/{invitation_id}", status_code=204)
async def revoke(tenant_id: int, invitation_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await lock_team(db, tenant_id)
    actor = await membership(db, tenant_id, user, {"OWNER", "ADMIN"})
    invitation = await db.scalar(select(TeamInvitation).where(
        TeamInvitation.tenant_id == tenant_id, TeamInvitation.id == invitation_id,
    ))
    if invitation is None:
        raise HTTPException(404, "Invitation not found.")
    assert_manage(actor, invitation.role, invitation.role)
    if invitation.accepted_at:
        raise HTTPException(409, "Invitation already accepted. Manage the member instead.")
    invitation.revoked_at = now()
    await db.commit()


@router.patch("/tenants/{tenant_id}/members/{user_id}", status_code=204)
async def update_member(tenant_id: int, user_id: int, body: ChangeRole, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await change_member(db, tenant_id, user, user_id, body.role)


@router.delete("/tenants/{tenant_id}/members/{user_id}", status_code=204)
async def remove_member(tenant_id: int, user_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await change_member(db, tenant_id, user, user_id)


@router.post("/invitations/preview")
async def preview(body: InvitationToken, response: Response, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    invitation = await invitation_for_token(db, body.token)
    team = await db.get(Tenant, invitation.tenant_id)
    return {"team_name": team.name, "role": invitation.role, "expires_at": invitation.expires_at}


@router.post("/invitations/accept")
async def accept(body: InvitationToken, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    _, tenant_id = await accept_invitation(db, body.token, user=user)
    return {"tenant_id": tenant_id}


@router.post("/invitations/register", status_code=201)
async def register_invitee(body: InvitationRegistration, response: Response, db: AsyncSession = Depends(get_db)):
    try:
        user, tenant_id = await accept_invitation(db, body.token, registration=body)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Unable to register. Sign in or recover your existing account.") from None
    _set_auth_cookie(response, create_access_token({"sub": str(user.id), "uid": user.id}))
    response.headers["Cache-Control"] = "no-store"
    return {"tenant_id": tenant_id}


@router.get("/tenants/{tenant_id}/access")
async def access(tenant_id: int, response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    actor = await membership(db, tenant_id, user)
    ids = (await db.scalars(select(Repository.id).where(Repository.tenant_id == tenant_id, Repository.is_active.is_(True)).order_by(Repository.id))).all()
    response.headers["Cache-Control"] = "no-store"
    return {"role": actor.role, "repository_ids": ids}


@router.put("/tenants/{tenant_id}/members/{user_id}/repositories", status_code=204)
async def assign_repositories(tenant_id: int, user_id: int, body: RepositoryAssignments, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await lock_team(db, tenant_id)
    actor = await membership(db, tenant_id, user, {"OWNER", "ADMIN"})
    target = await db.scalar(select(TenantMember).where(TenantMember.tenant_id == tenant_id, TenantMember.user_id == user_id))
    if target is None:
        raise HTTPException(404, "Member not found.")
    assert_manage(actor, target.role, target.role)
    if target.role != "MEMBER":
        raise HTTPException(422, "Owners and admins already have access to all team repositories.")
    ids = await validate_assignments(db, tenant_id, body.repository_ids)
    previous_ids = set((await db.scalars(select(RepositoryMember.repository_id).where(RepositoryMember.member_id == target.id))).all())
    if previous_ids == set(ids):
        return
    await db.execute(delete(RepositoryMember).where(RepositoryMember.member_id == target.id))
    db.add_all([RepositoryMember(tenant_id=tenant_id, member_id=target.id, repository_id=rid) for rid in ids])
    from app.services.collaboration import create_notifications
    import uuid
    await db.flush()
    await db.run_sync(lambda session: create_notifications(session.connection(), tenant_id=tenant_id,
        event_type="repository_assignment_changed", title="Repository assignments changed",
        message="Your repository access has been updated.", href="/dashboard",
        key=f"assignments:{target.id}:{uuid.uuid4()}", recipients=[user_id]))
    await db.commit()
