"""support GitHub-first authentication

Revision ID: a84d2f71c930
Revises: 6d2f4a8c9b10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a84d2f71c930"
down_revision: Union[str, Sequence[str], None] = "6d2f4a8c9b10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("auth_provider", sa.String(length=30), server_default="email", nullable=False),
    )
    op.alter_column(
        "users",
        "hashed_password",
        existing_type=sa.String(length=255),
        nullable=True,
    )
    op.execute("UPDATE users SET auth_provider = 'github' WHERE github_id IS NOT NULL")


def downgrade() -> None:
    connection = op.get_bind()
    missing_passwords = connection.execute(
        sa.text("SELECT COUNT(*) FROM users WHERE hashed_password IS NULL")
    ).scalar_one()
    if missing_passwords:
        raise RuntimeError(
            "Cannot downgrade while GitHub-only users without passwords exist."
        )
    op.alter_column(
        "users",
        "hashed_password",
        existing_type=sa.String(length=255),
        nullable=False,
    )
    op.drop_column("users", "auth_provider")
