"""Shared authorization and transactional event notifications.

The flush listener observes actual persisted domain transitions, including worker
sessions. Notifications commit or roll back with the originating transaction.
No private findings, code, email addresses, or chat bodies enter previews.
"""
from datetime import datetime, timezone
import re
import uuid
from sqlalchemy import and_, event, func, inspect, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from fastapi import HTTPException
from app.core.membership import membership
from app.core.repository_access import accessible_repository_ids
from app.models.collaboration import ChatChannel, ChatChannelMember, ChatMessage, Notification
from app.models.repository import Repository
from app.models.repository_member import RepositoryMember
from app.models.review_run import ReviewRun
from app.models.review_finding import ReviewFinding
from app.models.team_invitation import TeamInvitation
from app.models.tenant_member import TenantMember
from app.models.secret_scan import SecretScanRun, SecretFinding, SecretOccurrence


def now():
    return datetime.now(timezone.utc)


def insert_for(bind, table):
    return (pg_insert if bind.dialect.name == "postgresql" else sqlite_insert)(table)


def channel_access(user_id, tenant_id):
    member = select(TenantMember.id).where(TenantMember.tenant_id == tenant_id,
                                         TenantMember.user_id == user_id).exists()
    explicit = select(ChatChannelMember.channel_id).where(ChatChannelMember.user_id == user_id)
    return and_(ChatChannel.tenant_id == tenant_id, member, ChatChannel.archived.is_(False), or_(
        ChatChannel.kind == "team",
        and_(ChatChannel.kind == "repository", ChatChannel.repository_id.in_(accessible_repository_ids(user_id))),
        and_(ChatChannel.kind == "direct", ChatChannel.id.in_(explicit)),
    ))


async def require_channel(db, tenant_id, user, channel_id):
    await membership(db, tenant_id, user)
    channel = await db.scalar(select(ChatChannel).where(ChatChannel.id == channel_id,
        channel_access(user.id, tenant_id)).execution_options(populate_existing=True))
    if channel is None:
        raise HTTPException(404, "Channel not found or access revoked.")
    return channel


def notification_access(user_id, tenant_id):
    admin = select(TenantMember.id).where(TenantMember.user_id == user_id,
        TenantMember.tenant_id == tenant_id, TenantMember.role.in_(["OWNER", "ADMIN"])).exists()
    channels = select(ChatChannel.id).where(channel_access(user_id, tenant_id))
    return and_(Notification.recipient_id == user_id, Notification.tenant_id == tenant_id,
        or_(Notification.admin_only.is_(False), admin),
        or_(Notification.repository_id.is_(None), Notification.repository_id.in_(accessible_repository_ids(user_id))),
        or_(Notification.channel_id.is_(None), Notification.channel_id.in_(channels)))


def safe_href(href):
    return bool(re.fullmatch(r"/(?:reviews/\d+|repositories/\d+|team|dashboard(?:\?chat=\d+)?)", href))


def create_notifications(connection, *, tenant_id, event_type, title, message, href, key,
                         repository_id=None, channel_id=None, recipients=None, admin_only=False):
    if not safe_href(href):
        raise ValueError("Unsafe notification destination")
    members = TenantMember.__table__
    grants = RepositoryMember.__table__
    query = select(members.c.user_id).where(members.c.tenant_id == tenant_id)
    if recipients is not None:
        query = query.where(members.c.user_id.in_(recipients))
    if admin_only:
        query = query.where(members.c.role.in_(["OWNER", "ADMIN"]))
    if repository_id is not None:
        query = query.where(or_(members.c.role.in_(["OWNER", "ADMIN"]), select(grants.c.member_id).where(
            grants.c.member_id == members.c.id, grants.c.tenant_id == tenant_id,
            grants.c.repository_id == repository_id).exists()))
    ids = connection.execute(query).scalars().all()
    if not ids:
        return
    rows = [dict(recipient_id=uid, tenant_id=tenant_id, event_type=event_type, title=title,
        message=message[:500], href=href, dedup_key=key, repository_id=repository_id,
        channel_id=channel_id, admin_only=admin_only) for uid in ids]
    connection.execute(insert_for(connection, Notification.__table__).values(rows).on_conflict_do_nothing(
        index_elements=["recipient_id", "dedup_key"]))


