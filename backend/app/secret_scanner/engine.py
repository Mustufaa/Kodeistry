"""Isolated, bounded Gitleaks execution. Raw reports never leave this module."""
import asyncio
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass

from app.core.config import settings
from app.github.auth import get_installation_access_token
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.models.secret_scan import SecretScanRun

VERSION = "8.30.1"
CONFIG_PATH = Path(__file__).with_name("gitleaks.toml")
EXAMPLE_VALUES = {"example", "sample", "dummy", "test", "changeme", "password", "12345678", "your-token"}
HEX_SHA = re.compile(r"^[0-9a-f]{40}$")
RULE_ID = re.compile(r"^[a-zA-Z0-9_-]{1,120}$")
OWNER = re.compile(r"^[A-Za-z0-9-]{1,255}$")
REPO = re.compile(r"^[A-Za-z0-9._-]{1,255}$")


class ScanFailure(Exception):
    def __init__(self, code: str, retryable: bool = False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class ScanCancelled(Exception):
    pass


@dataclass(frozen=True)
class Detection:
    fingerprint: str
    rule_id: str
    secret_type: str
    severity: str
    confidence: str
    file_path: str
    line: int
    commit_sha: str


@dataclass(frozen=True)
class ScanResult:
    resolved_commit_sha: str
    detections: list[Detection]
    files_scanned: int | None
    commits_scanned: int | None
    skipped_count: int
    coverage_complete: bool
    coverage_note: str | None


def fingerprint(secret: str, rule_id: str, path: str, run: SecretScanRun) -> str:
    key = settings.SECRET_SCANNER_HMAC_KEY.encode("utf-8")
    if len(key) < 32:
        raise ScanFailure("HMAC_KEY_NOT_CONFIGURED")
    payload = "\0".join((str(run.tenant_id), str(run.repository_id), run.branch, run.scope, rule_id, path, secret))
    return hmac.new(key, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def _directory_size(path: Path) -> int:
    total = 0
    for base, _, filenames in os.walk(path):
        for name in filenames:
            try:
                total += (Path(base) / name).stat().st_size
            except OSError:
                pass
    return total


async def _command(args: list[str], *, cwd: Path, env: dict[str, str], deadline: float,
                   root: Path, capture: bool = False, cancelled=None, allowed_exit_codes=(0,)) -> bytes:
    try:
        proc = await asyncio.create_subprocess_exec(
            *args, cwd=str(cwd), env=env,
            stdout=asyncio.subprocess.PIPE if capture else asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    except (OSError, ValueError) as exc:
        raise ScanFailure("DEPENDENCY_UNAVAILABLE") from None
    task = asyncio.create_task(proc.communicate())
    try:
        while True:
            try:
                stdout, _ = await asyncio.wait_for(asyncio.shield(task), timeout=2)
                if proc.returncode not in allowed_exit_codes:
                    raise ScanFailure("PROCESS_FAILED")
                return stdout or b""
            except asyncio.TimeoutError:
                if cancelled and await cancelled():
                    raise ScanCancelled()
                if time.monotonic() >= deadline:
                    raise ScanFailure("SCAN_TIMEOUT")
                if _directory_size(root) > settings.SECRET_SCAN_MAX_DISK_MB * 1024 * 1024:
                    raise ScanFailure("DISK_LIMIT")
    except (ScanCancelled, ScanFailure):
        if proc.returncode is None:
            proc.kill()
        await task
        raise


def _git_env(askpass: Path, hooks: Path, token: str) -> dict[str, str]:
    env = os.environ.copy()
    env.update({
        "KODEISTRY_GITHUB_TOKEN": token,
        "GIT_ASKPASS": str(askpass),
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_LFS_SKIP_SMUDGE": "1",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "core.hooksPath",
        "GIT_CONFIG_VALUE_0": str(hooks),
        "GIT_TEMPLATE_DIR": str(hooks),
    })
    return env


def _askpass(path: Path) -> None:
    if os.name == "nt":
        content = '@echo off\n echo %~1 | findstr /B /I "Username" >nul\n if %errorlevel%==0 (echo x-access-token) else (echo %KODEISTRY_GITHUB_TOKEN%)\n'
        path.write_text(content, encoding="ascii")
    else:
        content = '#!/bin/sh\ncase "$1" in *Username*) printf "x-access-token\\n";; *) printf "%s\\n" "$KODEISTRY_GITHUB_TOKEN";; esac\n'
        path.write_text(content, encoding="ascii")
        path.chmod(0o700)


def _safe_path(raw: str, secret: str, repository: Path) -> str:
    candidate = Path(raw)
    if candidate.is_absolute():
        try:
            candidate = candidate.resolve().relative_to(repository.resolve())
        except ValueError:
            raise ScanFailure("INVALID_REPORT_PATH")
    if ".." in candidate.parts or not candidate.parts:
        raise ScanFailure("INVALID_REPORT_PATH")
    value = str(candidate).replace("\\", "/").replace(secret, "[REDACTED]")
    value = re.sub(r"(?i)(?:postgresql?|mysql|mongodb|redis)://[^/@\s]+:[^/@\s]+@", "[REDACTED]@", value)
    value = re.sub(r"gh[pousr]_[A-Za-z0-9_]{20,}", "[REDACTED]", value)
    return value[:1024]


def _detections(report: Path, repository: Path, run: SecretScanRun, sha: str) -> list[Detection]:
    if not report.exists():
        raise ScanFailure("REPORT_MISSING")
    if report.stat().st_size > 50 * 1024 * 1024:
        raise ScanFailure("REPORT_TOO_LARGE")
    try:
        records = json.loads(report.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError, OSError):
        raise ScanFailure("INVALID_REPORT") from None
    if not isinstance(records, list):
        raise ScanFailure("INVALID_REPORT")
    found = []
    for record in records:
        if not isinstance(record, dict):
            raise ScanFailure("INVALID_REPORT")
        secret = record.get("Secret")
        rule = record.get("RuleID")
        if not isinstance(secret, str) or not secret or not isinstance(rule, str) or not RULE_ID.fullmatch(rule):
            raise ScanFailure("INVALID_REPORT")
        if secret.strip().lower() in EXAMPLE_VALUES:
            continue
        raw_file = record.get("File")
        if not isinstance(raw_file, str):
            raise ScanFailure("INVALID_REPORT")
        path = _safe_path(raw_file, secret, repository)
        commit = record.get("Commit") or sha
        if not isinstance(commit, str) or not HEX_SHA.fullmatch(commit):
            raise ScanFailure("INVALID_REPORT")
        try:
            line = int(record.get("StartLine"))
        except (TypeError, ValueError):
            raise ScanFailure("INVALID_REPORT") from None
        if line < 1:
            raise ScanFailure("INVALID_REPORT")
        severity = "HIGH" if any(part in rule.lower() for part in ("private-key", "aws", "github", "stripe")) else "MEDIUM"
        confidence = "HIGH" if severity == "HIGH" else "MEDIUM"
        found.append(Detection(
            fingerprint=fingerprint(secret, rule, path, run), rule_id=rule,
            secret_type=rule.replace("-", " ").replace("_", " ").title()[:160],
            severity=severity, confidence=confidence, file_path=path,
            line=line, commit_sha=commit,
        ))
    return found


async def _snapshot(repo: Path, snapshot: Path, env: dict[str, str], deadline: float, root: Path, cancelled) -> tuple[int, int]:
    listing = await _command(["git", "ls-files", "-z"], cwd=repo, env=env, deadline=deadline, root=root, capture=True, cancelled=cancelled)
    paths = [p for p in listing.split(b"\0") if p]
    scanned = skipped = 0
    limit = settings.SECRET_SCAN_MAX_FILE_MB * 1024 * 1024
    for raw in paths:
        if (scanned + skipped) % 100 == 0:
            if cancelled and await cancelled():
                raise ScanCancelled()
            if time.monotonic() >= deadline:
                raise ScanFailure("SCAN_TIMEOUT")
        relative = Path(os.fsdecode(raw))
        source = repo / relative
        dest = snapshot / relative
        if source.is_symlink() or not source.is_file():
            skipped += 1
            continue
        size = source.stat().st_size
        if size > limit:
            skipped += 1
            continue
        with source.open("rb") as file:
            if file.read(100).startswith(b"version https://git-lfs.github.com/spec/v1"):
                skipped += 1
                continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, dest)
        scanned += 1
        if _directory_size(root) > settings.SECRET_SCAN_MAX_DISK_MB * 1024 * 1024:
            raise ScanFailure("DISK_LIMIT")
    return scanned, skipped


async def scan_repository(run: SecretScanRun, repository: Repository, installation: GitHubInstallation, cancelled, progress=None) -> ScanResult:
    if not OWNER.fullmatch(repository.owner) or not REPO.fullmatch(repository.name) or repository.name in {".", ".."}:
        raise ScanFailure("INVALID_REPOSITORY")
    if settings.SECRET_SCAN_MAX_SECONDS < 30 or settings.SECRET_SCAN_MAX_DISK_MB < 50 or settings.SECRET_SCAN_MAX_FILE_MB < 1:
        raise ScanFailure("INVALID_LIMITS")
    deadline = time.monotonic() + settings.SECRET_SCAN_MAX_SECONDS
    with tempfile.TemporaryDirectory(prefix="kodeistry-secret-") as directory:
        root = Path(directory)
        if os.name != "nt":
            root.chmod(0o700)
        repo = root / "repository"
        repo.mkdir()
        hooks = root / "empty-hooks"
        hooks.mkdir()
        askpass = root / ("askpass.cmd" if os.name == "nt" else "askpass.sh")
        _askpass(askpass)
        report = root / "report.json"
        git_env = _git_env(askpass, hooks, "")
        await _command(["git", "init", "--quiet", str(repo)], cwd=root, env=git_env, deadline=deadline, root=root, cancelled=cancelled)
        await _command(
            ["git", "remote", "add", "origin", "https://github.com/" + repository.owner + "/" + repository.name + ".git"],
            cwd=repo, env=git_env, deadline=deadline, root=root, cancelled=cancelled,
        )
        try:
            token = await get_installation_access_token(installation.installation_id)
        except Exception:
            raise ScanFailure("GITHUB_AUTH_FAILED", retryable=True) from None
        git_env["KODEISTRY_GITHUB_TOKEN"] = token
        token = ""
        if progress:
            await progress("Fetching selected branch")
        fetch = ["git", "fetch", "--quiet", "--no-tags", "--no-recurse-submodules"]
        if run.scope == "CURRENT_FILES":
            fetch.append("--depth=1")
        fetch.extend(["origin", "refs/heads/" + run.branch])
        try:
            await _command(fetch, cwd=repo, env=git_env, deadline=deadline, root=root, cancelled=cancelled)
        except ScanFailure as exc:
            if exc.code == "PROCESS_FAILED":
                raise ScanFailure("GITHUB_FETCH_FAILED", retryable=True) from None
            raise
        finally:
            git_env.pop("KODEISTRY_GITHUB_TOKEN", None)
        raw_sha = await _command(["git", "rev-parse", "FETCH_HEAD"], cwd=repo, env=git_env, deadline=deadline, root=root, capture=True, cancelled=cancelled)
        sha = raw_sha.decode("ascii", "ignore").strip()
        if not HEX_SHA.fullmatch(sha):
            raise ScanFailure("INVALID_COMMIT")
        files_scanned = commits_scanned = None
        skipped = 0
        target = repo
        if run.scope == "CURRENT_FILES":
            await _command(["git", "checkout", "--quiet", "--detach", sha], cwd=repo, env=git_env, deadline=deadline, root=root, cancelled=cancelled)
            if progress:
                await progress("Preparing tracked file snapshot")
            target = root / "snapshot"
            target.mkdir()
            files_scanned, skipped = await _snapshot(repo, target, git_env, deadline, root, cancelled)
        else:
            shallow = await _command(["git", "rev-parse", "--is-shallow-repository"], cwd=repo, env=git_env, deadline=deadline, root=root, capture=True, cancelled=cancelled)
            if shallow.strip() != b"false":
                raise ScanFailure("INCOMPLETE_HISTORY")
            count = await _command(["git", "rev-list", "--count", sha], cwd=repo, env=git_env, deadline=deadline, root=root, capture=True, cancelled=cancelled)
            commits_scanned = int(count.strip())
        if progress:
            await progress("Running Gitleaks")
        version = await _command([settings.GITLEAKS_PATH, "version"], cwd=root, env=git_env, deadline=deadline, root=root, capture=True, cancelled=cancelled)
        if VERSION.encode() not in version:
            raise ScanFailure("SCANNER_VERSION_MISMATCH")
        safe_ignore = root / "empty-gitleaksignore"
        safe_ignore.write_text("", encoding="ascii")
        args = [
            settings.GITLEAKS_PATH, "dir" if run.scope == "CURRENT_FILES" else "git",
            "--config", str(CONFIG_PATH), "--report-format=json", "--report-path", str(report),
            "--redact=100", "--ignore-gitleaks-allow", "--gitleaks-ignore-path", str(safe_ignore),
            "--max-target-megabytes", str(settings.SECRET_SCAN_MAX_FILE_MB),
            "--no-banner", "--no-color", "--log-level=fatal", "--exit-code=42",
        ]
        if run.scope == "GIT_HISTORY":
            args.extend(["--log-opts=--full-history " + sha])
        args.append(str(target))
        await _command(args, cwd=root, env=git_env, deadline=deadline, root=root, cancelled=cancelled, allowed_exit_codes=(0, 42))
        if progress:
            await progress("Processing masked findings")
        detections = _detections(report, target, run, sha)
        if run.scope == "GIT_HISTORY":
            # Gitleaks limits large blobs; do not call this complete or resolve prior findings.
            coverage_complete = False
            note = "All reachable commits were fetched; files over the size limit, LFS objects, submodules, and archives are outside coverage."
        else:
            coverage_complete = skipped == 0
            note = None if not skipped else f"{skipped} tracked files were skipped (size, symlink, submodule, or LFS pointer)."
        return ScanResult(
            resolved_commit_sha=sha, detections=detections, files_scanned=files_scanned,
            commits_scanned=commits_scanned, skipped_count=skipped,
            coverage_complete=coverage_complete, coverage_note=note,
        )
