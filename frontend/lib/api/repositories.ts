import { apiRequest } from "./client";
import type { RepositoryItem } from "@/types/repository";
import type { ReviewRun } from "@/types/review";

export interface AvailableRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string };
}

export async function getRepositories(tenantId: number) {
  return apiRequest<RepositoryItem[]>(`/tenants/${tenantId}/repositories`);
}

export async function getAvailableRepositories(tenantId: number) {
  return apiRequest<AvailableRepository[]>(
    `/tenants/${tenantId}/repositories/available`,
  );
}

export async function saveRepositorySelection(
  tenantId: number,
  selection: { repository_ids: number[]; select_all: boolean },
) {
  return apiRequest<RepositoryItem[]>(`/tenants/${tenantId}/repositories/selection`, {
    method: "PUT",
    body: JSON.stringify(selection),
  });
}

export async function getRepositoryReviews(tenantId: number, repositoryId: number) {
  return apiRequest<ReviewRun[]>(`/tenants/${tenantId}/repositories/${repositoryId}/reviews`);
}
