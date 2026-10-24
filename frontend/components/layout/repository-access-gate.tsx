"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

type Access = { role: "OWNER" | "ADMIN" | "MEMBER"; repository_ids: number[] };

export function RepositoryAccessGate({ children }: { children: React.ReactNode }) {
  const { tenantId } = useCurrentTenant();
  const pathname = usePathname();
  const client = useQueryClient();
  const previous = useRef<{ tenant: number; fingerprint: string } | null>(null);
  const access = useQuery({
    queryKey: ["repository-access", tenantId],
    enabled: !!tenantId,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: "always",
    retry: false,
    queryFn: async () => {
      const next = await apiRequest<Access>("/tenants/" + tenantId + "/access");
      const fingerprint = JSON.stringify(next);
      if (previous.current && previous.current.tenant === tenantId && previous.current.fingerprint !== fingerprint) {
        // Remove query caches AND mounted component state when a grant or role changes.
        await client.cancelQueries({ predicate: (query) => query.queryKey[0] !== "repository-access" });
        client.clear();
        window.location.replace("/dashboard");
        return new Promise<Access>(() => {});
      }
      previous.current = { tenant: tenantId!, fingerprint };
      return next;
    },
  });
  const { refetch } = access;
  useEffect(() => {
    const refresh = () => { void refetch(); };
    window.addEventListener("kodeistry-permissions-refresh", refresh);
    return () => window.removeEventListener("kodeistry-permissions-refresh", refresh);
  }, [refetch]);

  if (access.isError) return <div role="alert" className="rounded-xl border p-6">Unable to check repository access. <Button variant="outline" onClick={() => void access.refetch()}>Retry</Button></div>;
  if (!access.data) return <p role="status">Checking repository access...</p>;
  if (access.data.role === "MEMBER") {
    const restricted = pathname === "/team" || pathname.startsWith("/team/") ||
      (pathname.startsWith("/settings/") && !["/settings/profile", "/settings/security", "/settings/appearance", "/settings/assistant"].includes(pathname));
    if (restricted) return <p role="alert" className="rounded-xl border p-6">Only owners and admins can access this page.</p>;
    const dataPage = ["/dashboard", "/repositories", "/reviews", "/findings", "/analytics", "/reports"].some((route) => pathname === route || pathname.startsWith(route + "/"));
    if (dataPage && access.data.repository_ids.length === 0) return <p role="status" className="rounded-xl border bg-card p-8 text-center">No repositories assigned yet. Contact your admin.</p>;
    const repositoryMatch = pathname.match(/^\/repositories\/(\d+)/);
    if (repositoryMatch && !access.data.repository_ids.includes(Number(repositoryMatch[1]))) return <p role="alert" className="rounded-xl border p-6">Repository not found or access revoked.</p>;
  }
  return children;
}
