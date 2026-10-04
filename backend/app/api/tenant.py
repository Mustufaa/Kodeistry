import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.crud.tenant import create_personal_workspace
from app.db.session import get_db
from app.models.tenant import Tenant
from app.models.tenant_member import TenantMember
from app.models.user import User
from app.schemas.tenant import (
    TenantCreate,
    TenantMemberCreate,
    TenantMemberResponse,
    TenantResponse,
)


router = APIRouter(
    prefix="/api/tenants",
    tags=["Tenants"],
)


def generate_slug(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")

    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid tenant name.",
        )

    return slug



@router.post(
    "/personal",
    response_model=TenantResponse,
    status_code=status.HTTP_200_OK,
)
async def ensure_personal_workspace(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workspace = await create_personal_workspace(db, current_user)
    await db.commit()
    await db.refresh(workspace)
    return workspace

@router.post(
    "/",
    response_model=TenantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_tenant(
    tenant_data: TenantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Generate tenant slug
    slug = generate_slug(tenant_data.name)

    # Check whether tenant already exists
    existing_tenant = await db.scalar(
        select(Tenant).where(Tenant.slug == slug)
    )

    if existing_tenant:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant with this name already exists.",
        )

    # Create tenant
    tenant = Tenant(
        name=tenant_data.name,
        slug=slug,
        workspace_type="ORGANIZATION",
    )

    db.add(tenant)

    # Get generated tenant ID before commit
    await db.flush()

    # Make current user the tenant owner
    tenant_member = TenantMember(
        tenant_id=tenant.id,
        user_id=current_user.id,
        role="OWNER",
    )

    db.add(tenant_member)

    # Save tenant + membership together
    await db.commit()

    await db.refresh(tenant)

    return tenant


@router.get("/", response_model=list[TenantResponse])
async def get_workspaces(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Tenant)
        .join(TenantMember, TenantMember.tenant_id == Tenant.id)
        .where(TenantMember.user_id == current_user.id)
        .order_by(Tenant.workspace_type, Tenant.name)
    )
    return result.scalars().all()


@router.get(
    "/{tenant_id}/members",
    response_model=list[TenantMemberResponse],
)
async def get_workspace_members(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = await db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found.",
        )

    membership = await db.scalar(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == current_user.id,
        )
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this tenant.",
        )

    result = await db.execute(
        select(User, TenantMember.role)
        .join(TenantMember, TenantMember.user_id == User.id)
        .where(TenantMember.tenant_id == tenant_id)
        .order_by(User.full_name)
    )
    return [
        TenantMemberResponse(
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            role=role,
        )
        for user, role in result.all()
    ]


@router.post(
    "/{tenant_id}/members",
    response_model=TenantMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_workspace_member(
    tenant_id: int,
    member_data: TenantMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant = await db.scalar(select(Tenant).where(Tenant.id == tenant_id))
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found.",
        )

    owner_membership = await db.scalar(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == current_user.id,
        )
    )
    if owner_membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this tenant.",
        )
    if owner_membership.role != "OWNER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only tenant owners can add members.",
        )
    if tenant.workspace_type != "ORGANIZATION":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Members can only be added to organization workspaces.",
        )

    member_user = await db.scalar(
        select(User).where(User.email == member_data.email)
    )
    if member_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user is registered with this email.",
        )

    existing_membership = await db.scalar(
        select(TenantMember).where(
            TenantMember.tenant_id == tenant_id,
            TenantMember.user_id == member_user.id,
        )
    )
    if existing_membership is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this tenant.",
        )

    membership = TenantMember(
        tenant_id=tenant_id,
        user_id=member_user.id,
        role="DEVELOPER",
    )
    db.add(membership)
    await db.commit()
    return TenantMemberResponse(
        user_id=member_user.id,
        full_name=member_user.full_name,
        email=member_user.email,
        role=membership.role,
    )