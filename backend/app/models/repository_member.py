"""Explicit repository grants, constrained to a single team."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKeyConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class RepositoryMember(Base):
    __tablename__ = "repository_members"
    __table_args__ = (
        ForeignKeyConstraint(["member_id", "tenant_id"], ["tenant_members.id", "tenant_members.tenant_id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["repository_id", "tenant_id"], ["repositories.id", "repositories.tenant_id"], ondelete="CASCADE"),
    )
    member_id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
