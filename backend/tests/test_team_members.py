"""API regression tests. Set TEAM_TEST_DATABASE_URL to a disposable PostgreSQL DB
to also exercise real row locks and concurrent acceptance. Each test owns a schema.
"""
import asyncio
import os
import secrets
import uuid
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "1234567890abcdef1234567890ABCDEF!")
os.environ.setdefault("MAIL_USERNAME", "test@example.com")
os.environ.setdefault("MAIL_PASSWORD", "unused")
os.environ.setdefault("MAIL_FROM", "test@example.com")

from app.main import app
from app.core.auth import create_access_token
from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.models.user import User
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository
from app.models.review_run import ReviewRun
from app.models.review_finding import ReviewFinding
from app.models.team_invitation import TeamInvitation, InvitationSendAttempt
from app.services import team_service as service

PG_URL = os.environ.get("TEAM_TEST_DATABASE_URL")
PASSWORD = "a-valid-password"
PASSWORD_HASH = hash_password(PASSWORD)


@pytest_asyncio.fixture
async def env(monkeypatch):
    schema = "team_test_" + uuid.uuid4().hex
    admin_engine = None
    if PG_URL:
        admin_engine = create_async_engine(PG_URL)
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        engine = create_async_engine(PG_URL, connect_args={"server_settings": {"search_path": schema}})
    else:
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        users = {}
        for name in ["owner", "admin", "member", "outsider", "newcomer"]:
            user = User(full_name=name.title(), email=name+"@example.com", is_verified=True,
                        hashed_password=PASSWORD_HASH)
            db.add(user)
            await db.flush()
            users[name] = user
        a = Tenant(name="Shared team", slug="shared", workspace_type="ORGANIZATION")
        b = Tenant(name="Other team", slug="other", workspace_type="ORGANIZATION")
        db.add_all([a, b])
        await db.flush()
        for name, role in [("owner", "OWNER"), ("admin", "ADMIN"), ("member", "MEMBER")]:
            db.add(TenantMember(tenant_id=a.id, user_id=users[name].id, role=role))
        db.add(TenantMember(tenant_id=b.id, user_id=users["outsider"].id, role="OWNER"))
        resources = []
        for team in [a, b]:
            installation = GitHubInstallation(tenant_id=team.id, installation_id=100+team.id,
                account_login=team.slug, account_type="Organization", is_active=True, last_synced_at=service.now())
            db.add(installation)
            await db.flush()
            repo = Repository(tenant_id=team.id, github_installation_id=installation.id,
                github_repository_id=1000+team.id, owner=team.slug, name="repo",
                full_name=team.slug+"/repo", private=True, default_branch="main", is_active=True)
            db.add(repo)
            await db.flush()
            review = ReviewRun(tenant_id=team.id, repository_id=repo.id, pull_request_number=1,
                               commit_sha="a"*40, status="COMPLETED", findings_count=1)
            db.add(review)
            await db.flush()
            finding = ReviewFinding(review_run_id=review.id, filename="file.py", line=1,
                                    severity="high", category="security", message="Review this")
            db.add(finding)
            await db.flush()
            resources.append((repo.id, review.id, finding.id))
        await db.commit()
    async def override_db():
        async with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = override_db
    mail = AsyncMock()
    monkeypatch.setattr(service, "send_team_invitation_email", mail)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test") as client:
        yield SimpleNamespace(db=sessions, client=client, users=users, team=a.id, other=b.id,
                              resources=resources, mail=mail)
    app.dependency_overrides.clear()
    await engine.dispose()
    if admin_engine:
        async with admin_engine.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin_engine.dispose()


def auth(env, name="owner"):
    user = env.users[name]
    return {"Authorization": "Bearer " + create_access_token({"uid": user.id, "sub": str(user.id)})}


