"""Track review findings and durable fix work.

Revision ID: 9a0e5d4c2b71
Revises: 7c4a1d93e5b2
"""
from alembic import context, op
import sqlalchemy as sa
import hashlib

revision = "9a0e5d4c2b71"
down_revision = "7c4a1d93e5b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("review_findings", sa.Column("fingerprint", sa.String(64)))
    op.add_column("review_findings", sa.Column("source_anchor", sa.String(64)))
    op.add_column("review_findings", sa.Column("tracked_finding_id", sa.Integer(), sa.ForeignKey("review_findings.id", ondelete="SET NULL")))
    op.add_column("review_findings", sa.Column("verification_status", sa.String(20), nullable=False, server_default="OPEN"))
    op.add_column("review_findings", sa.Column("triage_status", sa.String(20), nullable=False, server_default="ACTIVE"))
    op.add_column("review_findings", sa.Column("triage_reason", sa.Text()))
    op.add_column("review_findings", sa.Column("checked_commit_sha", sa.String(255)))
    op.add_column("review_findings", sa.Column("checked_at", sa.DateTime(timezone=True)))
    op.add_column("review_findings", sa.Column("verification_reason", sa.Text()))
    op.create_index("ix_review_findings_fingerprint", "review_findings", ["fingerprint"])
    op.create_index("ix_review_findings_tracked_finding_id", "review_findings", ["tracked_finding_id"])
    # Backfill identities and link only unique active observations from different reviews.
    if not context.is_offline_mode():
        connection = op.get_bind()
        observations = connection.execute(sa.text("""
            SELECT f.id, f.review_run_id, f.category, f.message, f.filename, f.line, f.status,
                   r.repository_id, r.pull_request_number
            FROM review_findings f JOIN review_runs r ON r.id = f.review_run_id
            ORDER BY r.repository_id, r.pull_request_number, r.id, f.id
        """)).mappings()
        candidates = {}
        updates = []
        for item in observations:
            normalized = " ".join(item["message"].casefold().split())
            identity = "\x1f".join((item["category"].casefold(), normalized, item["filename"].casefold()))
            digest = hashlib.sha256(identity.encode()).hexdigest()
            key = (item["repository_id"], item["pull_request_number"], digest)
            prior = candidates.get(key, [])
            tracked_id = prior[0][0] if item["status"] == "open" and len(prior) == 1 and prior[0][1] != item["review_run_id"] and abs(prior[0][2] - item["line"]) <= 40 else None
            updates.append({"id": item["id"], "fingerprint": digest, "tracked_id": tracked_id})
            if tracked_id is None and item["status"] == "open":
                candidates.setdefault(key, []).append((item["id"], item["review_run_id"], item["line"]))
            if len(updates) == 500:
                connection.execute(sa.text("UPDATE review_findings SET fingerprint = :fingerprint, tracked_finding_id = :tracked_id WHERE id = :id"), updates)
                updates.clear()
        if updates:
            connection.execute(sa.text("UPDATE review_findings SET fingerprint = :fingerprint, tracked_finding_id = :tracked_id WHERE id = :id"), updates)

    op.execute("UPDATE review_findings SET triage_status = 'DISMISSED' WHERE status = 'dismissed'")
    op.execute("UPDATE review_findings SET verification_status = 'NEEDS_REVIEW', triage_reason = 'Legacy manual resolution at ' || COALESCE(resolved_at::text, 'unknown time'), status = 'open', resolved_at = NULL WHERE status = 'resolved'")
    op.create_table("pull_request_heads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pull_request_number", sa.Integer(), nullable=False),
        sa.Column("commit_sha", sa.String(255), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("repository_id", "pull_request_number"))
    op.create_index("ix_pull_request_heads_repository_id", "pull_request_heads", ["repository_id"])
    op.execute("""INSERT INTO pull_request_heads (repository_id, pull_request_number, commit_sha)
        SELECT DISTINCT ON (repository_id, pull_request_number) repository_id, pull_request_number, commit_sha
        FROM review_runs ORDER BY repository_id, pull_request_number, id DESC""")
    op.create_table("fix_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("finding_id", sa.Integer(), sa.ForeignKey("review_findings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("commit_sha", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("generation_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(20), nullable=False, server_default="QUEUED"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("error_code", sa.String(50)),
        sa.UniqueConstraint("finding_id", "commit_sha", "kind", "generation_version"))
    op.create_index("ix_fix_jobs_finding_id", "fix_jobs", ["finding_id"])
    op.create_index("ix_fix_jobs_status", "fix_jobs", ["status"])
    op.create_table("fix_suggestions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("finding_id", sa.Integer(), sa.ForeignKey("review_findings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("commit_sha", sa.String(255), nullable=False),
        sa.Column("generation_version", sa.Integer(), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("finding_id", "commit_sha", "generation_version"))
    op.create_index("ix_fix_suggestions_finding_id", "fix_suggestions", ["finding_id"])
    op.create_table("finding_verifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("finding_id", sa.Integer(), sa.ForeignKey("review_findings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("checked_commit_sha", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("evidence", sa.JSON()),
        sa.Column("checked_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_finding_verifications_finding_id", "finding_verifications", ["finding_id"])
    op.create_index("ix_finding_verifications_commit", "finding_verifications", ["finding_id", "checked_commit_sha"])


def downgrade() -> None:
    op.drop_table("finding_verifications")
    op.drop_table("fix_suggestions")
    op.drop_table("fix_jobs")
    op.drop_table("pull_request_heads")
    op.drop_index("ix_review_findings_tracked_finding_id", table_name="review_findings")
    op.drop_index("ix_review_findings_fingerprint", table_name="review_findings")
    for name in ("verification_reason", "checked_at", "checked_commit_sha", "triage_reason", "triage_status", "verification_status", "tracked_finding_id", "source_anchor", "fingerprint"):
        op.drop_column("review_findings", name)

