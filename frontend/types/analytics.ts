export type Timeframe = "7d" | "30d" | "3m" | "6m" | "12m" | "custom";
export type FindingStatus = "open" | "resolved" | "dismissed";

export interface AnalyticsFilters {
  timeframe: Timeframe;
  start_date?: string;
  end_date?: string;
  repository_id?: number;
  severity?: string;
  category?: string;
  status?: FindingStatus;
}

export interface AnalyticsFinding {
  id: number;
  review_id: number;
  repository_id: number;
  repository_name: string;
  pull_request_number: number;
  commit_sha: string;
  filename: string;
  line: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  message: string;
  suggestion?: string | null;
  why_it_matters?: string | null;
  recommended_approach?: string | null;
  verification_steps?: string | null;
  status: FindingStatus;
  created_at: string;
  resolved_at?: string | null;
  github_url?: string | null;
}

export interface AnalyticsSummary {
  reviews: number; pull_requests: number; repositories: number; findings: number;
  critical: number; high: number; medium: number; low: number; info: number;
  security: number; bugs: number; performance: number; quality: number;
  open: number; resolved: number; dismissed: number; actionable: number;
  resolution_rate?: number | null; average_findings_per_review?: number | null;
  average_issue_age_days?: number | null; oldest_open_finding_days?: number | null;
  most_affected_repository?: string | null; most_common_category?: string | null;
}

export interface TrendPoint { date: string; label: string; total: number; critical: number; high: number; medium: number; low: number; info: number }
export interface DistributionPoint { name: string; count: number }
export interface ComparisonMetric { current: number; previous: number; percent_change?: number | null }

export interface AnalyticsResponse {
  start_date: string; end_date: string; timeframe: Timeframe; summary: AnalyticsSummary;
  comparison: { label: string; has_sufficient_data: boolean; findings?: ComparisonMetric | null; resolved?: ComparisonMetric | null; critical?: ComparisonMetric | null };
  trend: TrendPoint[]; severity: DistributionPoint[]; status: DistributionPoint[];
  categories: DistributionPoint[]; repositories: DistributionPoint[];
  critical_findings: AnalyticsFinding[]; recently_resolved: AnalyticsFinding[];
}
