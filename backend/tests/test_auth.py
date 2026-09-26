import pytest
from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token
from app.core.security import verify_password
from app.crud.user import get_user_by_email
from app.models.user import User
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from tests.conftest import auth_headers_for_user, create_user


@pytest.mark.asyncio
async def test_register_success(client, db_session: AsyncSession):
    response = await client.post(
        "/api/auth/register",
        json={
            "name": "Alice Example",
            "email": "alice@example.com",
            "password": "SecurePass123!",
        },
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert "Registration successful" in response.json()["message"]

    user = await get_user_by_email(db_session, "alice@example.com")
    assert user is not None
    assert user.is_verified is False
    workspace = await db_session.scalar(
        select(Tenant).where(
            Tenant.personal_owner_user_id == user.id,
            Tenant.workspace_type == "PERSONAL",
        )
    )
    assert workspace is not None
    assert workspace.name == "Alice Example's Workspace"
    member = await db_session.scalar(
        select(TenantMember).where(
            TenantMember.tenant_id == workspace.id,
            TenantMember.user_id == user.id,
        )
    )
    assert member is not None
    assert member.role == "OWNER"
    assert response.json()["workspace"]["id"] == workspace.id


@pytest.mark.asyncio
async def test_register_rolls_back_user_when_personal_workspace_creation_fails(
    client,
    db_session: AsyncSession,
    monkeypatch,
):
    async def fail_workspace_creation(db, user):
        raise RuntimeError("workspace creation failed")

    monkeypatch.setattr(
        "app.api.auth.create_personal_workspace",
        fail_workspace_creation,
    )

    with pytest.raises(RuntimeError, match="workspace creation failed"):
        await client.post(
            "/api/auth/register",
            json={
                "name": "Rollback User",
                "email": "rollback@example.com",
                "password": "SecurePass123!",
            },
        )

    assert await get_user_by_email(db_session, "rollback@example.com") is None


@pytest.mark.asyncio
async def test_current_user_profile_requires_auth_and_returns_safe_profile(
    client,
    db_session: AsyncSession,
):
    user = await create_user(db_session, email="profile@example.com")
    headers = auth_headers_for_user(user)

    response = await client.get("/api/auth/me", headers=headers)

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "is_verified": True,
    }
    assert "hashed_password" not in response.json()


@pytest.mark.asyncio
async def test_current_user_profile_requires_auth(client):
    response = await client.get("/api/auth/me")
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_register_duplicate_email(client, db_session: AsyncSession):
    await create_user(db_session, email="dup@example.com")

    response = await client.post(
        "/api/auth/register",
        json={
            "name": "Duplicate User",
            "email": "dup@example.com",
            "password": "SecurePass123!",
        },
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["detail"] == "Email already registered"


@pytest.mark.asyncio
async def test_register_invalid_data(client):
    response = await client.post(
        "/api/auth/register",
        json={
            "name": "A",
            "email": "bad-email",
            "password": "short",
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_verify_email_success(client, db_session: AsyncSession):
    await create_user(db_session, email="verify@example.com", is_verified=False, verification_token="token-123")

    response = await client.get("/api/auth/verify-email", params={"token": "token-123"})

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["message"] == "Email verified successfully."

    result = await db_session.execute(select(User).where(User.email == "verify@example.com"))
    refreshed = result.scalar_one_or_none()
    assert refreshed is not None
    assert refreshed.is_verified is True
    assert refreshed.verification_token is None


@pytest.mark.asyncio
async def test_verify_email_invalid_token(client):
    response = await client.get("/api/auth/verify-email", params={"token": "missing-token"})

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["detail"] == "Invalid or expired verification token."


@pytest.mark.asyncio
async def test_login_success(client, db_session: AsyncSession):
    await create_user(db_session, email="login@example.com", password="TestPass123!", is_verified=True)

    response = await client.post(
        "/api/auth/login",
        json={"email": "login@example.com", "password": "TestPass123!"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]


@pytest.mark.asyncio
async def test_login_wrong_password(client, db_session: AsyncSession):
    await create_user(db_session, email="wrongpass@example.com", password="TestPass123!", is_verified=True)

    response = await client.post(
        "/api/auth/login",
        json={"email": "wrongpass@example.com", "password": "WrongPass123!"},
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_login_nonexistent_user(client):
    response = await client.post(
        "/api/auth/login",
        json={"email": "ghost@example.com", "password": "TestPass123!"},
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "Invalid email or password"


@pytest.mark.asyncio
async def test_login_before_email_verification(client, db_session: AsyncSession):
    await create_user(db_session, email="pending@example.com", password="TestPass123!", is_verified=False)

    response = await client.post(
        "/api/auth/login",
        json={"email": "pending@example.com", "password": "TestPass123!"},
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "Please verify your email before logging in."


@pytest.mark.asyncio
async def test_forgot_password(client, db_session: AsyncSession):
    await create_user(db_session, email="reset@example.com", is_verified=True)

    response = await client.post(
        "/api/auth/forgot-password",
        json={"email": "reset@example.com"},
    )

    assert response.status_code == status.HTTP_200_OK
    result = await db_session.execute(select(User).where(User.email == "reset@example.com"))
    updated_user = result.scalar_one_or_none()
    assert updated_user is not None
    assert updated_user.reset_password_token is not None


@pytest.mark.asyncio
async def test_reset_password_success(client, db_session: AsyncSession):
    user = await create_user(
        db_session,
        email="newpass@example.com",
        is_verified=True,
        reset_password_token="reset-token-1",
    )

    response = await client.post(
        "/api/auth/reset-password",
        json={"token": "reset-token-1", "new_password": "NewPass123!"},
    )

    assert response.status_code == status.HTTP_200_OK
    db_session.expire_all()
    result = await db_session.execute(select(User).where(User.email == "newpass@example.com"))
    refreshed_user = result.scalar_one_or_none()
    assert refreshed_user is not None
    assert refreshed_user.reset_password_token is None
    assert verify_password("NewPass123!", refreshed_user.hashed_password) is True
    assert verify_password("TestPass123!", refreshed_user.hashed_password) is False


@pytest.mark.asyncio
async def test_reset_password_invalid_token(client):
    response = await client.post(
        "/api/auth/reset-password",
        json={"token": "bad-token", "new_password": "NewPass123!"},
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["detail"] == "Invalid or expired reset token."


@pytest.mark.asyncio
async def test_protected_route_without_jwt(client):
    response = await client.post("/api/tenants/", json={"name": "Protected Test"})

    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_protected_route_with_invalid_jwt(client):
    response = await client.post(
        "/api/tenants/",
        json={"name": "Protected Test"},
        headers={"Authorization": "Bearer invalid-token"},
    )

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_protected_route_with_valid_jwt(client, db_session: AsyncSession):
    user = await create_user(db_session, email="jwtuser@example.com", is_verified=True)
    headers = auth_headers_for_user(user)

    response = await client.post("/api/tenants/", json={"name": "Auth Tenant"}, headers=headers)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["name"] == "Auth Tenant"
