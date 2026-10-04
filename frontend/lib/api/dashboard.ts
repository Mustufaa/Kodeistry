import { apiRequest } from "./client";
import type { ReviewRun } from "@/types/review";

export interface DashboardRepository {
  id: number;
  full_name: string;
  private: boolean;
  language?: string | null;
  html_url?: string | null;
  reviews_count: number;
  findings_count: number;
  last_review_at?: string | null;
}

export interface DashboardSummary {
  user: {
    id: number;
    full_name: string;
    email: string;
    is_verified: boolean;
    github_login?: string | null;
  };
  workspace: {
    id: number;
    name: string;
    slug: string;
    workspace_type: "PERSONAL" | "ORGANIZATION";
  };
  github?: {
    id: number;
    tenant_id: number;
    installation_id: number;
    account_login: string;
    account_type: string;
    account_id?: number | null;
    account_avatar_url?: string | null;
    last_synced_at?: string | null;
  } | null;
  repositories_count: number;
  pull_requests_count: number;
  reviews_count: number;
  findings_count: number;
  critical_findings_count: number;
  repositories: DashboardRepository[];
  recent_reviews: ReviewRun[];
}

export function getDashboardSummary(tenantId: number) {
  return apiRequest<DashboardSummary>(`/tenants/${tenantId}/dashboard`);
}
