export type ReviewStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export interface ReviewFinding {
  id: number;
  review_id: number;
  repository_id: number;
  repository_name: string;
  pull_request_number: number;
  commit_sha: string;
  filename: string;
  line: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: "security" | "bug" | "performance" | "quality" | "style" | "testing";
  message: string;
  suggestion?: string | null;
  why_it_matters?: string | null;
  recommended_approach?: string | null;
  verification_steps?: string | null;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  resolved_at?: string | null;
  github_url?: string | null;
}

export interface ReviewRun {
  id: number;
  repository_id: number;
  pull_request_number: number;
  commit_sha: string;
  status: ReviewStatus;
  findings_count: number;
  created_at: string;
  completed_at?: string | null;
  findings?: ReviewFinding[];
}
