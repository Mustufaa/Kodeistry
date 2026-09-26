"""add personal and organization workspace types

Revision ID: b7c913e4a205
Revises: 0ebfe18d88f2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c913e4a205"
down_revision: Union[str, Sequence[str], None] = "0ebfe18d88f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tenants") as batch_op:
        batch_op.add_column(
            sa.Column(
                "workspace_type",
                sa.String(length=20),
                server_default="ORGANIZATION",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("personal_owner_user_id", sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_tenants_personal_owner_user_id_users",
            "users",
            ["personal_owner_user_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_unique_constraint(
            "uq_tenants_personal_owner",
            ["personal_owner_user_id"],
        )
        batch_op.create_check_constraint(
            "ck_tenants_workspace_type",
            "workspace_type IN ('PERSONAL', 'ORGANIZATION')",
        )
        batch_op.create_check_constraint(
            "ck_tenants_personal_owner",
            "(workspace_type = 'PERSONAL' AND personal_owner_user_id IS NOT NULL) "
            "OR (workspace_type = 'ORGANIZATION' AND personal_owner_user_id IS NULL)",
        )

    connection = op.get_bind()
    users = sa.table(
        "users",
        sa.column("id", sa.Integer()),
        sa.column("full_name", sa.String(length=100)),
    )
    tenants = sa.table(
        "tenants",
        sa.column("id", sa.Integer()),
        sa.column("name", sa.String(length=150)),
        sa.column("slug", sa.String(length=150)),
        sa.column("workspace_type", sa.String(length=20)),
        sa.column("personal_owner_user_id", sa.Integer()),
    )
    tenant_members = sa.table(
        "tenant_members",
        sa.column("tenant_id", sa.Integer()),
        sa.column("user_id", sa.Integer()),
        sa.column("role", sa.String(length=30)),
    )

    for user_id, full_name in connection.execute(
        sa.select(users.c.id, users.c.full_name)
    ):
        base_slug = f"personal-{user_id}"
        slug = base_slug
        suffix = 1
        while connection.execute(
            sa.select(tenants.c.id).where(tenants.c.slug == slug)
        ).first():
            slug = f"{base_slug}-{suffix}"
            suffix += 1

        workspace_id = connection.execute(
            sa.insert(tenants)
            .values(
                name=f"{full_name}'s Workspace",
                slug=slug,
                workspace_type="PERSONAL",
                personal_owner_user_id=user_id,
            )
            .returning(tenants.c.id)
        ).scalar_one()
        connection.execute(
            sa.insert(tenant_members).values(
                tenant_id=workspace_id,
                user_id=user_id,
                role="OWNER",
            )
        )


def downgrade() -> None:
    op.execute(
        "UPDATE tenants SET workspace_type = 'ORGANIZATION', "
        "personal_owner_user_id = NULL WHERE workspace_type = 'PERSONAL'"
    )
    with op.batch_alter_table("tenants") as batch_op:
        batch_op.drop_constraint("ck_tenants_personal_owner", type_="check")
        batch_op.drop_constraint("ck_tenants_workspace_type", type_="check")
        batch_op.drop_constraint("uq_tenants_personal_owner", type_="unique")
        batch_op.drop_constraint(
            "fk_tenants_personal_owner_user_id_users",
            type_="foreignkey",
        )
        batch_op.drop_column("personal_owner_user_id")
        batch_op.drop_column("workspace_type")
