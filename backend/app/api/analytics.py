import csv
import io
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.repository_access import require_repository
from app.api.fix_workflow import TriageUpdate, authorized, update_triage
from app.db.session import get_db
from app.models.repository import Repository
from app.models.review_finding import ReviewFinding
from app.models.review_run import ReviewRun
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsComparison,
    AnalyticsFinding,
    AnalyticsResponse,
    AnalyticsSummary,
    ComparisonMetric,
    DistributionPoint,
    FindingStatusUpdate,
    TrendPoint,
)

router = APIRouter(prefix="/api/tenants/{tenant_id}", tags=["Analytics"])
TIMEFRAME_DAYS = {"7d": 7, "30d": 30, "3m": 90, "6m": 180, "12m": 365}
SEVERITIES = ("critical", "high", "medium", "low", "info")
CATEGORIES = ("security", "bug", "performance", "quality", "style", "testing")
STATUSES = ("open", "resolved", "dismissed")


async def require_membership(tenant_id: int, user_id: int, db: AsyncSession) -> None:
    tenant = await db.scalar(select(Tenant.id).where(Tenant.id == tenant_id))
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    member = await db.scalar(
        select(TenantMember.id).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == user_id,
        )
    )
    if member is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this tenant")


def resolve_range(timeframe: str, start_date: date | None, end_date: date | None) -> tuple[datetime, datetime, str]:
    today = datetime.now(timezone.utc).date()
    if timeframe == "custom":
        if start_date is None or end_date is None or start_date > end_date:
            raise HTTPException(status_code=422, detail="A valid start_date and end_date are required for a custom range")
        start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
        return start, end, "custom"
    days = TIMEFRAME_DAYS.get(timeframe)
    if days is None:
        raise HTTPException(status_code=422, detail="Unsupported timeframe")
    end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return end - timedelta(days=days), end, timeframe


def finding_query(
    tenant_id: int,
    start: datetime,
    end: datetime,
    repository_id: int | None,
    severity: str | None,
    category: str | None,
    finding_status: str | None,
):
    statement = (
        select(ReviewFinding, ReviewRun, Repository)
        .join(ReviewRun, ReviewFinding.review_run_id == ReviewRun.id)
        .join(Repository, ReviewRun.repository_id == Repository.id)
        .where(
            ReviewRun.tenant_id == tenant_id,
            ReviewFinding.tracked_finding_id.is_(None),
            ReviewFinding.created_at >= start,
            ReviewFinding.created_at < end,
        )
    )
    if repository_id is not None:
        statement = statement.where(ReviewRun.repository_id == repository_id)
    if severity:
        statement = statement.where(ReviewFinding.severity == severity.lower())
    if category:
        statement = statement.where(ReviewFinding.category == category.lower())
    if finding_status:
        statement = statement.where(ReviewFinding.status == finding_status.lower())
    return statement.order_by(ReviewFinding.created_at.desc())


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def serialize_finding(row) -> AnalyticsFinding:
    finding, review, repository = row
    github_url = f"{repository.html_url}/pull/{review.pull_request_number}" if repository.html_url else None
    return AnalyticsFinding(
        id=finding.id,
        review_id=review.id,
        repository_id=repository.id,
        repository_name=repository.full_name,
        pull_request_number=review.pull_request_number,
        commit_sha=review.commit_sha,
        filename=finding.filename,
        line=finding.line,
        severity=finding.severity,
        category=finding.category,
        message=finding.message,
        suggestion=finding.suggestion,
        why_it_matters=finding.why_it_matters,
        recommended_approach=finding.recommended_approach,
        verification_steps=finding.verification_steps,
        status=finding.status,
        verification_status=finding.verification_status,
        triage_status=finding.triage_status,
        tracked_finding_id=finding.tracked_finding_id,
        checked_commit_sha=finding.checked_commit_sha,
        checked_at=finding.checked_at,
        verification_reason=finding.verification_reason,
        created_at=finding.created_at,
        resolved_at=finding.resolved_at,
        github_url=github_url,
    )


def metric(current: int, previous: int) -> ComparisonMetric:
    change = round(((current - previous) / previous) * 100, 1) if previous else None
    return ComparisonMetric(current=current, previous=previous, percent_change=change)


def bucket_key(value: datetime, days: int) -> date:
    day = aware(value).date()
    if days <= 31:
        return day
    if days <= 180:
        return day - timedelta(days=day.weekday())
    return day.replace(day=1)


