from datetime import datetime
from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class TeamInvitation(Base):
    __tablename__ = "team_invitations"
    __table_args__ = (
        CheckConstraint("role IN ('OWNER', 'ADMIN', 'MEMBER')", name="ck_invitation_role"),
        CheckConstraint("email = lower(trim(email))", name="ck_invitation_email"),
        Index("uq_pending_team_email", "tenant_id", "email", unique=True,
              postgresql_where=text("accepted_at IS NULL AND revoked_at IS NULL"),
              sqlite_where=text("accepted_at IS NULL AND revoked_at IS NULL")),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30))
    repository_ids: Mapped[list[int]] = mapped_column(JSON, default=list, server_default="[]")
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    inviter_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class InvitationSendAttempt(Base):
    """Limits shared by API processes, including failed deliveries."""
    __tablename__ = "invitation_send_attempts"
    __table_args__ = (Index("ix_invitation_attempt_user_time", "user_id", "created_at"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
