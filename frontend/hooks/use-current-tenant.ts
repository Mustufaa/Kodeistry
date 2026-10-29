"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getCurrentUser } from "@/lib/api/auth";
import { selectOnboardingWorkspace } from "@/lib/api/onboarding";
import { getTenants } from "@/lib/api/tenants";

export function useCurrentTenant() {
  const queryClient = useQueryClient();
  const tenantsQuery = useQuery({ queryKey: ["tenants"], queryFn: getTenants, staleTime: 30_000 });
  const userQuery = useQuery({ queryKey: ["current-user"], queryFn: getCurrentUser, staleTime: 30_000 });
  const switchWorkspace = useMutation({
    mutationFn: selectOnboardingWorkspace,
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      // A fresh document also clears component state and in-flight data from the previous team.
      window.location.assign("/dashboard");
    },
  });

  const tenants = useMemo(() => tenantsQuery.data ?? [], [tenantsQuery.data]);
  const selectedId = userQuery.data?.onboarding_tenant_id;
  const currentTenant = useMemo(() => {
    if (!tenants.length) return undefined;
    return tenants.find((tenant) => tenant.id === selectedId) ?? tenants[0];
  }, [selectedId, tenants]);

  return {
    ...tenantsQuery,
    tenants,
    currentTenant,
    user: userQuery.data,
    tenantId: currentTenant?.id,
    setTenantId: (tenantId: number) => switchWorkspace.mutate(tenantId),
    isSwitching: switchWorkspace.isPending,
    switchError: switchWorkspace.error,
    canManage: currentTenant?.role === "OWNER" || currentTenant?.role === "ADMIN",
    isOwner: currentTenant?.role === "OWNER",
  };
}
