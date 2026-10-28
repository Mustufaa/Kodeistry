import dataclasses
import json
import logging
import os
from pathlib import Path
import shutil
import subprocess

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.secret_scans import _connected_repository
from app.core.config import settings
from app.db.base import Base
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.models.secret_scan import SecretFinding, SecretScanRun
from app.models.tenant_member import TenantMember
from app.models.user import User
from app.secret_scanner import worker
from app.secret_scanner.engine import _detections, ScanResult, CONFIG_PATH

# Import related tables before creating SQLite test metadata.
import app.models.tenant  # noqa: F401
import app.models.user  # noqa: F401

SYNTHETIC_SECRET = "postgresql://fixture:localonly-Z8x7Q6w5@localhost/fixture"


def _run(args: list[str], cwd: Path) -> int:
    return subprocess.run(args, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode


def test_gitleaks_detects_current_files_and_removed_history(tmp_path: Path):
    binary = os.environ.get("GITLEAKS_PATH") or shutil.which("gitleaks")
    if not binary:
        pytest.skip("Pinned Gitleaks binary is unavailable")
    repo = tmp_path / "repo"
    repo.mkdir()
    assert _run(["git", "init", "-q"], repo) == 0
    (repo / "fixture.env").write_text("DATABASE_URL=" + SYNTHETIC_SECRET, encoding="utf-8")
    assert _run(["git", "add", "fixture.env"], repo) == 0
    assert _run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "-m", "synthetic fixture"], repo) == 0
    current_report = tmp_path / "current.json"
    base = [binary, "--config", str(CONFIG_PATH), "--report-format=json", "--redact=100",
            "--no-banner", "--no-color", "--log-level=fatal", "--exit-code=42",
            "--ignore-gitleaks-allow", "--max-target-megabytes", "10"]
    assert _run(base + ["--report-path", str(current_report), "dir", str(repo)], repo) == 42
    current = json.loads(current_report.read_text(encoding="utf-8"))
    assert any(item["RuleID"] == "kodeistry-credentialed-database-url" for item in current)

    (repo / "fixture.env").unlink()
    assert _run(["git", "add", "-u"], repo) == 0
    assert _run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-q", "-m", "remove fixture"], repo) == 0
    latest_report = tmp_path / "latest.json"
    assert _run(base + ["--report-path", str(latest_report), "dir", str(repo)], repo) == 0
    assert json.loads(latest_report.read_text(encoding="utf-8")) == []
    history_report = tmp_path / "history.json"
    assert _run(base + ["--report-path", str(history_report), "--log-opts=--full-history HEAD", "git", str(repo)], repo) == 42
    history = json.loads(history_report.read_text(encoding="utf-8"))
    assert any(item["RuleID"] == "kodeistry-credentialed-database-url" and item["Commit"] for item in history)


def test_raw_report_is_reduced_to_masked_metadata(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "SECRET_SCANNER_HMAC_KEY", "synthetic-local-test-key-0123456789-abcdefgh")
    report = tmp_path / "raw.json"
    report.write_text(json.dumps([{
        "Secret": SYNTHETIC_SECRET,
        "RuleID": "kodeistry-credentialed-database-url",
        "File": "fixture.env",
        "StartLine": 2,
        "Commit": "a" * 40,
        "Match": "DATABASE_URL=" + SYNTHETIC_SECRET,
        "Line": "DATABASE_URL=" + SYNTHETIC_SECRET,
    }]), encoding="utf-8")
    run = SecretScanRun(tenant_id=1, repository_id=1, requested_by_id=1, branch="main", scope="CURRENT_FILES", scanner_version="8.30.1")
    detections = _detections(report, tmp_path, run, "a" * 40)
    assert len(detections) == 1
    serialized = json.dumps(dataclasses.asdict(detections[0]))
    assert SYNTHETIC_SECRET not in serialized
    assert "localonly-Z8x7Q6w5" not in serialized
    assert len(detections[0].fingerprint) == 64
    assert detections == _detections(report, tmp_path, run, "a" * 40)


