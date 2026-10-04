"""add github identity to users

Revision ID: c3f8a1d9e2b4
Revises: 0ebfe18d88f2
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3f8a1d9e2b4"
down_revision: Union[str, Sequence[str], None] = "0ebfe18d88f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("github_id", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("github_login", sa.String(length=255), nullable=True))
    op.create_index("ix_users_github_id", "users", ["github_id"], unique=False)
    op.create_unique_constraint("uq_users_github_id", "users", ["github_id"])


def downgrade() -> None:
    op.drop_constraint("uq_users_github_id", "users", type_="unique")
    op.drop_index("ix_users_github_id", table_name="users")
    op.drop_column("users", "github_login")
    op.drop_column("users", "github_id")
