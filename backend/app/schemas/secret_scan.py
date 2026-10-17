from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StartSecretScan(BaseModel):
    repository_id: int
    branch: str = Field(min_length=1, max_length=255)
    scope: Literal["CURRENT_FILES", "GIT_HISTORY"]


class SecretScanView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    repository_id: int
    branch: str
    scope: str
    resolved_commit_sha: str | None
    status: str
    stage: str
    scanner_version: str
    findings_count: int
    files_scanned: int | None
    commits_scanned: int | None
    skipped_count: int
    coverage_complete: bool
    coverage_note: str | None
    error_code: str | None
    cancel_requested: bool
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class SecretFindingView(BaseModel):
    id: int
    rule_id: str
    secret_type: str
    severity: str
    confidence: str
    file_path: str
    line: int
    branch: str
    commit_sha: str
    preview: Literal["[REDACTED]"] = "[REDACTED]"
    disposition: str
    dismissal_reason: str | None
    validity: Literal["NOT_CHECKED"] = "NOT_CHECKED"
    first_detected_at: datetime
    last_seen_at: datetime


class DismissSecretFinding(BaseModel):
    disposition: Literal["OPEN", "DISMISSED"]
    reason: Literal["EXAMPLE_VALUE", "TEST_CREDENTIAL", "FALSE_POSITIVE"] | None = None
