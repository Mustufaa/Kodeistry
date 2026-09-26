from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_db

from app.models.user import User
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember

from app.schemas.github_installation import (
    GitHubInstallationConnect,
)


router = APIRouter(
    prefix="/api/tenants",
    tags=["GitHub Installations"],
)


@router.post(
    "/{tenant_id}/github/installations",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
async def connect_github_installation(
    tenant_id: int,
    installation_data: GitHubInstallationConnect,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check tenant exists
    tenant = await db.scalar(
        select(Tenant).where(Tenant.id == tenant_id)
    )

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found.",
        )

    # Check current user belongs to tenant
    membership = await db.scalar(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == current_user.id,
        )
    )

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this tenant.",
        )

    # Only OWNER can connect GitHub installation
    if membership.role != "OWNER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the tenant owner can connect GitHub.",
        )

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            "GitHub installation linking is unavailable until "
            "a verified installation flow is configured."
        ),
    )