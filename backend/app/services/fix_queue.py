"""Database-backed queue and stable tracked finding identity."""
import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.fix_workflow import FixJob, PullRequestHead
from app.models.review_finding import ReviewFinding
from app.models.review_run import ReviewRun
from app.services.fix_workflow import VERSION, fingerprint


def now():
    return datetime.now(timezone.utc)


async def enqueue(db, finding_id: int, sha: str, kind: str, generation_version: int = VERSION):
    statement = pg_insert(FixJob).values(
        finding_id=finding_id, commit_sha=sha, kind=kind,
        generation_version=generation_version, status="QUEUED", attempts=0,
    ).on_conflict_do_nothing(index_elements=["finding_id", "commit_sha", "kind", "generation_version"])
    result = await db.execute(statement)
    return result.rowcount > 0


async def set_head_and_enqueue(db, repository_id: int, pull_number: int, sha: str):
    statement = pg_insert(PullRequestHead).values(
        repository_id=repository_id, pull_request_number=pull_number, commit_sha=sha,
    ).on_conflict_do_update(
        index_elements=["repository_id", "pull_request_number"],
        set_={"commit_sha": sha, "updated_at": now()},
    )
    await db.execute(statement)
    rows = (await db.execute(
        select(ReviewFinding, ReviewRun)
        .join(ReviewRun, ReviewRun.id == ReviewFinding.review_run_id)
        .where(
            ReviewRun.repository_id == repository_id,
            ReviewRun.pull_request_number == pull_number,
            ReviewFinding.tracked_finding_id.is_(None),
            ReviewFinding.triage_status == "ACTIVE",
            ReviewRun.commit_sha != sha,
        )
    )).all()
    for finding, review in rows:
        # Queueing is idempotent for a given finding and target commit.
        if await enqueue(db, finding.id, sha, "RECHECK"):
            finding.verification_status = "RECHECKING"
            finding.status = "open"
            finding.resolved_at = None


async def attach_observations(db, review, new_findings: list[ReviewFinding], review_files: list[dict] | None = None):
    """Match only a unique same-PR, same-file, same-category, same-issue candidate."""
    prior = (await db.execute(
        select(ReviewFinding, ReviewRun)
        .join(ReviewRun, ReviewRun.id == ReviewFinding.review_run_id)
        .where(
            ReviewRun.repository_id == review.repository_id,
            ReviewRun.pull_request_number == review.pull_request_number,
            ReviewRun.id != review.id,
            ReviewFinding.tracked_finding_id.is_(None),
            ReviewFinding.triage_status == "ACTIVE",
        )
    )).all()
    used = set()
    for finding in new_findings:
        finding.fingerprint = fingerprint(finding.category, finding.message, finding.filename)
        source_lines = [
            line.get("content", "").strip() for file in (review_files or [])
            if file.get("filename") == finding.filename
            for line in file.get("changed_lines", []) if line.get("line") == finding.line
        ]
        if len(source_lines) == 1 and len(source_lines[0]) >= 8:
            finding.source_anchor = hashlib.sha256(source_lines[0].encode()).hexdigest()
        candidates = [old for old, _ in prior
            if fingerprint(old.category, old.message, old.filename) == finding.fingerprint
            and old.id not in used
            and (
                getattr(old, "source_anchor", None) == getattr(finding, "source_anchor", None)
                if getattr(old, "source_anchor", None) and getattr(finding, "source_anchor", None)
                else abs(getattr(old, "line", 0) - finding.line) <= 40
            )]
        if len(candidates) == 1:
            canonical = candidates[0]
            finding.tracked_finding_id = canonical.id
            used.add(canonical.id)
            if canonical.verification_status == "RESOLVED":
                queued = await enqueue(db, canonical.id, review.commit_sha, "RECHECK")
                if not queued:
                    latest = await db.scalar(select(FixJob).where(
                        FixJob.finding_id == canonical.id,
                        FixJob.commit_sha == review.commit_sha,
                        FixJob.kind == "RECHECK",
                    ).order_by(FixJob.generation_version.desc()))
                    if latest and latest.status in {"COMPLETED", "FAILED"}:
                        queued = await enqueue(db, canonical.id, review.commit_sha, "RECHECK", latest.generation_version + 1)
                    elif latest and latest.status in {"QUEUED", "RUNNING"}:
                        queued = True
                canonical.verification_status = "RECHECKING" if queued else "NEEDS_REVIEW"
                canonical.verification_reason = "A later review observed this issue again."
                canonical.status = "open"
                canonical.resolved_at = None

