import { apiRequest, apiUrl } from "./client";
import type { AnalyticsFilters, AnalyticsFinding, AnalyticsResponse, FindingStatus } from "@/types/analytics";

export function analyticsQuery(filters: AnalyticsFilters) {
  const params = new URLSearchParams({ timeframe: filters.timeframe });
  if (filters.start_date) params.set("start_date", filters.start_date);
  if (filters.end_date) params.set("end_date", filters.end_date);
  if (filters.repository_id) params.set("repository_id", String(filters.repository_id));
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.category) params.set("category", filters.category);
  if (filters.status) params.set("status", filters.status);
  return params.toString();
}

export function getAnalytics(tenantId: number, filters: AnalyticsFilters) {
  return apiRequest<AnalyticsResponse>(`/tenants/${tenantId}/analytics?${analyticsQuery(filters)}`);
}

export function getFindings(tenantId: number, filters: AnalyticsFilters) {
  return apiRequest<AnalyticsFinding[]>(`/tenants/${tenantId}/findings?${analyticsQuery(filters)}`);
}

export function updateFindingStatus(tenantId: number, findingId: number, status: FindingStatus) {
  return apiRequest<AnalyticsFinding>(`/tenants/${tenantId}/findings/${findingId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function downloadFindingsCsv(tenantId: number, filters: AnalyticsFilters, filename?: string) {
  const response = await fetch(apiUrl(`/tenants/${tenantId}/findings/export?${analyticsQuery(filters)}`), { credentials: "include" });
  if (!response.ok) throw new Error("Unable to export findings.");
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const serverName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? serverName ?? "kodeistry-findings.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
