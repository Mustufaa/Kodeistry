"""add finding resolution fields

Revision ID: 1f4d9a7b2c30
Revises: a84d2f71c930
Create Date: 2026-10-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "1f4d9a7b2c30"
down_revision: Union[str, Sequence[str], None] = "a84d2f71c930"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("review_findings", sa.Column("why_it_matters", sa.Text(), nullable=True))
    op.add_column("review_findings", sa.Column("recommended_approach", sa.Text(), nullable=True))
    op.add_column("review_findings", sa.Column("verification_steps", sa.Text(), nullable=True))
    op.add_column("review_findings", sa.Column("status", sa.String(length=20), server_default="open", nullable=False))
    op.add_column("review_findings", sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f("ix_review_findings_status"), "review_findings", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_review_findings_status"), table_name="review_findings")
    op.drop_column("review_findings", "resolved_at")
    op.drop_column("review_findings", "status")
    op.drop_column("review_findings", "verification_steps")
    op.drop_column("review_findings", "recommended_approach")
    op.drop_column("review_findings", "why_it_matters")
