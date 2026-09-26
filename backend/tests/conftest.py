import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault(
    "SECRET_KEY",
    "unit-test-only-F5!q9R2@v7K4#x8M1",
)
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
os.environ.setdefault("MAIL_USERNAME", "test@example.com")
os.environ.setdefault("MAIL_PASSWORD", "test-password")
os.environ.setdefault("MAIL_FROM", "test@example.com")
os.environ.setdefault("MAIL_PORT", "587")
os.environ.setdefault("MAIL_SERVER", "smtp.gmail.com")
os.environ.setdefault("MAIL_STARTTLS", "True")
os.environ.setdefault("MAIL_SSL_TLS", "False")
os.environ.setdefault("GITHUB_APP_ID", "123")
os.environ.setdefault("GITHUB_CLIENT_ID", "client-id")
os.environ.setdefault("GITHUB_CLIENT_SECRET", "client-secret")
os.environ.setdefault("GITHUB_PRIVATE_KEY_PATH", "")
os.environ.setdefault("GITHUB_WEBHOOK_SECRET", "test-webhook-secret")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("GEMINI_MODEL", "gemini-test-model")
os.environ.setdefault("OPENROUTER_API_KEY", "test-openrouter-key")
os.environ.setdefault("OPENROUTER_MODEL", "test-model")

from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from datetime import datetime, timedelta, timezone

from app.core.auth import create_access_token
from app.core.security import hash_password
from app.crud.tenant import create_personal_workspace
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.models.review_finding import ReviewFinding
from app.models.review_run import ReviewRun
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.user import User


@pytest.fixture(autouse=True)
def suppress_auth_email_delivery(monkeypatch):
    async def suppress_email(email: str, token: str) -> None:
        return None

    monkeypatch.setattr("app.api.auth.send_verification_email", suppress_email)
    monkeypatch.setattr("app.api.auth.send_password_reset_email", suppress_email)


def _make_engine():
    return create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
        echo=False,
    )


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = _make_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    import app.db.session as session_module

    session_module.AsyncSessionLocal = async_session

    async def override_get_db():
        async with session_module.AsyncSessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    try:
        async with async_session() as session:
            yield session
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client


async def create_user(
    db: AsyncSession,
    *,
    email: str,
    password: str = "TestPass123!",
    name: str = "Test User",
    is_verified: bool = True,
    verification_token: str | None = None,
    reset_password_token: str | None = None,
) -> User:
    user = User(
        full_name=name,
        email=email,
        hashed_password=hash_password(password),
        is_verified=is_verified,
        verification_token=verification_token,
        verification_token_expiry=(
            datetime.now(timezone.utc) + timedelta(minutes=30)
            if verification_token is not None
            else None
        ),
        reset_password_token=reset_password_token,
        reset_password_expiry=(
            datetime.now(timezone.utc) + timedelta(minutes=30)
            if reset_password_token is not None
            else None
        ),
    )
    db.add(user)
    await db.flush()
    await create_personal_workspace(db, user)
    await db.commit()
    await db.refresh(user)
    return user


async def create_tenant(db: AsyncSession, name: str = "Acme") -> Tenant:
    tenant = Tenant(name=name, slug=name.lower().replace(" ", "-"))
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant


async def create_member(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    role: str = "OWNER",
) -> TenantMember:
    member = TenantMember(tenant_id=tenant_id, user_id=user_id, role=role)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


async def create_repository(
    db: AsyncSession,
    *,
    tenant_id: int,
    installation_id: int,
    github_repository_id: int,
    owner: str = "octocat",
    name: str = "demo-repo",
    full_name: str = "octocat/demo-repo",
    private: bool = False,
    default_branch: str = "main",
) -> Repository:
    repo = Repository(
        tenant_id=tenant_id,
        github_installation_id=installation_id,
        github_repository_id=github_repository_id,
        owner=owner,
        name=name,
        full_name=full_name,
        private=private,
        default_branch=default_branch,
    )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)
    return repo


async def create_review_run(
    db: AsyncSession,
    *,
    tenant_id: int,
    repository_id: int,
    pull_request_number: int = 7,
    commit_sha: str = "abc123",
    status: str = "COMPLETED",
    findings_count: int = 0,
) -> ReviewRun:
    run = ReviewRun(
        tenant_id=tenant_id,
        repository_id=repository_id,
        pull_request_number=pull_request_number,
        commit_sha=commit_sha,
        status=status,
        findings_count=findings_count,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


async def create_review_finding(
    db: AsyncSession,
    *,
    review_run_id: int,
    filename: str,
    line: int,
    severity: str,
    category: str,
    message: str,
    suggestion: str | None = None,
) -> ReviewFinding:
    finding = ReviewFinding(
        review_run_id=review_run_id,
        filename=filename,
        line=line,
        severity=severity,
        category=category,
        message=message,
        suggestion=suggestion,
    )
    db.add(finding)
    await db.commit()
    await db.refresh(finding)
    return finding


async def create_github_installation(
    db: AsyncSession,
    *,
    tenant_id: int,
    installation_id: int = 42,
    account_login: str = "octocat",
    account_type: str = "User",
) -> GitHubInstallation:
    installation = GitHubInstallation(
        tenant_id=tenant_id,
        installation_id=installation_id,
        account_login=account_login,
        account_type=account_type,
    )
    db.add(installation)
    await db.commit()
    await db.refresh(installation)
    return installation


def auth_headers_for_user(user: User) -> dict[str, str]:
    token = create_access_token({"sub": user.email})
    return {"Authorization": f"Bearer {token}"}
