"""HTTP authorization regressions: same-team guessed IDs and aggregates."""
import csv
import io
import pytest
import pytest_asyncio
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from test_team_members import env, auth, invitation, PG_URL, PASSWORD
from app.models.repository import Repository
from app.models.repository_member import RepositoryMember
from app.models.review_run import ReviewRun
from app.models.review_finding import ReviewFinding
from app.models.tenant_member import TenantMember
from app.models.team_invitation import TeamInvitation
from app.models.user import User
from app.models.secret_scan import SecretScanRun, SecretFinding, SecretOccurrence
from app.core.repository_access import scope_session
from unittest.mock import AsyncMock

@pytest_asyncio.fixture
async def extra(env):
    async with env.db() as db:
        first = await db.get(Repository, env.resources[0][0])
        repo = Repository(tenant_id=env.team, github_installation_id=first.github_installation_id,
            github_repository_id=99999, owner="hidden", name="private",
            full_name="hidden/private", default_branch="main", private=True, is_active=True)
        db.add(repo)
        await db.flush()
        review = ReviewRun(tenant_id=env.team, repository_id=repo.id, pull_request_number=88,
            commit_sha="b"*40, status="COMPLETED", findings_count=1)
        db.add(review)
        await db.flush()
        finding = ReviewFinding(review_run_id=review.id, filename="hidden.py", line=88,
            severity="critical", category="security", message="Hidden vulnerability")
        db.add(finding)
        await db.flush()
        await db.commit()
        return repo.id, review.id, finding.id

async def assign(env, ids, actor="admin", target="member"):
    return await env.client.put(f"/api/tenants/{env.team}/members/{env.users[target].id}/repositories",
        headers=auth(env, actor), json={"repository_ids": ids})

async def get(env, suffix, actor="member"):
    return await env.client.get(f"/api/tenants/{env.team}"+suffix, headers=auth(env, actor))

@pytest.mark.asyncio
@pytest.mark.parametrize("actor", ["owner", "admin"])
async def test_managers_see_all_own_team_data(env, extra, actor):
    response = await get(env, "/repositories", actor)
    assert {r["id"] for r in response.json()} == {env.resources[0][0], extra[0]}
    dashboard = (await get(env, "/dashboard", actor)).json()
    assert dashboard["repositories_count"] == 2
    assert dashboard["reviews_count"] == 2
    assert dashboard["findings_count"] == 2
    analytics = (await get(env, "/analytics", actor)).json()
    assert analytics["summary"]["findings"] == 2
    assert "hidden/private" in (await get(env, "/findings/export", actor)).text
    for suffix in ["/repositories", "/dashboard", "/analytics", "/findings/export"]:
        denied = await env.client.get(f"/api/tenants/{env.other}"+suffix, headers=auth(env, actor))
        assert denied.status_code == 403

@pytest.mark.asyncio
async def test_member_assigned_lists_aggregates_search_and_exports(env, extra):
    repo, review, finding = env.resources[0]
    assert (await assign(env, [repo])).status_code == 204
    dashboard = await get(env, "/dashboard")
    assert dashboard.status_code == 200, dashboard.text
    data = dashboard.json()
    assert data["repositories_count"] == data["reviews_count"] == data["findings_count"] == data["pull_requests_count"] == 1
    assert data["critical_findings_count"] == 0 and data["github"] is None
    assert {r["id"] for r in data["repositories"]} == {repo}
    assert {r["id"] for r in data["recent_reviews"]} == {review}
    assert {r["id"] for r in (await get(env, "/repositories")).json()} == {repo}
    assert {r["id"] for r in (await get(env, "/reviews")).json()} == {review}
    assert {r["id"] for r in (await get(env, "/findings")).json()} == {finding}
    for suffix in ["/analytics", "/analytics?severity=critical", "/findings?search=hidden",
                   "/findings/export", "/repositories?search=hidden", "/reviews?search=hidden"]:
        response = await get(env, suffix)
        assert response.status_code == 200, response.text
        assert "hidden/private" not in response.text and "Hidden vulnerability" not in response.text
    analytics = (await get(env, "/analytics")).json()
    assert analytics["summary"]["findings"] == analytics["summary"]["reviews"] == 1
    assert sum(point["total"] for point in analytics["trend"]) == 1
    assert analytics["summary"]["critical"] == 0
    assert len(list(csv.reader(io.StringIO((await get(env, "/findings/export")).text)))) == 2
    for suffix in [f"/reviews/{review}", f"/repositories/{repo}/reviews/{review}",
                   f"/findings/{finding}/fix-assistant", f"/findings/{finding}/tracking"]:
        response = await get(env, suffix)
        assert response.status_code == 200, (suffix, response.text)
    status = await env.client.get("/api/onboarding/status", headers=auth(env, "member"))
    assert status.json()["repositories"]["count"] == 1
    assert status.json()["github"]["account_login"] is None