def build_trend(rows: list, start: datetime, end: datetime) -> list[TrendPoint]:
    days = max(1, (end.date() - start.date()).days)
    counts: dict[date, Counter] = defaultdict(Counter)
    for finding, _, _ in rows:
        key = bucket_key(finding.created_at, days)
        counts[key]["total"] += 1
        counts[key][finding.severity] += 1
    keys: list[date] = []
    cursor = bucket_key(start, days)
    while cursor < end.date():
        keys.append(cursor)
        if days <= 31:
            cursor += timedelta(days=1)
        elif days <= 180:
            cursor += timedelta(days=7)
        else:
            cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
    return [
        TrendPoint(
            date=key,
            label=f"{key.strftime('%b')} {key.day}" if days <= 180 else key.strftime("%b %Y"),
            total=counts[key]["total"],
            critical=counts[key]["critical"],
            high=counts[key]["high"],
            medium=counts[key]["medium"],
            low=counts[key]["low"],
            info=counts[key]["info"],
        )
        for key in keys
    ]


def summary_for(rows: list, review_rows: list[ReviewRun]) -> AnalyticsSummary:
    severities = Counter(finding.severity for finding, _, _ in rows)
    categories = Counter(finding.category for finding, _, _ in rows)
    statuses = Counter(finding.status for finding, _, _ in rows)
    repositories = Counter(repository.full_name for _, _, repository in rows)
    actionable = [finding for finding, _, _ in rows if finding.severity != "info"]
    resolved_actionable = sum(1 for finding in actionable if finding.status == "resolved")
    open_findings = [finding for finding, _, _ in rows if finding.status == "open"]
    now = datetime.now(timezone.utc)
    ages = [(now - aware(finding.created_at)).total_seconds() / 86400 for finding in open_findings]
    reviews = len(review_rows)
    return AnalyticsSummary(
        reviews=reviews,
        pull_requests=len({(review.repository_id, review.pull_request_number) for review in review_rows}),
        repositories=len({review.repository_id for review in review_rows}),
        findings=len(rows),
        critical=severities["critical"], high=severities["high"], medium=severities["medium"], low=severities["low"], info=severities["info"],
        security=categories["security"], bugs=categories["bug"], performance=categories["performance"], quality=categories["quality"],
        open=statuses["open"], resolved=statuses["resolved"], dismissed=statuses["dismissed"],
        actionable=len(actionable),
        resolution_rate=round((resolved_actionable / len(actionable)) * 100, 1) if actionable else None,
        average_findings_per_review=round(len(rows) / reviews, 1) if reviews else None,
        average_issue_age_days=round(sum(ages) / len(ages), 1) if ages else None,
        oldest_open_finding_days=int(max(ages)) if ages else None,
        most_affected_repository=repositories.most_common(1)[0][0] if repositories else None,
        most_common_category=categories.most_common(1)[0][0] if categories else None,
    )


