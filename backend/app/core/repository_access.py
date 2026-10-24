"""Request-scoped repository security, including aggregates and indirect findings.

Authenticated HTTP sessions install these ORM criteria once. Raw Core tables in
the permission subqueries deliberately avoid recursively applying the criteria.
Workers/webhooks use their own unscoped sessions. Do not use raw SQL/Core selects
for repository data in HTTP handlers: they bypass SQLAlchemy loader criteria.
"""
from fastapi import HTTPException
from sqlalchemy import and_, event, or_, select
from sqlalchemy.orm import Session, with_loader_criteria
from app.models.repository import Repository
from app.models.repository_member import RepositoryMember
from app.models.tenant_member import TenantMember
from app.models.review_run import ReviewRun
from app.models.review_finding import ReviewFinding
from app.models.fix_workflow import FixSuggestion, FixJob, FindingVerification, PullRequestHead
from app.models.secret_scan import SecretScanRun, SecretFinding, SecretOccurrence

def accessible_repository_ids(user_id):
    repo = Repository.__table__.alias("access_repo")
    member = TenantMember.__table__.alias("access_member")
    grant = RepositoryMember.__table__.alias("access_grant")
    assigned = select(grant.c.repository_id).where(
        grant.c.member_id == member.c.id, grant.c.tenant_id == repo.c.tenant_id,
        grant.c.repository_id == repo.c.id,
    ).exists()
    return select(repo.c.id).select_from(repo.join(member, member.c.tenant_id == repo.c.tenant_id)).where(
        member.c.user_id == user_id,
        or_(member.c.role.in_(["OWNER", "ADMIN"]),
            and_(member.c.role == "MEMBER", repo.c.is_active.is_(True), assigned)),
    ).correlate(None)

@event.listens_for(Session, "do_orm_execute")
def scope_repository_reads(state):
    user_id = state.session.info.get("repository_access_user_id")
    if user_id is None or not state.is_select:
        return
    ids = accessible_repository_ids(user_id)
    runs = ReviewRun.__table__
    review_ids = select(runs.c.id).where(runs.c.repository_id.in_(ids)).correlate(None)
    findings = ReviewFinding.__table__
    finding_ids = select(findings.c.id).where(findings.c.review_run_id.in_(review_ids)).correlate(None)
    scans = SecretScanRun.__table__
    scan_ids = select(scans.c.id).where(scans.c.repository_id.in_(ids)).correlate(None)
    state.statement = state.statement.options(
        with_loader_criteria(FixSuggestion, FixSuggestion.finding_id.in_(finding_ids), include_aliases=True),
        with_loader_criteria(FixJob, FixJob.finding_id.in_(finding_ids), include_aliases=True),
        with_loader_criteria(FindingVerification, FindingVerification.finding_id.in_(finding_ids), include_aliases=True),
        with_loader_criteria(PullRequestHead, PullRequestHead.repository_id.in_(ids), include_aliases=True),
        with_loader_criteria(Repository, Repository.id.in_(ids), include_aliases=True),
        with_loader_criteria(ReviewRun, ReviewRun.repository_id.in_(ids), include_aliases=True),
        with_loader_criteria(ReviewFinding, ReviewFinding.review_run_id.in_(review_ids), include_aliases=True),
        with_loader_criteria(SecretScanRun, SecretScanRun.repository_id.in_(ids), include_aliases=True),
        with_loader_criteria(SecretFinding, SecretFinding.repository_id.in_(ids), include_aliases=True),
        with_loader_criteria(SecretOccurrence, SecretOccurrence.run_id.in_(scan_ids), include_aliases=True),
    )

def scope_session(db, user_id):
    db.info["repository_access_user_id"] = user_id

async def require_repository(db, tenant_id, user_id, repository_id):
    repo = await db.scalar(select(Repository).where(
        Repository.id == repository_id, Repository.tenant_id == tenant_id,
        Repository.id.in_(accessible_repository_ids(user_id)),
    ))
    if repo is None:
        raise HTTPException(404, "Repository not found or access revoked.")
    return repo

async def validate_assignments(db, tenant_id, repository_ids):
    ids = sorted(set(repository_ids or []))
    # Invitation acceptance precedes membership. Validate only the explicitly supplied
    # IDs within the invitation's team, independently of the invitee's current grants.
    repo = Repository.__table__
    found = (await db.scalars(select(repo.c.id).where(
        repo.c.tenant_id == tenant_id, repo.c.id.in_(ids), repo.c.is_active.is_(True),
    ).with_for_update())).all()
    if len(found) != len(ids):
        raise HTTPException(422, "One or more repositories are unavailable in this team. Update the assignments.")
    return ids
