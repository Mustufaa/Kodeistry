from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class Tenant(Base):
    __tablename__ = "tenants"
    __table_args__ = (
        CheckConstraint(
            "workspace_type IN ('PERSONAL', 'ORGANIZATION')",
            name="ck_tenants_workspace_type",
        ),
        CheckConstraint(
            "(workspace_type = 'PERSONAL' AND personal_owner_user_id IS NOT NULL) "
            "OR (workspace_type = 'ORGANIZATION' AND personal_owner_user_id IS NULL)",
            name="ck_tenants_personal_owner",
        ),
        UniqueConstraint(
            "personal_owner_user_id",
            name="uq_tenants_personal_owner",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    slug: Mapped[str] = mapped_column(
        String(150),
        unique=True,
        nullable=False,
        index=True,
    )

    workspace_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="ORGANIZATION",
        server_default="ORGANIZATION",
    )

    personal_owner_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
            name="fk_tenants_personal_owner_user_id_users",
        ),
        nullable=True,
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