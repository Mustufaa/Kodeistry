"""Durable manual-scan worker. Run as a separate process, never from FastAPI."""
import argparse
import asyncio
from datetime import datetime, timedelta, timezone
import logging
import os
from pathlib import Path
import shutil
import tempfile
import uuid

from sqlalchemy import func, select, text

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.models.secret_scan import SecretFinding, SecretOccurrence, SecretScanRun
from app.models.tenant_member import TenantMember
from app.secret_scanner.engine import ScanCancelled, ScanFailure, ScanResult, scan_repository

logger = logging.getLogger(__name__)
LEASE_SECONDS = 90
MAX_ATTEMPTS = 3
WORKER_ID = uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


def cleanup_abandoned_workspaces() -> None:
    """Only remove scanner-created directories under this user's temp root."""
    root = Path(tempfile.gettempdir()).resolve()
    cutoff = _now().timestamp() - 7200
    for candidate in root.glob("kodeistry-secret-*"):
        try:
            resolved = candidate.resolve()
            if (
                candidate.is_symlink() or not candidate.is_dir()
                or resolved.parent != root or not candidate.name.startswith("kodeistry-secret-")
                or candidate.stat().st_mtime > cutoff
            ):
                continue
            shutil.rmtree(candidate)
        except OSError:
            logger.warning("Could not clean an abandoned scanner workspace.")


def recover_expired_run(run: SecretScanRun) -> None:
    run.lease_owner = None
    run.lease_expires_at = None
    if run.cancel_requested:
        run.status = "CANCELLED"
        run.stage = "Cancelled"
        run.completed_at = _now()
    elif run.attempts >= MAX_ATTEMPTS:
        run.status = "FAILED"
        run.stage = "Failed"
        run.error_code = "WORKER_INTERRUPTED"
        run.completed_at = _now()
    else:
        run.status = "QUEUED"
        run.stage = "Recovering after worker interruption"