@pytest_asyncio.fixture
async def database(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    try:
        yield sessions
    finally:
        await engine.dispose()


def _scan(status="RUNNING", attempts=1):
    return SecretScanRun(
        tenant_id=1, repository_id=1, requested_by_id=1, branch="main",
        scope="CURRENT_FILES", status=status, stage="Running", scanner_version="8.30.1",
        attempts=attempts, lease_owner=worker.WORKER_ID,
    )


def _finding():
    return SecretFinding(
        tenant_id=1, repository_id=1, branch="main", scope="CURRENT_FILES",
        fingerprint="a" * 64, rule_id="fixture-rule", secret_type="Fixture",
        severity="MEDIUM", confidence="MEDIUM", file_path="fixture.env",
        preview="[REDACTED]", disposition="OPEN",
    )


@pytest.mark.asyncio
async def test_partial_scan_preserves_open_findings(database):
    async with database() as session:
        run = _scan()
        session.add_all([run, _finding()])
        await session.commit()
        run_id = run.id
    result = ScanResult("b" * 40, [], 1, None, 1, False, "One file skipped")
    await worker._record_result(run_id, result)
    async with database() as session:
        finding = await session.scalar(select(SecretFinding))
        assert finding.disposition == "OPEN"
        run = await session.get(SecretScanRun, run_id)
        assert run.status == "COMPLETED"
        assert not run.coverage_complete


@pytest.mark.asyncio
async def test_complete_comparable_scan_marks_absent_finding(database):
    async with database() as session:
        run = _scan()
        session.add_all([run, _finding()])
        await session.commit()
        run_id = run.id
    result = ScanResult("b" * 40, [], 1, None, 0, True, None)
    await worker._record_result(run_id, result)
    async with database() as session:
        finding = await session.scalar(select(SecretFinding))
        assert finding.disposition == "REMOVED_FROM_SCANNED_SCOPE"


@pytest.mark.asyncio
async def test_active_duplicate_is_rejected_by_database(database):
    async with database() as session:
        session.add(_scan(status="QUEUED"))
        await session.commit()
    async with database() as session:
        session.add(_scan(status="QUEUED"))
        with pytest.raises(IntegrityError):
            await session.commit()


@pytest.mark.asyncio
async def test_other_user_cannot_access_connected_repository(database):
    async with database() as session:
        session.add(GitHubInstallation(id=1, tenant_id=1, installation_id=77, account_login="fixture", account_type="User"))
        session.add(Repository(
            id=1, tenant_id=1, github_installation_id=1, github_repository_id=99,
            owner="fixture", name="repo", full_name="fixture/repo", private=True,
            default_branch="main",
        ))
        session.add(TenantMember(tenant_id=1, user_id=2, role="MEMBER"))
        await session.commit()
        with pytest.raises(HTTPException) as denied:
            await _connected_repository(session, User(id=1), 1)
        assert denied.value.status_code == 404


def test_worker_recovery_is_bounded():
    run = _scan(status="RUNNING", attempts=1)
    worker.recover_expired_run(run)
    assert run.status == "QUEUED"
    run = _scan(status="RUNNING", attempts=3)
    worker.recover_expired_run(run)
    assert run.status == "FAILED"
    run = _scan(status="RUNNING", attempts=1)
    run.cancel_requested = True
    worker.recover_expired_run(run)
    assert run.status == "CANCELLED"


@pytest.mark.asyncio
async def test_unexpected_worker_error_never_logs_secret(database, monkeypatch, caplog):
    async with database() as session:
        session.add(GitHubInstallation(id=1, tenant_id=1, installation_id=77, account_login="fixture", account_type="User"))
        session.add(Repository(
            id=1, tenant_id=1, github_installation_id=1, github_repository_id=99,
            owner="fixture", name="repo", full_name="fixture/repo", private=True,
            default_branch="main",
        ))
        session.add(TenantMember(tenant_id=1, user_id=1, role="OWNER"))
        run = _scan()
        session.add(run)
        await session.commit()
        run_id = run.id

    async def fail(*args, **kwargs):
        raise RuntimeError(SYNTHETIC_SECRET)

    monkeypatch.setattr(worker, "scan_repository", fail)
    with caplog.at_level(logging.ERROR):
        await worker.run_one(run_id)
    assert SYNTHETIC_SECRET not in caplog.text
    async with database() as session:
        assert (await session.get(SecretScanRun, run_id)).status == "FAILED"

@pytest.mark.asyncio
async def test_engine_scans_selected_branch_without_live_github(tmp_path: Path, monkeypatch):
    """Exercise fetch, snapshot/history modes, report reduction, and cleanup."""
    from types import SimpleNamespace
    import app.secret_scanner.engine as scanner

    binary = os.environ.get("GITLEAKS_PATH") or shutil.which("gitleaks")
    if not binary:
        pytest.skip("Pinned Gitleaks binary is unavailable")
    monkeypatch.setattr(settings, "GITLEAKS_PATH", binary)
    monkeypatch.setattr(settings, "SECRET_SCANNER_HMAC_KEY", "synthetic-local-test-key-0123456789-abcdefgh")
    origin = tmp_path / "origin"
    origin.mkdir()
    assert _run(["git", "init", "-q", "-b", "main"], origin) == 0
    (origin / "fixture.env").write_text("DATABASE_URL=" + SYNTHETIC_SECRET, encoding="utf-8")
    assert _run(["git", "add", "fixture.env"], origin) == 0
    assert _run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                 "commit", "-q", "-m", "synthetic fixture"], origin) == 0
    (origin / "fixture.env").unlink()
    assert _run(["git", "add", "-u"], origin) == 0
    assert _run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                 "commit", "-q", "-m", "remove fixture"], origin) == 0

    real_command = scanner._command

    async def local_origin(args, **kwargs):
        if args[:3] == ["git", "remote", "add"]:
            args = [*args[:-1], str(origin)]
        return await real_command(args, **kwargs)

    async def fake_token(_installation_id):
        return "synthetic-token"

    monkeypatch.setattr(scanner, "_command", local_origin)
    monkeypatch.setattr(scanner, "get_installation_access_token", fake_token)
    async def never_cancelled():
        return False

    repository = SimpleNamespace(owner="fixture", name="repo")
    installation = SimpleNamespace(installation_id=77)
    current_run = SecretScanRun(tenant_id=1, repository_id=1, requested_by_id=1,
                                branch="main", scope="CURRENT_FILES", scanner_version="8.30.1")
    current = await scanner.scan_repository(current_run, repository, installation, never_cancelled)
    assert current.coverage_complete
    assert current.detections == []
    assert current.resolved_commit_sha

    history_run = SecretScanRun(tenant_id=1, repository_id=1, requested_by_id=1,
                                branch="main", scope="GIT_HISTORY", scanner_version="8.30.1")
    history = await scanner.scan_repository(history_run, repository, installation, never_cancelled)
    assert history.commits_scanned == 2
    assert not history.coverage_complete
    assert any(item.rule_id == "kodeistry-credentialed-database-url" for item in history.detections)
    assert SYNTHETIC_SECRET not in repr(history)
