from urllib.parse import parse_qs, urlsplit

import pytest
import httpx
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.auth import GitHubOAuthError, _fetch_github_identity
from app.api.github import verify_github_signature
from app.api.github_installation import matching_personal_installation
from app.api.onboarding import get_onboarding_status
from app.core.config import settings
from app.crud.tenant import create_personal_workspace
from app.db.base import Base
from app.main import app
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.user import User
from app.services.repository_service import sync_installation_repositories


def test_canonical_github_oauth_route_redirects_with_bound_state():
    client = TestClient(app)
    response = client.get('/api/auth/github', follow_redirects=False)

    assert response.status_code == 302
    location = urlsplit(response.headers['location'])
    assert (location.scheme, location.netloc, location.path) == (
        'https',
        'github.com',
        '/login/oauth/authorize',
    )
    query = parse_qs(location.query)
    assert 'scope' not in query
    state = query['state'][0]
    payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert payload['purpose'] == 'github_oauth'
    assert 'nonce' in payload
    assert settings.OAUTH_STATE_COOKIE_NAME in response.headers['set-cookie']
    assert 'HttpOnly' in response.headers['set-cookie']

    routes = [route.path for route in app.routes]
    assert routes.count('/api/auth/github') == 1
    assert routes.count('/api/auth/github/callback') == 1
    assert routes.count('/api/github/setup/callback') == 1


def test_webhook_signature_rejects_missing_signature():
    assert verify_github_signature(b'{}', None) is False


def test_existing_personal_installation_matches_authenticated_github_user():
    user = User(
        full_name='Octo Cat',
        email='octo@example.com',
        github_id=123,
        github_login='octocat',
        auth_provider='github',
        hashed_password=None,
        is_verified=True,
    )
    installations = [
        {'id': 10, 'account': {'id': 999, 'type': 'User'}},
        {'id': 11, 'account': {'id': 123, 'type': 'User'}, 'suspended_at': None},
    ]

    assert matching_personal_installation(installations, user)['id'] == 11


def test_suspended_or_organization_installation_is_not_auto_linked():
    user = User(
        full_name='Octo Cat',
        email='octo@example.com',
        github_id=123,
        github_login='octocat',
        auth_provider='github',
        hashed_password=None,
        is_verified=True,
    )
    installations = [
        {'id': 10, 'account': {'id': 123, 'type': 'Organization'}},
        {'id': 11, 'account': {'id': 123, 'type': 'User'}, 'suspended_at': '2026-01-01'},
    ]

    assert matching_personal_installation(installations, user) is None


@pytest.mark.asyncio
@pytest.mark.parametrize('status_code', [403, 404])
async def test_github_identity_reports_missing_email_permission(status_code):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/login/oauth/access_token':
            return httpx.Response(200, json={'access_token': 'token'})
        if request.url.path == '/user':
            return httpx.Response(200, json={'id': 123, 'login': 'octocat'})
        return httpx.Response(status_code, json={'message': 'Resource not accessible by integration'})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(GitHubOAuthError) as exc_info:
            await _fetch_github_identity(client, 'code')

    assert exc_info.value.code == 'email_permission_missing'
    assert 'Email addresses permission' in exc_info.value.user_message


@pytest.mark.asyncio
async def test_github_identity_uses_verified_primary_email():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/login/oauth/access_token':
            return httpx.Response(200, json={'access_token': 'token'})
        if request.url.path == '/user':
            return httpx.Response(200, json={'id': 123, 'login': 'octocat'})
        return httpx.Response(200, json=[
            {'email': 'other@example.com', 'verified': True, 'primary': False},
            {'email': 'Octo@Example.com', 'verified': True, 'primary': True},
        ])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        github_user, email = await _fetch_github_identity(client, 'code')

    assert github_user['login'] == 'octocat'
    assert email == 'octo@example.com'


@pytest.mark.asyncio
async def test_personal_workspace_and_repository_sync_are_idempotent():
    engine = create_async_engine(
        'sqlite+aiosqlite:///:memory:',
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as db:
        user = User(
            full_name='Octo Cat',
            email='octo@example.com',
            github_id=123,
            github_login='octocat',
            auth_provider='github',
            hashed_password=None,
            is_verified=True,
        )
        db.add(user)
        await db.flush()

        first_workspace = await create_personal_workspace(db, user)
        second_workspace = await create_personal_workspace(db, user)
        assert first_workspace.id == second_workspace.id
        assert await db.scalar(select(func.count()).select_from(Tenant)) == 1
        assert await db.scalar(select(func.count()).select_from(TenantMember)) == 1
        user.onboarding_tenant_id = first_workspace.id
        before_install = await get_onboarding_status(db, user)
        assert before_install.next_step == 'github_install'

        installation = GitHubInstallation(
            tenant_id=first_workspace.id,
            installation_id=456,
            account_login='octocat',
            account_type='User',
        )
        db.add(installation)
        await db.flush()

        first = await sync_installation_repositories(db, installation, [
            {'id': 1, 'owner': {'login': 'octocat'}, 'name': 'one', 'full_name': 'octocat/one', 'private': False, 'default_branch': 'main'},
            {'id': 2, 'owner': {'login': 'octocat'}, 'name': 'two', 'full_name': 'octocat/two', 'private': True, 'default_branch': 'main'},
        ])
        assert (first.total, first.created, first.updated, first.removed) == (2, 2, 0, 0)

        second = await sync_installation_repositories(db, installation, [
            {'id': 1, 'owner': {'login': 'octocat'}, 'name': 'one-renamed', 'full_name': 'octocat/one-renamed', 'private': False, 'default_branch': 'trunk'},
        ])
        assert (second.total, second.created, second.updated, second.removed) == (1, 0, 1, 1)
        repositories = (await db.execute(select(Repository).order_by(Repository.github_repository_id))).scalars().all()
        assert repositories[0].full_name == 'octocat/one-renamed'
        assert repositories[0].is_active is True
        assert repositories[1].is_active is False
        completed = await get_onboarding_status(db, user)
        assert completed.next_step == 'dashboard'
        assert completed.onboarding_complete is True
        assert completed.repositories.count == 1

    await engine.dispose()
