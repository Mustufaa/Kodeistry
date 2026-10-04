export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface FindingItem {
  id?: number;
  filename: string;
  line: number;
  severity: FindingSeverity;
  category: string;
  message: string;
  suggestion?: string | null;
  repository_id?: number;
  repository_name?: string;
  pull_request_number?: number;
  review_id?: number;
}
