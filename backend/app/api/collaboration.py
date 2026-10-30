"""Authenticated collaboration REST API and database-backed WebSocket delivery."""
import asyncio
import hashlib
import json
import secrets
import time
from datetime import timedelta
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select, update
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.membership import lock_team, membership
from app.core.repository_access import accessible_repository_ids
from app.db.session import get_db, AsyncSessionLocal
from app.models.collaboration import ChatChannel, ChatChannelMember, ChatMessage, CollaborationTicket, Notification
from app.models.repository import Repository
from app.models.tenant_member import TenantMember
from app.models.user import User
from app.services.collaboration import channel_access, channel_snapshot, create_notifications, insert_for, notification_access, now, require_channel

router = APIRouter(prefix="/api/tenants/{tenant_id}/collaboration", tags=["Collaboration"])


class ChannelInput(BaseModel):
    name: str = Field(default="general", min_length=1, max_length=80, pattern=r"^[\w .-]+$")
    repository_id: int | None = Field(default=None, gt=0)
    recipient_id: int | None = Field(default=None, gt=0)


class MessageInput(BaseModel):
    client_id: UUID
    body: str = Field(min_length=1, max_length=4000)
    reply_to_id: int | None = Field(default=None, gt=0)
    mentions: list[int] = Field(default_factory=list, max_length=20)

    @field_validator("body")
    @classmethod
    def clean_body(cls, value):
        value = value.strip()
        if not value or any(ord(c) < 32 and c not in "\n\t" for c in value):
            raise ValueError("Message must contain text without control characters")
        return value