async def invitation(env, email="newcomer@example.com", role="MEMBER", **changes):
    token = secrets.token_urlsafe(32)
    async with env.db() as db:
        item = TeamInvitation(tenant_id=env.team, email=email, role=role, token_hash=service.token_hash(token),
            inviter_user_id=env.users["owner"].id, expires_at=service.now()+timedelta(days=7),
            updated_at=service.now()-timedelta(minutes=2), **changes)
        db.add(item)
        await db.commit()
        return token, item.id


@pytest.mark.asyncio
async def test_new_user_registration_is_bound_verified_and_has_no_personal_team(env):
    token, _ = await invitation(env, "invited@example.com")
    preview = await env.client.post("/api/invitations/preview", json={"token": token})
    assert set(preview.json()) == {"team_name", "role", "expires_at"}
    result = await env.client.post("/api/invitations/register",
        json={"token": token, "name": "Invited", "password": PASSWORD, "email": "attacker@example.com"})
    assert result.status_code == 201, result.text
    assert result.json() == {"tenant_id": env.team}
    assert "kodeistry_session" in result.cookies
    async with env.db() as db:
        user = await db.scalar(select(User).where(User.email == "invited@example.com"))
        assert user.is_verified and user.onboarding_tenant_id == env.team
        assert verify_password(PASSWORD, user.hashed_password)
        assert await db.scalar(select(func.count()).select_from(TenantMember).where(TenantMember.user_id == user.id)) == 1
        assert not await db.scalar(select(Tenant.id).where(Tenant.personal_owner_user_id == user.id))


@pytest.mark.asyncio
async def test_existing_accept_preserves_password_and_uses_shared_installation(env):
    token, _ = await invitation(env)
    old_hash = env.users["newcomer"].hashed_password
    result = await env.client.post("/api/invitations/accept", headers=auth(env, "newcomer"), json={"token": token})
    assert result.status_code == 200
    status = await env.client.get("/api/onboarding/status", headers=auth(env, "newcomer"))
    assert status.json()["next_step"] == "dashboard"
    assert status.json()["workspace"]["id"] == env.team
    assert status.json()["github"]["installation_id"] is None
    assert status.json()["repositories"]["count"] == 0
    async with env.db() as db:
        assert (await db.get(User, env.users["newcomer"].id)).hashed_password == old_hash


@pytest.mark.asyncio
async def test_existing_account_cannot_reset_password_by_registering_invitation(env):
    token, _ = await invitation(env)
    result = await env.client.post("/api/invitations/register", json={"token": token, "name": "Changed", "password": "different-password"})
    assert result.status_code == 409
    async with env.db() as db:
        user = await db.get(User, env.users["newcomer"].id)
        assert user.full_name == "Newcomer"
        assert verify_password(PASSWORD, user.hashed_password)


@pytest.mark.asyncio
async def test_mismatched_and_unverified_users_cannot_accept(env):
    token, item_id = await invitation(env)
    mismatch = await env.client.post("/api/invitations/accept", headers=auth(env, "outsider"), json={"token": token})
    assert mismatch.status_code == 403
    async with env.db() as db:
        user = await db.get(User, env.users["newcomer"].id)
        user.is_verified = False
        await db.commit()
    unverified = await env.client.post("/api/invitations/accept", headers=auth(env, "newcomer"), json={"token": token})
    assert unverified.status_code == 403
    async with env.db() as db:
        assert (await db.get(TeamInvitation, item_id)).accepted_at is None


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["expired", "revoked", "accepted", "invalid"])
async def test_unusable_tokens(env, state):
    token, item_id = await invitation(env)
    async with env.db() as db:
        item = await db.get(TeamInvitation, item_id)
        if state == "expired": item.expires_at = service.now()-timedelta(seconds=1)
        if state == "revoked": item.revoked_at = service.now()
        if state == "accepted": item.accepted_at = service.now()
        await db.commit()
    if state == "invalid": token = secrets.token_urlsafe(32)
    for path in ["preview", "accept"]:
        response = await env.client.post("/api/invitations/"+path, json={"token": token}, headers=auth(env, "newcomer"))
        assert response.status_code == (404 if state == "invalid" else 410)