@event.listens_for(Session, "after_flush")
def domain_notifications(session, context):
    connection = session.connection()
    seen_findings = set()
    for item in list(session.new) + list(session.dirty) + list(session.deleted):
        state = inspect(item)
        fresh = item in session.new
        def changed(field):
            return fresh or state.attrs[field].history.has_changes()
        data = None
        if isinstance(item, SecretScanRun) and changed("status") and item.status == "COMPLETED":
            severities = connection.execute(select(SecretFinding.__table__.c.severity).join(
                SecretOccurrence.__table__, SecretOccurrence.__table__.c.finding_id == SecretFinding.__table__.c.id
            ).where(SecretOccurrence.__table__.c.run_id == item.id,
                    SecretFinding.__table__.c.severity.in_(["critical", "high"])).distinct()).scalars().all()
            for severity in severities:
                create_notifications(connection, tenant_id=item.tenant_id, repository_id=item.repository_id,
                    event_type=f"finding_{severity}", title=f"{severity.title()} severity secret finding detected",
                    message=f"A completed secret scan found {severity} severity issues. Open the repository for details.",
                    href=f"/repositories/{item.repository_id}", key=f"scan:{item.id}:{severity}")
            continue
        if isinstance(item, ReviewRun) and changed("status") and item.status in {"RUNNING", "COMPLETED", "FAILED"}:
            action = {"RUNNING": "started", "COMPLETED": "completed", "FAILED": "failed"}[item.status]
            repo = connection.execute(select(Repository.__table__.c.full_name).where(Repository.__table__.c.id == item.repository_id)).scalar_one()
            data = dict(tenant_id=item.tenant_id, repository_id=item.repository_id,
                event_type=f"review_{action}", title=f"PR review {action}",
                message=f"{repo} · PR #{item.pull_request_number}", href=f"/reviews/{item.id}",
                key=f"review:{item.repository_id}:{item.pull_request_number}:{item.commit_sha}:{action}")
        elif isinstance(item, ReviewFinding) and fresh and item.severity.lower() in {"critical", "high"}:
            finding_key = (item.review_run_id, item.severity.lower())
            if finding_key in seen_findings:
                continue
            seen_findings.add(finding_key)
            run = connection.execute(select(ReviewRun.__table__).where(ReviewRun.__table__.c.id == item.review_run_id)).mappings().one()
            repo = connection.execute(select(Repository.__table__.c.full_name).where(Repository.__table__.c.id == run["repository_id"])).scalar_one()
            severity = item.severity.lower()
            data = dict(tenant_id=run["tenant_id"], repository_id=run["repository_id"],
                event_type=f"finding_{severity}", title=f"{severity.title()} severity finding detected",
                message=f"{repo} · PR #{run['pull_request_number']} · {severity.title()} severity. Open the review for details.",
                href=f"/reviews/{run['id']}", key=f"finding:{run['repository_id']}:{run['pull_request_number']}:{run['commit_sha']}:{severity}")
        elif isinstance(item, Repository) and changed("is_active"):
            action = "connected" if item.is_active else "disconnected"
            data = dict(tenant_id=item.tenant_id, repository_id=item.id, event_type=f"repository_{action}",
                title=f"Repository {action}", message=item.full_name, href=f"/repositories/{item.id}",
                key=f"repo:{item.id}:{action}:{uuid.uuid4()}")
        elif isinstance(item, TeamInvitation) and (fresh or changed("accepted_at")):
            action = "accepted" if item.accepted_at else "invited"
            data = dict(tenant_id=item.tenant_id, event_type=f"member_{action}", title="Team invitation accepted" if item.accepted_at else "Team member invited",
                message="Your team's membership has changed.", href="/team", admin_only=True,
                key=f"invite:{item.id}:{action}")
        elif isinstance(item, TenantMember) and (item in session.deleted or (not fresh and changed("role"))):
            action = "removed" if item in session.deleted else "role_changed"
            data = dict(tenant_id=item.tenant_id, event_type=f"member_{action}", title="Team member removed" if action == "removed" else "Team role changed",
                message="Your team's membership has changed.", href="/team", admin_only=True,
                key=f"member:{item.id}:{action}:{uuid.uuid4()}")
        if data:
            create_notifications(connection, **data)
            if isinstance(item, TenantMember) and item not in session.deleted:
                create_notifications(connection, tenant_id=item.tenant_id, event_type="role_changed",
                    title="Your team role changed", message="Your team permissions have been updated.",
                    href="/dashboard", key=f"role:{item.id}:{uuid.uuid4()}", recipients=[item.user_id])


async def channel_snapshot(db, tenant_id, user):
    """Bounded-query discovery and unread totals, independent of channel count."""
    channels = (await db.scalars(select(ChatChannel).where(channel_access(user.id, tenant_id)).order_by(ChatChannel.id))).all()
    ids = [c.id for c in channels]
    cursors = dict((await db.execute(select(ChatChannelMember.channel_id, ChatChannelMember.last_read_id).where(
        ChatChannelMember.channel_id.in_(ids), ChatChannelMember.user_id == user.id))).all())
    counts = dict((await db.execute(select(ChatMessage.channel_id, func.count()).outerjoin(ChatChannelMember,
        and_(ChatChannelMember.channel_id == ChatMessage.channel_id, ChatChannelMember.user_id == user.id)).where(
        ChatMessage.channel_id.in_(ids), ChatMessage.id > func.coalesce(ChatChannelMember.last_read_id, 0),
        ChatMessage.sender_id != user.id, ChatMessage.deleted_at.is_(None)).group_by(ChatMessage.channel_id))).all())
    from app.models.user import User
    names = dict((await db.execute(select(ChatChannelMember.channel_id, User.full_name).join(User,
        User.id == ChatChannelMember.user_id).where(ChatChannelMember.channel_id.in_([c.id for c in channels if c.kind == "direct"]),
        ChatChannelMember.user_id != user.id))).all())
    return [dict(id=c.id, name=names.get(c.id, c.name), kind=c.kind, repository_id=c.repository_id,
                 revision=c.revision, unread=counts.get(c.id, 0), last_read_id=cursors.get(c.id, 0)) for c in channels]
