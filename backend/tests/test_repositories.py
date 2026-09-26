from unittest.mock import AsyncMock, patch

import pytest
from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from tests.conftest import (
    auth_headers_for_user,
    create_github_installation,
    create_member,
    create_repository,
    create_review_run,
    create_tenant,
    create_user,
)


@pytest.mark.asyncio
async def test_connect_repository_as_owner_success(client, db_session: AsyncSession):
    owner = await create_user(db_session, email="repo-owner@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Repo Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=owner.id, role="OWNER")
    installation = await create_github_installation(db_session, tenant_id=tenant.id, installation_id=101)

    mock_repo = {
        "id": 999,
        "owner": {"login": "octocat"},
        "name": "demo-repo",
        "full_name": "octocat/demo-repo",
        "private": False,
        "default_branch": "main",
    }

    with patch("app.api.repository.GitHubClient.get_repository", new=AsyncMock(return_value=mock_repo)):
        response = await client.post(
            f"/api/tenants/{tenant.id}/repositories",
            json={"owner": "octocat", "name": "demo-repo"},
            headers=auth_headers_for_user(owner),
        )

    assert response.status_code == status.HTTP_201_CREATED
    payload = response.json()
    assert payload["github_repository_id"] == 999
    assert payload["full_name"] == "octocat/demo-repo"


@pytest.mark.asyncio
async def test_connect_repository_requires_auth(client, db_session: AsyncSession):
    tenant = await create_tenant(db_session, name="Repo Guest Tenant")
    response = await client.post(
        f"/api/tenants/{tenant.id}/repositories",
        json={"owner": "octocat", "name": "demo-repo"},
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_connect_repository_non_member_forbidden(client, db_session: AsyncSession):
    outsider = await create_user(db_session, email="outsider@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Forbidden Repo Tenant")
    await create_github_installation(db_session, tenant_id=tenant.id, installation_id=201)

    response = await client.post(
        f"/api/tenants/{tenant.id}/repositories",
        json={"owner": "octocat", "name": "demo-repo"},
        headers=auth_headers_for_user(outsider),
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "You are not a member of this tenant"


@pytest.mark.asyncio
async def test_connect_repository_requires_owner_role(client, db_session: AsyncSession):
    member = await create_user(db_session, email="member-no-owner@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Developer Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=member.id, role="DEVELOPER")
    await create_github_installation(db_session, tenant_id=tenant.id, installation_id=202)

    response = await client.post(
        f"/api/tenants/{tenant.id}/repositories",
        json={"owner": "octocat", "name": "demo-repo"},
        headers=auth_headers_for_user(member),
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "Only tenant owners can connect repositories"


@pytest.mark.asyncio
async def test_connect_repository_missing_installation(client, db_session: AsyncSession):
    owner = await create_user(db_session, email="repo-owner2@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="No Install Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=owner.id, role="OWNER")

    response = await client.post(
        f"/api/tenants/{tenant.id}/repositories",
        json={"owner": "octocat", "name": "demo-repo"},
        headers=auth_headers_for_user(owner),
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["detail"] == "No GitHub installation connected to this tenant"


@pytest.mark.asyncio
async def test_connect_repository_github_not_found(client, db_session: AsyncSession):
    owner = await create_user(db_session, email="repo-owner3@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Missing Repo Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=owner.id, role="OWNER")
    await create_github_installation(db_session, tenant_id=tenant.id, installation_id=203)

    with patch("app.api.repository.GitHubClient.get_repository", new=AsyncMock(side_effect=RuntimeError("Repository not found"))):
        response = await client.post(
            f"/api/tenants/{tenant.id}/repositories",
            json={"owner": "octocat", "name": "missing-repo"},
            headers=auth_headers_for_user(owner),
        )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["detail"] == "Repository not found"


@pytest.mark.asyncio
async def test_connect_repository_duplicate_repo(client, db_session: AsyncSession):
    owner = await create_user(db_session, email="repo-owner4@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Duplicate Repo Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=owner.id, role="OWNER")
    installation = await create_github_installation(db_session, tenant_id=tenant.id, installation_id=204)
    await create_repository(db_session, tenant_id=tenant.id, installation_id=installation.id, github_repository_id=888)

    mock_repo = {
        "id": 888,
        "owner": {"login": "octocat"},
        "name": "existing-repo",
        "full_name": "octocat/existing-repo",
        "private": False,
        "default_branch": "main",
    }

    with patch("app.api.repository.GitHubClient.get_repository", new=AsyncMock(return_value=mock_repo)):
        response = await client.post(
            f"/api/tenants/{tenant.id}/repositories",
            json={"owner": "octocat", "name": "existing-repo"},
            headers=auth_headers_for_user(owner),
        )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json()["detail"] == "Repository is already connected to this tenant"


@pytest.mark.asyncio
async def test_list_repositories_success(client, db_session: AsyncSession):
    owner = await create_user(db_session, email="repo-list@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="List Repo Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=owner.id, role="OWNER")
    installation = await create_github_installation(db_session, tenant_id=tenant.id, installation_id=205)
    await create_repository(db_session, tenant_id=tenant.id, installation_id=installation.id, github_repository_id=1001)
    await create_repository(db_session, tenant_id=tenant.id, installation_id=installation.id, github_repository_id=1002)

    response = await client.get(
        f"/api/tenants/{tenant.id}/repositories",
        headers=auth_headers_for_user(owner),
    )

    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_repository_not_found_for_review_list(client, db_session: AsyncSession):
    user = await create_user(db_session, email="repo404@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="MissingRepoListTenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=user.id, role="OWNER")

    response = await client.get(
        f"/api/tenants/{tenant.id}/repositories/999/reviews",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "Repository not found"


@pytest.mark.asyncio
async def test_repository_from_other_tenant_not_accessible(client, db_session: AsyncSession):
    user = await create_user(db_session, email="cross-tenant@example.com", is_verified=True)
    tenant_a = await create_tenant(db_session, name="Tenant A")
    tenant_b = await create_tenant(db_session, name="Tenant B")
    await create_member(db_session, tenant_id=tenant_a.id, user_id=user.id, role="OWNER")
    installation = await create_github_installation(db_session, tenant_id=tenant_b.id, installation_id=206)
    repository = await create_repository(db_session, tenant_id=tenant_b.id, installation_id=installation.id, github_repository_id=321)

    response = await client.get(
        f"/api/tenants/{tenant_a.id}/repositories/{repository.id}/reviews",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "Repository not found"
