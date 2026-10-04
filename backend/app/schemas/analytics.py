from datetime import date, datetime

from pydantic import BaseModel, Field


class AnalyticsSummary(BaseModel):
    reviews: int = 0
    pull_requests: int = 0
    repositories: int = 0
    findings: int = 0
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0
    security: int = 0
    bugs: int = 0
    performance: int = 0
    quality: int = 0
    open: int = 0
    resolved: int = 0
    dismissed: int = 0
    actionable: int = 0
    resolution_rate: float | None = None
    average_findings_per_review: float | None = None
    average_issue_age_days: float | None = None
    oldest_open_finding_days: int | None = None
    most_affected_repository: str | None = None
    most_common_category: str | None = None


class TrendPoint(BaseModel):
    date: date
    label: str
    total: int = 0
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class DistributionPoint(BaseModel):
    name: str
    count: int


class ComparisonMetric(BaseModel):
    current: int
    previous: int
    percent_change: float | None = None


class AnalyticsComparison(BaseModel):
    label: str
    has_sufficient_data: bool
    findings: ComparisonMetric | None = None
    resolved: ComparisonMetric | None = None
    critical: ComparisonMetric | None = None


class AnalyticsFinding(BaseModel):
    id: int
    review_id: int
    repository_id: int
    repository_name: str
    pull_request_number: int
    commit_sha: str
    filename: str
    line: int
    severity: str
    category: str
    message: str
    suggestion: str | None = None
    why_it_matters: str | None = None
    recommended_approach: str | None = None
    verification_steps: str | None = None
    status: str
    created_at: datetime
    resolved_at: datetime | None = None
    github_url: str | None = None


class AnalyticsResponse(BaseModel):
    start_date: date
    end_date: date
    timeframe: str
    summary: AnalyticsSummary
    comparison: AnalyticsComparison
    trend: list[TrendPoint] = Field(default_factory=list)
    severity: list[DistributionPoint] = Field(default_factory=list)
    status: list[DistributionPoint] = Field(default_factory=list)
    categories: list[DistributionPoint] = Field(default_factory=list)
    repositories: list[DistributionPoint] = Field(default_factory=list)
    critical_findings: list[AnalyticsFinding] = Field(default_factory=list)
    recently_resolved: list[AnalyticsFinding] = Field(default_factory=list)


class FindingStatusUpdate(BaseModel):
    status: str
