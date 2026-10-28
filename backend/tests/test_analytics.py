from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.analytics import build_trend, resolve_range, summary_for


def finding(**values):
    defaults = {
        "severity": "high",
        "category": "bug",
        "status": "open",
        "created_at": datetime.now(timezone.utc) - timedelta(days=2),
    }
    return SimpleNamespace(**(defaults | values))


def row(item, repository="acme/api", review_id=1):
    review = SimpleNamespace(id=review_id, repository_id=10, pull_request_number=7)
    return item, review, SimpleNamespace(full_name=repository)


def test_summary_uses_actionable_findings_for_resolution_rate():
    rows = [
        row(finding(status="resolved")),
        row(finding(severity="critical", category="security", status="open"), review_id=2),
        row(finding(severity="info", category="quality", status="resolved"), review_id=2),
    ]
    reviews = [item[1] for item in rows[:2]]

    summary = summary_for(rows, reviews)

    assert summary.findings == 3
    assert summary.actionable == 2
    assert summary.resolution_rate == 50.0
    assert summary.security == 1
    assert summary.most_affected_repository == "acme/api"


def test_trend_contains_zero_value_days_without_inventing_findings():
    end = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    start = end - timedelta(days=7)
    rows = [row(finding(created_at=start + timedelta(days=2), severity="critical"))]

    trend = build_trend(rows, start, end)

    assert len(trend) == 7
    assert sum(point.total for point in trend) == 1
    assert sum(point.critical for point in trend) == 1


def test_custom_range_requires_both_dates():
    with pytest.raises(HTTPException) as error:
        resolve_range("custom", None, None)
    assert error.value.status_code == 422
