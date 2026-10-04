"""complete GitHub onboarding metadata

Revision ID: 6d2f4a8c9b10
Revises: f2a7c9d4e8b1
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6d2f4a8c9b10"
down_revision: Union[str, Sequence[str], None] = "f2a7c9d4e8b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("github_avatar_url", sa.String(length=500), nullable=True))
    op.add_column("users", sa.Column("onboarding_tenant_id", sa.Integer(), nullable=True))
    op.create_index("ix_users_onboarding_tenant_id", "users", ["onboarding_tenant_id"], unique=False)
    op.create_foreign_key(
        "fk_users_onboarding_tenant_id_tenants",
        "users",
        "tenants",
        ["onboarding_tenant_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column(
        "github_installations",
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column(
        "github_installations",
        sa.Column("disconnected_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("github_installations", "disconnected_at")
    op.drop_column("github_installations", "is_active")
    op.drop_constraint(
        "fk_users_onboarding_tenant_id_tenants",
        "users",
        type_="foreignkey",
    )
    op.drop_index("ix_users_onboarding_tenant_id", table_name="users")
    op.drop_column("users", "onboarding_tenant_id")
    op.drop_column("users", "github_avatar_url")
