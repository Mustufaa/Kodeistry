"""Persistent Fix Assistant and recheck worker. Run separately from the API."""
import argparse
import asyncio
import logging
from datetime import timedelta
from pathlib import PurePosixPath

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.session import AsyncSessionLocal
from app.github.client import GitHubClient
from app.models.fix_workflow import FindingVerification, FixJob, FixSuggestion, PullRequestHead
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.models.review_finding import ReviewFinding
from app.models.review_run import ReviewRun
from app.services.fix_queue import now, set_head_and_enqueue
from app.services.fix_workflow import SourceUnavailable, resolve_rename, suggest, verify

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 3


def result_applies(database_head: str | None, live_head: str, checked_sha: str) -> bool:
    return database_head == checked_sha and live_head == checked_sha


def apply_verification_state(finding, status: str, sha: str, checked_at, reason: str):
    finding.verification_status = status
    finding.status = "dismissed" if finding.triage_status != "ACTIVE" else "resolved" if status == "RESOLVED" else "open"
    finding.resolved_at = checked_at if status == "RESOLVED" and finding.triage_status == "ACTIVE" else None
    finding.checked_commit_sha = sha
    finding.checked_at = checked_at
    finding.verification_reason = reason


async def claim() -> int | None:
    async with AsyncSessionLocal() as db:
        async with db.begin():
            exhausted = (await db.scalars(select(FixJob).where(
                FixJob.status == "RUNNING",
                FixJob.lease_expires_at < now(),
                FixJob.attempts >= MAX_ATTEMPTS,
            ).with_for_update(skip_locked=True))).all()
            for abandoned in exhausted:
                abandoned.status = "FAILED"
                abandoned.error_code = "WORKER_INTERRUPTED"
                abandoned.completed_at = now()
                abandoned.lease_expires_at = None
                if abandoned.kind == "RECHECK":
                    db.add(FindingVerification(
                        finding_id=abandoned.finding_id, checked_commit_sha=abandoned.commit_sha,
                        status="NEEDS_REVIEW", reason="Verification worker stopped before completing.",
                        evidence={"error_code": "WORKER_INTERRUPTED"}, checked_at=now(),
                    ))
                    finding = await db.get(ReviewFinding, abandoned.finding_id)
                    review = await db.get(ReviewRun, finding.review_run_id) if finding else None
                    head = await db.scalar(select(PullRequestHead.commit_sha).where(
                        PullRequestHead.repository_id == review.repository_id,
                        PullRequestHead.pull_request_number == review.pull_request_number,
                    )) if review else None
                    if finding and head == abandoned.commit_sha:
                        finding.verification_status = "NEEDS_REVIEW"
                        finding.verification_reason = "Verification worker stopped before completing."
            job = await db.scalar(
                select(FixJob).where(or_(
                    (FixJob.status == "QUEUED") & (
                        (FixJob.lease_expires_at.is_(None)) | (FixJob.lease_expires_at <= now())
                    ),
                    (FixJob.status == "RUNNING") & (FixJob.lease_expires_at < now()),
                ), FixJob.attempts < MAX_ATTEMPTS)
                .order_by(FixJob.id).with_for_update(skip_locked=True).limit(1)
            )
            if job is None:
                return None
            job.status = "RUNNING"
            job.attempts += 1
            job.lease_expires_at = now() + timedelta(minutes=5)
            return job.id


