from fastapi import status
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.tenant import create_personal_workspace
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from tests.conftest import auth_headers_for_user, create_member, create_tenant, create_user


@pytest.mark.asyncio
async def test_create_tenant_authenticated(client, db_session: AsyncSession):
    user = await create_user(db_session, email="tenant-owner@example.com", is_verified=True)

    response = await client.post(
        "/api/tenants/",
        json={"name": "Acme Labs"},
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == "Acme Labs"
    assert data["slug"] == "acme-labs"
    assert data["workspace_type"] == "ORGANIZATION"

    result = await db_session.execute(
        select(TenantMember).where(
            TenantMember.user_id == user.id,
            TenantMember.tenant_id == data["id"],
        )
    )
    member = result.scalar_one_or_none()
    assert member is not None
    assert member.role == "OWNER"


@pytest.mark.asyncio
async def test_personal_workspace_is_unique_per_user(db_session: AsyncSession):
    user = await create_user(db_session, email="one-personal@example.com")

    with pytest.raises(IntegrityError):
        await create_personal_workspace(db_session, user)
    await db_session.rollback()


@pytest.mark.asyncio
async def test_user_lists_only_workspaces_they_belong_to(client, db_session: AsyncSession):
    user = await create_user(db_session, email="workspace-list@example.com")
    org = await create_tenant(db_session, name="Listed Organization")
    outsider = await create_user(db_session, email="workspace-outsider@example.com")
    await create_member(db_session, tenant_id=org.id, user_id=outsider.id, role="OWNER")

    response = await client.post(
        "/api/tenants/",
        json={"name": "User Organization"},
        headers=auth_headers_for_user(user),
    )
    assert response.status_code == status.HTTP_201_CREATED

    response = await client.get(
        "/api/tenants/",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_200_OK
    workspaces = response.json()
    assert {item["workspace_type"] for item in workspaces} == {
        "PERSONAL",
        "ORGANIZATION",
    }
    assert len(workspaces) == 2


@pytest.mark.asyncio
async def test_owner_can_add_existing_user_to_organization_workspace(
    client,
    db_session: AsyncSession,
):
    owner = await create_user(db_session, email="member-owner@example.com")
    new_member = await create_user(db_session, email="new-member@example.com")
    org = await create_tenant(db_session, name="Member Organization")
    await create_member(db_session, tenant_id=org.id, user_id=owner.id, role="OWNER")

    response = await client.post(
        f"/api/tenants/{org.id}/members",
        json={"email": new_member.email},
        headers=auth_headers_for_user(owner),
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["user_id"] == new_member.id
    assert response.json()["role"] == "DEVELOPER"


@pytest.mark.asyncio
async def test_non_owner_cannot_add_organization_members(
    client,
    db_session: AsyncSession,
):
    owner = await create_user(db_session, email="member-owner2@example.com")
    member = await create_user(db_session, email="regular-member@example.com")
    org = await create_tenant(db_session, name="Owner Restricted Organization")
    await create_member(db_session, tenant_id=org.id, user_id=owner.id, role="OWNER")
    await create_member(db_session, tenant_id=org.id, user_id=member.id, role="DEVELOPER")

    response = await client.post(
        f"/api/tenants/{org.id}/members",
        json={"email": owner.email},
        headers=auth_headers_for_user(member),
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "Only tenant owners can add members."


@pytest.mark.asyncio
async def test_personal_workspace_cannot_add_another_user(
    client,
    db_session: AsyncSession,
):
    owner = await create_user(db_session, email="personal-owner@example.com")
    other = await create_user(db_session, email="personal-other@example.com")
    personal = await db_session.scalar(
        select(Tenant).where(Tenant.personal_owner_user_id == owner.id)
    )

    response = await client.post(
        f"/api/tenants/{personal.id}/members",
        json={"email": other.email},
        headers=auth_headers_for_user(owner),
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.asyncio
async def test_user_cannot_access_another_users_personal_workspace(
    client,
    db_session: AsyncSession,
):
    owner = await create_user(db_session, email="private-workspace-owner@example.com")
    visitor = await create_user(db_session, email="private-workspace-visitor@example.com")
    personal_workspace = await db_session.scalar(
        select(Tenant).where(Tenant.personal_owner_user_id == owner.id)
    )
    assert personal_workspace is not None

    response = await client.get(
        f"/api/tenants/{personal_workspace.id}/repositories",
        headers=auth_headers_for_user(visitor),
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_workspace_member_list_is_tenant_scoped(
    client,
    db_session: AsyncSession,
):
    member = await create_user(db_session, email="members-viewer@example.com")
    outsider = await create_user(db_session, email="members-outsider@example.com")
    org = await create_tenant(db_session, name="Members Visible Organization")
    await create_member(db_session, tenant_id=org.id, user_id=member.id, role="DEVELOPER")
    await create_member(db_session, tenant_id=org.id, user_id=outsider.id, role="OWNER")

    response = await client.get(
        f"/api/tenants/{org.id}/members",
        headers=auth_headers_for_user(member),
    )

    assert response.status_code == status.HTTP_200_OK
    assert {entry["user_id"] for entry in response.json()} == {
        member.id,
        outsider.id,
    }


@pytest.mark.asyncio
async def test_create_tenant_requires_auth(client):
    response = await client.post("/api/tenants/", json={"name": "No Auth"})
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_create_tenant_validation(client, db_session: AsyncSession):
    user = await create_user(db_session, email="tenant-bad@example.com", is_verified=True)

    response = await client.post(
        "/api/tenants/",
        json={"name": "A"},
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_create_tenant_duplicate_name(client, db_session: AsyncSession):
    user = await create_user(db_session, email="tenant-dup@example.com", is_verified=True)
    await create_tenant(db_session, name="Duplicate Tenant")

    response = await client.post(
        "/api/tenants/",
        json={"name": "Duplicate Tenant"},
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json()["detail"] == "Tenant with this name already exists."


@pytest.mark.asyncio
async def test_tenant_member_for_new_tenant_is_owner(client, db_session: AsyncSession):
    user = await create_user(db_session, email="tenant-owner2@example.com", is_verified=True)
    response = await client.post(
        "/api/tenants/",
        json={"name": "Owner Tenant"},
        headers=auth_headers_for_user(user),
    )

    tenant_id = response.json()["id"]
    result = await db_session.execute(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == user.id,
        )
    )
    member = result.scalar_one_or_none()
    assert member is not None
    assert member.role == "OWNER"


@pytest.mark.asyncio
async def test_user_not_member_cannot_access_tenant_resources(client, db_session: AsyncSession):
    user = await create_user(db_session, email="outside@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="External Tenant")
    other_user = await create_user(db_session, email="other-user@example.com", is_verified=True)
    await create_member(db_session, tenant_id=tenant.id, user_id=other_user.id, role="OWNER")

    response = await client.get(
        f"/api/tenants/{tenant.id}/repositories",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "You are not a member of this tenant"


@pytest.mark.asyncio
async def test_tenant_not_found_for_protected_resources(client, db_session: AsyncSession):
    user = await create_user(db_session, email="tenant-missing@example.com", is_verified=True)

    response = await client.get(
        "/api/tenants/999/repositories",
        headers=auth_headers_for_user(user),
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "Tenant not found"


@pytest.mark.asyncio
async def test_membership_authorization_behavior(client, db_session: AsyncSession):
    owner = await create_user(db_session, email="owner@example.com", is_verified=True)
    member = await create_user(db_session, email="member@example.com", is_verified=True)
    tenant = await create_tenant(db_session, name="Member Tenant")
    await create_member(db_session, tenant_id=tenant.id, user_id=owner.id, role="OWNER")
    await create_member(db_session, tenant_id=tenant.id, user_id=member.id, role="DEVELOPER")

    response = await client.post(
        f"/api/tenants/{tenant.id}/repositories",
        json={"owner": "octocat", "name": "demo"},
        headers=auth_headers_for_user(member),
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "Only tenant owners can connect repositories"


@pytest.mark.asyncio
async def test_github_installation_linking_disabled_until_verified_flow(
    client,
    db_session: AsyncSession,
):
    owner = await create_user(
        db_session,
        email="installation-owner@example.com",
        is_verified=True,
    )
    tenant = await create_tenant(db_session, name="Installation Tenant")
    await create_member(
        db_session,
        tenant_id=tenant.id,
        user_id=owner.id,
        role="OWNER",
    )

    response = await client.post(
        f"/api/tenants/{tenant.id}/github/installations",
        json={"installation_id": 12345},
        headers=auth_headers_for_user(owner),
    )

    assert response.status_code == status.HTTP_501_NOT_IMPLEMENTED
    assert "verified installation flow" in response.json()["detail"]
