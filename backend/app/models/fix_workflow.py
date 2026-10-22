from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.db.base import Base

class PullRequestHead(Base):
    __tablename__ = "pull_request_heads"
    __table_args__ = (UniqueConstraint("repository_id", "pull_request_number"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    pull_request_number: Mapped[int] = mapped_column(Integer)
    commit_sha: Mapped[str] = mapped_column(String(255))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class FixJob(Base):
    __tablename__ = "fix_jobs"
    __table_args__ = (UniqueConstraint("finding_id", "commit_sha", "kind", "generation_version"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    finding_id: Mapped[int] = mapped_column(ForeignKey("review_findings.id", ondelete="CASCADE"), index=True)
    commit_sha: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(20))
    generation_version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="QUEUED", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(50))

class FixSuggestion(Base):
    __tablename__ = "fix_suggestions"
    __table_args__ = (UniqueConstraint("finding_id", "commit_sha", "generation_version"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    finding_id: Mapped[int] = mapped_column(ForeignKey("review_findings.id", ondelete="CASCADE"), index=True)
    commit_sha: Mapped[str] = mapped_column(String(255))
    generation_version: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class FindingVerification(Base):
    __tablename__ = "finding_verifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    finding_id: Mapped[int] = mapped_column(ForeignKey("review_findings.id", ondelete="CASCADE"), index=True)
    checked_commit_sha: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(Text)
    evidence: Mapped[dict | None] = mapped_column(JSON)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
