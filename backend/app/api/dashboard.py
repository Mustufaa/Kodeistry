from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.models.review_finding import ReviewFinding
from app.models.review_run import ReviewRun
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.user import User
from app.schemas.dashboard import DashboardRepositoryResponse, DashboardSummaryResponse
from app.schemas.github_installation import GitHubInstallationResponse
from app.schemas.review import ReviewRunResponse
from app.schemas.tenant import CurrentUserResponse, TenantResponse

router = APIRouter(prefix="/api/tenants/{tenant_id}/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    tenant_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tenant = await db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    membership = await db.scalar(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == current_user.id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this tenant.")

    installation = await db.scalar(
        select(GitHubInstallation)
        .where(GitHubInstallation.tenant_id == tenant_id)
        .where(GitHubInstallation.is_active.is_(True))
        .order_by(GitHubInstallation.id.desc())
    )
    repositories_count = await db.scalar(
        select(func.count()).select_from(Repository).where(Repository.tenant_id == tenant_id, Repository.is_active.is_(True))
    ) or 0
    reviews_count = await db.scalar(
        select(func.count()).select_from(ReviewRun).where(ReviewRun.tenant_id == tenant_id)
    ) or 0
    findings_count = await db.scalar(
        select(func.count())
        .select_from(ReviewFinding)
        .join(ReviewRun, ReviewFinding.review_run_id == ReviewRun.id)
        .where(ReviewRun.tenant_id == tenant_id, ReviewFinding.tracked_finding_id.is_(None))
    ) or 0
    critical_findings_count = await db.scalar(
        select(func.count())
        .select_from(ReviewFinding)
        .join(ReviewRun, ReviewFinding.review_run_id == ReviewRun.id)
        .where(ReviewRun.tenant_id == tenant_id, ReviewFinding.tracked_finding_id.is_(None), ReviewFinding.severity == "critical")
    ) or 0
    pull_requests_count = len((await db.execute(
        select(ReviewRun.repository_id, ReviewRun.pull_request_number)
        .where(ReviewRun.tenant_id == tenant_id)
        .distinct()
    )).all())
    repository_rows = await db.execute(
        select(
            Repository,
            func.count(func.distinct(ReviewRun.id)).label("reviews_count"),
            func.count(func.distinct(ReviewFinding.id)).label("findings_count"),
            func.max(ReviewRun.completed_at).label("last_review_at"),
        )
        .outerjoin(ReviewRun, ReviewRun.repository_id == Repository.id)
        .outerjoin(ReviewFinding, (ReviewFinding.review_run_id == ReviewRun.id) & ReviewFinding.tracked_finding_id.is_(None))
        .where(Repository.tenant_id == tenant_id, Repository.is_active.is_(True))
        .group_by(Repository.id)
        .order_by(Repository.full_name)
        .limit(6)
    )
    repositories = [
        DashboardRepositoryResponse(
            id=repository.id,
            full_name=repository.full_name,
            private=repository.private,
            language=repository.language,
            html_url=repository.html_url,
            reviews_count=reviews_count,
            findings_count=findings_count,
            last_review_at=last_review_at,
        )
        for repository, reviews_count, findings_count, last_review_at in repository_rows.all()
    ]
    recent_reviews = (await db.execute(
        select(ReviewRun).where(ReviewRun.tenant_id == tenant_id).order_by(ReviewRun.created_at.desc()).limit(8)
    )).scalars().all()

    return DashboardSummaryResponse(
        user=CurrentUserResponse.model_validate(current_user),
        workspace=TenantResponse.model_validate(tenant),
        github=GitHubInstallationResponse.model_validate(installation) if installation else None,
        repositories_count=repositories_count,
        pull_requests_count=pull_requests_count,
        reviews_count=reviews_count,
        findings_count=findings_count,
        critical_findings_count=critical_findings_count,
        repositories=repositories,
        recent_reviews=[ReviewRunResponse.model_validate(review) for review in recent_reviews],
    )
