from pydantic import BaseModel, ConfigDict, Field


class RepositoryConnect(BaseModel):
    owner: str
    name: str


class RepositorySelection(BaseModel):
    repository_ids: list[int] = Field(default_factory=list)
    select_all: bool = False


class RepositoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    github_installation_id: int
    github_repository_id: int
    owner: str
    name: str
    full_name: str
    private: bool
    default_branch: str
    html_url: str | None = None
    description: str | None = None
    language: str | None = None
    is_active: bool