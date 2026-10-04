from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.user import User


async def create_personal_workspace(
    db: AsyncSession,
    user: User,
) -> Tenant:
    existing = await db.scalar(
        select(Tenant).where(
            Tenant.workspace_type == "PERSONAL",
            Tenant.personal_owner_user_id == user.id,
        )
    )
    if existing is not None:
        membership = await db.scalar(
            select(TenantMember).where(
                TenantMember.tenant_id == existing.id,
                TenantMember.user_id == user.id,
            )
        )
        if membership is None:
            db.add(
                TenantMember(
                    tenant_id=existing.id,
                    user_id=user.id,
                    role="OWNER",
                )
            )
            await db.flush()
        return existing

    base_slug = f"personal-{user.id}"
    slug = base_slug
    suffix = 1

    while await db.scalar(select(Tenant.id).where(Tenant.slug == slug)):
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    workspace = Tenant(
        name=f"{user.full_name}'s Workspace",
        slug=slug,
        workspace_type="PERSONAL",
        personal_owner_user_id=user.id,
    )
    db.add(workspace)
    await db.flush()

    db.add(
        TenantMember(
            tenant_id=workspace.id,
            user_id=user.id,
            role="OWNER",
        )
    )
    await db.flush()

    return workspace