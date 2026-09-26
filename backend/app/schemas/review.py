from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class Severity(str, Enum):
    """
    Severity of a code review finding.
    """

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ReviewCategory(str, Enum):
    """
    Category of a code review finding.
    """

    SECURITY = "security"
    BUG = "bug"
    PERFORMANCE = "performance"
    QUALITY = "quality"
    STYLE = "style"


class ReviewFinding(BaseModel):
    """
    A single code review finding.
    """

    filename: str

    line: int = Field(
        ge=1,
    )

    severity: Severity

    category: ReviewCategory

    message: str = Field(
        min_length=1,
    )

    suggestion: str | None = None


class ReviewResult(BaseModel):
    """
    Complete result of reviewing a Pull Request.
    """

    findings: list[ReviewFinding] = Field(
        default_factory=list,
    )

    files_reviewed: int = Field(
        ge=0,
    )

    lines_reviewed: int = Field(
        ge=0,
    )


class ReviewRunResponse(BaseModel):
    """
    Summary of a completed or processed review run.
    """

    id: int

    repository_id: int

    pull_request_number: int

    commit_sha: str

    status: str

    findings_count: int

    created_at: datetime

    completed_at: datetime | None = None


class ReviewRunDetailResponse(ReviewRunResponse):
    """
    Detailed review run including individual findings.
    """

    findings: list[ReviewFinding] = Field(
        default_factory=list,
    )