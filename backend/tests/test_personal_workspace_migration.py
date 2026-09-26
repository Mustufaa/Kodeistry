import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_personal_workspace_migration_backfills_and_downgrades_safely():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "b7c913e4a205_add_personal_workspaces.py"
    )
    spec = importlib.util.spec_from_file_location(
        "personal_workspace_migration",
        migration_path,
    )
    assert spec is not None
    assert spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    users = sa.Table(
        "users",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("full_name", sa.String(100), nullable=False),
    )
    tenants = sa.Table(
        "tenants",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("slug", sa.String(150), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    tenant_members = sa.Table(
        "tenant_members",
        metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tenant_id", sa.Integer, sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint("tenant_id", "user_id", name="uq_tenant_member"),
    )
    metadata.create_all(engine)

    with engine.begin() as connection:
        connection.execute(
            users.insert(),
            [
                {"id": 1, "full_name": "Existing Owner"},
                {"id": 2, "full_name": "Second Owner"},
            ],
        )
        connection.execute(
            tenants.insert(),
            [{"id": 1, "name": "Existing Organization", "slug": "personal-1"}],
        )
        context = MigrationContext.configure(connection)

        with Operations.context(context):
            migration.upgrade()

        workspace_rows = connection.execute(
            sa.text(
                "SELECT name, slug, workspace_type, personal_owner_user_id "
                "FROM tenants ORDER BY id"
            )
        ).all()
        assert workspace_rows == [
            ("Existing Organization", "personal-1", "ORGANIZATION", None),
            ("Existing Owner's Workspace", "personal-1-1", "PERSONAL", 1),
            ("Second Owner's Workspace", "personal-2", "PERSONAL", 2),
        ]
        owner_memberships = connection.execute(
            sa.text("SELECT COUNT(*) FROM tenant_members WHERE role = 'OWNER'")
        ).scalar_one()
        assert owner_memberships == 2

        with Operations.context(context):
            migration.downgrade()

        preserved_tenants = connection.execute(
            sa.text("SELECT COUNT(*) FROM tenants")
        ).scalar_one()
        assert preserved_tenants == 3

    engine.dispose()