@pytest.mark.asyncio
async def test_invite_normalization_hashing_duplicate_and_member_rejection(env):
    path = f"/api/tenants/{env.team}/invitations"
    response = await env.client.post(path, headers=auth(env), json={"email": "NEW@Example.com", "role": "ADMIN"})
    assert response.status_code == 201, response.text
    secret = env.mail.await_args.args[3]
    assert secret not in response.text and "token_hash" not in response.text
    async with env.db() as db:
        item = await db.get(TeamInvitation, response.json()["id"])
        assert item.email == "new@example.com" and item.token_hash == service.token_hash(secret)
    assert (await env.client.post(path, headers=auth(env), json={"email": "new@example.com"})).status_code == 409
    assert (await env.client.post(path, headers=auth(env), json={"email": "MEMBER@example.com"})).status_code == 409


@pytest.mark.asyncio
async def test_resend_rotates_and_revoke_invalidates(env):
    old, item_id = await invitation(env)
    response = await env.client.post(f"/api/tenants/{env.team}/invitations/{item_id}/resend", headers=auth(env))
    assert response.status_code == 200, response.text
    new = env.mail.await_args.args[3]
    assert old != new
    assert (await env.client.post("/api/invitations/preview", json={"token": old})).status_code == 404
    assert (await env.client.post("/api/invitations/preview", json={"token": new})).status_code == 200
    assert (await env.client.delete(f"/api/tenants/{env.team}/invitations/{item_id}", headers=auth(env))).status_code == 204
    assert (await env.client.post("/api/invitations/accept", headers=auth(env, "newcomer"), json={"token": new})).status_code == 410


@pytest.mark.asyncio
async def test_delivery_failure_preserves_previous_link_and_records_rate_attempt(env):
    old, item_id = await invitation(env)
    env.mail.side_effect = RuntimeError("SMTP unavailable")
    response = await env.client.post(f"/api/tenants/{env.team}/invitations/{item_id}/resend", headers=auth(env))
    assert response.status_code == 503
    assert (await env.client.post("/api/invitations/preview", json={"token": old})).status_code == 200
    async with env.db() as db:
        assert await db.scalar(select(func.count()).select_from(InvitationSendAttempt)) == 1


@pytest.mark.asyncio
async def test_rate_limits_create_and_resend(env):
    _, item_id = await invitation(env)
    async with env.db() as db:
        db.add_all([InvitationSendAttempt(user_id=env.users["owner"].id, created_at=service.now()) for _ in range(20)])
        await db.commit()
    for path, body in [(f"/api/tenants/{env.team}/invitations", {"email": "new@example.com"}),
                       (f"/api/tenants/{env.team}/invitations/{item_id}/resend", None)]:
        result = await env.client.post(path, headers=auth(env), json=body)
        assert result.status_code == 429
    env.mail.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("actor,role,status", [("owner","OWNER",201),("owner","ADMIN",201),
    ("admin","MEMBER",201),("admin","ADMIN",403),("admin","OWNER",403),("member","MEMBER",403)])
async def test_invitation_permissions(env, actor, role, status):
    result = await env.client.post(f"/api/tenants/{env.team}/invitations",
                                  headers=auth(env, actor), json={"email": "new@example.com", "role": role})
    assert result.status_code == status, result.text


@pytest.mark.asyncio
async def test_role_boundaries_and_last_owner(env):
    base = f"/api/tenants/{env.team}/members/"
    for target in ["owner", "admin"]:
        for method in ["delete", "patch"]:
            response = await env.client.request(method, base+str(env.users[target].id), headers=auth(env, "admin"),
                                                json={"role":"MEMBER"} if method=="patch" else None)
            assert response.status_code == 403
    assert (await env.client.patch(base+str(env.users["member"].id), headers=auth(env, "admin"), json={"role":"ADMIN"})).status_code == 403
    assert (await env.client.patch(base+str(env.users["owner"].id), headers=auth(env), json={"role":"MEMBER"})).status_code == 409
    assert (await env.client.delete(base+str(env.users["owner"].id), headers=auth(env))).status_code == 409
    assert (await env.client.patch(base+str(env.users["member"].id), headers=auth(env), json={"role":"ADMIN"})).status_code == 204


