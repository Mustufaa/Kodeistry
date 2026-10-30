"""Collaboration integration tests use the existing isolated team fixture.
TEAM_TEST_DATABASE_URL enables PostgreSQL coverage without touching production.
"""
import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from datetime import timedelta

import pytest
from sqlalchemy import delete, func, select
from fastapi import HTTPException
from test_team_members import env, auth, PG_URL
from app.main import app
from app.models.collaboration import ChatMessage, Notification, CollaborationTicket
from app.models.repository_member import RepositoryMember
from app.models.tenant_member import TenantMember
from app.models.review_run import ReviewRun
from app.models.review_finding import ReviewFinding
from app.api import collaboration as api
from app.services.collaboration import now, safe_href


def path(env, suffix=""):
    return f"/api/tenants/{env.team}/collaboration{suffix}"


async def channel(env, actor="owner", **body):
    result = await env.client.post(path(env, "/channels"), headers=auth(env, actor), json=body or {"name": "general"})
    assert result.status_code == 200, result.text
    return result.json()["id"]


async def send(env, cid, actor="owner", **body):
    return await env.client.post(path(env, f"/channels/{cid}/messages"), headers=auth(env, actor),
        json={"client_id": str(uuid.uuid4()), "body": "A real persisted message", **body})


@pytest.mark.asyncio
async def test_persistence_history_search_pagination_and_dedup(env):
    cid = await channel(env)
    client_id = str(uuid.uuid4())
    first = await send(env, cid, client_id=client_id, body="<script>alert(1)</script>")
    assert first.status_code == 200, first.text
    retry = await send(env, cid, client_id=client_id, body="retry")
    assert retry.json()["id"] == first.json()["id"]
    second = await send(env, cid, body="second")
    async with env.db() as db:
        assert await db.scalar(select(func.count()).select_from(ChatMessage)) == 2
    history = await env.client.get(path(env, f"/channels/{cid}/messages?limit=1"), headers=auth(env, "member"))
    assert history.json()["items"][0]["id"] == second.json()["id"]
    earlier = await env.client.get(path(env, f"/channels/{cid}/messages?before={history.json()['next_cursor']}"), headers=auth(env, "member"))
    assert earlier.json()["items"][0]["body"] == "<script>alert(1)</script>"
    search = await env.client.get(path(env, f"/channels/{cid}/messages?q=script"), headers=auth(env))
    assert len(search.json()["items"]) == 1


@pytest.mark.asyncio
async def test_direct_messages_notification_and_read_receipts(env):
    cid = await channel(env, recipient_id=env.users["member"].id)
    result = await send(env, cid)
    assert result.status_code == 200, result.text
    mid = result.json()["id"]
    channels = await env.client.get(path(env, "/channels"), headers=auth(env, "member"))
    assert channels.json()[0]["unread"] == 1
    assert channels.json()[0]["name"] == "Owner"
    notices = await env.client.get(path(env, "/notifications"), headers=auth(env, "member"))
    assert notices.json()["items"][0]["event_type"] == "direct_message"
    assert "A real persisted message" not in notices.text
    assert (await env.client.post(path(env, f"/channels/{cid}/read"), headers=auth(env, "member"), json={"message_id": mid})).status_code == 204
    async with env.db() as db:
        state = await api.live_snapshot(db, env.team, env.users["owner"], cid)
        assert any(p["user_id"] == env.users["member"].id and p["read_id"] == mid for p in state["participants"])
    assert (await env.client.get(path(env, f"/channels/{cid}/messages"), headers=auth(env, "admin"))).status_code == 404


@pytest.mark.asyncio
async def test_reply_edit_delete_and_ownership(env):
    cid = await channel(env)
    message = (await send(env, cid)).json()
    reply = await send(env, cid, actor="member", reply_to_id=message["id"])
    assert reply.status_code == 200
    endpoint = path(env, f"/channels/{cid}/messages/{message['id']}")
    assert (await env.client.patch(endpoint, headers=auth(env, "member"), json={"body": "attack"})).status_code == 404
    assert (await env.client.patch(endpoint, headers=auth(env), json={"body": "edited"})).json()["body"] == "edited"
    assert (await env.client.delete(endpoint, headers=auth(env))).status_code == 204
    history = (await env.client.get(path(env, f"/channels/{cid}/messages"), headers=auth(env))).json()
    deleted = next(m for m in history["items"] if m["id"] == message["id"])
    assert deleted["body"] == "" and deleted["deleted_at"]
    another = await channel(env, name="other")
    assert (await send(env, another, reply_to_id=message["id"])).status_code == 422


