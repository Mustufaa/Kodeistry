"""Invitation lifecycle; all membership writes serialize on the tenant row."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.membership import can_manage_member, lock_team, membership
from app.core.security import hash_password
from app.core.repository_access import validate_assignments
from app.models.repository_member import RepositoryMember
from app.models.team_invitation import InvitationSendAttempt, TeamInvitation
from app.models.tenant_member import TenantMember
from app.models.user import User
from app.services.email import send_team_invitation_email


def now():
    return datetime.now(timezone.utc)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def validate_invitation(invitation: TeamInvitation | None):
    if invitation is None:
        raise HTTPException(404, "Invalid invitation.")
    if invitation.accepted_at:
        raise HTTPException(410, "This invitation has already been accepted.")
    if invitation.revoked_at:
        raise HTTPException(410, "This invitation has been revoked.")
    expiry = invitation.expires_at
    if expiry.tzinfo is None:  # SQLite test dialect
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry <= now():
        raise HTTPException(410, "This invitation has expired. Ask your team to resend it.")
    return invitation


async def invitation_for_token(db: AsyncSession, token: str, *, lock=False):
    digest = token_hash(token)
    invitation = await db.scalar(select(TeamInvitation).where(TeamInvitation.token_hash == digest))
    if lock and invitation is not None:
        # Same lock order as resend, revoke, and role changes. Refresh after waiting.
        await lock_team(db, invitation.tenant_id)
        invitation = await db.scalar(select(TeamInvitation).where(
            TeamInvitation.token_hash == digest
        ).execution_options(populate_existing=True).with_for_update())
    return validate_invitation(invitation)


async def reserve_delivery(db: AsyncSession, user_id: int):
    # Persist the attempt before contacting SMTP, including failed sends.
    await db.scalar(select(User.id).where(User.id == user_id).with_for_update())
    cutoff = now() - timedelta(hours=1)
    await db.execute(delete(InvitationSendAttempt).where(
        InvitationSendAttempt.user_id == user_id, InvitationSendAttempt.created_at < cutoff,
    ))
    count = await db.scalar(select(func.count()).select_from(InvitationSendAttempt).where(
        InvitationSendAttempt.user_id == user_id,
    )) or 0
    if count >= 20:
        raise HTTPException(429, "Invitation email limit reached. Try again in an hour.", headers={"Retry-After": "3600"})
    db.add(InvitationSendAttempt(user_id=user_id, created_at=now()))
    await db.commit()


def assert_manage(actor, target_role, new_role="MEMBER"):
    if not can_manage_member(actor.role, target_role, new_role):
        raise HTTPException(403, "Only owners can manage owners or admins.")


async def issue_invitation(db, tenant_id, user, email=None, role="MEMBER", invitation_id=None, repository_ids=None):
    actor = await membership(db, tenant_id, user, {"OWNER", "ADMIN"})
    if invitation_id is None:
        assert_manage(actor, role, role)
    await reserve_delivery(db, user.id)
    team = await lock_team(db, tenant_id)
    actor = await membership(db, tenant_id, user, {"OWNER", "ADMIN"})
    if invitation_id is not None:
        invitation = await db.scalar(select(TeamInvitation).where(
            TeamInvitation.id == invitation_id, TeamInvitation.tenant_id == tenant_id,
        ))
        if invitation is None:
            raise HTTPException(404, "Invitation not found.")
        if invitation.accepted_at or invitation.revoked_at:
            raise HTTPException(410, "This invitation is no longer pending.")
        assert_manage(actor, invitation.role, invitation.role)
        email, role = invitation.email, invitation.role
        updated = invitation.updated_at
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        if (now() - updated).total_seconds() < 60:
            raise HTTPException(429, "Wait a minute before resending.", headers={"Retry-After": "60"})
    else:
        assert_manage(actor, role, role)
        invitation = await db.scalar(select(TeamInvitation).where(
            TeamInvitation.tenant_id == tenant_id, TeamInvitation.email == email,
            TeamInvitation.accepted_at.is_(None), TeamInvitation.revoked_at.is_(None),
        ))
        if invitation is not None:
            raise HTTPException(409, "An invitation already exists. Resend or revoke it first.")
        invitation = TeamInvitation(tenant_id=tenant_id, email=email, role=role, inviter_user_id=user.id)
    if invitation_id is None:
        if role != "MEMBER" and repository_ids:
            raise HTTPException(422, "Repository assignments apply only to members.")
        invitation.repository_ids = await validate_assignments(db, tenant_id, repository_ids)
    else:
        await validate_assignments(db, tenant_id, invitation.repository_ids)
    active_member = await db.scalar(select(TenantMember.id).join(User, User.id == TenantMember.user_id).where(
        TenantMember.tenant_id == tenant_id, func.lower(func.trim(User.email)) == email,
    ))
    if active_member is not None:
        raise HTTPException(409, "This email is already a team member.")
    token = secrets.token_urlsafe(32)
    invitation.token_hash = token_hash(token)
    invitation.expires_at = now() + timedelta(days=7)
    invitation.updated_at = now()
    # Sharing an existing workspace keeps all repository/installation IDs, but removes
    # the legacy personal-owner recovery path that could recreate a removed membership.
    team.workspace_type = "ORGANIZATION"
    team.personal_owner_user_id = None
    db.add(invitation)
    await db.flush()
    try:
        await send_team_invitation_email(email, team.name, role, token)
    except Exception:
        await db.rollback()
        raise HTTPException(503, "Invitation email could not be sent. Check email configuration and try again.") from None
    await db.commit()
    return invitation


async def accept_invitation(db, token, user=None, registration=None):
    invitation = await invitation_for_token(db, token, lock=True)
    # Revalidate stored IDs, including deleted/deactivated repositories, before creating an account.
    repository_ids = await validate_assignments(db, invitation.tenant_id, invitation.repository_ids)
    if registration is not None:
        # Never update an existing account or password, even if it is unverified.
        existing = await db.scalar(select(User.id).where(func.lower(func.trim(User.email)) == invitation.email))
        if existing is not None:
            raise HTTPException(409, "Unable to register with this invitation. Sign in using your existing account or recover access.")
        user = User(full_name=registration.name, email=invitation.email,
                    hashed_password=hash_password(registration.password), is_verified=True, auth_provider="email")
        db.add(user)
        await db.flush()
    elif user is None or not user.is_verified or user.email.strip().lower() != invitation.email:
        raise HTTPException(403, "Sign in with the verified account that received this invitation.")
    # Serialize acceptance of different invitations for the same account as well.
    await db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    existing = await db.scalar(select(TenantMember.id).where(
        TenantMember.tenant_id == invitation.tenant_id, TenantMember.user_id == user.id,
    ))
    if existing is not None:
        raise HTTPException(409, "You are already a member of this team.")
    member = TenantMember(tenant_id=invitation.tenant_id, user_id=user.id, role=invitation.role)
    db.add(member)
    await db.flush()
    if invitation.role == "MEMBER":
        db.add_all([RepositoryMember(tenant_id=invitation.tenant_id, member_id=member.id, repository_id=repo_id)
                    for repo_id in repository_ids])
    invitation.accepted_at = now()
    user.onboarding_tenant_id = invitation.tenant_id
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "This invitation could not be accepted. Sign in or refresh and try again.") from None
    return user, invitation.tenant_id


async def change_member(db, tenant_id, user, target_user_id, new_role=None):
    await lock_team(db, tenant_id)
    actor = await membership(db, tenant_id, user, {"OWNER", "ADMIN"})
    target = await db.scalar(select(TenantMember).where(
        TenantMember.tenant_id == tenant_id, TenantMember.user_id == target_user_id,
    ).execution_options(populate_existing=True))
    if target is None:
        raise HTTPException(404, "Member not found.")
    assert_manage(actor, target.role, new_role or "MEMBER")
    if target.role == "OWNER" and new_role != "OWNER":
        owners = await db.scalar(select(func.count()).select_from(TenantMember).where(
            TenantMember.tenant_id == tenant_id, TenantMember.role == "OWNER",
        ))
        if owners <= 1:
            raise HTTPException(409, "The team must have at least one owner.")
    if new_role is None:
        await db.delete(target)
    else:
        if target.role != new_role:
            await db.execute(delete(RepositoryMember).where(RepositoryMember.member_id == target.id))
        target.role = new_role
    await db.commit()
