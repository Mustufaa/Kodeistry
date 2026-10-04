from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class TenantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)


class TenantResponse(BaseModel):
    id: int
    name: str
    slug: str
    workspace_type: Literal["PERSONAL", "ORGANIZATION"]

    model_config = {
        "from_attributes": True,
    }


class TenantMemberCreate(BaseModel):
    email: EmailStr


class TenantMemberResponse(BaseModel):
    user_id: int
    full_name: str
    email: EmailStr
    role: str


class CurrentUserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    is_verified: bool
    github_login: str | None = None
    github_avatar_url: str | None = None
    auth_provider: str = "email"
    onboarding_tenant_id: int | None = None

    model_config = {
        "from_attributes": True,
    }
