from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.schemas.repository import (
    RepositoryConnect,
    RepositoryResponse,
    RepositorySelection,
)
from app.github.client import GitHubClient
from app.models.review_run import ReviewRun
from app.schemas.review import ReviewRunResponse
from app.models.review_run import ReviewRun
from app.models.review_finding import ReviewFinding

from app.schemas.review import (
    ReviewRunDetailResponse,
    PersistedReviewFinding as ReviewFindingSchema,
)

router = APIRouter(
    prefix="/api/tenants/{tenant_id}/repositories",
    tags=["Repositories"],
)


async def get_tenant_installation(
    tenant_id: int,
    current_user: User,
    db: AsyncSession,
) -> GitHubInstallation:
    member = await db.scalar(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == current_user.id,
        )
    )
    if member is None:
        raise HTTPException(status_code=403, detail="You are not a member of this tenant")

    installation = await db.scalar(
        select(GitHubInstallation).where(
            GitHubInstallation.tenant_id == tenant_id
        )
    )
    if installation is None:
        raise HTTPException(
            status_code=400,
            detail="No GitHub installation connected to this tenant",
        )
    return installation


@router.get("/available")
async def list_available_repositories(
    tenant_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    installation = await get_tenant_installation(tenant_id, current_user, db)
    try:
        return await GitHubClient().list_installation_repositories(
            installation.installation_id
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.put("/selection", response_model=list[RepositoryResponse])
async def save_repository_selection(
    tenant_id: int,
    data: RepositorySelection,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    installation = await get_tenant_installation(tenant_id, current_user, db)
    try:
        available = await GitHubClient().list_installation_repositories(
            installation.installation_id
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    available_ids = {repository.get("id") for repository in available}
    if not data.select_all and not set(data.repository_ids).issubset(available_ids):
        raise HTTPException(
            status_code=400,
            detail="One or more selected repositories are not available to this installation.",
        )
    selected = available if data.select_all else [
        repository for repository in available
        if repository.get("id") in data.repository_ids
    ]

    existing = await db.scalars(
        select(Repository).where(Repository.tenant_id == tenant_id)
    )
    for repository in existing.all():
        await db.delete(repository)

    saved = [
        Repository(
            tenant_id=tenant_id,
            github_installation_id=installation.id,
            github_repository_id=github_repo["id"],
            owner=github_repo["owner"]["login"],
            name=github_repo["name"],
            full_name=github_repo["full_name"],
            private=github_repo["private"],
            default_branch=github_repo.get("default_branch") or "main",
        )
        for github_repo in selected
    ]
    db.add_all(saved)
    await db.commit()
    for repository in saved:
        await db.refresh(repository)
    return saved


@router.post(
    "",
    response_model=RepositoryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def connect_repository(
    tenant_id: int,
    data: RepositoryConnect,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # --------------------------------------------------
    # 1. Check tenant exists
    # --------------------------------------------------
    tenant_result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = tenant_result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    # --------------------------------------------------
    # 2. Check current user is OWNER of the tenant
    # --------------------------------------------------
    member_result = await db.execute(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this tenant",
        )

    if member.role != "OWNER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only tenant owners can connect repositories",
        )

    # --------------------------------------------------
    # 3. Get GitHub installation connected to tenant
    # --------------------------------------------------
    installation_result = await db.execute(
        select(GitHubInstallation).where(
            GitHubInstallation.tenant_id == tenant_id
        )
    )
    installation = installation_result.scalar_one_or_none()

    if not installation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No GitHub installation connected to this tenant",
        )

    # --------------------------------------------------
    # 4. Fetch repository from GitHub
    # --------------------------------------------------
    github_client = GitHubClient()

    try:
        github_repo = await github_client.get_repository(
            installation_id=installation.installation_id,
            owner=data.owner,
            repo=data.name,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # --------------------------------------------------
    # 5. Prevent duplicate repository
    # --------------------------------------------------
    existing_result = await db.execute(
        select(Repository).where(
            Repository.tenant_id == tenant_id,
            Repository.github_repository_id == github_repo["id"],
        )
    )
    existing_repo = existing_result.scalar_one_or_none()

    if existing_repo:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Repository is already connected to this tenant",
        )

    # --------------------------------------------------
    # 6. Save repository
    # --------------------------------------------------
    repository = Repository(
        tenant_id=tenant_id,
        github_installation_id=installation.id,
        github_repository_id=github_repo["id"],
        owner=github_repo["owner"]["login"],
        name=github_repo["name"],
        full_name=github_repo["full_name"],
        private=github_repo["private"],
        default_branch=github_repo["default_branch"],
    )

    db.add(repository)
    await db.commit()
    await db.refresh(repository)

    return repository

@router.get(
    "",
    response_model=list[RepositoryResponse],
)
async def list_repositories(
    tenant_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # --------------------------------------------------
    # 1. Check tenant exists
    # --------------------------------------------------
    tenant_result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = tenant_result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    # --------------------------------------------------
    # 2. Check current user is a tenant member
    # --------------------------------------------------
    member_result = await db.execute(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == current_user.id,
        )
    )
    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this tenant",
        )

    # --------------------------------------------------
    # 3. Fetch connected repositories
    # --------------------------------------------------
    repositories_result = await db.execute(
        select(Repository)
        .where(
            Repository.tenant_id == tenant_id,
            Repository.is_active.is_(True),
        )
        .order_by(Repository.id.desc())
    )

    repositories = repositories_result.scalars().all()

    return repositories

@router.get(
    "/{repository_id}/reviews",
    response_model=list[ReviewRunResponse],
)
async def list_repository_reviews(
    tenant_id: int,
    repository_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # --------------------------------------------------
    # 1. Check tenant exists
    # --------------------------------------------------
    tenant_result = await db.execute(
        select(Tenant).where(Tenant.id == tenant_id)
    )

    tenant = tenant_result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    # --------------------------------------------------
    # 2. Check current user is a tenant member
    # --------------------------------------------------
    member_result = await db.execute(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == current_user.id,
        )
    )

    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this tenant",
        )

    # --------------------------------------------------
    # 3. Check repository belongs to tenant
    # --------------------------------------------------
    repository_result = await db.execute(
        select(Repository).where(
            Repository.id == repository_id,
            Repository.tenant_id == tenant_id,
        )
    )

    repository = repository_result.scalar_one_or_none()

    if not repository:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    # --------------------------------------------------
    # 4. Fetch review history for repository
    # --------------------------------------------------
    reviews_result = await db.execute(
        select(ReviewRun)
        .where(
            ReviewRun.tenant_id == tenant_id,
            ReviewRun.repository_id == repository_id,
        )
        .order_by(
            ReviewRun.id.desc()
        )
    )

    reviews = reviews_result.scalars().all()

    return reviews

@router.get(
    "/{repository_id}/reviews/{review_run_id}",
    response_model=ReviewRunDetailResponse,
)
async def get_repository_review_detail(
    tenant_id: int,
    repository_id: int,
    review_run_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # --------------------------------------------------
    # 1. Check tenant exists
    # --------------------------------------------------
    tenant_result = await db.execute(
        select(Tenant).where(
            Tenant.id == tenant_id
        )
    )

    tenant = tenant_result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    # --------------------------------------------------
    # 2. Check current user is a tenant member
    # --------------------------------------------------
    member_result = await db.execute(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == current_user.id,
        )
    )

    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this tenant",
        )

    # --------------------------------------------------
    # 3. Check repository belongs to tenant
    # --------------------------------------------------
    repository_result = await db.execute(
        select(Repository).where(
            Repository.id == repository_id,
            Repository.tenant_id == tenant_id,
        )
    )

    repository = repository_result.scalar_one_or_none()

    if not repository:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found",
        )

    # --------------------------------------------------
    # 4. Get review belonging to this repository
    # --------------------------------------------------
    review_result = await db.execute(
        select(ReviewRun).where(
            ReviewRun.id == review_run_id,
            ReviewRun.tenant_id == tenant_id,
            ReviewRun.repository_id == repository_id,
        )
    )

    review_run = review_result.scalar_one_or_none()

    if not review_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review run not found",
        )

    # --------------------------------------------------
    # 5. Get findings
    # --------------------------------------------------
    findings_result = await db.execute(
        select(ReviewFinding)
        .where(
            ReviewFinding.review_run_id == review_run_id
        )
        .order_by(
            ReviewFinding.id.asc()
        )
    )

    findings = findings_result.scalars().all()
    tracked_ids = {finding.tracked_finding_id for finding in findings if finding.tracked_finding_id}
    tracked_rows = (await db.scalars(select(ReviewFinding).where(ReviewFinding.id.in_(tracked_ids)))).all() if tracked_ids else []
    tracked_by_id = {finding.id: finding for finding in tracked_rows}

    # --------------------------------------------------
    # 6. Return detailed review
    # --------------------------------------------------
    return ReviewRunDetailResponse(
        id=review_run.id,
        repository_id=review_run.repository_id,
        pull_request_number=review_run.pull_request_number,
        commit_sha=review_run.commit_sha,
        status=review_run.status,
        findings_count=review_run.findings_count,
        created_at=review_run.created_at,
        completed_at=review_run.completed_at,
        findings=[
            ReviewFindingSchema(
                id=finding.id,
                review_id=review_run.id,
                repository_id=review_run.repository_id,
                repository_name=repository.full_name,
                pull_request_number=review_run.pull_request_number,
                commit_sha=review_run.commit_sha,
                filename=finding.filename,
                line=finding.line,
                severity=finding.severity,
                category=finding.category,
                message=finding.message,
                suggestion=finding.suggestion,
                why_it_matters=finding.why_it_matters,
                recommended_approach=finding.recommended_approach,
                verification_steps=finding.verification_steps,
                status=(tracked_by_id.get(finding.tracked_finding_id) or finding).status,
                verification_status=(tracked_by_id.get(finding.tracked_finding_id) or finding).verification_status,
                triage_status=(tracked_by_id.get(finding.tracked_finding_id) or finding).triage_status,
                tracked_finding_id=finding.tracked_finding_id,
                checked_commit_sha=(tracked_by_id.get(finding.tracked_finding_id) or finding).checked_commit_sha,
                checked_at=(tracked_by_id.get(finding.tracked_finding_id) or finding).checked_at,
                verification_reason=(tracked_by_id.get(finding.tracked_finding_id) or finding).verification_reason,
                created_at=finding.created_at,
                resolved_at=(tracked_by_id.get(finding.tracked_finding_id) or finding).resolved_at,
                github_url=(f"{repository.html_url}/pull/{review_run.pull_request_number}" if repository.html_url else None),
            )
            for finding in findings
        ],
    )
