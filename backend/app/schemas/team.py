from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from app.schemas.auth import PasswordMixin

Role = Literal["OWNER", "ADMIN", "MEMBER"]


class InviteMember(BaseModel):
    email: EmailStr
    role: Role = "MEMBER"
    repository_ids: list[int] = Field(default_factory=list, max_length=1000)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ChangeRole(BaseModel):
    role: Role


class InvitationToken(BaseModel):
    token: str = Field(min_length=40, max_length=128)


class InvitationRegistration(PasswordMixin, InvitationToken):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()


class InvitationView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    role: Role
    expires_at: datetime
    created_at: datetime
    repository_ids: list[int] = Field(default_factory=list)


class MemberView(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: Role
    joined_at: datetime
    repository_ids: list[int] = Field(default_factory=list)


class RepositoryAssignments(BaseModel):
    repository_ids: list[int] = Field(max_length=1000)
