"""Explicit member repository assignments. Existing members receive no implicit grants."""
from alembic import op
import sqlalchemy as sa
revision = "bc42d931e702"
down_revision = "af31b820d601"
branch_labels = None
depends_on = None

def upgrade():
    op.create_unique_constraint("uq_repository_id_tenant", "repositories", ["id", "tenant_id"])
    op.create_unique_constraint("uq_member_id_tenant", "tenant_members", ["id", "tenant_id"])
    op.add_column("team_invitations", sa.Column("repository_ids", sa.JSON(), nullable=False, server_default="[]"))
    op.create_table("repository_members",
        sa.Column("member_id", sa.Integer(), primary_key=True),
        sa.Column("repository_id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["member_id", "tenant_id"], ["tenant_members.id", "tenant_members.tenant_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["repository_id", "tenant_id"], ["repositories.id", "repositories.tenant_id"], ondelete="CASCADE"),
    )
    op.create_index("ix_repository_members_tenant_id", "repository_members", ["tenant_id"])

def downgrade():
    op.drop_table("repository_members")
    op.drop_column("team_invitations", "repository_ids")
    op.drop_constraint("uq_member_id_tenant", "tenant_members", type_="unique")
    op.drop_constraint("uq_repository_id_tenant", "repositories", type_="unique")
