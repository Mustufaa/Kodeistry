from datetime import datetime, timezone

from app.schemas.review import PersistedReviewFinding, ReviewRunDetailResponse


def test_review_detail_keeps_finding_identity_for_fix_workflow():
    created_at = datetime.now(timezone.utc)
    commit = "a" * 40
    finding = PersistedReviewFinding(
        id=17,
        review_id=3,
        repository_id=4,
        repository_name="team/repo",
        pull_request_number=8,
        commit_sha=commit,
        filename="src/example.py",
        line=12,
        severity="critical",
        category="security",
        message="Unsafe input",
        status="open",
        verification_status="OPEN",
        triage_status="ACTIVE",
        created_at=created_at,
    )
    detail = ReviewRunDetailResponse(
        id=3,
        repository_id=4,
        pull_request_number=8,
        commit_sha=commit,
        status="COMPLETED",
        findings_count=1,
        created_at=created_at,
        findings=[finding],
    )

    serialized = detail.model_dump(mode="json")["findings"][0]
    assert serialized["id"] == 17
    assert serialized["commit_sha"] == commit
    assert serialized["verification_status"] == "OPEN"
    assert serialized["triage_status"] == "ACTIVE"
