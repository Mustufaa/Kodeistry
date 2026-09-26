import hashlib
import hmac
import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import status
from sqlalchemy import select

from app.models.review_finding import ReviewFinding
from app.models.review_run import ReviewRun
from app.schemas.review import ReviewResult, ReviewFinding as ReviewFindingSchema
from tests.conftest import (
    auth_headers_for_user,
    create_github_installation,
    create_member,
    create_repository,
    create_review_finding,
    create_review_run,
    create_tenant,
    create_user,
)


@pytest.mark.asyncio
async def test_list_review_history_success(client, db_session):
    user = await create_user(db_session, email="review-history@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Review History Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=user.id, role="OWNER")
    installation = await create_github_installation(db_session, tenant_id=tenant.id, installation_id=301)
    repository = await create_repository(db_session, tenant_id=tenant.id, installation_id=installation.id, github_repository_id=7001)

    first = await create_review_run(db_session, tenant_id=tenant.id, repository_id=repository.id, pull_request_number=1, commit_sha="sha-1", status="COMPLETED", findings_count=2)
    second = await create_review_run(db_session, tenant_id=tenant.id, repository_id=repository.id, pull_request_number=2, commit_sha="sha-2", status="COMPLETED", findings_count=1)

    response = await client.get(
        f"/api/tenants/{tenant.id}/reviews",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert [item["id"] for item in payload] == [second.id, first.id]


@pytest.mark.asyncio
async def test_list_review_history_tenant_scoped(client, db_session):
    user = await create_user(db_session, email="review-scoped@example.com", is_verified=True)
    tenant_a = await create_tenant(db_session, name="Tenant A Reviews")
    tenant_b = await create_tenant(db_session, name="Tenant B Reviews")
    await create_member(db_session, tenant_id=tenant_a.id, user_id=user.id, role="OWNER")
    installation_a = await create_github_installation(db_session, tenant_id=tenant_a.id, installation_id=302)
    installation_b = await create_github_installation(db_session, tenant_id=tenant_b.id, installation_id=303)
    repo_a = await create_repository(db_session, tenant_id=tenant_a.id, installation_id=installation_a.id, github_repository_id=7002)
    repo_b = await create_repository(db_session, tenant_id=tenant_b.id, installation_id=installation_b.id, github_repository_id=7003)
    await create_review_run(db_session, tenant_id=tenant_a.id, repository_id=repo_a.id, pull_request_number=11, commit_sha="sha-a", status="COMPLETED", findings_count=1)
    await create_review_run(db_session, tenant_id=tenant_b.id, repository_id=repo_b.id, pull_request_number=12, commit_sha="sha-b", status="COMPLETED", findings_count=1)

    response = await client.get(
        f"/api/tenants/{tenant_a.id}/reviews",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload
    assert all(item["repository_id"] in {repo_a.id} for item in payload)


@pytest.mark.asyncio
async def test_list_review_history_unauthorized(client, db_session):
    actor = await create_user(db_session, email="review-unauth@example.com", is_verified=True)
    owner = await create_user(db_session, email="review-owner@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Sealed Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=owner.id, role="OWNER")

    response = await client.get(
        f"/api/tenants/{tenant.id}/reviews",
        headers=auth_headers_for_user(actor),
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "You are not a member of this tenant"


@pytest.mark.asyncio
async def test_list_review_history_missing_tenant(client, db_session):
    user = await create_user(db_session, email="tenant-missing-review@example.com", is_verified=True)

    response = await client.get(
        "/api/tenants/999/reviews",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "Tenant not found"


@pytest.mark.asyncio
async def test_get_review_detail_success_and_findings(client, db_session):
    user = await create_user(db_session, email="review-detail@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Review Detail Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=user.id, role="OWNER")
    installation = await create_github_installation(db_session, tenant_id=tenant.id, installation_id=304)
    repository = await create_repository(db_session, tenant_id=tenant.id, installation_id=installation.id, github_repository_id=7004)
    review_run = await create_review_run(db_session, tenant_id=tenant.id, repository_id=repository.id, pull_request_number=20, commit_sha="sha-detail", status="COMPLETED", findings_count=2)
    await create_review_finding(db_session, review_run_id=review_run.id, filename="app.py", line=10, severity="high", category="security", message="Issue 1")
    await create_review_finding(db_session, review_run_id=review_run.id, filename="app.py", line=20, severity="medium", category="bug", message="Issue 2", suggestion="Fix it")

    response = await client.get(
        f"/api/tenants/{tenant.id}/reviews/{review_run.id}",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["findings_count"] == 2
    assert len(payload["findings"]) == 2
    assert payload["findings"][0]["filename"] == "app.py"


@pytest.mark.asyncio
async def test_get_review_detail_for_other_tenant_rejected(client, db_session):
    user = await create_user(db_session, email="review-other-tenant@example.com", is_verified=True)
    tenant_a = await create_tenant(db_session, name="Review T1")
    tenant_b = await create_tenant(db_session, name="Review T2")
    await create_member(db_session, tenant_id=tenant_a.id, user_id=user.id, role="OWNER")
    installation = await create_github_installation(db_session, tenant_id=tenant_b.id, installation_id=305)
    repository = await create_repository(db_session, tenant_id=tenant_b.id, installation_id=installation.id, github_repository_id=7005)
    review_run = await create_review_run(db_session, tenant_id=tenant_b.id, repository_id=repository.id, pull_request_number=21, commit_sha="sha-other", status="COMPLETED", findings_count=1)

    response = await client.get(
        f"/api/tenants/{tenant_a.id}/reviews/{review_run.id}",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "Review run not found"


@pytest.mark.asyncio
async def test_get_repository_review_list_success(client, db_session):
    user = await create_user(db_session, email="repo-review-list@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Repo Review Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=user.id, role="OWNER")
    installation = await create_github_installation(db_session, tenant_id=tenant.id, installation_id=306)
    repository = await create_repository(db_session, tenant_id=tenant.id, installation_id=installation.id, github_repository_id=7006)
    first = await create_review_run(db_session, tenant_id=tenant.id, repository_id=repository.id, pull_request_number=30, commit_sha="sha-30", status="COMPLETED", findings_count=1)
    second = await create_review_run(db_session, tenant_id=tenant.id, repository_id=repository.id, pull_request_number=31, commit_sha="sha-31", status="COMPLETED", findings_count=0)

    response = await client.get(
        f"/api/tenants/{tenant.id}/repositories/{repository.id}/reviews",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert [item["id"] for item in payload] == [second.id, first.id]
    assert all(item["repository_id"] == repository.id for item in payload)


@pytest.mark.asyncio
async def test_get_repository_review_detail_success(client, db_session):
    user = await create_user(db_session, email="repo-review-detail@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Repo Detail Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=user.id, role="OWNER")
    installation = await create_github_installation(db_session, tenant_id=tenant.id, installation_id=307)
    repository = await create_repository(db_session, tenant_id=tenant.id, installation_id=installation.id, github_repository_id=7007)
    review_run = await create_review_run(db_session, tenant_id=tenant.id, repository_id=repository.id, pull_request_number=41, commit_sha="sha-41", status="COMPLETED", findings_count=1)
    await create_review_finding(db_session, review_run_id=review_run.id, filename="service.py", line=8, severity="critical", category="security", message="Possible injection", suggestion="Sanitize input")

    response = await client.get(
        f"/api/tenants/{tenant.id}/repositories/{repository.id}/reviews/{review_run.id}",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["repository_id"] == repository.id
    assert payload["findings_count"] == 1
    assert payload["findings"][0]["category"] == "security"


@pytest.mark.asyncio
async def test_mismatched_repository_review_combination_returns_404(client, db_session):
    user = await create_user(db_session, email="repo-mismatch@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Mismatch Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=user.id, role="OWNER")
    installation = await create_github_installation(db_session, tenant_id=tenant.id, installation_id=308)
    repo_one = await create_repository(db_session, tenant_id=tenant.id, installation_id=installation.id, github_repository_id=7008)
    repo_two = await create_repository(db_session, tenant_id=tenant.id, installation_id=installation.id, github_repository_id=7009)
    review_run = await create_review_run(db_session, tenant_id=tenant.id, repository_id=repo_one.id, pull_request_number=42, commit_sha="sha-42", status="COMPLETED", findings_count=0)

    response = await client.get(
        f"/api/tenants/{tenant.id}/repositories/{repo_two.id}/reviews/{review_run.id}",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "Review run not found"


@pytest.mark.asyncio
async def test_webhook_rejects_invalid_signature(client, db_session):
    payload = json.dumps({"action": "opened", "repository": {"id": 1, "name": "demo", "owner": {"login": "octocat"}}, "installation": {"id": 12}, "number": 2}).encode()

    response = await client.post(
        "/api/github/webhook",
        content=payload,
        headers={
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": "sha256=bad-signature",
        },
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_webhook_processes_valid_pr_event_and_creates_review_run(client, db_session):
    user = await create_user(db_session, email="webhook-user@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Webhook Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=user.id, role="OWNER")
    installation = await create_github_installation(db_session, tenant_id=tenant.id, installation_id=400)
    repo = await create_repository(db_session, tenant_id=tenant.id, installation_id=installation.id, github_repository_id=9001)

    payload = {
        "action": "opened",
        "installation": {"id": 400},
        "repository": {
            "id": 9001,
            "name": "demo",
            "full_name": "octocat/demo",
            "owner": {"login": "octocat"},
        },
        "number": 12,
    }
    encoded = json.dumps(payload).encode()
    signature = "sha256=" + hmac.new(b"test-webhook-secret", encoded, hashlib.sha256).hexdigest()

    review_result = ReviewResult(
        findings=[
            {
                "filename": "app.py",
                "line": 3,
                "severity": "high",
                "category": "security",
                "message": "Unsafe usage",
                "suggestion": "Fix it",
            }
        ],
        files_reviewed=1,
        lines_reviewed=10,
    )

    with patch("app.api.github.GitHubClient.get_pull_request_commit_sha", new=AsyncMock(return_value="abc123")), \
         patch("app.api.github.GitHubClient.get_pull_request_files", new=AsyncMock(return_value=[{"filename": "app.py", "status": "modified", "patch": "@@ -1 +1 @@\n+print(1)"}])), \
         patch("app.api.github.review_changed_files", new=AsyncMock(return_value=review_result)), \
         patch("app.api.github.post_review_to_github", new=AsyncMock(return_value={"id": 777})):
        response = await client.post(
            "/api/github/webhook",
            content=encoded,
            headers={
                "X-GitHub-Event": "pull_request",
                "X-Hub-Signature-256": signature,
            },
        )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["review_run_status"] == "COMPLETED"
    assert response.json()["findings_count"] == 1

    result = await db_session.execute(
        select(ReviewRun).where(
            ReviewRun.tenant_id == tenant.id,
            ReviewRun.repository_id == repo.id,
        ).order_by(ReviewRun.id.desc())
    )
    run = result.scalar_one_or_none()
    assert run is not None
    findings_result = await db_session.execute(
        select(ReviewFinding).where(ReviewFinding.review_run_id == run.id)
    )
    assert findings_result.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_webhook_skips_unsupported_event(client):
    payload = json.dumps({"action": "closed", "repository": {"id": 1}, "installation": {"id": 12}, "number": 2}).encode()
    signature = "sha256=" + hmac.new(b"test-webhook-secret", payload, hashlib.sha256).hexdigest()

    response = await client.post(
        "/api/github/webhook",
        content=payload,
        headers={
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": signature,
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["message"] == "Webhook received but no review triggered."


@pytest.mark.asyncio
async def test_webhook_handles_malformed_payload_gracefully(client):
    payload = b'{"action": "opened"'
    signature = "sha256=" + hmac.new(b"test-webhook-secret", payload, hashlib.sha256).hexdigest()

    response = await client.post(
        "/api/github/webhook",
        content=payload,
        headers={
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": signature,
        },
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["detail"] == "Invalid JSON payload."


@pytest.mark.parametrize("payload", [b"[]", b'"hello"', b"123", b"null"])
@pytest.mark.asyncio
async def test_webhook_rejects_non_object_json_payload(client, payload):
    signature = "sha256=" + hmac.new(
        b"test-webhook-secret",
        payload,
        hashlib.sha256,
    ).hexdigest()

    response = await client.post(
        "/api/github/webhook",
        content=payload,
        headers={
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": signature,
        },
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["detail"] == "Invalid JSON payload."


@pytest.mark.parametrize(
    "path",
    [
        "/api/github/test-app",
        "/api/github/installations",
        "/api/github/installations/123/token",
        "/api/github/repository/octocat/demo",
        "/api/github/repository/octocat/demo/pull/1",
        "/api/github/repository/octocat/demo/pull/1/files",
        "/api/github/repository/octocat/demo/pull/1/review",
    ],
)
@pytest.mark.asyncio
async def test_github_diagnostic_routes_are_not_public(client, path):
    response = await client.get(path)

    assert response.status_code == status.HTTP_404_NOT_FOUND
