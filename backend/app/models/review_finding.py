from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class ReviewFinding(Base):
    __tablename__ = "review_findings"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    review_run_id: Mapped[int] = mapped_column(
        ForeignKey(
            "review_runs.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    filename: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    line: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    category: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        index=True,
    )

    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    suggestion: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    why_it_matters: Mapped[str | None] = mapped_column(Text, nullable=True)

    recommended_approach: Mapped[str | None] = mapped_column(Text, nullable=True)

    verification_steps: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="open",
        server_default="open",
        index=True,
    )

    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    fingerprint: Mapped[str | None] = mapped_column(String(64), index=True)
    source_anchor: Mapped[str | None] = mapped_column(String(64))
    tracked_finding_id: Mapped[int | None] = mapped_column(ForeignKey("review_findings.id", ondelete="SET NULL"), index=True)
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN", server_default="OPEN")
    triage_status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE", server_default="ACTIVE")
    triage_reason: Mapped[str | None] = mapped_column(Text)
    checked_commit_sha: Mapped[str | None] = mapped_column(String(255))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_reason: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
