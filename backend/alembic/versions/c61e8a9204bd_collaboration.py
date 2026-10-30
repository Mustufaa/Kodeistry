"""Persistent team collaboration. Additive; no existing data is rewritten."""
from alembic import op
import sqlalchemy as sa

revision = "c61e8a9204bd"
down_revision = "bc42d931e702"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("chat_channels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE")),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("revision", sa.Integer(), server_default="0", nullable=False),
        sa.UniqueConstraint("tenant_id", "key", name="uq_chat_channel_key"),
        sa.CheckConstraint("kind IN ('team','repository','direct')", name="ck_chat_channel_kind"))
    op.create_index("ix_chat_channels_tenant_id", "chat_channels", ["tenant_id"])
    op.create_index("ix_chat_channels_repository_id", "chat_channels", ["repository_id"])
    op.create_table("chat_channel_members",
        sa.Column("channel_id", sa.Integer(), sa.ForeignKey("chat_channels.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("last_read_id", sa.Integer(), server_default="0", nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True)),
        sa.Column("typing_until", sa.DateTime(timezone=True)))
    op.create_table("chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("channel_id", sa.Integer(), sa.ForeignKey("chat_channels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.String(36), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("reply_to_id", sa.Integer(), sa.ForeignKey("chat_messages.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("edited_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("sender_id", "client_id", name="uq_chat_message_client"),
        sa.CheckConstraint("length(body) <= 4000", name="ck_chat_message_length"))
    op.create_index("ix_chat_history", "chat_messages", ["channel_id", "id"])
    op.create_index("ix_chat_sender_time", "chat_messages", ["sender_id", "created_at"])
    op.create_table("notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("recipient_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repository_id", sa.Integer(), sa.ForeignKey("repositories.id", ondelete="CASCADE")),
        sa.Column("channel_id", sa.Integer(), sa.ForeignKey("chat_channels.id", ondelete="CASCADE")),
        sa.Column("admin_only", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("event_type", sa.String(60), nullable=False),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("message", sa.String(500), nullable=False),
        sa.Column("href", sa.String(200), nullable=False),
        sa.Column("dedup_key", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("recipient_id", "dedup_key", name="uq_notification_dedup"))
    op.create_index("ix_notifications_recipient_id", "notifications", ["recipient_id"])
    op.create_index("ix_notifications_tenant_id", "notifications", ["tenant_id"])
    op.create_index("ix_notification_inbox", "notifications", ["recipient_id", "tenant_id", "read_at", "id"])
    op.create_index("ix_notification_created", "notifications", ["created_at"])
    op.create_table("collaboration_tickets",
        sa.Column("digest", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_collaboration_tickets_user_id", "collaboration_tickets", ["user_id"])
    op.create_index("ix_collaboration_tickets_expires_at", "collaboration_tickets", ["expires_at"])


def downgrade():
    for name in ["collaboration_tickets", "notifications", "chat_messages", "chat_channel_members", "chat_channels"]:
        op.drop_table(name)
