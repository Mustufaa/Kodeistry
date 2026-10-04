import { apiRequest } from "./client";

export interface GitHubInstallation {
  id: number;
  tenant_id: number;
  installation_id: number;
  account_login: string;
  account_type: string;
  account_id?: number | null;
  account_avatar_url?: string | null;
  last_synced_at?: string | null;
  is_active: boolean;
  repository_count?: number;
  repository_selection?: string | null;
  management_url?: string | null;
}

export interface GitHubSyncResponse {
  installation: GitHubInstallation;
  repositories_synced: number;
  total: number;
  created: number;
  updated: number;
  removed: number;
}

export function getGithubInstallStartUrl() {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api"}/github/install`;
}

export function getGithubTenantInstallStartUrl(tenantId: number) {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api"}/tenants/${tenantId}/github/install`;
}

export function getGithubInstallations(tenantId: number) {
  return apiRequest<GitHubInstallation[]>(`/tenants/${tenantId}/github/installations`);
}

export function getGithubInstallationUrl(tenantId: number) {
  return apiRequest<{ install_url: string }>(`/tenants/${tenantId}/github/installations/url`);
}

export function syncGithubInstallation(tenantId: number) {
  return apiRequest<GitHubSyncResponse>(`/tenants/${tenantId}/github/installations/sync`, {
    method: "POST",
  });
}

export function disconnectGithubInstallation(tenantId: number, installationId: number) {
  return apiRequest<void>(`/tenants/${tenantId}/github/installations/${installationId}`, {
    method: "DELETE",
  });
}
