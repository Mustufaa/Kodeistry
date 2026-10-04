from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.github.client import GitHubClient
from app.models.github_installation import GitHubInstallation
from app.models.repository import Repository


@dataclass(frozen=True)
class RepositorySyncSummary:
    total: int
    created: int
    updated: int
    removed: int


def _repository_values(payload: dict) -> dict:
    owner = payload.get("owner") or {}
    return {
        "owner": owner.get("login"),
        "name": payload.get("name"),
        "full_name": payload.get("full_name"),
        "private": bool(payload.get("private", False)),
        "default_branch": payload.get("default_branch") or "main",
        "html_url": payload.get("html_url"),
        "description": payload.get("description"),
        "language": payload.get("language"),
        "is_active": True,
    }


async def sync_installation_repositories(
    db: AsyncSession,
    installation: GitHubInstallation,
    github_repositories: list[dict] | None = None,
    github_client: GitHubClient | None = None,
) -> RepositorySyncSummary:
    """Fetch and upsert every repository accessible to one installation."""
    if github_repositories is None:
        client = github_client or GitHubClient()
        github_repositories = await client.list_installation_repositories(
            installation.installation_id
        )

    existing_result = await db.execute(
        select(Repository).where(Repository.tenant_id == installation.tenant_id)
    )
    existing = {
        repository.github_repository_id: repository
        for repository in existing_result.scalars().all()
    }
    accessible_ids: set[int] = set()
    created = 0
    updated = 0

    for payload in github_repositories:
        github_repository_id = payload.get("id")
        values = _repository_values(payload)
        if (
            not isinstance(github_repository_id, int)
            or not values["owner"]
            or not values["name"]
            or not values["full_name"]
        ):
            continue

        accessible_ids.add(github_repository_id)
        repository = existing.get(github_repository_id)
        if repository is None:
            repository = Repository(
                tenant_id=installation.tenant_id,
                github_installation_id=installation.id,
                github_repository_id=github_repository_id,
                **values,
            )
            db.add(repository)
            created += 1
            continue

        changed = repository.github_installation_id != installation.id or any(
            getattr(repository, key) != value for key, value in values.items()
        )
        repository.github_installation_id = installation.id
        for key, value in values.items():
            setattr(repository, key, value)
        if changed:
            updated += 1

    removed = 0
    for github_repository_id, repository in existing.items():
        if (
            repository.github_installation_id == installation.id
            and github_repository_id not in accessible_ids
            and repository.is_active
        ):
            repository.is_active = False
            removed += 1

    installation.last_synced_at = datetime.now(timezone.utc)
    await db.flush()
    return RepositorySyncSummary(
        total=len(accessible_ids),
        created=created,
        updated=updated,
        removed=removed,
    )


async def get_repository_for_installation(
    db: AsyncSession,
    installation_id: int,
    github_repository_id: int,
) -> Repository | None:
    result = await db.execute(
        select(Repository)
        .join(
            GitHubInstallation,
            Repository.github_installation_id == GitHubInstallation.id,
        )
        .where(
            GitHubInstallation.installation_id == installation_id,
            GitHubInstallation.is_active.is_(True),
            Repository.github_repository_id == github_repository_id,
            Repository.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none()