@pytest.mark.asyncio
async def test_repository_access_and_assignment_revocation(env):
    cid = await channel(env, repository_id=env.resources[0][0])
    assert (await env.client.get(path(env, f"/channels/{cid}/messages"), headers=auth(env, "member"))).status_code == 404
    assignment = f"/api/tenants/{env.team}/members/{env.users['member'].id}/repositories"
    assert (await env.client.put(assignment, headers=auth(env), json={"repository_ids": [env.resources[0][0]]})).status_code == 204
    assert (await send(env, cid, actor="member")).status_code == 200
    assert (await env.client.put(assignment, headers=auth(env), json={"repository_ids": []})).status_code == 204
    assert (await send(env, cid, actor="member")).status_code == 404
    async with env.db() as db:
        state = await api.live_snapshot(db, env.team, env.users["member"])
        assert cid not in [c["id"] for c in state["channels"]]
    notices = (await env.client.get(path(env, "/notifications"), headers=auth(env, "member"))).json()["items"]
    assert any(n["event_type"] == "repository_assignment_changed" for n in notices)


@pytest.mark.asyncio
async def test_cross_team_membership_and_role_revocation(env):
    cid = await channel(env)
    assert (await send(env, cid, actor="outsider")).status_code == 403
    assert (await env.client.post(path(env, "/channels"), headers=auth(env, "member"), json={"name": "private"})).status_code == 403
    assert (await env.client.delete(f"/api/tenants/{env.team}/members/{env.users['member'].id}", headers=auth(env))).status_code == 204
    assert (await send(env, cid, actor="member")).status_code == 403
    assert (await env.client.get(path(env, "/notifications"), headers=auth(env, "member"))).status_code == 403
    assert (await env.client.patch(f"/api/tenants/{env.team}/members/{env.users['admin'].id}", headers=auth(env), json={"role": "MEMBER"})).status_code == 204
    admin_inbox = (await env.client.get(path(env, "/notifications"), headers=auth(env, "admin"))).json()["items"]
    assert all(n["event_type"] not in {"member_removed", "member_role_changed"} for n in admin_inbox)
    assert any(n["event_type"] == "role_changed" for n in admin_inbox)


@pytest.mark.asyncio
async def test_review_events_persist_deduplicate_and_hide_previews(env):
    repo = env.resources[0][0]
    async with env.db() as db:
        for _ in range(2):  # A retried failed webhook creates a new run for the same commit.
            run = ReviewRun(tenant_id=env.team, repository_id=repo, pull_request_number=90, commit_sha="b"*40, status="RUNNING", findings_count=0)
            db.add(run)
            await db.flush()
            db.add_all([ReviewFinding(review_run_id=run.id, filename="private.py", line=1, severity="critical", category="security", message="DO NOT LEAK SECRET") for _ in range(3)])
            await db.flush()
            run.status = "COMPLETED"
            await db.commit()
    inbox = (await env.client.get(path(env, "/notifications"), headers=auth(env))).json()["items"]
    events = [n["event_type"] for n in inbox if "PR #90" in n["message"]]
    assert sorted(events) == ["finding_critical", "review_completed", "review_started"]
    assert "DO NOT LEAK" not in json.dumps(inbox) and "private.py" not in json.dumps(inbox)
    member = (await env.client.get(path(env, "/notifications"), headers=auth(env, "member"))).json()["items"]
    assert not any("PR #90" in n["message"] for n in member)


@pytest.mark.asyncio
async def test_rollback_does_not_emit_and_failed_reviews_notify(env):
    async with env.db() as db:
        run = ReviewRun(tenant_id=env.team, repository_id=env.resources[0][0], pull_request_number=91, commit_sha="c"*40, status="RUNNING", findings_count=0)
        db.add(run)
        await db.flush()
        await db.rollback()
    async with env.db() as db:
        assert not await db.scalar(select(Notification.id).where(Notification.message.contains("PR #91")))
        run = ReviewRun(tenant_id=env.team, repository_id=env.resources[0][0], pull_request_number=92, commit_sha="d"*40, status="FAILED", findings_count=0)
        db.add(run)
        await db.commit()
    inbox = (await env.client.get(path(env, "/notifications"), headers=auth(env))).json()["items"]
    assert any(n["event_type"] == "review_failed" and "PR #92" in n["message"] for n in inbox)


@pytest.mark.asyncio
async def test_unread_single_and_all_mark_read(env):
    inbox = (await env.client.get(path(env, "/notifications"), headers=auth(env))).json()["items"]
    assert inbox
    before = (await env.client.get(path(env, "/notifications/unread-count"), headers=auth(env))).json()["count"]
    assert (await env.client.post(path(env, f"/notifications/{inbox[0]['id']}/read"), headers=auth(env))).status_code == 204
    assert (await env.client.get(path(env, "/notifications/unread-count"), headers=auth(env))).json()["count"] == before-1
    assert (await env.client.post(path(env, f"/notifications/{inbox[0]['id']}/read"), headers=auth(env, "member"))).status_code == 404
    assert (await env.client.post(path(env, "/notifications/read-all"), headers=auth(env))).status_code == 204
    assert (await env.client.get(path(env, "/notifications?unread=true"), headers=auth(env))).json()["items"] == []


