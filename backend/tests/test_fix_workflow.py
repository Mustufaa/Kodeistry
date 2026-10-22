import os
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET_KEY", "1234567890abcdef1234567890ABCDEF!")
os.environ.setdefault("MAIL_USERNAME", "test@example.com")
os.environ.setdefault("MAIL_PASSWORD", "unused")
os.environ.setdefault("MAIL_FROM", "test@example.com")

from app.api.fix_workflow import authorized
from app.services import fix_workflow as service
from app.services.fix_queue import attach_observations, enqueue, set_head_and_enqueue
from app.services.fix_worker import apply_verification_state, result_applies


def test_fingerprint_normalizes_text_but_preserves_file_identity():
    first = service.fingerprint("bug", "  Invalid   INPUT ", "src/a.py")
    assert first == service.fingerprint("BUG", "invalid input", "src/a.py")
    assert first != service.fingerprint("bug", "invalid input", "src/b.py")


def test_line_shift_and_changed_line_are_located():
    old = "def handler():\n    validate_input(value)\n    unsafe_call(value)\n    return result"
    shifted = "# added\n" + old
    changed = "# added\ndef handler():\n    validate_input(value)\n    safe_call(value)\n    return result"
    assert service.locate(old, shifted, 3) == 4
    assert service.locate(old, changed, 3) == 4


def test_ambiguous_location_and_rename_do_not_imply_resolution():
    old = "def handler():\n    unsafe_call(value)\n    return result"
    current = old + "\n" + old
    assert service.locate(old, current, 2) is None
    assert service.resolve_rename("src/old.py", [{"status": "renamed", "previous_filename": "src/old.py", "filename": "src/new.py"}]) == "src/new.py"
    assert service.resolve_rename("src/old.py", [
        {"status": "renamed", "previous_filename": "src/old.py", "filename": "src/a.py"},
        {"status": "renamed", "previous_filename": "src/old.py", "filename": "src/b.py"},
    ]) is None


def test_old_result_cannot_overwrite_new_head_and_resolved_issue_can_reopen():
    first, second = "a" * 40, "b" * 40
    assert result_applies(first, first, first)
    assert not result_applies(second, second, first)
    assert not result_applies(first, second, first)
    finding = SimpleNamespace(triage_status="ACTIVE")
    checked = datetime.now(timezone.utc)
    apply_verification_state(finding, "RESOLVED", first, checked, "Evidence of correction")
    assert finding.status == "resolved"
    apply_verification_state(finding, "STILL_PRESENT", second, checked, "Issue returned")
    assert finding.status == "open" and finding.resolved_at is None


def test_dismissal_never_counts_as_verified_fix():
    finding = SimpleNamespace(triage_status="DISMISSED")
    apply_verification_state(finding, "RESOLVED", "a" * 40, datetime.now(timezone.utc), "Code changed")
    assert finding.verification_status == "RESOLVED"
    assert finding.status == "dismissed" and finding.resolved_at is None


@pytest.mark.asyncio
async def test_cross_tenant_finding_is_hidden():
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(one_or_none=lambda: None)))
    with pytest.raises(HTTPException) as error:
        await authorized(db, tenant_id=2, finding_id=5, user_id=9)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_duplicate_job_insert_is_noop():
    db = SimpleNamespace(execute=AsyncMock(side_effect=[
        SimpleNamespace(rowcount=1), SimpleNamespace(rowcount=0),
    ]))
    assert await enqueue(db, 7, "a" * 40, "RECHECK")
    assert not await enqueue(db, 7, "a" * 40, "RECHECK")


@pytest.mark.asyncio
async def test_missing_source_cannot_generate_patch(monkeypatch):
    monkeypatch.setattr(service, "source_file", AsyncMock(side_effect=service.SourceUnavailable()))
    finding = SimpleNamespace(filename="src/a.py", line=3, message="unsafe", severity="high", category="bug")
    review = SimpleNamespace(commit_sha="a" * 40, pull_request_number=1)
    repo = SimpleNamespace(owner="org", name="repo", full_name="org/repo")
    with pytest.raises(service.SourceUnavailable):
        await service.suggest(finding, review, repo, 1)


def test_structured_suggestion_requires_complete_fields_and_redacts_secrets():
    with pytest.raises(ValidationError):
        service.FixSuggestionResult.model_validate({"explanation": "issue"})
    assert "topsecret" not in service.redact("password=topsecret")
    assert "AKIA" not in service.redact("AKIA1234567890ABCDEF")


@pytest.mark.asyncio
async def test_provider_failure_and_missing_context_need_review(monkeypatch):
    finding = SimpleNamespace(filename="src/a.py", line=2, message="unsafe call", category="bug")
    review = SimpleNamespace(commit_sha="a" * 40)
    repo = SimpleNamespace(owner="org", name="repo")
    source = "def handler():\n    unsafe_call(value)\n    return result"
    monkeypatch.setattr(service, "source_file", AsyncMock(return_value=source))
    monkeypatch.setattr(service, "structured_ai", AsyncMock(side_effect=RuntimeError("PROVIDER_UNAVAILABLE")))
    status, reason, _ = await service.verify(finding, review, repo, 1, "b" * 40, "src/a.py")
    assert status == "NEEDS_REVIEW" and "provider" in reason.lower()
    monkeypatch.setattr(service, "source_file", AsyncMock(side_effect=service.SourceUnavailable()))
    status, _, _ = await service.verify(finding, review, repo, 1, "b" * 40, "src/a.py")
    assert status == "NEEDS_REVIEW"