@pytest.mark.asyncio
async def test_persisted_finding_and_api_view_are_masked(database, tmp_path: Path, monkeypatch):
    from app.api.secret_scans import _finding_view
    from app.models.secret_scan import SecretOccurrence

    monkeypatch.setattr(settings, "SECRET_SCANNER_HMAC_KEY", "synthetic-local-test-key-0123456789-abcdefgh")
    report = tmp_path / "report.json"
    report.write_text(json.dumps([{
        "Secret": SYNTHETIC_SECRET,
        "RuleID": "kodeistry-credentialed-database-url",
        "File": "fixture.env",
        "StartLine": 1,
        "Commit": "a" * 40,
    }]), encoding="utf-8")
    async with database() as session:
        run = _scan()
        session.add(run)
        await session.commit()
        run_id = run.id
    detections = _detections(report, tmp_path, run, "a" * 40)
    await worker._record_result(run_id, ScanResult("a" * 40, detections, 1, None, 0, True, None))
    async with database() as session:
        finding = await session.scalar(select(SecretFinding))
        occurrence = await session.scalar(select(SecretOccurrence))
        assert finding is not None and occurrence is not None
        assert finding.preview == "[REDACTED]"
        persisted = repr(finding.__dict__) + repr(occurrence.__dict__)
        response = _finding_view(finding, occurrence).model_dump_json()
        assert SYNTHETIC_SECRET not in persisted + response
        assert "localonly-Z8x7Q6w5" not in persisted + response
        assert '"validity":"NOT_CHECKED"' in response