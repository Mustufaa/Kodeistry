from datetime import datetime

from pydantic import BaseModel, ConfigDict


class GitHubInstallationConnect(BaseModel):
    installation_id: int


class GitHubInstallationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    installation_id: int
    account_login: str
    account_type: str
    account_id: int | None = None
    account_avatar_url: str | None = None
    last_synced_at: datetime | None = None
    is_active: bool = True
    repository_count: int = 0
    repository_selection: str | None = None


    management_url: str | None = None
class GitHubSyncResponse(BaseModel):
    installation: GitHubInstallationResponse
    repositories_synced: int
    total: int
    created: int
    updated: int
    removed: int