@pytest.mark.asyncio
async def test_guessed_ids_and_explicit_filters_are_denied(env, extra):
    assert (await assign(env, [env.resources[0][0]])).status_code == 204
    for repo, review, finding in [extra, env.resources[1]]:
        for suffix in [f"/repositories/{repo}/reviews", f"/repositories/{repo}/reviews/{review}",
                       f"/reviews/{review}", f"/findings/{finding}/fix-assistant",
                       f"/findings/{finding}/tracking", f"/analytics?repository_id={repo}",
                       f"/findings?repository_id={repo}", f"/findings/export?repository_id={repo}"]:
            response = await get(env, suffix)
            assert response.status_code == 404, (suffix, response.text)
    # Mismatched parent review/repository is also denied.
    assert (await get(env, f"/repositories/{env.resources[0][0]}/reviews/{extra[1]}")).status_code == 404

@pytest.mark.asyncio
async def test_no_grants_never_falls_back_to_team_access(env, extra):
    for suffix in ["/repositories", "/reviews", "/findings"]:
        response = await get(env, suffix)
        assert response.status_code == 200 and response.json() == []
    dashboard = (await get(env, "/dashboard")).json()
    assert all(dashboard[key] == 0 for key in ["repositories_count", "reviews_count", "findings_count", "critical_findings_count", "pull_requests_count"])
    analytics = (await get(env, "/analytics")).json()
    assert analytics["summary"]["findings"] == analytics["summary"]["reviews"] == 0
    assert analytics["repositories"] == [] and sum(p["total"] for p in analytics["trend"]) == 0
    assert len(list(csv.reader(io.StringIO((await get(env, "/findings/export")).text)))) == 1
    assert (await get(env, "/access")).json() == {"role": "MEMBER", "repository_ids": []}

@pytest.mark.asyncio
async def test_unassign_denies_same_jwt_and_refreshes_access_fingerprint(env, extra):
    repo, review, finding = env.resources[0]
    assert (await assign(env, [repo, extra[0]])).status_code == 204
    headers = auth(env, "member")
    path = f"/api/tenants/{env.team}/reviews/{review}"
    assert (await env.client.get(path, headers=headers)).status_code == 200
    assert (await assign(env, [extra[0]])).status_code == 204
    assert (await env.client.get(path, headers=headers)).status_code == 404
    assert (await get(env, f"/findings/{finding}/fix-assistant")).status_code == 404
    response = await get(env, "/access")
    assert response.json()["repository_ids"] == [extra[0]]
    assert response.headers["cache-control"] == "no-store"
    assert (await get(env, "/dashboard")).json()["findings_count"] == 1

@pytest.mark.asyncio
async def test_assignments_validate_roles_team_and_preserve_on_error(env, extra):
    repo = env.resources[0][0]
    assert (await assign(env, [repo])).status_code == 204
    assert (await assign(env, [env.resources[1][0]])).status_code == 422
    assert (await assign(env, [repo], actor="member")).status_code == 403
    assert (await assign(env, [repo], target="outsider")).status_code == 404
    for target in ["owner", "admin"]:
        assert (await assign(env, [repo], target=target)).status_code == 403
    assert (await get(env, "/access")).json()["repository_ids"] == [repo]
    for suffix in ["/members", "/invitations", "/github/installations", "/repositories/available"]:
        assert (await get(env, suffix)).status_code == 403
    # One member can have many repositories; one repository can have many members.
    token, _ = await invitation(env, repository_ids=[repo, extra[0]])
    accepted = await env.client.post("/api/invitations/accept", headers=auth(env, "newcomer"), json={"token":token})
    assert accepted.status_code == 200, accepted.text
    assert (await get(env, "/access", "newcomer")).json()["repository_ids"] == [repo, extra[0]]
    assert (await get(env, "/access")).json()["repository_ids"] == [repo]