class MessageEdit(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    _clean = field_validator("body")(MessageInput.clean_body.__func__)


class ReadInput(BaseModel):
    message_id: int = Field(ge=0)


async def ensure_member(db, channel_id, user_id):
    await db.execute(insert_for(db.get_bind(), ChatChannelMember).values(channel_id=channel_id, user_id=user_id)
                     .on_conflict_do_nothing(index_elements=["channel_id", "user_id"]))


@router.post("/channels")
async def create_channel(tenant_id: int, body: ChannelInput, db=Depends(get_db), user=Depends(get_current_user)):
    await lock_team(db, tenant_id)
    actor = await membership(db, tenant_id, user)
    if body.recipient_id and body.repository_id:
        raise HTTPException(422, "Choose a repository channel or a direct message.")
    if body.recipient_id:
        recipient = await db.scalar(select(User).join(TenantMember, TenantMember.user_id == User.id).where(
            TenantMember.tenant_id == tenant_id, User.id == body.recipient_id, User.is_verified.is_(True)))
        if recipient is None or recipient.id == user.id:
            raise HTTPException(404, "Team member not found.")
        kind, key, name = "direct", "dm:" + ":".join(map(str, sorted([user.id, recipient.id]))), "Direct message"
    else:
        if actor.role not in {"OWNER", "ADMIN"} and (body.repository_id or body.name != "general"):
            raise HTTPException(403, "Only team administrators can create channels.")
        if body.repository_id:
            repo = await db.scalar(select(Repository).where(Repository.id == body.repository_id,
                Repository.tenant_id == tenant_id, Repository.is_active.is_(True)))
            if repo is None:
                raise HTTPException(404, "Repository not found.")
            kind, key, name = "repository", f"repo:{repo.id}", repo.full_name[:100]
        else:
            kind, key, name = "team", "team:" + body.name.lower(), body.name
    channel = await db.scalar(select(ChatChannel).where(ChatChannel.tenant_id == tenant_id, ChatChannel.key == key))
    if channel is None:
        channel = ChatChannel(tenant_id=tenant_id, repository_id=body.repository_id, key=key, kind=kind, name=name)
        db.add(channel)
        await db.flush()
    elif channel.archived:
        raise HTTPException(409, "This channel was archived.")
    await ensure_member(db, channel.id, user.id)
    if body.recipient_id:
        await ensure_member(db, channel.id, body.recipient_id)
    await db.commit()
    return {"id": channel.id}


@router.delete("/channels/{channel_id}", status_code=204)
async def archive_channel(tenant_id: int, channel_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await membership(db, tenant_id, user, {"OWNER", "ADMIN"})
    channel = await require_channel(db, tenant_id, user, channel_id)
    if channel.kind == "direct":
        raise HTTPException(403, "Direct conversations cannot be administratively archived.")
    channel.archived = True
    await db.commit()


@router.get("/channels")
async def channels(tenant_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await membership(db, tenant_id, user)
    return await channel_snapshot(db, tenant_id, user)


@router.get("/people")
async def people(tenant_id: int, channel_id: int | None = None, db=Depends(get_db), user=Depends(get_current_user)):
    await membership(db, tenant_id, user)
    query = select(User.id, User.full_name, User.github_avatar_url).join(TenantMember, TenantMember.user_id == User.id).where(
        TenantMember.tenant_id == tenant_id, User.is_verified.is_(True))
    if channel_id:
        channel = await require_channel(db, tenant_id, user, channel_id)
        if channel.kind == "direct":
            query = query.where(User.id.in_(select(ChatChannelMember.user_id).where(ChatChannelMember.channel_id == channel_id)))
        elif channel.repository_id:
            # Correlated repository permissions for each candidate, using existing grant logic.
            from app.models.repository_member import RepositoryMember
            query = query.where((TenantMember.role.in_(["OWNER", "ADMIN"])) | TenantMember.id.in_(
                select(RepositoryMember.member_id).where(RepositoryMember.repository_id == channel.repository_id)))
    return [dict(row._mapping) for row in (await db.execute(query.order_by(User.full_name))).all()]


def message_view(message, sender):
    return dict(id=message.id, channel_id=message.channel_id, client_id=message.client_id,
        sender_id=message.sender_id, sender=sender.full_name, avatar=sender.github_avatar_url,
        body=message.body if not message.deleted_at else "", reply_to_id=message.reply_to_id,
        created_at=message.created_at, edited_at=message.edited_at, deleted_at=message.deleted_at)


@router.get("/channels/{channel_id}/messages")
async def messages(tenant_id: int, channel_id: int, before: int | None = Query(None, gt=0),
                   q: str = Query("", max_length=100), limit: int = Query(40, ge=1, le=100),
                   db=Depends(get_db), user=Depends(get_current_user)):
    await require_channel(db, tenant_id, user, channel_id)
    query = select(ChatMessage, User).join(User, User.id == ChatMessage.sender_id).where(ChatMessage.channel_id == channel_id)
    if before:
        query = query.where(ChatMessage.id < before)
    if q:
        query = query.where(ChatMessage.deleted_at.is_(None), ChatMessage.body.icontains(q, autoescape=True))
    rows = (await db.execute(query.order_by(ChatMessage.id.desc()).limit(limit + 1))).all()
    return {"items": [message_view(m, u) for m, u in rows[:limit]],
            "next_cursor": rows[limit-1][0].id if len(rows) > limit else None}


@router.post("/channels/{channel_id}/messages")
async def send_message(tenant_id: int, channel_id: int, body: MessageInput, db=Depends(get_db), user=Depends(get_current_user)):
    # Serializes writes against team removal/assignment changes and against other sends.
    await lock_team(db, tenant_id)
    channel = await require_channel(db, tenant_id, user, channel_id)
    await db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    existing = await db.scalar(select(ChatMessage).where(ChatMessage.sender_id == user.id, ChatMessage.client_id == str(body.client_id)))
    if existing:
        if existing.channel_id != channel_id:
            raise HTTPException(409, "Message identifier already used in a different channel.")
        return message_view(existing, user)
    count = await db.scalar(select(func.count()).select_from(ChatMessage).where(
        ChatMessage.sender_id == user.id, ChatMessage.created_at > now() - timedelta(minutes=1)))
    if count >= 30:
        raise HTTPException(429, "Message limit reached. Try again in a minute.", headers={"Retry-After": "60"})
    if body.reply_to_id and not await db.scalar(select(ChatMessage.id).where(
            ChatMessage.id == body.reply_to_id, ChatMessage.channel_id == channel_id)):
        raise HTTPException(422, "Reply must reference a message in this channel.")
    allowed = await people(tenant_id, channel_id, db, user)
    allowed_ids = {p["id"] for p in allowed}
    if not set(body.mentions).issubset(allowed_ids):
        raise HTTPException(422, "Mentioned user cannot access this channel.")
    message = ChatMessage(channel_id=channel_id, sender_id=user.id, client_id=str(body.client_id),
                          body=body.body, reply_to_id=body.reply_to_id)
    db.add(message)
    channel.revision += 1
    await db.flush()
    recipients = (allowed_ids if channel.kind == "direct" else set(body.mentions)) - {user.id}
    if recipients:
        await db.run_sync(lambda session: create_notifications(session.connection(), tenant_id=tenant_id,
            event_type="direct_message" if channel.kind == "direct" else "chat_mention",
            title="New direct message" if channel.kind == "direct" else "You were mentioned",
            message="Open team chat to read the message.", href=f"/dashboard?chat={channel_id}",
            key=f"message:{message.id}", repository_id=channel.repository_id, channel_id=channel_id, recipients=recipients))
    await db.commit()
    return message_view(message, user)


async def own_message(db, tenant_id, channel_id, message_id, user):
    await lock_team(db, tenant_id)
    channel = await require_channel(db, tenant_id, user, channel_id)
    message = await db.scalar(select(ChatMessage).where(ChatMessage.id == message_id,
        ChatMessage.channel_id == channel_id, ChatMessage.sender_id == user.id, ChatMessage.deleted_at.is_(None)))
    if not message:
        raise HTTPException(404, "Message not found or not yours.")
    channel.revision += 1
    return message


@router.patch("/channels/{channel_id}/messages/{message_id}")
async def edit_message(tenant_id: int, channel_id: int, message_id: int, body: MessageEdit, db=Depends(get_db), user=Depends(get_current_user)):
    message = await own_message(db, tenant_id, channel_id, message_id, user)
    message.body, message.edited_at = body.body, now()
    await db.commit()
    return message_view(message, user)


@router.delete("/channels/{channel_id}/messages/{message_id}", status_code=204)
async def delete_message(tenant_id: int, channel_id: int, message_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    message = await own_message(db, tenant_id, channel_id, message_id, user)
    message.body, message.deleted_at = "", now()
    await db.commit()


@router.post("/channels/{channel_id}/read", status_code=204)
async def read_channel(tenant_id: int, channel_id: int, body: ReadInput, db=Depends(get_db), user=Depends(get_current_user)):
    await require_channel(db, tenant_id, user, channel_id)
    if body.message_id and not await db.scalar(select(ChatMessage.id).where(ChatMessage.id == body.message_id, ChatMessage.channel_id == channel_id)):
        raise HTTPException(422, "Invalid read cursor.")
    await ensure_member(db, channel_id, user.id)
    await db.execute(update(ChatChannelMember).where(ChatChannelMember.channel_id == channel_id,
        ChatChannelMember.user_id == user.id, ChatChannelMember.last_read_id < body.message_id).values(last_read_id=body.message_id))
    await db.commit()


@router.get("/notifications")
async def notifications(tenant_id: int, unread: bool = False, before: int | None = Query(None, gt=0),
                        limit: int = Query(30, ge=1, le=100), db=Depends(get_db), user=Depends(get_current_user)):
    await membership(db, tenant_id, user)
    query = select(Notification).where(notification_access(user.id, tenant_id))
    if unread:
        query = query.where(Notification.read_at.is_(None))
    if before:
        query = query.where(Notification.id < before)
    items = (await db.scalars(query.order_by(Notification.id.desc()).limit(limit + 1))).all()
    return {"items": [dict(id=n.id, event_type=n.event_type, title=n.title, message=n.message,
        href=n.href, created_at=n.created_at, read_at=n.read_at) for n in items[:limit]],
        "next_cursor": items[limit-1].id if len(items) > limit else None}


@router.get("/notifications/unread-count")
async def unread_count(tenant_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await membership(db, tenant_id, user)
    return {"count": await db.scalar(select(func.count()).select_from(Notification).where(
        notification_access(user.id, tenant_id), Notification.read_at.is_(None)))}


@router.post("/notifications/read-all", status_code=204)
async def read_all(tenant_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await membership(db, tenant_id, user)
    await db.execute(update(Notification).where(notification_access(user.id, tenant_id), Notification.read_at.is_(None)).values(read_at=now()))
    await db.commit()


@router.post("/notifications/{notification_id}/read", status_code=204)
async def read_notification(tenant_id: int, notification_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await membership(db, tenant_id, user)
    item = await db.scalar(select(Notification).where(Notification.id == notification_id, notification_access(user.id, tenant_id)))
    if not item:
        raise HTTPException(404, "Notification not found.")
    item.read_at = item.read_at or now()
    await db.commit()


@router.post("/ticket")
async def ticket(tenant_id: int, db=Depends(get_db), user=Depends(get_current_user)):
    await membership(db, tenant_id, user)
    await db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    await db.execute(delete(CollaborationTicket).where(CollaborationTicket.expires_at < now()))
    count = await db.scalar(select(func.count()).select_from(CollaborationTicket).where(CollaborationTicket.user_id == user.id))
    if count >= 5:
        raise HTTPException(429, "Too many connection attempts. Try again shortly.")
    token = secrets.token_urlsafe(32)
    db.add(CollaborationTicket(digest=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id,
        tenant_id=tenant_id, expires_at=now() + timedelta(seconds=30)))
    await db.commit()
    return {"ticket": token}


async def consume_ticket(db, tenant_id, token):
    if not isinstance(token, str) or len(token) > 100:
        raise HTTPException(401, "Invalid connection ticket")
    uid = (await db.execute(delete(CollaborationTicket).where(
        CollaborationTicket.digest == hashlib.sha256(token.encode()).hexdigest(),
        CollaborationTicket.tenant_id == tenant_id, CollaborationTicket.expires_at > now()).returning(CollaborationTicket.user_id))).scalar_one_or_none()
    await db.commit()
    user = await db.get(User, uid) if uid else None
    if not user:
        raise HTTPException(401, "Expired or consumed ticket")
    await membership(db, tenant_id, user)
    return user.id


async def live_snapshot(db, tenant_id, user, channel_id=None):
    actor = await membership(db, tenant_id, user)
    channels_data = await channel_snapshot(db, tenant_id, user)
    count, latest = (await db.execute(select(func.count(), func.max(Notification.id)).where(
        notification_access(user.id, tenant_id), Notification.read_at.is_(None)))).one()
    # Include total/read count as well: reading one of several notifications still invalidates the inbox.
    result = dict(type="sync", channels=channels_data, unread=count, notification_revision=latest or 0, participants=[])
    repo_ids = (await db.scalars(select(Repository.id).where(Repository.tenant_id == tenant_id,
        Repository.id.in_(accessible_repository_ids(user.id))))).all()
    result["permissions"] = f"{actor.role}:" + ",".join(map(str, sorted(repo_ids)))
    if channel_id and channel_id in {c["id"] for c in channels_data}:
        allowed = {p["id"] for p in await people(tenant_id, channel_id, db, user)}
        rows = (await db.scalars(select(ChatChannelMember).where(ChatChannelMember.channel_id == channel_id,
            ChatChannelMember.user_id.in_(allowed)))).all()
        def active(value, cutoff):
            return bool(value and value.replace(tzinfo=value.tzinfo or now().tzinfo) > cutoff)
        result["participants"] = [dict(user_id=p.user_id, read_id=p.last_read_id,
            online=active(p.seen_at, now()-timedelta(seconds=35)), typing=active(p.typing_until, now())) for p in rows]
    return result


@router.websocket("/ws")
async def websocket(websocket: WebSocket, tenant_id: int):
    # Browser Origin validation also applies to ticket auth. Credentials never enter URL/logs.
    if websocket.headers.get("origin") not in settings.CORS_ALLOWED_ORIGINS:
        await websocket.close(code=4403)
        return
    await websocket.accept()
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=5)
        if len(raw.encode()) > 1024:
            await websocket.close(code=1009)
            return
        async with AsyncSessionLocal() as db:
            uid = await consume_ticket(db, tenant_id, json.loads(raw).get("ticket"))
        channel_id, previous, last_heartbeat = None, None, time.monotonic()
        started, last_presence = time.monotonic(), 0.0
        received = []
        while time.monotonic() - started < 900:  # Refresh authentication through HTTP every 15 minutes.
            async with AsyncSessionLocal() as db:
                user = await db.get(User, uid)
                if not user:
                    raise HTTPException(401)
                state = await live_snapshot(db, tenant_id, user, channel_id)
                if channel_id and channel_id not in {c["id"] for c in state["channels"]}:
                    channel_id = None
                if state != previous:
                    await websocket.send_json(state)
                    previous = state
                if channel_id and time.monotonic()-last_presence >= 10:
                    await ensure_member(db, channel_id, uid)
                    await db.execute(update(ChatChannelMember).where(ChatChannelMember.channel_id == channel_id,
                        ChatChannelMember.user_id == uid).values(seen_at=now()))
                    await db.commit()
                    last_presence = time.monotonic()
            await websocket.send_json({"type": "ping"})
            # A fixed tick bounds query traffic, even if clients flood frames.
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline:
                try:
                    raw = await asyncio.wait_for(websocket.receive_text(), timeout=max(.01, deadline-time.monotonic()))
                except asyncio.TimeoutError:
                    break
                if len(raw.encode()) > 1024:
                    await websocket.close(code=1009)
                    return
                stamp = time.monotonic()
                received = [t for t in received if t > stamp-10] + [stamp]
                if len(received) > 30:
                    await websocket.close(code=4429)
                    return
                event = json.loads(raw)
                if event.get("type") == "pong":
                    last_heartbeat = stamp
                elif event.get("type") in {"subscribe", "typing"}:
                    requested = event.get("channel_id")
                    if requested is None and event["type"] == "subscribe":
                        channel_id = None
                        continue
                    if not isinstance(requested, int):
                        raise HTTPException(422)
                    async with AsyncSessionLocal() as db:
                        user = await db.get(User, uid)
                        await require_channel(db, tenant_id, user, requested)
                        channel_id = requested
                        await ensure_member(db, channel_id, uid)
                        values = {"seen_at": now()}
                        if event["type"] == "typing":
                            values["typing_until"] = now() + timedelta(seconds=5)
                        await db.execute(update(ChatChannelMember).where(ChatChannelMember.channel_id == channel_id,
                            ChatChannelMember.user_id == uid).values(**values))
                        await db.commit()
            if time.monotonic()-last_heartbeat > 45:
                break
        await websocket.close(code=4000)
    except WebSocketDisconnect:
        pass
    except (HTTPException, ValueError, TypeError, AttributeError, KeyError):
        await websocket.close(code=4403)
