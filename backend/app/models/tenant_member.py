from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class TenantMember(Base):
    __tablename__ = "tenant_members"

    __table_args__ = (
        UniqueConstraint("id", "tenant_id", name="uq_member_id_tenant"),
        CheckConstraint("role IN ('OWNER', 'ADMIN', 'MEMBER')", name="ck_tenant_member_role"),
        UniqueConstraint(
            "tenant_id",
            "user_id",
            name="uq_tenant_member",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="MEMBER",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )