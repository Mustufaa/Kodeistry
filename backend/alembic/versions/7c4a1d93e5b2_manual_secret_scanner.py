"""Add manual secret scans and masked finding snapshots.

Revision ID: 7c4a1d93e5b2
Revises: 1f4d9a7b2c30
"""
from alembic import op
import sqlalchemy as sa

revision = "7c4a1d93e5b2"
down_revision = "1f4d9a7b2c30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "secret_scan_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requested_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch", sa.String(255), nullable=False),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("resolved_commit_sha", sa.String(40)),
        sa.Column("status", sa.String(20), nullable=False, server_default="QUEUED"),
        sa.Column("stage", sa.String(80), nullable=False, server_default="Queued"),
        sa.Column("scanner_version", sa.String(30), nullable=False),
        sa.Column("findings_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("files_scanned", sa.Integer()),
        sa.Column("commits_scanned", sa.Integer()),
        sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("coverage_complete", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("coverage_note", sa.Text()),
        sa.Column("error_code", sa.String(60)),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lease_owner", sa.String(100)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("scope IN ('CURRENT_FILES','GIT_HISTORY')", name="ck_secret_scan_scope"),
        sa.CheckConstraint("status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')", name="ck_secret_scan_status"),
    )
    for field in ("tenant_id", "repository_id", "requested_by_id", "status"):
        op.create_index("ix_secret_scan_runs_" + field, "secret_scan_runs", [field])
    op.create_index(
        "uq_secret_scan_active", "secret_scan_runs", ["repository_id", "branch", "scope"],
        unique=True, postgresql_where=sa.text("status IN ('QUEUED','RUNNING')"),
    )
    op.create_table(
        "secret_findings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch", sa.String(255), nullable=False),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False, unique=True),
        sa.Column("rule_id", sa.String(120), nullable=False),
        sa.Column("secret_type", sa.String(160), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("confidence", sa.String(20), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("preview", sa.String(20), nullable=False, server_default="[REDACTED]"),
        sa.Column("disposition", sa.String(30), nullable=False, server_default="OPEN"),
        sa.Column("dismissal_reason", sa.String(500)),
        sa.Column("first_detected_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("disposition IN ('OPEN','DISMISSED','REMOVED_FROM_SCANNED_SCOPE')", name="ck_secret_finding_disposition"),
    )
    for field in ("tenant_id", "repository_id", "severity", "disposition"):
        op.create_index("ix_secret_findings_" + field, "secret_findings", [field])
    op.create_table(
        "secret_occurrences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("secret_scan_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("finding_id", sa.Integer(), sa.ForeignKey("secret_findings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(1024), nullable=False),
        sa.Column("line", sa.Integer(), nullable=False),
        sa.Column("commit_sha", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("run_id", "finding_id", "commit_sha", "file_path", "line", name="uq_secret_occurrence"),
    )
    op.create_index("ix_secret_occurrences_run_id", "secret_occurrences", ["run_id"])
    op.create_index("ix_secret_occurrences_finding_id", "secret_occurrences", ["finding_id"])


def downgrade() -> None:
    op.drop_table("secret_occurrences")
    op.drop_table("secret_findings")
    op.drop_table("secret_scan_runs")