@pytest.mark.asyncio
async def test_mentions_validate_authorization_and_never_preview_body(env):
    cid = await channel(env)
    result = await send(env, cid, mentions=[env.users["member"].id])
    assert result.status_code == 200
    assert (await send(env, cid, mentions=[env.users["outsider"].id])).status_code == 422
    inbox = (await env.client.get(path(env, "/notifications"), headers=auth(env, "member"))).json()["items"]
    assert inbox[0]["event_type"] == "chat_mention"
    assert "persisted message" not in inbox[0]["message"]


@pytest.mark.asyncio
async def test_payload_validation_and_rate_limit(env):
    cid = await channel(env)
    assert (await send(env, cid, body=" ")).status_code == 422
    assert (await send(env, cid, body="x"*4001)).status_code == 422
    assert (await send(env, cid, body="x"*25000)).status_code == 413
    for i in range(30):
        result = await send(env, cid, body=str(i))
        assert result.status_code == 200, result.text
    assert (await send(env, cid)).status_code == 429


@pytest.mark.asyncio
async def test_connection_ticket_single_use_expiry_and_tenant_binding(env):
    response = await env.client.post(path(env, "/ticket"), headers=auth(env))
    token = response.json()["ticket"]
    async with env.db() as db:
        with pytest.raises(HTTPException):
            await api.consume_ticket(db, env.other, token)
        assert await api.consume_ticket(db, env.team, token) == env.users["owner"].id
        with pytest.raises(HTTPException):
            await api.consume_ticket(db, env.team, token)
    token = (await env.client.post(path(env, "/ticket"), headers=auth(env))).json()["ticket"]
    async with env.db() as db:
        ticket = await db.scalar(select(CollaborationTicket))
        ticket.expires_at = now() - timedelta(seconds=1)
        await db.commit()
        with pytest.raises(HTTPException):
            await api.consume_ticket(db, env.team, token)


class Socket:
    def __init__(self, incoming, outgoing):
        self.incoming, self.outgoing = incoming, outgoing

    async def send(self, data):
        await self.incoming.put({"type": "websocket.receive", "text": json.dumps(data)})

    async def event(self):
        while True:
            value = await asyncio.wait_for(self.outgoing.get(), 8)
            if value["type"] == "websocket.close":
                return value
            if value["type"] == "websocket.send":
                data = json.loads(value["text"])
                if data["type"] == "ping":
                    await self.send({"type": "pong"})
                    continue
                return data


@asynccontextmanager
async def connect(env, monkeypatch, actor="member", origin="http://localhost:3000"):
    monkeypatch.setattr(api, "AsyncSessionLocal", env.db)
    token = (await env.client.post(path(env, "/ticket"), headers=auth(env, actor))).json()["ticket"]
    incoming, outgoing = asyncio.Queue(), asyncio.Queue()
    scope = {"type": "websocket", "asgi": {"version": "3.0"}, "scheme": "ws",
        "path": path(env, "/ws"), "raw_path": path(env, "/ws").encode(), "query_string": b"",
        "headers": [(b"origin", origin.encode())], "client": ("127.0.0.1", 123), "server": ("test", 80),
        "subprotocols": [], "root_path": "", "state": {}}
    task = asyncio.create_task(app(scope, incoming.get, outgoing.put))
    await incoming.put({"type": "websocket.connect"})
    first = await asyncio.wait_for(outgoing.get(), 5)
    socket = Socket(incoming, outgoing)
    try:
        if first["type"] == "websocket.accept":
            await socket.send({"ticket": token})
        else:
            await outgoing.put(first)
        yield socket
    finally:
        await incoming.put({"type": "websocket.disconnect", "code": 1000})
        await asyncio.wait_for(task, 8)


