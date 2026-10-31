"""Persist the account-wide, one-time Kody invitation.

Deploy this migration before the API/frontend. PostgreSQL holds the ALTER TABLE
lock through the backfill, so concurrent registrations cannot fall between them.
"""
from alembic import op
import sqlalchemy as sa

revision = "cd53ea42f803"
down_revision = "bc42d931e702"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("onboarding_prompt_shown_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("tutorial_status", sa.String(20), nullable=False, server_default="NOT_STARTED"))
    op.execute("UPDATE users SET onboarding_prompt_shown_at = CURRENT_TIMESTAMP")
    op.create_check_constraint("ck_users_tutorial_status", "users", "tutorial_status IN ('NOT_STARTED', 'IN_PROGRESS', 'SKIPPED', 'COMPLETED')")


def downgrade():
    # Intentionally irreversible: dropping this history could re-invite accounts.
    raise RuntimeError("Preserve Kody invitation history; roll back application code only.")
