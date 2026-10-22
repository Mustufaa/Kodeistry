export type VerificationStatus = "OPEN" | "RECHECKING" | "RESOLVED" | "STILL_PRESENT" | "NEEDS_REVIEW";
export type TriageStatus = "ACTIVE" | "DISMISSED" | "FALSE_POSITIVE";

export interface FixSuggestion {
  explanation: string;
  conditions: string;
  impact: string;
  suggested_fix: string;
  unified_diff?: string | null;
  regression_test?: string | null;
}

export interface FixAssistantResult {
  state: "EMPTY" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "READY";
  suggestion: FixSuggestion | null;
  error_code: string | null;
  source_commit: string;
  stale: boolean;
  repository: string;
  pull_request_number: number;
  filename: string;
  line: number;
  prompt: string;
  tests_executed: false;
}

export interface VerificationHistory {
  id: number;
  status: VerificationStatus;
  checked_commit_sha: string;
  checked_at: string;
  reason: string;
  evidence?: { path?: string; line?: number; assessment?: string } | null;
}

export interface TrackingResult {
  tracked_finding_id: number;
  verification_status: VerificationStatus;
  triage_status: TriageStatus;
  triage_reason: string | null;
  checked_commit_sha: string | null;
  checked_at: string | null;
  verification_reason: string | null;
  current_head: string | null;
  stale: boolean;
  history: VerificationHistory[];
}