def test_diff_requires_original_source_lines():
    source = "def handler():\n    unsafe_call(value)\n    return result"
    good = "--- a/src/a.py\n+++ b/src/a.py\n@@ -1,3 +1,3 @@\n def handler():\n-    unsafe_call(value)\n+    safe_call(value)\n     return result"
    invented = good.replace("unsafe_call(value)", "never_existed(value)")
    assert service.grounded_diff(good, "src/a.py", source)
    assert not service.grounded_diff(invented, "src/a.py", source)


@pytest.mark.asyncio
async def test_duplicate_webhook_queue_does_not_regress_completed_status(monkeypatch):
    finding = SimpleNamespace(id=1, verification_status="RESOLVED", status="resolved", resolved_at=datetime.now(timezone.utc))
    review = SimpleNamespace(commit_sha="a" * 40)
    db = SimpleNamespace(execute=AsyncMock(side_effect=[
        SimpleNamespace(), SimpleNamespace(all=lambda: [(finding, review)]),
    ]))
    monkeypatch.setattr("app.services.fix_queue.enqueue", AsyncMock(return_value=False))
    await set_head_and_enqueue(db, 3, 7, "b" * 40)
    assert finding.verification_status == "RESOLVED"
    assert finding.status == "resolved"


@pytest.mark.asyncio
async def test_unique_observation_links_and_ambiguous_match_stays_separate(monkeypatch):
    old = SimpleNamespace(id=1, category="bug", message="Unsafe call", filename="src/a.py", line=10, verification_status="RESOLVED")
    other = SimpleNamespace(id=2, category="bug", message="Unsafe call", filename="src/a.py", line=10, verification_status="OPEN")
    fresh = SimpleNamespace(category="bug", message=" unsafe  call ", filename="src/a.py", line=10, tracked_finding_id=None)
    review = SimpleNamespace(id=9, repository_id=3, pull_request_number=7, commit_sha="b" * 40)
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [(old, None)])))
    queued = AsyncMock(return_value=True)
    monkeypatch.setattr("app.services.fix_queue.enqueue", queued)
    await attach_observations(db, review, [fresh])
    assert fresh.tracked_finding_id == 1
    assert old.verification_status == "RECHECKING"
    queued.assert_awaited_once()

    ambiguous = SimpleNamespace(category="bug", message="Unsafe call", filename="src/a.py", line=10, tracked_finding_id=None)
    db.execute = AsyncMock(return_value=SimpleNamespace(all=lambda: [(old, None), (other, None)]))
    await attach_observations(db, review, [ambiguous])
    assert ambiguous.tracked_finding_id is None


@pytest.mark.asyncio
async def test_resolved_issue_observed_after_completed_recheck_gets_new_job(monkeypatch):
    old = SimpleNamespace(id=1, category="bug", message="Unsafe call", filename="src/a.py", line=10,
                          verification_status="RESOLVED", status="resolved", resolved_at=datetime.now(timezone.utc))
    fresh = SimpleNamespace(category="bug", message="Unsafe call", filename="src/a.py", line=10, tracked_finding_id=None)
    review = SimpleNamespace(id=9, repository_id=3, pull_request_number=7, commit_sha="b" * 40)
    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [(old, None)])),
        scalar=AsyncMock(return_value=SimpleNamespace(status="COMPLETED", generation_version=1)),
    )
    queued = AsyncMock(side_effect=[False, True])
    monkeypatch.setattr("app.services.fix_queue.enqueue", queued)
    await attach_observations(db, review, [fresh])
    assert fresh.tracked_finding_id == 1
    assert old.verification_status == "RECHECKING" and old.status == "open"
    assert queued.await_args_list[-1].args[-1] == 2


@pytest.mark.asyncio
async def test_source_anchor_matches_large_line_shift_and_rejects_different_code():
    import hashlib
    old = SimpleNamespace(id=3, category="bug", message="Unsafe call", filename="src/a.py",
                          line=10, source_anchor=hashlib.sha256(b"unsafe_call(value)").hexdigest(),
                          verification_status="OPEN")
    review = SimpleNamespace(id=9, repository_id=3, pull_request_number=7, commit_sha="b" * 40)
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [(old, None)])))
    matching = SimpleNamespace(category="bug", message="Unsafe call", filename="src/a.py", line=150, tracked_finding_id=None)
    await attach_observations(db, review, [matching], [{
        "filename": "src/a.py", "changed_lines": [{"line": 150, "content": "unsafe_call(value)"}],
    }])
    assert matching.tracked_finding_id == 3
    different = SimpleNamespace(category="bug", message="Unsafe call", filename="src/a.py", line=150, tracked_finding_id=None)
    await attach_observations(db, review, [different], [{
        "filename": "src/a.py", "changed_lines": [{"line": 150, "content": "unsafe_call(other)"}],
    }])
    assert different.tracked_finding_id is None