async def process(job_id: int):
    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(FixJob, ReviewFinding, ReviewRun, Repository, GitHubInstallation)
            .join(ReviewFinding, ReviewFinding.id == FixJob.finding_id)
            .join(ReviewRun, ReviewRun.id == ReviewFinding.review_run_id)
            .join(Repository, Repository.id == ReviewRun.repository_id)
            .join(GitHubInstallation, GitHubInstallation.id == Repository.github_installation_id)
            .where(FixJob.id == job_id)
        )).one_or_none()
        if not row:
            return
        job, finding, review, repository, installation = row
        if not repository.is_active or not installation.is_active or repository.tenant_id != review.tenant_id or installation.tenant_id != review.tenant_id:
            raise SourceUnavailable()
        client = GitHubClient()
        if job.kind == "SUGGEST":
            data = await suggest(finding, review, repository, installation.installation_id)
            await db.execute(pg_insert(FixSuggestion).values(
                finding_id=finding.id, commit_sha=job.commit_sha,
                generation_version=job.generation_version, content=data,
            ).on_conflict_do_nothing(index_elements=["finding_id", "commit_sha", "generation_version"]))
        else:
            live_head = await client.get_pull_request_commit_sha(
                installation.installation_id, repository.owner, repository.name, review.pull_request_number,
            )
            latest_sha = live_head
            if live_head != job.commit_sha:
                await set_head_and_enqueue(db, repository.id, review.pull_request_number, live_head)
                status, reason, evidence = "NEEDS_REVIEW", "A newer PR commit is available; this result is historical.", {}
            else:
                files = await client.get_pull_request_files(
                    installation.installation_id, repository.owner, repository.name, review.pull_request_number,
                )
                path = resolve_rename(finding.filename, files)
                related_paths = [
                    item.get("filename") for item in files
                    if path and item.get("filename") != path
                    and str(PurePosixPath(item.get("filename", "")).parent) == str(PurePosixPath(path).parent)
                ][:2]
                status, reason, evidence = await verify(
                    finding, review, repository, installation.installation_id, job.commit_sha, path, related_paths,
                ) if path else ("NEEDS_REVIEW", "File rename is ambiguous.", {})
                latest_sha = await client.get_pull_request_commit_sha(
                    installation.installation_id, repository.owner, repository.name, review.pull_request_number,
                )
                if latest_sha != job.commit_sha:
                    await set_head_and_enqueue(db, repository.id, review.pull_request_number, latest_sha)
            db.add(FindingVerification(
                finding_id=finding.id, checked_commit_sha=job.commit_sha,
                status=status, reason=reason, evidence=evidence, checked_at=now(),
            ))
            head = await db.scalar(select(PullRequestHead).where(
                PullRequestHead.repository_id == repository.id,
                PullRequestHead.pull_request_number == review.pull_request_number,
            ).with_for_update())
            if result_applies(head.commit_sha if head else None, latest_sha, job.commit_sha):
                finding = await db.scalar(select(ReviewFinding).where(ReviewFinding.id == finding.id).with_for_update().execution_options(populate_existing=True))
                apply_verification_state(finding, status, job.commit_sha, now(), reason)
        job.status = "COMPLETED"
        job.completed_at = now()
        job.lease_expires_at = None
        await db.commit()


async def fail(job_id: int, error_code: str):
    async with AsyncSessionLocal() as db:
        job = await db.get(FixJob, job_id)
        if not job:
            return
        job.error_code = error_code
        job.status = "QUEUED" if job.attempts < MAX_ATTEMPTS else "FAILED"
        job.lease_expires_at = now() + timedelta(seconds=30 * (2 ** job.attempts)) if job.status == "QUEUED" else None
        if job.status == "FAILED":
            job.completed_at = now()
            if job.kind == "RECHECK":
                db.add(FindingVerification(finding_id=job.finding_id, checked_commit_sha=job.commit_sha,
                    status="NEEDS_REVIEW", reason="Verification could not complete.",
                    evidence={"error_code": error_code}, checked_at=now()))
            if job.kind == "RECHECK":
                finding = await db.get(ReviewFinding, job.finding_id)
                if finding and finding.verification_status == "RECHECKING":
                    review = await db.get(ReviewRun, finding.review_run_id)
                    head = await db.scalar(select(PullRequestHead.commit_sha).where(
                        PullRequestHead.repository_id == review.repository_id,
                        PullRequestHead.pull_request_number == review.pull_request_number,
                    )) if review else None
                    if head == job.commit_sha:
                        finding.verification_status = "NEEDS_REVIEW"
                        finding.verification_reason = "Verification could not complete."
        await db.commit()


async def run_once() -> bool:
    job_id = await claim()
    if job_id is None:
        return False
    try:
        await process(job_id)
    except SourceUnavailable:
        await fail(job_id, "SOURCE_UNAVAILABLE")
    except Exception:
        logger.warning("Fix workflow job %s failed", job_id)
        await fail(job_id, "WORKER_FAILURE")
    return True


async def main(poll_seconds: float):
    while True:
        if not await run_once():
            await asyncio.sleep(poll_seconds)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--poll-seconds", type=float, default=3.0)
    args = parser.parse_args()
    asyncio.run(main(args.poll_seconds))

