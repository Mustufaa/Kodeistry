import hashlib
import logging
import hmac
from datetime import datetime, timezone
from json import JSONDecodeError

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

from app.github.client import GitHubClient

from app.services.diff_service import build_review_file

from app.services.review_service import (
    review_changed_files,
)

from app.services.github_review_service import (
    post_review_to_github,
)

from app.db.session import get_db
from app.models.repository import Repository
from app.models.github_installation import GitHubInstallation

from app.models.review_run import (
    ReviewRun,
    ReviewRunStatus,
)

from app.models.review_finding import ReviewFinding
from app.services.fix_queue import set_head_and_enqueue, attach_observations

from app.services.repository_service import (
    get_repository_for_installation,
)
from app.api.github_installation import (
    apply_installation_account,
    get_verified_installation,
    synchronize_installation,
)


router = APIRouter(
    prefix="/api/github",
    tags=["GitHub"],
)
logger = logging.getLogger(__name__)


# ============================================================
# WEBHOOK SIGNATURE VERIFICATION
# ============================================================

def verify_github_signature(
    payload: bytes,
    signature: str | None,
) -> bool:
    """
    Verify that the webhook request came from GitHub.
    """

    if not signature:
        return False

    if not settings.GITHUB_WEBHOOK_SECRET:
        return False

    expected_signature = (
        "sha256="
        + hmac.new(
            settings.GITHUB_WEBHOOK_SECRET.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()
    )

    return hmac.compare_digest(
        expected_signature,
        signature,
    )


# ============================================================
# GITHUB WEBHOOK
# ============================================================

@router.post("/webhook")
async def github_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(
        default=None,
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Receive, verify, and process GitHub webhook events.

    Pull Request events with actions:
        - opened
        - synchronize
        - reopened

    automatically trigger the AI code-review pipeline.
    """

    payload = await request.body()

    # --------------------------------------------------------
    # 1. Verify GitHub signature
    # --------------------------------------------------------

    if not verify_github_signature(
        payload,
        x_hub_signature_256,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid GitHub webhook signature.",
        )

    try:
        data = await request.json()
    except JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON payload.",
        ) from exc

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON payload.",
        )

    event = request.headers.get(
        "X-GitHub-Event"
    )

    action = data.get("action")

    if event in {"installation", "installation_repositories"}:
        installation_id = (data.get("installation") or {}).get("id")
        logger.info("GitHub %s webhook received for installation %s action=%s", event, installation_id, action)
        if not installation_id:
            raise HTTPException(status_code=400, detail="GitHub installation ID missing from webhook payload.")

        installation = await db.scalar(
            select(GitHubInstallation).where(GitHubInstallation.installation_id == installation_id)
        )
        if event == "installation" and action == "deleted":
            if installation is not None:
                installation.is_active = False
                installation.disconnected_at = datetime.now(timezone.utc)
                repositories = await db.scalars(
                    select(Repository).where(
                        Repository.github_installation_id == installation.id
                    )
                )
                for repository in repositories.all():
                    repository.is_active = False
                await db.commit()
            return {
                "message": "GitHub installation disconnected.",
                "event": event,
                "action": action,
                "installation_id": installation_id,
            }
        if installation is None:
            logger.info("GitHub installation %s webhook received before tenant association; waiting for setup callback.", installation_id)
            return {
                "message": "Installation webhook received before tenant association.",
                "event": event,
                "action": action,
                "installation_id": installation_id,
            }

        github_installation = await get_verified_installation(installation_id)
        apply_installation_account(installation, github_installation)
        sync_summary = await synchronize_installation(db, installation)
        await db.commit()
        logger.info("GitHub installation %s synchronized from %s webhook: %s repositories", installation_id, event, sync_summary.total)
        return {
            "message": "GitHub installation synchronized.",
            "event": event,
            "action": action,
            "installation_id": installation_id,
            "repositories_synced": sync_summary.total,
            "sync_summary": {
                "total": sync_summary.total,
                "created": sync_summary.created,
                "updated": sync_summary.updated,
                "removed": sync_summary.removed,
            },
        }
    # --------------------------------------------------------
    # 2. Only process relevant Pull Request events
    # --------------------------------------------------------

    review_actions = {
        "opened",
        "synchronize",
        "reopened",
    }

    if event != "pull_request" or action not in review_actions:
        return {
            "message": "Webhook received but no review triggered.",
            "event": event,
            "action": action,
        }

    # --------------------------------------------------------
    # 3. Extract installation and repository information
    # --------------------------------------------------------

    installation_id = (
        data.get("installation", {})
        .get("id")
    )

    repository = data.get("repository", {})

    owner = (
        repository.get("owner", {})
        .get("login")
    )

    repo = repository.get("name")

    pull_number = data.get("number")

    if not installation_id:
        raise HTTPException(
            status_code=400,
            detail="GitHub installation ID missing from webhook payload.",
        )

    if not owner or not repo or not pull_number:
        raise HTTPException(
            status_code=400,
            detail="Repository or Pull Request information missing from webhook payload.",
        )

    # --------------------------------------------------------
    # 4. Resolve repository from tenant database
    # --------------------------------------------------------

    github_repository_id = repository.get("id")

    if not github_repository_id:
        raise HTTPException(
            status_code=400,
            detail="GitHub repository ID missing from webhook payload.",
        )

    connected_repository = (
        await get_repository_for_installation(
            db=db,
            installation_id=installation_id,
            github_repository_id=github_repository_id,
        )
    )

    if not connected_repository:
        return {
            "message": (
                "Repository is not connected "
                "to any tenant. Review skipped."
            ),
            "repository": f"{owner}/{repo}",
            "pull_request": pull_number,
            "installation_id": installation_id,
        }

    client = GitHubClient()

    # --------------------------------------------------------
    # 5. Get Pull Request HEAD commit SHA
    # --------------------------------------------------------

    commit_sha = await client.get_pull_request_commit_sha(
        installation_id=installation_id,
        owner=owner,
        repo=repo,
        pull_number=pull_number,
    )

    lock_key = int.from_bytes(hashlib.sha256(f"{connected_repository.id}/{pull_number}/{commit_sha}".encode()).digest()[:8], "big", signed=True)
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
    await set_head_and_enqueue(db, connected_repository.id, pull_number, commit_sha)
    existing = await db.scalar(select(ReviewRun).where(
        ReviewRun.repository_id == connected_repository.id,
        ReviewRun.pull_request_number == pull_number,
        ReviewRun.commit_sha == commit_sha,
        ReviewRun.status.in_([ReviewRunStatus.RUNNING.value, ReviewRunStatus.COMPLETED.value]),
    ))
    if existing:
        await db.commit()
        return {"message": "Commit already reviewed.", "review_run_id": existing.id, "review_run_status": existing.status}

    # --------------------------------------------------------
    # 6. Create ReviewRun
    # --------------------------------------------------------

    review_run = ReviewRun(
        tenant_id=connected_repository.tenant_id,
        repository_id=connected_repository.id,
        pull_request_number=pull_number,
        commit_sha=commit_sha,
        status=ReviewRunStatus.RUNNING.value,
        findings_count=0,
    )

    db.add(review_run)
    await db.commit()
    await db.refresh(review_run)

    try:
        # ----------------------------------------------------
        # 7. Fetch changed files
        # ----------------------------------------------------

        files = await client.get_pull_request_files(
            installation_id=installation_id,
            owner=owner,
            repo=repo,
            pull_number=pull_number,
        )

        # ----------------------------------------------------
        # 8. Build review-ready files
        # ----------------------------------------------------

        review_files = [
            build_review_file(
                filename=file.get("filename"),
                status=file.get("status"),
                patch=file.get("patch"),
            )
            for file in files
        ]

        # ----------------------------------------------------
        # 9. Run AI review
        # ----------------------------------------------------

        review_result = await review_changed_files(
            review_files
        )

        # ----------------------------------------------------
        # 10. Post inline review to GitHub
        # ----------------------------------------------------

        latest_sha = await client.get_pull_request_commit_sha(
            installation_id=installation_id, owner=owner, repo=repo, pull_number=pull_number,
        )
        github_review = (
            await post_review_to_github(
                installation_id=installation_id, owner=owner, repo=repo,
                pull_number=pull_number, review_result=review_result, commit_id=commit_sha,
            ) if latest_sha == commit_sha else {"posted": False, "message": "PR head changed during review."}
        )

        # ----------------------------------------------------
        # 11. Save individual review findings
        # ----------------------------------------------------

        persisted_findings = []
        for finding in review_result.findings:
            persisted = ReviewFinding(
                    review_run_id=review_run.id,
                    filename=finding.filename,
                    line=finding.line,
                    severity=finding.severity.value,
                    category=finding.category.value,
                    message=finding.message,
                    suggestion=finding.suggestion,
                    why_it_matters=finding.why_it_matters,
                    recommended_approach=finding.recommended_approach,
                    verification_steps=finding.verification_steps,
                )
            db.add(persisted)
            persisted_findings.append(persisted)

        await db.flush()
        await attach_observations(db, review_run, persisted_findings, review_files)

        # ----------------------------------------------------
        # 12. Mark ReviewRun as completed
        # ----------------------------------------------------

        findings_count = len(
            getattr(
                review_result,
                "findings",
                [],
            )
        )

        review_run.status = (
            ReviewRunStatus.COMPLETED.value
        )
        review_run.findings_count = findings_count
        review_run.completed_at = datetime.now(
            timezone.utc
        )

        await db.commit()
        await db.refresh(review_run)

    except Exception:
        # ----------------------------------------------------
        # 13. Mark ReviewRun as failed
        # ----------------------------------------------------

        review_run.status = (
            ReviewRunStatus.FAILED.value
        )
        review_run.completed_at = datetime.now(
            timezone.utc
        )

        await db.commit()

        raise

    # --------------------------------------------------------
    # 14. Return processing result
    # --------------------------------------------------------

    return {
        "message": (
            "GitHub Pull Request reviewed successfully."
        ),
        "event": event,
        "action": action,
        "repository": f"{owner}/{repo}",
        "pull_request": pull_number,
        "installation_id": installation_id,
        "review_run_id": review_run.id,
        "review_run_status": review_run.status,
        "findings_count": review_run.findings_count,
        "review": review_result.model_dump(),
        "github_review": github_review,
    }
