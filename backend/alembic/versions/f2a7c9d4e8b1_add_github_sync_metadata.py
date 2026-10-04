"""add github sync metadata

Revision ID: f2a7c9d4e8b1
Revises: c3f8a1d9e2b4, b7c913e4a205
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2a7c9d4e8b1"
down_revision: Union[str, Sequence[str], None] = ("c3f8a1d9e2b4", "b7c913e4a205")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("github_installations", sa.Column("account_id", sa.BigInteger(), nullable=True))
    op.add_column("github_installations", sa.Column("account_avatar_url", sa.String(length=500), nullable=True))
    op.add_column("github_installations", sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("repositories", sa.Column("html_url", sa.String(length=500), nullable=True))
    op.add_column("repositories", sa.Column("description", sa.String(length=1000), nullable=True))
    op.add_column("repositories", sa.Column("language", sa.String(length=100), nullable=True))
    op.add_column(
        "repositories",
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("repositories", "is_active")
    op.drop_column("repositories", "language")
    op.drop_column("repositories", "description")
    op.drop_column("repositories", "html_url")

    op.drop_column("github_installations", "last_synced_at")
    op.drop_column("github_installations", "account_avatar_url")
    op.drop_column("github_installations", "account_id")