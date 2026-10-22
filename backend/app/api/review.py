from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_db

from app.models.user import User
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.review_run import ReviewRun

from app.models.review_finding import ReviewFinding
from app.models.repository import Repository

from app.schemas.review import (
    ReviewRunResponse,
    ReviewRunDetailResponse,
    PersistedReviewFinding as ReviewFindingSchema,
)


router = APIRouter(
    prefix="/api/tenants/{tenant_id}/reviews",
    tags=["Reviews"],
)


@router.get(
    "",
    response_model=list[ReviewRunResponse],
)
async def list_review_history(
    tenant_id: int,
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
    # 3. Fetch review history
    # --------------------------------------------------

    reviews_result = await db.execute(
        select(ReviewRun)
        .where(
            ReviewRun.tenant_id == tenant_id
        )
        .order_by(
            ReviewRun.id.desc()
        )
    )

    reviews = reviews_result.scalars().all()

    return reviews

@router.get(
    "/{review_run_id}",
    response_model=ReviewRunDetailResponse,
)
async def get_review_history_detail(
    tenant_id: int,
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
    # 3. Get review run
    # --------------------------------------------------

    review_result = await db.execute(
        select(ReviewRun).where(
            ReviewRun.id == review_run_id,
            ReviewRun.tenant_id == tenant_id,
        )
    )

    review_run = review_result.scalar_one_or_none()

    if not review_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review run not found",
        )

    # --------------------------------------------------
    # 4. Get individual findings
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
    repository = await db.scalar(select(Repository).where(Repository.id == review_run.repository_id))

    # --------------------------------------------------
    # 5. Build response
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
                repository_name=repository.full_name if repository else f"Repository {review_run.repository_id}",
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
                github_url=(f"{repository.html_url}/pull/{review_run.pull_request_number}" if repository and repository.html_url else None),
            )
            for finding in findings
        ],
    )