@pytest.mark.asyncio
async def test_live_membership_denies_removed_member_with_same_jwt(env):
    headers = auth(env, "member")
    path = f"/api/tenants/{env.team}/repositories"
    assert (await env.client.get(path, headers=headers)).status_code == 200
    result = await env.client.delete(f"/api/tenants/{env.team}/members/{env.users['member'].id}", headers=auth(env, "admin"))
    assert result.status_code == 204
    assert (await env.client.get(path, headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_cross_team_resources_and_exports_are_denied(env):
    for suffix in ["/dashboard", "/repositories", "/reviews", "/findings", "/findings/export", "/analytics", "/github/installations", "/members", "/invitations"]:
        response = await env.client.get(f"/api/tenants/{env.other}"+suffix, headers=auth(env, "member"))
        assert response.status_code == 403, (suffix, response.text)
    repo, review, finding = env.resources[1]
    for suffix in [f"/reviews/{review}", f"/repositories/{repo}/reviews", f"/findings/{finding}/fix-assistant"]:
        response = await env.client.get(f"/api/tenants/{env.team}"+suffix, headers=auth(env, "member"))
        assert response.status_code == 404, (suffix, response.text)
    assert (await env.client.post(f"/api/tenants/{env.team}/members", headers=auth(env), json={"email":"new@example.com"})).status_code == 405


@pytest.mark.asyncio
async def test_member_cannot_mutate_reviews_repositories_or_github(env):
    _, _, finding = env.resources[0]
    paths = [("POST",f"/findings/{finding}/recheck",{}),
             ("PATCH",f"/findings/{finding}/status",{"status":"dismissed"}),
             ("PUT","/repositories/selection",{"repository_ids":[],"select_all":False}),
             ("POST","/github/installations/sync",{})]
    for method, suffix, body in paths:
        response = await env.client.request(method, f"/api/tenants/{env.team}"+suffix, headers=auth(env,"member"), json=body)
        assert response.status_code == 403, (suffix, response.text)
    response = await env.client.get(f"/api/tenants/{env.team}/github/installations/url", headers=auth(env,"admin"))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_routing_zero_one_multiple_and_stale_selection(env):
    # No membership: existing owner onboarding creates exactly one personal workspace.
    result = await env.client.get("/api/onboarding/status", headers=auth(env,"newcomer"))
    assert result.json()["next_step"] == "github_install"
    result = await env.client.get("/api/onboarding/status", headers=auth(env,"member"))
    assert result.json()["workspace"]["id"] == env.team
    async with env.db() as db:
        db.add(TenantMember(tenant_id=env.other, user_id=env.users["member"].id, role="MEMBER"))
        user = await db.get(User, env.users["member"].id)
        user.onboarding_tenant_id = env.other
        await db.commit()
    result = await env.client.get("/api/onboarding/status", headers=auth(env,"member"))
    assert result.json()["workspace"]["id"] == env.other
    async with env.db() as db:
        member = await db.scalar(select(TenantMember).where(TenantMember.tenant_id==env.other, TenantMember.user_id==env.users["member"].id))
        await db.delete(member); await db.commit()
    result = await env.client.get("/api/onboarding/status", headers=auth(env,"member"))
    assert result.json()["workspace"]["id"] == env.team
    selection = await env.client.post("/api/onboarding/workspace", headers=auth(env,"member"), json={"tenant_id":env.other})
    assert selection.status_code == 403


@pytest.mark.asyncio
async def test_reuse_after_success_is_denied(env):
    token, _ = await invitation(env)
    first = await env.client.post("/api/invitations/accept", headers=auth(env,"newcomer"), json={"token":token})
    second = await env.client.post("/api/invitations/accept", headers=auth(env,"newcomer"), json={"token":token})
    assert first.status_code == 200 and second.status_code == 410


@pytest.mark.asyncio
@pytest.mark.skipif(not PG_URL, reason="Real PostgreSQL row locks required")
@pytest.mark.parametrize("register", [False, True])
async def test_concurrent_acceptance_creates_one_membership(env, register):
    token, _ = await invitation(env, "concurrent@example.com" if register else "newcomer@example.com")
    path = "/api/invitations/register" if register else "/api/invitations/accept"
    body = {"token":token, "name":"Concurrent", "password":PASSWORD} if register else {"token":token}
    headers = {} if register else auth(env,"newcomer")
    results = await asyncio.gather(*[env.client.post(path, headers=headers, json=body) for _ in range(2)])
    assert sorted(r.status_code for r in results) == [201 if register else 200, 410]
    async with env.db() as db:
        count = await db.scalar(select(func.count()).select_from(TenantMember).where(TenantMember.tenant_id==env.team))
        assert count == 4


@pytest.mark.asyncio
@pytest.mark.skipif(not PG_URL, reason="Real PostgreSQL row locks required")
async def test_concurrent_owner_demotions_leave_one_owner(env):
    async with env.db() as db:
        member = await db.scalar(select(TenantMember).where(TenantMember.tenant_id==env.team, TenantMember.user_id==env.users["admin"].id))
        member.role = "OWNER"; await db.commit()
    results = await asyncio.gather(*[
        env.client.patch(f"/api/tenants/{env.team}/members/{env.users[name].id}", headers=auth(env,name), json={"role":"MEMBER"})
        for name in ["owner","admin"]])
    assert sorted(r.status_code for r in results) == [204,409]


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [0, 1, 2])
async def test_email_login_routes_by_memberships(env, count):
    async with env.db() as db:
        user = await db.get(User, env.users["newcomer"].id)
        for team_id in [env.team, env.other][:count]:
            db.add(TenantMember(tenant_id=team_id, user_id=user.id, role="MEMBER"))
        user.onboarding_tenant_id = env.other if count == 2 else None
        await db.commit()
    login = await env.client.post("/api/auth/login", json={"email":"NEWCOMER@example.com", "password":PASSWORD})
    assert login.status_code == 200
    status = await env.client.get("/api/onboarding/status")
    assert status.status_code == 200
    assert status.json()["next_step"] == ("github_install" if count == 0 else "dashboard")
    if count: assert status.json()["workspace"]["id"] == (env.other if count == 2 else env.team)


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [0, 1, 2])
async def test_github_login_routes_by_memberships(env, monkeypatch, count):
    from app.api import auth as auth_api
    from app.core.config import settings
    from jose import jwt
    from urllib.parse import urlsplit

    async with env.db() as db:
        user = await db.get(User, env.users["newcomer"].id)
        for team_id in [env.team, env.other][:count]:
            db.add(TenantMember(tenant_id=team_id, user_id=user.id, role="MEMBER"))
        user.onboarding_tenant_id = env.other if count == 2 else None
        await db.commit()
    monkeypatch.setattr(auth_api, "_github_identity", AsyncMock(return_value=({"id":9999,"login":"newcomer"}, "newcomer@example.com")))
    state = jwt.encode({"purpose":"github_oauth", "exp":service.now()+timedelta(minutes=5)}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    env.client.cookies.set(settings.OAUTH_STATE_COOKIE_NAME, state)
    result = await env.client.get("/api/auth/github/callback", params={"code":"fake-code","state":state})
    assert result.status_code == 302, result.text
    assert urlsplit(result.headers["location"]).path == ("/onboarding/github" if count == 0 else "/dashboard")
    async with env.db() as db:
        user = await db.get(User, env.users["newcomer"].id)
        if count:
            assert user.onboarding_tenant_id == (env.other if count == 2 else env.team)
            assert not await db.scalar(select(Tenant.id).where(Tenant.personal_owner_user_id==user.id))


@pytest.mark.asyncio
async def test_oauth_invitation_context_is_allowlisted_and_skips_owner_creation(env, monkeypatch):
    from app.api import auth as auth_api
    from app.core.config import settings
    from jose import jwt
    from urllib.parse import parse_qs, urlsplit

    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "fake-id")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "fake-key")
    for destination in ["/invite", "https://attacker.example", "//attacker.example"]:
        start = await env.client.get("/api/auth/github", params={"return_to": destination})
        state = parse_qs(urlsplit(start.headers["location"]).query)["state"][0]
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["return_to"] == ("/invite" if destination == "/invite" else None)
    monkeypatch.setattr(auth_api, "_github_identity", AsyncMock(return_value=({"id":9999,"login":"newcomer"}, "newcomer@example.com")))
    state = jwt.encode({"purpose":"github_oauth","return_to":"/invite","exp":service.now()+timedelta(minutes=5)},
                       settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    env.client.cookies.set(settings.OAUTH_STATE_COOKIE_NAME, state, path="/api/auth/github")
    result = await env.client.get("/api/auth/github/callback", params={"code":"fake","state":state})
    assert urlsplit(result.headers["location"]).path == "/invite"
    async with env.db() as db:
        assert not await db.scalar(select(Tenant.id).where(Tenant.personal_owner_user_id==env.users["newcomer"].id))


@pytest.mark.asyncio
async def test_bad_invitation_input_never_echoes_secrets(env):
    response = await env.client.post("/api/invitations/register",
        json={"token":"invalid-secret-token", "name":"Test","password":"short-secret"})
    assert response.status_code == 422
    assert "invalid-secret-token" not in response.text
    assert "short-secret" not in response.text


@pytest.mark.asyncio
async def test_invitation_email_requires_configuration_and_trusted_origin(monkeypatch):
    from app.services.email import send_team_invitation_email
    from app.core.config import settings
    monkeypatch.setattr(settings, "MAIL_USERNAME", "")
    with pytest.raises(RuntimeError, match="not configured"):
        await send_team_invitation_email("user@example.com", "Team", "MEMBER", "token")
    monkeypatch.setattr(settings, "MAIL_USERNAME", "configured")
    monkeypatch.setattr(settings, "FRONTEND_URL", "https://trusted.example@attacker.example/path")
    with pytest.raises(RuntimeError, match="trusted"):
        await send_team_invitation_email("user@example.com", "Team", "MEMBER", "token")


@pytest.mark.asyncio
@pytest.mark.skipif(not PG_URL, reason="Real PostgreSQL row locks required")
async def test_concurrent_duplicate_invites_send_once(env):
    responses = await asyncio.gather(*[
        env.client.post(f"/api/tenants/{env.team}/invitations", headers=auth(env), json={"email":"same@example.com"})
        for _ in range(2)])
    assert sorted(response.status_code for response in responses) == [201,409]
    env.mail.assert_awaited_once()


@pytest.mark.asyncio
async def test_cookie_invitation_acceptance_requires_csrf(env):
    token, _ = await invitation(env)
    login = await env.client.post("/api/auth/login", json={"email":"newcomer@example.com", "password":PASSWORD})
    assert login.status_code == 200
    rejected = await env.client.post("/api/invitations/accept", json={"token":token})
    assert rejected.status_code == 403
    csrf = await env.client.get("/api/auth/csrf")
    accepted = await env.client.post("/api/invitations/accept", json={"token":token},
                                    headers={"X-CSRF-Token":csrf.json()["csrf_token"]})
    assert accepted.status_code == 200