async def load_period(
    db: AsyncSession, tenant_id: int, start: datetime, end: datetime,
    repository_id: int | None, severity: str | None, category: str | None, finding_status: str | None,
):
    rows = (await db.execute(finding_query(tenant_id, start, end, repository_id, severity, category, finding_status))).all()
    review_statement = select(ReviewRun).where(ReviewRun.tenant_id == tenant_id, ReviewRun.created_at >= start, ReviewRun.created_at < end)
    if repository_id is not None:
        review_statement = review_statement.where(ReviewRun.repository_id == repository_id)
    review_rows = (await db.scalars(review_statement)).all()
    if severity or category or finding_status:
        matching_ids = {review.id for _, review, _ in rows}
        review_rows = [review for review in review_rows if review.id in matching_ids]
    return rows, review_rows


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics(
    tenant_id: int,
    timeframe: str = "30d",
    start_date: date | None = None,
    end_date: date | None = None,
    repository_id: int | None = None,
    severity: str | None = None,
    category: str | None = None,
    finding_status: str | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_membership(tenant_id, current_user.id, db)
    if repository_id is not None:
        await require_repository(db, tenant_id, current_user.id, repository_id)
    start, end, normalized_timeframe = resolve_range(timeframe, start_date, end_date)
    rows, review_rows = await load_period(db, tenant_id, start, end, repository_id, severity, category, finding_status)
    duration = end - start
    previous_start, previous_end = start - duration, start
    previous_rows, previous_reviews = await load_period(db, tenant_id, previous_start, previous_end, repository_id, severity, category, finding_status)
    summary = summary_for(rows, review_rows)
    previous = summary_for(previous_rows, previous_reviews)
    previous_has_data = bool(previous.reviews or previous.findings)
    severity_counts = Counter(finding.severity for finding, _, _ in rows)
    category_counts = Counter(finding.category for finding, _, _ in rows)
    status_counts = Counter(finding.status for finding, _, _ in rows)
    repository_counts = Counter(repository.full_name for _, _, repository in rows)
    label = "previous period" if normalized_timeframe == "custom" else {"7d": "previous 7 days", "30d": "previous 30 days", "3m": "previous 3 months", "6m": "previous 6 months", "12m": "previous 12 months"}[normalized_timeframe]
    return AnalyticsResponse(
        start_date=start.date(), end_date=(end - timedelta(days=1)).date(), timeframe=normalized_timeframe,
        summary=summary,
        comparison=AnalyticsComparison(
            label=label, has_sufficient_data=previous_has_data,
            findings=metric(summary.findings, previous.findings) if previous_has_data else None,
            resolved=metric(summary.resolved, previous.resolved) if previous_has_data else None,
            critical=metric(summary.critical, previous.critical) if previous_has_data else None,
        ),
        trend=build_trend(rows, start, end),
        severity=[DistributionPoint(name=name, count=severity_counts[name]) for name in SEVERITIES],
        status=[DistributionPoint(name=name, count=status_counts[name]) for name in STATUSES],
        categories=[DistributionPoint(name=name, count=category_counts[name]) for name in CATEGORIES if category_counts[name]],
        repositories=[DistributionPoint(name=name, count=count) for name, count in repository_counts.most_common(8)],
        critical_findings=[serialize_finding(row) for row in rows if row[0].severity == "critical"][:8],
        recently_resolved=[serialize_finding(row) for row in rows if row[0].status == "resolved"][:8],
    )


@router.get("/findings", response_model=list[AnalyticsFinding])
async def list_findings(
    tenant_id: int, timeframe: str = "12m", start_date: date | None = None, end_date: date | None = None,
    repository_id: int | None = None, severity: str | None = None, category: str | None = None,
    finding_status: str | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await require_membership(tenant_id, current_user.id, db)
    if repository_id is not None:
        await require_repository(db, tenant_id, current_user.id, repository_id)
    start, end, _ = resolve_range(timeframe, start_date, end_date)
    rows, _ = await load_period(db, tenant_id, start, end, repository_id, severity, category, finding_status)
    return [serialize_finding(row) for row in rows]


@router.patch("/findings/{finding_id}/status", response_model=AnalyticsFinding)
async def update_finding_status(
    tenant_id: int, finding_id: int, payload: FindingStatusUpdate,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    normalized = payload.status.lower()
    if normalized not in {"open", "dismissed"}:
        raise HTTPException(status_code=422, detail="Use verification to resolve a finding; triage accepts open or dismissed.")
    await update_triage(
        tenant_id, finding_id,
        TriageUpdate(status="ACTIVE" if normalized == "open" else "DISMISSED", reason=payload.reason),
        current_user, db,
    )
    finding, review, repository, _ = await authorized(db, tenant_id, finding_id, current_user.id)
    return serialize_finding((finding, review, repository))


@router.get("/findings/export")
async def export_findings(
    tenant_id: int, timeframe: str = "30d", start_date: date | None = None, end_date: date | None = None,
    repository_id: int | None = None, severity: str | None = None, category: str | None = None,
    finding_status: str | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await require_membership(tenant_id, current_user.id, db)
    if repository_id is not None:
        await require_repository(db, tenant_id, current_user.id, repository_id)
    start, end, _ = resolve_range(timeframe, start_date, end_date)
    rows, _ = await load_period(db, tenant_id, start, end, repository_id, severity, category, finding_status)
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(["Finding ID", "Date", "Repository", "Pull Request", "Commit SHA", "Filename", "Line", "Severity", "Category", "Message", "Suggested Fix", "Status", "Resolved At", "Review ID", "GitHub URL"])
    for row in rows:
        item = serialize_finding(row)
        writer.writerow([item.id, item.created_at.isoformat(), item.repository_name, item.pull_request_number, item.commit_sha, item.filename, item.line, item.severity, item.category, item.message, item.suggestion or "", item.status, item.resolved_at.isoformat() if item.resolved_at else "", item.review_id, item.github_url or ""])
    filename = f"kodeistry-findings-{(end - timedelta(days=1)).strftime('%Y-%m')}.csv"
    content = "\ufeff" + output.getvalue()
    return StreamingResponse(iter([content]), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
