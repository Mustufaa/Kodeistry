from datetime import datetime, timezone
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.membership import membership
from app.core.config import settings
from app.db.session import get_db
from app.github.auth import get_installation_access_token
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.models.secret_scan import SecretFinding, SecretOccurrence, SecretScanRun
from app.models.tenant_member import TenantMember
from app.models.user import User
from app.schemas.secret_scan import DismissSecretFinding, SecretFindingView, SecretScanView, StartSecretScan

router = APIRouter(prefix="/api/secret-scans", tags=["Secret Scanner"])
finding_router = APIRouter(prefix="/api/secret-findings", tags=["Secret Scanner"])
SCANNER_VERSION = "8.30.1"
GITHUB_API = "https://api.github.com"


async def _connected_repository(db: AsyncSession, user: User, repository_id: int) -> tuple[Repository, GitHubInstallation]:
    row = (await db.execute(
        select(Repository, GitHubInstallation)
        .join(TenantMember, TenantMember.tenant_id == Repository.tenant_id)
        .join(GitHubInstallation, GitHubInstallation.id == Repository.github_installation_id)
        .where(
            Repository.id == repository_id,
            Repository.is_active.is_(True),
            GitHubInstallation.is_active.is_(True),
            TenantMember.user_id == user.id,
        )
    )).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Connected repository not found or access revoked.")
    return row[0], row[1]