@pytest.mark.asyncio
async def test_invite_selection_and_acceptance(env, extra):
    response = await env.client.post(f"/api/tenants/{env.team}/invitations", headers=auth(env,"admin"),
        json={"email":"newcomer@example.com","role":"MEMBER","repository_ids":[env.resources[0][0], extra[0]]})
    assert response.status_code == 201, response.text
    assert response.json()["repository_ids"] == [env.resources[0][0], extra[0]]
    token = env.mail.await_args.args[3]
    accepted = await env.client.post("/api/invitations/accept", headers=auth(env,"newcomer"),json={"token":token})
    assert accepted.status_code == 200
    assert len((await get(env, "/repositories", "newcomer")).json()) == 2

@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", ["foreign", "inactive", "deleted"])
async def test_pending_assignments_revalidated_before_account_creation(env, invalid):
    repo_id = env.resources[1 if invalid=="foreign" else 0][0]
    token, invitation_id = await invitation(env, email="newregistration@example.com", repository_ids=[repo_id])
    async with env.db() as db:
        repo = await db.get(Repository, repo_id)
        if invalid == "inactive": repo.is_active = False
        if invalid == "deleted":
            # The invitation keeps the deleted ID and acceptance must fail.
            await db.delete(repo)
        await db.commit()
    response = await env.client.post("/api/invitations/register", json={"token":token,"name":"New","password":PASSWORD})
    assert response.status_code == 422, response.text
    async with env.db() as db:
        assert await db.scalar(select(User.id).where(User.email=="newregistration@example.com")) is None
        assert (await db.get(TeamInvitation, invitation_id)).accepted_at is None

@pytest.mark.asyncio
async def test_cross_team_invites_and_elevated_assignment_rejected(env):
    for role, repo in [("MEMBER", env.resources[1][0]), ("ADMIN", env.resources[0][0])]:
        response = await env.client.post(f"/api/tenants/{env.team}/invitations",headers=auth(env),
            json={"email":"new@example.com","role":role,"repository_ids":[repo]})
        assert response.status_code == 422
    env.mail.assert_not_awaited()

@pytest.mark.asyncio
async def test_role_changes_do_not_restore_old_grants(env):
    assert (await assign(env,[env.resources[0][0]])).status_code == 204
    for role in ["ADMIN", "MEMBER"]:
        response = await env.client.patch(f"/api/tenants/{env.team}/members/{env.users['member'].id}",
            headers=auth(env), json={"role":role})
        assert response.status_code == 204
    assert (await get(env,"/repositories")).json() == []

@pytest.mark.asyncio
async def test_tracked_finding_cannot_leak_other_repository(env, extra):
    repo, review, finding = env.resources[0]
    assert (await assign(env,[repo])).status_code == 204
    async with env.db() as db:
        source = await db.get(ReviewFinding,finding)
        source.tracked_finding_id = extra[2]
        target = await db.get(ReviewFinding,extra[2])
        target.verification_reason = "Hidden verification"
        await db.commit()
    response = await get(env,f"/reviews/{review}")
    assert response.status_code == 200 and "Hidden verification" not in response.text
    assert response.json()["findings"][0]["tracked_finding_id"] is None
    assert (await get(env,f"/findings/{finding}/tracking")).status_code == 404

