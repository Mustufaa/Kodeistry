from app.github.client import GitHubClient
from app.schemas.review import ReviewResult


def finding_to_comment(
    finding,
) -> dict:
    """
    Convert a ReviewFinding into a GitHub
    inline review comment.
    """

    body = (
        f"**{finding.severity.value.upper()}** "
        f"— {finding.category.value}\n\n"
        f"{finding.message}"
    )

    if finding.suggestion:
        body += (
            "\n\n"
            f"**Suggestion:** {finding.suggestion}"
        )

    return {
        "path": finding.filename,
        "line": finding.line,
        "side": "RIGHT",
        "body": body,
    }


async def post_review_to_github(
    installation_id: int,
    owner: str,
    repo: str,
    pull_number: int,
    review_result: ReviewResult,
) -> dict:
    """
    Create one submitted GitHub review containing
    all AI-generated inline comments.
    """

    if not review_result.findings:
        return {
            "posted": False,
            "message": "No findings to post.",
            "comments_posted": 0,
            "comments": [],
        }

    client = GitHubClient()

    commit_id = (
        await client.get_pull_request_commit_sha(
            installation_id=installation_id,
            owner=owner,
            repo=repo,
            pull_number=pull_number,
        )
    )

    comments = [
        finding_to_comment(finding)
        for finding in review_result.findings
    ]

    review_body = (
        "🤖 **Reviewed by Kodeistry**\n\n"
        f"Found {len(comments)} issue(s) in this PR."
    )

    review = await client.create_pull_request_review(
        installation_id=installation_id,
        owner=owner,
        repo=repo,
        pull_number=pull_number,
        commit_id=commit_id,
        comments=comments,
        review_body=review_body,
    )

    return {
        "posted": True,
        "comments_posted": len(comments),
        "review_id": review.get("id"),
        "review_state": review.get("state"),
        "submitted_at": review.get(
            "submitted_at"
        ),
        "commit_id": commit_id,
    }