async def claim_job() -> int | None:
    async with AsyncSessionLocal() as db:
        async with db.begin():
            # Serialize the global concurrency check and claim across worker processes.
            await db.execute(text("SELECT pg_advisory_xact_lock(71519032)"))
            expired = (await db.execute(
                select(SecretScanRun).where(
                    SecretScanRun.status == "RUNNING",
                    SecretScanRun.lease_expires_at < _now(),
                ).with_for_update(skip_locked=True)
            )).scalars().all()
            for run in expired:
                recover_expired_run(run)
            running = await db.scalar(select(func.count()).select_from(SecretScanRun).where(
                SecretScanRun.status == "RUNNING",
                SecretScanRun.lease_expires_at >= _now(),
            )) or 0
            if running >= settings.SECRET_SCAN_MAX_CONCURRENT:
                return None
            run = await db.scalar(
                select(SecretScanRun)
                .where(SecretScanRun.status == "QUEUED")
                .order_by(SecretScanRun.id)
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            if run is None:
                return None
            if run.cancel_requested:
                run.status = "CANCELLED"
                run.stage = "Cancelled"
                run.completed_at = _now()
                return None
            run.status = "RUNNING"
            run.stage = "Preparing isolated workspace"
            run.attempts += 1
            run.started_at = run.started_at or _now()
            run.lease_owner = WORKER_ID
            run.lease_expires_at = _now() + timedelta(seconds=LEASE_SECONDS)
            return run.id


async def heartbeat(scan_id: int, stage: str | None = None) -> bool:
    async with AsyncSessionLocal() as db:
        async with db.begin():
            run = await db.get(SecretScanRun, scan_id, with_for_update=True)
            if run is None or run.status != "RUNNING" or run.lease_owner != WORKER_ID:
                return True
            if stage is not None:
                run.stage = stage
            run.lease_expires_at = _now() + timedelta(seconds=LEASE_SECONDS)
            return run.cancel_requested


async def _record_result(scan_id: int, result: ScanResult) -> None:
    async with AsyncSessionLocal() as db:
        async with db.begin():
            run = await db.get(SecretScanRun, scan_id, with_for_update=True)
            if run is None or run.status != "RUNNING" or run.lease_owner != WORKER_ID:
                raise ScanCancelled()
            if run.cancel_requested:
                raise ScanCancelled()
            seen: set[str] = set()
            identities: set[int] = set()
            for item in result.detections:
                finding = await db.scalar(select(SecretFinding).where(SecretFinding.fingerprint == item.fingerprint))
                if finding is None:
                    finding = SecretFinding(
                        tenant_id=run.tenant_id, repository_id=run.repository_id,
                        branch=run.branch, scope=run.scope, fingerprint=item.fingerprint,
                        rule_id=item.rule_id, secret_type=item.secret_type, severity=item.severity,
                        confidence=item.confidence, file_path=item.file_path,
                        preview="[REDACTED]", disposition="OPEN",
                    )
                    db.add(finding)
                    await db.flush()
                else:
                    finding.last_seen_at = _now()
                    if finding.disposition == "REMOVED_FROM_SCANNED_SCOPE":
                        finding.disposition = "OPEN"
                identities.add(finding.id)
                key = f"{finding.id}:{item.commit_sha}:{item.file_path}:{item.line}"
                if key in seen:
                    continue
                seen.add(key)
                db.add(SecretOccurrence(
                    run_id=run.id, finding_id=finding.id,
                    file_path=item.file_path, line=item.line, commit_sha=item.commit_sha,
                ))
            if result.coverage_complete:
                previous = (await db.execute(select(SecretFinding).where(
                    SecretFinding.repository_id == run.repository_id,
                    SecretFinding.branch == run.branch,
                    SecretFinding.scope == run.scope,
                    SecretFinding.disposition == "OPEN",
                ))).scalars().all()
                for finding in previous:
                    if finding.id not in identities:
                        finding.disposition = "REMOVED_FROM_SCANNED_SCOPE"
            run.resolved_commit_sha = result.resolved_commit_sha
            run.findings_count = len(identities)
            run.files_scanned = result.files_scanned
            run.commits_scanned = result.commits_scanned
            run.skipped_count = result.skipped_count
            run.coverage_complete = result.coverage_complete
            run.coverage_note = result.coverage_note
            run.status = "COMPLETED"
            run.stage = "Completed" if result.coverage_complete else "Completed with limited coverage"
            run.completed_at = _now()
            run.lease_owner = None
            run.lease_expires_at = None


async def _finish(scan_id: int, status: str, code: str | None = None, retry: bool = False) -> None:
    async with AsyncSessionLocal() as db:
        async with db.begin():
            run = await db.get(SecretScanRun, scan_id, with_for_update=True)
            if run is None or run.lease_owner != WORKER_ID:
                return
            run.lease_owner = None
            run.lease_expires_at = None
            if run.cancel_requested or status == "CANCELLED":
                run.status = "CANCELLED"
                run.stage = "Cancelled"
                run.completed_at = _now()
            elif retry and run.attempts < MAX_ATTEMPTS:
                run.status = "QUEUED"
                run.stage = "Retrying temporary scanner failure"
                run.error_code = code
            else:
                run.status = "FAILED"
                run.stage = "Failed"
                run.error_code = code or "SCAN_FAILED"
                run.completed_at = _now()


async def run_one(scan_id: int) -> None:
    try:
        async with AsyncSessionLocal() as db:
            run = await db.get(SecretScanRun, scan_id)
            if run is None:
                return
            row = (await db.execute(
                select(Repository, GitHubInstallation)
                .join(GitHubInstallation, Repository.github_installation_id == GitHubInstallation.id)
                .join(TenantMember, TenantMember.tenant_id == Repository.tenant_id)
                .where(
                    Repository.id == run.repository_id,
                    Repository.is_active.is_(True),
                    GitHubInstallation.is_active.is_(True),
                    TenantMember.user_id == run.requested_by_id,
                )
            )).first()
            if row is None:
                raise ScanFailure("ACCESS_REVOKED")
            repository, installation = row
            await heartbeat(scan_id, "Fetching selected branch")
            result = await scan_repository(run, repository, installation, lambda: heartbeat(scan_id), lambda stage: heartbeat(scan_id, stage))
        await _record_result(scan_id, result)
        logger.info("Secret scan completed run_id=%s", scan_id)
    except ScanCancelled:
        await _finish(scan_id, "CANCELLED")
    except ScanFailure as exc:
        logger.warning("Secret scan failed run_id=%s code=%s", scan_id, exc.code)
        await _finish(scan_id, "FAILED", exc.code, exc.retryable)
    except Exception as exc:
        # Never log exception text or traceback: scanner/transport errors can contain credentials.
        logger.error("Secret scan failed run_id=%s exception_type=%s", scan_id, type(exc).__name__)
        await _finish(scan_id, "FAILED", "SCAN_FAILED")


async def serve(once: bool = False) -> None:
    cleanup_abandoned_workspaces()
    while True:
        scan_id = None
        try:
            scan_id = await claim_job()
            if scan_id is not None:
                await run_one(scan_id)
        except Exception as exc:
            logger.error("Scanner worker loop failed exception_type=%s", type(exc).__name__)
            if once:
                raise
        if once:
            return
        await asyncio.sleep(2 if scan_id is not None else 5)


def main() -> None:
    parser = argparse.ArgumentParser(description="Process explicitly requested Secret Scanner jobs.")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if os.name != "nt":
        os.umask(0o077)
    asyncio.run(serve(once=args.once))


if __name__ == "__main__":
    main()