async def _github_get(installation: GitHubInstallation, path: str) -> dict | list:
    try:
        token = await get_installation_access_token(installation.installation_id)
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                GITHUB_API + path,
                headers={
                    "Authorization": "Bearer " + token,
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
    except (RuntimeError, ValueError, FileNotFoundError, httpx.HTTPError):
        raise HTTPException(status_code=502, detail="Unable to verify GitHub repository access.") from None
    if response.status_code in (403, 404):
        raise HTTPException(status_code=403, detail="GitHub repository access has been revoked.")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Unable to verify GitHub repository access.")
    try:
        return response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Unable to read GitHub response.") from None


async def _require_remote_access(repository: Repository, installation: GitHubInstallation) -> None:
    payload = await _github_get(
        installation, "/repos/" + quote(repository.owner, safe="") + "/" + quote(repository.name, safe="")
    )
    if not isinstance(payload, dict) or payload.get("id") != repository.github_repository_id:
        raise HTTPException(status_code=403, detail="GitHub repository access has been revoked.")


async def _scan_for_user(db: AsyncSession, user: User, scan_id: int) -> SecretScanRun:
    scan = await db.get(SecretScanRun, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found.")
    repository, installation = await _connected_repository(db, user, scan.repository_id)
    await _require_remote_access(repository, installation)
    return scan


def _finding_view(finding: SecretFinding, occurrence: SecretOccurrence) -> SecretFindingView:
    return SecretFindingView(
        id=finding.id, rule_id=finding.rule_id, secret_type=finding.secret_type,
        severity=finding.severity, confidence=finding.confidence,
        file_path=occurrence.file_path, line=occurrence.line, branch=finding.branch,
        commit_sha=occurrence.commit_sha, disposition=finding.disposition,
        dismissal_reason=finding.dismissal_reason, first_detected_at=finding.first_detected_at,
        last_seen_at=finding.last_seen_at,
    )


@router.get("/repositories")
async def repositories(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(
        select(Repository, GitHubInstallation)
        .join(TenantMember, TenantMember.tenant_id == Repository.tenant_id)
        .join(GitHubInstallation, GitHubInstallation.id == Repository.github_installation_id)
        .where(TenantMember.user_id == user.id, Repository.is_active.is_(True), GitHubInstallation.is_active.is_(True))
        .order_by(Repository.full_name)
    )).all()
    result = []
    for repository, installation in rows:
        try:
            await _require_remote_access(repository, installation)
        except HTTPException as exc:
            if exc.status_code == 403:
                continue
            raise
        result.append({"id": repository.id, "full_name": repository.full_name, "default_branch": repository.default_branch})
    return result


@router.get("/repositories/{repository_id}/branches")
async def branches(repository_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    repository, installation = await _connected_repository(db, user, repository_id)
    await _require_remote_access(repository, installation)
    result = []
    for page in range(1, 11):
        payload = await _github_get(
            installation, "/repos/" + quote(repository.owner, safe="") + "/" +
            quote(repository.name, safe="") + f"/branches?per_page=100&page={page}"
        )
        if not isinstance(payload, list):
            raise HTTPException(status_code=502, detail="Unable to load branches.")
        result.extend({"name": item["name"], "commit_sha": item["commit"]["sha"]} for item in payload)
        if len(payload) < 100:
            break
    return result


@router.post("", response_model=SecretScanView, status_code=201)
async def start_scan(
    body: StartSecretScan,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if len(settings.SECRET_SCANNER_HMAC_KEY.encode("utf-8")) < 32:
        raise HTTPException(status_code=503, detail="Secret Scanner is not configured.")
    repository, installation = await _connected_repository(db, user, body.repository_id)
    await membership(db, repository.tenant_id, user, {"OWNER", "ADMIN"})
    await _require_remote_access(repository, installation)
    branch = body.branch.strip()
    if branch != body.branch or branch.startswith("-") or ".." in branch or "@{" in branch or "\\" in branch:
        raise HTTPException(status_code=422, detail="Invalid branch.")
    branch_payload = await _github_get(
        installation, "/repos/" + quote(repository.owner, safe="") + "/" +
        quote(repository.name, safe="") + "/branches/" + quote(branch, safe="")
    )
    if not isinstance(branch_payload, dict) or branch_payload.get("name") != branch:
        raise HTTPException(status_code=422, detail="Branch is unavailable.")
    await db.scalar(select(Repository.id).where(Repository.id == repository.id).with_for_update())
    duplicate = await db.scalar(select(SecretScanRun.id).where(
        SecretScanRun.repository_id == repository.id, SecretScanRun.branch == branch,
        SecretScanRun.scope == body.scope, SecretScanRun.status.in_(("QUEUED", "RUNNING")),
    ))
    if duplicate:
        raise HTTPException(status_code=409, detail="An equivalent scan is already queued or running.")
    queued = await db.scalar(select(func.count()).select_from(SecretScanRun).where(
        SecretScanRun.requested_by_id == user.id, SecretScanRun.status.in_(("QUEUED", "RUNNING")),
    )) or 0
    if queued >= settings.SECRET_SCAN_MAX_QUEUED_PER_USER:
        raise HTTPException(status_code=429, detail="Too many pending scans. Try again when one finishes.")
    scan = SecretScanRun(
        tenant_id=repository.tenant_id, repository_id=repository.id, requested_by_id=user.id,
        branch=branch, scope=body.scope, status="QUEUED", stage="Queued",
        scanner_version=SCANNER_VERSION,
    )
    db.add(scan)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="An equivalent scan is already queued or running.") from None
    await db.refresh(scan)
    return scan


@router.get("")
async def list_scans(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(SecretScanRun, Repository, GitHubInstallation)
        .join(Repository, Repository.id == SecretScanRun.repository_id)
        .join(TenantMember, TenantMember.tenant_id == Repository.tenant_id)
        .join(GitHubInstallation, GitHubInstallation.id == Repository.github_installation_id)
        .where(TenantMember.user_id == user.id, Repository.is_active.is_(True), GitHubInstallation.is_active.is_(True))
        .order_by(SecretScanRun.id.desc()).offset(offset).limit(limit)
    )).all()
    result = []
    access = {}
    for scan, repository, installation in rows:
        if repository.id not in access:
            try:
                await _require_remote_access(repository, installation)
                access[repository.id] = True
            except HTTPException as exc:
                if exc.status_code != 403:
                    raise
                access[repository.id] = False
        if access[repository.id]:
            result.append(SecretScanView.model_validate(scan))
    return result


@router.get("/{scan_id}", response_model=SecretScanView)
async def get_scan(scan_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await _scan_for_user(db, user, scan_id)


@router.post("/{scan_id}/cancel", response_model=SecretScanView)
async def cancel_scan(scan_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    scan = await _scan_for_user(db, user, scan_id)
    await membership(db, scan.tenant_id, user, {"OWNER", "ADMIN"})
    if scan.status == "QUEUED":
        scan.status = "CANCELLED"
        scan.stage = "Cancelled"
        scan.completed_at = datetime.now(timezone.utc)
    elif scan.status == "RUNNING":
        scan.cancel_requested = True
        scan.stage = "Cancelling"
    await db.commit()
    await db.refresh(scan)
    return scan


@router.get("/{scan_id}/findings")
async def list_findings(
    scan_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    secret_type: str | None = Query(None, max_length=160),
    severity: str | None = Query(None, max_length=20),
    disposition: str | None = Query(None, max_length=30),
    file: str | None = Query(None, max_length=255),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _scan_for_user(db, user, scan_id)
    statement = select(SecretFinding, SecretOccurrence).join(
        SecretOccurrence, SecretOccurrence.finding_id == SecretFinding.id
    ).where(SecretOccurrence.run_id == scan_id)
    if secret_type:
        statement = statement.where(SecretFinding.secret_type == secret_type)
    if severity:
        statement = statement.where(SecretFinding.severity == severity)
    if disposition:
        statement = statement.where(SecretFinding.disposition == disposition)
    if file:
        statement = statement.where(SecretOccurrence.file_path.ilike("%" + file.replace("%", "\\%").replace("_", "\\_") + "%", escape="\\"))
    rows = (await db.execute(statement.order_by(SecretOccurrence.id).offset(offset).limit(limit))).all()
    return [_finding_view(finding, occurrence) for finding, occurrence in rows]


@finding_router.get("/{finding_id}", response_model=SecretFindingView)
async def get_finding(finding_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    finding = await db.get(SecretFinding, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found.")
    repository, installation = await _connected_repository(db, user, finding.repository_id)
    await _require_remote_access(repository, installation)
    occurrence = await db.scalar(select(SecretOccurrence).where(SecretOccurrence.finding_id == finding_id).order_by(SecretOccurrence.id.desc()))
    if occurrence is None:
        raise HTTPException(status_code=404, detail="Finding not found.")
    return _finding_view(finding, occurrence)


@finding_router.patch("/{finding_id}", response_model=SecretFindingView)
async def update_finding(
    finding_id: int, body: DismissSecretFinding,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    finding = await db.get(SecretFinding, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found.")
    repository, installation = await _connected_repository(db, user, finding.repository_id)
    await membership(db, repository.tenant_id, user, {"OWNER", "ADMIN"})
    await _require_remote_access(repository, installation)
    if body.disposition == "DISMISSED" and body.reason is None:
        raise HTTPException(status_code=422, detail="Choose a dismissal reason.")
    finding.disposition = body.disposition
    finding.dismissal_reason = body.reason if body.disposition == "DISMISSED" else None
    await db.commit()
    occurrence = await db.scalar(select(SecretOccurrence).where(SecretOccurrence.finding_id == finding_id).order_by(SecretOccurrence.id.desc()))
    return _finding_view(finding, occurrence)
