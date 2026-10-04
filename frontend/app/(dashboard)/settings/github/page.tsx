"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Unplug } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { GitHubMark } from "@/components/icons/github-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { disconnectGithubInstallation, getGithubInstallations, getGithubTenantInstallStartUrl, syncGithubInstallation } from "@/lib/api/github";
import { formatDate } from "@/lib/format";

export default function GithubSettingsPage() {
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const installations = useQuery({ queryKey: ["github-installations", tenantId], queryFn: () => getGithubInstallations(tenantId!), enabled: !!tenantId });
  const sync = useMutation({ mutationFn: () => syncGithubInstallation(tenantId!), onSuccess: async (summary) => { setMessage(`${summary.total} repositories synchronized.`); await queryClient.invalidateQueries({ queryKey: ["github-installations", tenantId] }); await queryClient.invalidateQueries({ queryKey: ["repositories", tenantId] }); await queryClient.invalidateQueries({ queryKey: ["dashboard", tenantId] }); }, onError: () => setMessage("We couldn't synchronize repositories. Try again in a moment.") });
  const disconnect = useMutation({ mutationFn: (id: number) => disconnectGithubInstallation(tenantId!, id), onSuccess: async () => { setMessage("GitHub has been disconnected."); await queryClient.invalidateQueries({ queryKey: ["github-installations", tenantId] }); }, onError: () => setMessage("We couldn't disconnect GitHub. Try again in a moment.") });
  const connected = installations.data?.[0];

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <PageHeader eyebrow="Integration" title="GitHub" description="Manage the GitHub App connection that gives Kodeistry repository access." />
      {installations.isError ? <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4 text-sm">Couldn&apos;t check your GitHub connection. <button className="ml-2 font-medium text-violet-600 dark:text-violet-400" onClick={() => installations.refetch()}>Try again</button></div> : null}
      {installations.isLoading ? <Card><CardContent className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Checking connection?</CardContent></Card> : connected ? (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b px-5 py-4 sm:px-6"><CardTitle className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg border bg-background"><GitHubMark className="size-5" /></span>GitHub App</CardTitle><span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-3" />Connected</span></CardHeader>
          <CardContent className="p-5 sm:p-6">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-background p-4"><dt className="text-xs text-muted-foreground">Account</dt><dd className="mt-1.5 truncate text-sm font-medium">@{connected.account_login}</dd></div>
              <div className="rounded-xl border bg-background p-4"><dt className="text-xs text-muted-foreground">Repositories</dt><dd className="mt-1.5 text-sm font-medium">{connected.repository_count ?? 0}</dd></div>
              <div className="rounded-xl border bg-background p-4"><dt className="text-xs text-muted-foreground">Last synchronized</dt><dd className="mt-1.5 text-xs font-medium">{connected.last_synced_at ? formatDate(connected.last_synced_at) : "Not yet"}</dd></div>
            </dl>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              {connected.management_url ? <Button asChild variant="outline"><a href={connected.management_url} target="_blank" rel="noreferrer">Manage on GitHub<ExternalLink className="size-4" /></a></Button> : null}
              <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}><RefreshCw className={`size-4 ${sync.isPending ? "animate-spin" : ""}`} />{sync.isPending ? "Syncing" : "Sync repositories"}</Button>
              <Button variant="ghost" className="text-muted-foreground sm:ml-auto" onClick={() => { if (window.confirm(`Disconnect @${connected.account_login} from Kodeistry?`)) disconnect.mutate(connected.installation_id); }} disabled={disconnect.isPending}><Unplug className="size-4" />Disconnect</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="subtle-grid"><CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><div className="grid size-12 place-items-center rounded-xl border bg-card"><GitHubMark className="size-6" /></div><h2 className="mt-5 text-base font-semibold">Connect your repositories</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Install the Kodeistry GitHub App and choose the repositories you want reviewed.</p><Button className="mt-6" onClick={() => tenantId && window.location.assign(getGithubTenantInstallStartUrl(tenantId))} disabled={!tenantId}><GitHubMark className="size-4" />Install GitHub App</Button></CardContent></Card>
      )}
      {message ? <p role="status" className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
