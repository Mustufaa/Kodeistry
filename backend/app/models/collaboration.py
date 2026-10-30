"""Persistent collaboration data; identity and authorization remain in existing tables."""
from datetime import datetime
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class ChatChannel(Base):
    __tablename__ = "chat_channels"
    __table_args__ = (UniqueConstraint("tenant_id", "key", name="uq_chat_channel_key"),
                      CheckConstraint("kind IN ('team','repository','direct')", name="ck_chat_channel_kind"))
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    repository_id: Mapped[int | None] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(100))
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    revision: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class ChatChannelMember(Base):
    __tablename__ = "chat_channel_members"
    channel_id: Mapped[int] = mapped_column(ForeignKey("chat_channels.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    last_read_id: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    typing_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (UniqueConstraint("sender_id", "client_id", name="uq_chat_message_client"),
                      Index("ix_chat_history", "channel_id", "id"),
                      Index("ix_chat_sender_time", "sender_id", "created_at"),
                      CheckConstraint("length(body) <= 4000", name="ck_chat_message_length"))
    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[int] = mapped_column(ForeignKey("chat_channels.id", ondelete="CASCADE"))
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    client_id: Mapped[str] = mapped_column(String(36))
    body: Mapped[str] = mapped_column(Text)
    reply_to_id: Mapped[int | None] = mapped_column(ForeignKey("chat_messages.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (UniqueConstraint("recipient_id", "dedup_key", name="uq_notification_dedup"),
                      Index("ix_notification_inbox", "recipient_id", "tenant_id", "read_at", "id"),
                      Index("ix_notification_created", "created_at"))
    id: Mapped[int] = mapped_column(primary_key=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    repository_id: Mapped[int | None] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"))
    channel_id: Mapped[int | None] = mapped_column(ForeignKey("chat_channels.id", ondelete="CASCADE"))
    admin_only: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    event_type: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(150))
    message: Mapped[str] = mapped_column(String(500))
    href: Mapped[str] = mapped_column(String(200))
    dedup_key: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CollaborationTicket(Base):
    __tablename__ = "collaboration_tickets"
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