@pytest.mark.asyncio
async def test_websocket_delivery_offline_reconnect_presence_and_revocation(env, monkeypatch):
    cid = await channel(env, recipient_id=env.users["member"].id)
    async with connect(env, monkeypatch) as ws:
        initial = await ws.event()
        assert initial["type"] == "sync"
        await ws.send({"type": "subscribe", "channel_id": cid})
        sent = await send(env, cid)
        for _ in range(4):
            event = await ws.event()
            if event.get("unread", 0) > 0:
                break
        assert event["unread"] == 1
        assert event["channels"][0]["unread"] == 1
        await ws.send({"type": "typing", "channel_id": cid})
        for _ in range(4):
            event = await ws.event()
            if any(p["typing"] for p in event["participants"]):
                break
        assert any(p["online"] and p["typing"] for p in event["participants"])
    # Send while offline, then reconnect from a different socket with no memory cursor.
    await send(env, cid)
    async with connect(env, monkeypatch) as ws:
        snapshot = await ws.event()
        assert snapshot["channels"][0]["unread"] == 2
        history = await env.client.get(path(env, f"/channels/{cid}/messages"), headers=auth(env, "member"))
        assert len(history.json()["items"]) == 2
        removed = await env.client.delete(f"/api/tenants/{env.team}/members/{env.users['member'].id}", headers=auth(env))
        assert removed.status_code == 204
        closed = await ws.event()
        assert closed["type"] == "websocket.close" and closed["code"] == 4403


@pytest.mark.asyncio
async def test_websocket_rejects_untrusted_origin(env, monkeypatch):
    async with connect(env, monkeypatch, origin="https://attacker.invalid") as ws:
        assert (await ws.event())["code"] == 4403


@pytest.mark.parametrize("href", ["https://evil.invalid", "//evil.invalid", "/\\evil", "/dashboard?next=https://evil", "/reviews/1#<script>"])
def test_unsafe_links_rejected(href):
    assert not safe_href(href)


@pytest.mark.asyncio
async def test_completed_secret_scan_emits_safe_severity_summary(env):
    from app.models.secret_scan import SecretScanRun, SecretFinding, SecretOccurrence
    async with env.db() as db:
        run = SecretScanRun(tenant_id=env.team, repository_id=env.resources[0][0], requested_by_id=env.users["owner"].id,
            branch="main", scope="snapshot", status="RUNNING", scanner_version="test")
        db.add(run)
        await db.flush()
        finding = SecretFinding(tenant_id=env.team, repository_id=env.resources[0][0], branch="main", scope="snapshot",
            fingerprint="f"*64, rule_id="test", secret_type="Token", severity="critical", confidence="high", file_path="private.txt")
        db.add(finding)
        await db.flush()
        db.add(SecretOccurrence(run_id=run.id, finding_id=finding.id, file_path="private.txt", line=1, commit_sha="f"*40))
        await db.flush()
        run.status = "COMPLETED"
        await db.commit()
    inbox = (await env.client.get(path(env, "/notifications"), headers=auth(env))).json()["items"]
    scan_notices = [n for n in inbox if "secret finding" in n["title"]]
    assert len(scan_notices) == 1
    assert "private.txt" not in json.dumps(scan_notices)


@pytest.mark.asyncio
@pytest.mark.skipif(not PG_URL, reason="PostgreSQL row locks required")
async def test_concurrent_sends_are_idempotent(env):
    cid = await channel(env)
    stable_id = str(uuid.uuid4())
    results = await asyncio.gather(*[send(env, cid, client_id=stable_id) for _ in range(2)])
    assert all(result.status_code == 200 for result in results)
    assert results[0].json()["id"] == results[1].json()["id"]


@pytest.mark.asyncio
@pytest.mark.skipif(not PG_URL, reason="GitHub pipeline uses PostgreSQL advisory locks")
async def test_signed_github_webhook_retry_creates_one_notification(env, monkeypatch):
    import hashlib
    import hmac
    from unittest.mock import AsyncMock
    from app.api import github
    from app.core.config import settings
    from app.schemas.review import ReviewResult
    monkeypatch.setattr(settings, "GITHUB_WEBHOOK_SECRET", "integration-fixture")
    monkeypatch.setattr(github.GitHubClient, "get_pull_request_commit_sha", AsyncMock(return_value="e"*40))
    monkeypatch.setattr(github.GitHubClient, "get_pull_request_files", AsyncMock(return_value=[]))
    monkeypatch.setattr(github, "review_changed_files", AsyncMock(return_value=ReviewResult(findings=[])))
    monkeypatch.setattr(github, "post_review_to_github", AsyncMock(return_value={"posted": False}))
    body = json.dumps({"action": "opened", "number": 99, "installation": {"id": 100+env.team},
        "repository": {"id": 1000+env.team, "name": "repo", "owner": {"login": "shared"}}}).encode()
    signature = "sha256=" + hmac.new(b"integration-fixture", body, hashlib.sha256).hexdigest()
    for _ in range(2):
        response = await env.client.post("/api/github/webhook", content=body,
            headers={"X-GitHub-Event": "pull_request", "X-Hub-Signature-256": signature, "Content-Type": "application/json"})
        assert response.status_code == 200, response.text
    inbox = (await env.client.get(path(env, "/notifications"), headers=auth(env))).json()["items"]
    assert len([n for n in inbox if n["event_type"] == "review_completed" and "PR #99" in n["message"]]) == 1
