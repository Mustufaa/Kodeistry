"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FolderGit2, GitBranch, Lock, RefreshCw, Search } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { TableSkeleton } from "@/components/dashboard/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { syncGithubInstallation } from "@/lib/api/github";
import { getRepositories } from "@/lib/api/repositories";

export default function RepositoriesPage() {
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const repositories = useQuery({ queryKey: ["repositories", tenantId], queryFn: () => getRepositories(tenantId!), enabled: !!tenantId });
  const sync = useMutation({
    mutationFn: () => syncGithubInstallation(tenantId!),
    onSuccess: async (summary) => {
      setMessage(`${summary.total} repositories synchronized.`);
      await queryClient.invalidateQueries({ queryKey: ["repositories", tenantId] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", tenantId] });
    },
    onError: () => setMessage("We couldn't synchronize repositories. Try again in a moment."),
  });
  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return repositories.data ?? [];
    return (repositories.data ?? []).filter((repo) => `${repo.full_name} ${repo.default_branch} ${repo.language ?? ""}`.toLowerCase().includes(normalized));
  }, [repositories.data, search]);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Source control"
        title="Repositories"
        description="Repositories available through your Kodeistry GitHub App installation."
        actions={<Button variant="outline" onClick={() => sync.mutate()} disabled={!tenantId || sync.isPending}><RefreshCw className={`size-4 ${sync.isPending ? "animate-spin" : ""}`} />{sync.isPending ? "Syncing" : "Sync repositories"}</Button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search repositories?" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">{filtered.length} {filtered.length === 1 ? "repository" : "repositories"}</p>
      </div>

      {message ? <p role="status" className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">{message}</p> : null}
      {repositories.isError ? (
        <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4 text-sm">Couldn&apos;t load repositories. <button className="ml-2 font-medium text-violet-600 dark:text-violet-400" onClick={() => repositories.refetch()}>Try again</button></div>
      ) : null}

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {repositories.isLoading ? <div className="p-5"><TableSkeleton /></div> : filtered.length === 0 ? (
            <div className="p-5"><EmptyState icon={FolderGit2} title={search ? "No matching repositories" : "No repositories connected"} description={search ? "Try a different repository name, branch, or language." : "Choose repositories in your GitHub App settings, then synchronize again."} action={!search ? <Button asChild size="sm"><Link href="/settings/integrations/github">Open GitHub connection</Link></Button> : undefined} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b bg-muted/35 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr><th className="px-5 py-3 font-medium">Repository</th><th className="px-4 py-3 font-medium">Visibility</th><th className="px-4 py-3 font-medium">Default branch</th><th className="px-4 py-3 font-medium">Status</th><th className="px-5 py-3" /></tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((repo) => (
                    <tr key={repo.id} className="group transition-colors hover:bg-accent/45">
                      <td className="px-5 py-4">
                        <Link href={`/repositories/${repo.id}`} className="flex items-center gap-3">
                          <div className="grid size-9 place-items-center rounded-lg border bg-background"><FolderGit2 className="size-4 text-violet-600 dark:text-violet-400" /></div>
                          <div className="min-w-0"><p className="font-medium">{repo.full_name}</p><p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">{repo.description || repo.language || "GitHub repository"}</p></div>
                        </Link>
                      </td>
                      <td className="px-4 py-4"><span className="inline-flex items-center gap-1.5 text-xs"><Lock className="size-3.5 text-muted-foreground" />{repo.private ? "Private" : "Public"}</span></td>
                      <td className="px-4 py-4"><span className="inline-flex items-center gap-1.5 font-mono text-xs"><GitBranch className="size-3.5 text-muted-foreground" />{repo.default_branch}</span></td>
                      <td className="px-4 py-4"><span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-400" />Connected</span></td>
                      <td className="px-5 py-4 text-right">{repo.html_url ? <a href={repo.html_url} target="_blank" rel="noreferrer" className="inline-flex rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Open ${repo.full_name} on GitHub`}><ExternalLink className="size-4" /></a> : <Button asChild size="sm" variant="ghost"><Link href={`/repositories/${repo.id}`}>Open</Link></Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
