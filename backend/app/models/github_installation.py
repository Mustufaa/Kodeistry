from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, BigInteger, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class GitHubInstallation(Base):
    __tablename__ = "github_installations"

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "installation_id",
            name="uq_tenant_github_installation",
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

    installation_id: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        unique=True,
        index=True,
    )

    account_login: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    account_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )

    account_avatar_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    account_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    disconnected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
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