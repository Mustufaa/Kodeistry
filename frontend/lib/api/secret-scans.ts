import { apiRequest } from "./client";
import type { SecretBranch, SecretFinding, SecretRepository, SecretScan, SecretScanScope } from "@/types/secret-scan";

export const getSecretRepositories = () => apiRequest<SecretRepository[]>("/secret-scans/repositories");
export const getSecretBranches = (repositoryId: number) =>
  apiRequest<SecretBranch[]>("/secret-scans/repositories/" + repositoryId + "/branches");
export const getSecretScans = (offset = 0) =>
  apiRequest<SecretScan[]>("/secret-scans?offset=" + offset + "&limit=20");
export const getSecretScan = (id: number) => apiRequest<SecretScan>("/secret-scans/" + id);
export const startSecretScan = (input: { repository_id: number; branch: string; scope: SecretScanScope }) =>
  apiRequest<SecretScan>("/secret-scans", { method: "POST", body: JSON.stringify(input) });
export const cancelSecretScan = (id: number) =>
  apiRequest<SecretScan>("/secret-scans/" + id + "/cancel", { method: "POST" });
export const getSecretFindings = (id: number, filters: { offset: number; secretType: string; severity: string; disposition: string; file: string }) => {
  const query = new URLSearchParams({ offset: String(filters.offset), limit: "20" });
  if (filters.secretType) query.set("secret_type", filters.secretType);
  if (filters.severity) query.set("severity", filters.severity);
  if (filters.disposition) query.set("disposition", filters.disposition);
  if (filters.file) query.set("file", filters.file);
  return apiRequest<SecretFinding[]>("/secret-scans/" + id + "/findings?" + query.toString());
};
export const updateSecretFinding = (id: number, disposition: "OPEN" | "DISMISSED", reason?: string) =>
  apiRequest<SecretFinding>("/secret-findings/" + id, {
    method: "PATCH",
    body: JSON.stringify({ disposition, reason: reason || null }),
  });
