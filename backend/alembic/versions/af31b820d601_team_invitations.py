"""Team roles, hashed invitations, and shared delivery limits."""
from alembic import op
import sqlalchemy as sa

revision = "af31b820d601"
down_revision = "9a0e5d4c2b71"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE tenant_members SET role = 'MEMBER' WHERE role = 'DEVELOPER'")
    op.create_check_constraint("ck_tenant_member_role", "tenant_members", "role IN ('OWNER', 'ADMIN', 'MEMBER')")
    # Fails safely if historical case-variant duplicate accounts need manual resolution.
    op.create_index("uq_users_normalized_email", "users", [sa.text("lower(trim(email))")], unique=True)
    op.create_table(
        "team_invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("inviter_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('OWNER', 'ADMIN', 'MEMBER')", name="ck_invitation_role"),
        sa.CheckConstraint("email = lower(trim(email))", name="ck_invitation_email"),
    )
    op.create_index("ix_team_invitations_tenant_id", "team_invitations", ["tenant_id"])
    op.create_index("uq_pending_team_email", "team_invitations", ["tenant_id", "email"], unique=True,
                    postgresql_where=sa.text("accepted_at IS NULL AND revoked_at IS NULL"))
    op.create_table(
        "invitation_send_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_invitation_attempt_user_time", "invitation_send_attempts", ["user_id", "created_at"])


def downgrade():
    op.drop_table("invitation_send_attempts")
    op.drop_table("team_invitations")
    op.drop_index("uq_users_normalized_email", "users")
    op.drop_constraint("ck_tenant_member_role", "tenant_members", type_="check")
    op.execute("UPDATE tenant_members SET role = 'DEVELOPER' WHERE role = 'MEMBER'")
