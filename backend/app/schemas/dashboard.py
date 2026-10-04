from datetime import datetime

from pydantic import BaseModel

from app.schemas.github_installation import GitHubInstallationResponse
from app.schemas.review import ReviewRunResponse
from app.schemas.tenant import CurrentUserResponse, TenantResponse


class DashboardRepositoryResponse(BaseModel):
    id: int
    full_name: str
    private: bool
    language: str | None = None
    html_url: str | None = None
    reviews_count: int
    findings_count: int
    last_review_at: datetime | None = None


class DashboardSummaryResponse(BaseModel):
    user: CurrentUserResponse
    workspace: TenantResponse
    github: GitHubInstallationResponse | None = None
    repositories_count: int
    pull_requests_count: int
    reviews_count: int
    findings_count: int
    critical_findings_count: int
    repositories: list[DashboardRepositoryResponse]
    recent_reviews: list[ReviewRunResponse]
