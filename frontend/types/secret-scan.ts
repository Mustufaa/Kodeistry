export type SecretScanScope = "CURRENT_FILES" | "GIT_HISTORY";
export type SecretScanStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface SecretRepository {
  id: number;
  full_name: string;
  default_branch: string;
}

export interface SecretBranch {
  name: string;
  commit_sha: string;
}

export interface SecretScan {
  id: number;
  repository_id: number;
  branch: string;
  scope: SecretScanScope;
  resolved_commit_sha: string | null;
  status: SecretScanStatus;
  stage: string;
  scanner_version: string;
  findings_count: number;
  files_scanned: number | null;
  commits_scanned: number | null;
  skipped_count: number;
  coverage_complete: boolean;
  coverage_note: string | null;
  error_code: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface SecretFinding {
  id: number;
  rule_id: string;
  secret_type: string;
  severity: string;
  confidence: string;
  file_path: string;
  line: number;
  branch: string;
  commit_sha: string;
  preview: "[REDACTED]";
  disposition: "OPEN" | "DISMISSED" | "REMOVED_FROM_SCANNED_SCOPE";
  dismissal_reason: string | null;
  validity: "NOT_CHECKED";
  first_detected_at: string;
  last_seen_at: string;
}
