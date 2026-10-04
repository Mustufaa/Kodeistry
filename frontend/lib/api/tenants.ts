import { apiRequest } from "./client";
import type { Tenant, TenantMember } from "@/types/tenant";

export async function getTenants() {
  return apiRequest<Tenant[]>("/tenants/");
}

export async function createTenant(name: string) {
  return apiRequest<Tenant>("/tenants/", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getTenantMembers(tenantId: number) {
  return apiRequest<TenantMember[]>(`/tenants/${tenantId}/members`);
}

export async function ensurePersonalWorkspace() {
  return apiRequest<Tenant>("/tenants/personal", {
    method: "POST",
  });
}