@pytest.mark.asyncio
async def test_secret_scanner_inherits_repository_scope(env, extra, monkeypatch):
    from app.api import secret_scans
    remote = AsyncMock()
    monkeypatch.setattr(secret_scans, "_require_remote_access", remote)
    assert (await assign(env,[env.resources[0][0]])).status_code == 204
    async with env.db() as db:
        scan = SecretScanRun(tenant_id=env.team,repository_id=extra[0],requested_by_id=env.users["owner"].id,
            branch="main",scope="CURRENT",status="COMPLETED",stage="Complete",scanner_version="test")
        secret = SecretFinding(tenant_id=env.team,repository_id=extra[0],branch="main",scope="CURRENT",
            fingerprint="x"*64,rule_id="test",secret_type="Token",severity="high",confidence="high",file_path="hidden.txt")
        db.add_all([scan,secret]); await db.flush()
        db.add(SecretOccurrence(run_id=scan.id,finding_id=secret.id,file_path="hidden.txt",line=1,commit_sha="a"*40))
        await db.commit()
        scan_id, secret_id = scan.id, secret.id
    for path in [f"/api/secret-scans/{scan_id}", f"/api/secret-scans/{scan_id}/findings",
                 f"/api/secret-findings/{secret_id}", f"/api/secret-scans/repositories/{extra[0]}/branches"]:
        response = await env.client.get(path,headers=auth(env,"member"))
        assert response.status_code == 404, (path,response.text)
    assert (await env.client.get("/api/secret-scans",headers=auth(env,"member"))).json() == []
    response = await env.client.get("/api/secret-scans/repositories",headers=auth(env,"member"))
    assert {r["id"] for r in response.json()} == {env.resources[0][0]}
    assert remote.await_count == 1

@pytest.mark.asyncio
async def test_orm_aggregates_and_aliases_cannot_skip_scope(env, extra):
    from sqlalchemy.orm import aliased
    assert (await assign(env,[env.resources[0][0]])).status_code == 204
    async with env.db() as db:
        scope_session(db,env.users["member"].id)
        alias = aliased(Repository)
        assert await db.scalar(select(func.count()).select_from(alias)) == 1
        assert await db.scalar(select(func.count()).select_from(ReviewRun)) == 1
        assert await db.scalar(select(func.count()).select_from(ReviewFinding)) == 1

@pytest.mark.asyncio
@pytest.mark.skipif(not PG_URL,reason="PostgreSQL FK enforcement")
async def test_database_rejects_cross_team_grant(env):
    async with env.db() as db:
        member = await db.scalar(select(TenantMember).where(TenantMember.user_id==env.users["member"].id))
        db.add(RepositoryMember(member_id=member.id,tenant_id=env.team,repository_id=env.resources[1][0]))
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()


@pytest.mark.asyncio
async def test_assigned_member_remains_read_only(env):
    repo, _, finding = env.resources[0]
    assert (await assign(env,[repo])).status_code == 204
    for method, suffix, body in [
        ("POST", f"/findings/{finding}/fix-assistant", {}),
        ("POST", f"/findings/{finding}/recheck", {}),
        ("PATCH", f"/findings/{finding}/triage", {"status":"DISMISSED","reason":"test reason"}),
        ("PATCH", f"/findings/{finding}/status", {"status":"dismissed","reason":"test reason"}),
        ("PUT", "/repositories/selection", {"repository_ids":[],"select_all":False}),
    ]:
        response = await env.client.request(method,f"/api/tenants/{env.team}"+suffix,headers=auth(env,"member"),json=body)
        assert response.status_code == 403, (suffix,response.text)

@pytest.mark.asyncio
async def test_repository_selection_preserves_assignments_and_history(env, monkeypatch):
    from app.api.repository import GitHubClient
    repo, review, _ = env.resources[0]
    assert (await assign(env,[repo])).status_code == 204
    async with env.db() as db:
        original = await db.get(Repository,repo)
        payload = {"id": original.github_repository_id,"owner":{"login":original.owner},
                   "name":original.name,"full_name":original.full_name,"private":True,"default_branch":"main"}
    monkeypatch.setattr(GitHubClient,"list_installation_repositories",AsyncMock(return_value=[payload]))
    response = await env.client.put(f"/api/tenants/{env.team}/repositories/selection",
        headers=auth(env),json={"repository_ids":[payload["id"]],"select_all":False})
    assert response.status_code == 200, response.text
    assert response.json()[0]["id"] == repo
    assert (await get(env, f"/reviews/{review}")).status_code == 200

@pytest.mark.asyncio
async def test_chat_cannot_request_repository_context(env):
    response = await env.client.post("/api/chat",headers=auth(env,"member"),
        json={"message":"Show repository findings","repository_id":env.resources[0][0],"tenant_id":env.team})
    assert response.status_code == 422
