from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class SecretScanRun(Base):
    __tablename__ = "secret_scan_runs"
    __table_args__ = (
        Index(
            "uq_secret_scan_active",
            "repository_id", "branch", "scope",
            unique=True,
            postgresql_where=text("status IN ('QUEUED', 'RUNNING')"),
            sqlite_where=text("status IN ('QUEUED', 'RUNNING')"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    branch: Mapped[str] = mapped_column(String(255), nullable=False)
    scope: Mapped[str] = mapped_column(String(20), nullable=False)
    resolved_commit_sha: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="QUEUED", index=True)
    stage: Mapped[str] = mapped_column(String(80), nullable=False, default="Queued")
    scanner_version: Mapped[str] = mapped_column(String(30), nullable=False)
    findings_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    files_scanned: Mapped[int | None] = mapped_column(Integer)
    commits_scanned: Mapped[int | None] = mapped_column(Integer)
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    coverage_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    coverage_note: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(String(60))
    cancel_requested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lease_owner: Mapped[str | None] = mapped_column(String(100))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SecretFinding(Base):
    __tablename__ = "secret_findings"
    __table_args__ = (UniqueConstraint("fingerprint", name="uq_secret_finding_fingerprint"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, index=True)
    branch: Mapped[str] = mapped_column(String(255), nullable=False)
    scope: Mapped[str] = mapped_column(String(20), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    rule_id: Mapped[str] = mapped_column(String(120), nullable=False)
    secret_type: Mapped[str] = mapped_column(String(160), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    confidence: Mapped[str] = mapped_column(String(20), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    preview: Mapped[str] = mapped_column(String(20), nullable=False, default="[REDACTED]")
    disposition: Mapped[str] = mapped_column(String(30), nullable=False, default="OPEN", index=True)
    dismissal_reason: Mapped[str | None] = mapped_column(String(500))
    first_detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SecretOccurrence(Base):
    __tablename__ = "secret_occurrences"
    __table_args__ = (UniqueConstraint("run_id", "finding_id", "commit_sha", "file_path", "line", name="uq_secret_occurrence"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("secret_scan_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    finding_id: Mapped[int] = mapped_column(ForeignKey("secret_findings.id", ondelete="CASCADE"), nullable=False, index=True)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    line: Mapped[int] = mapped_column(Integer, nullable=False)
    commit_sha: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
