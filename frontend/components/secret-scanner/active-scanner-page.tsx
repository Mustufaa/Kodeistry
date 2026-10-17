"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Clock3, FolderGit2, Loader2, ScanSearch, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  cancelSecretScan, getSecretBranches, getSecretFindings, getSecretRepositories,
  getSecretScan, getSecretScans, startSecretScan, updateSecretFinding,
} from "@/lib/api/secret-scans";
import { ApiError } from "@/lib/api/client";
import type { SecretFinding, SecretScan, SecretScanScope } from "@/types/secret-scan";

const active = (run: SecretScan) => run.status === "QUEUED" || run.status === "RUNNING";
const dateText = (value: string | null) => value ? new Date(value).toLocaleString() : "—";
const scopeText = (scope: SecretScanScope) => scope === "CURRENT_FILES" ? "Current files" : "Git history";

export default function SecretScannerPage() {
  const queryClient = useQueryClient();
  const [repositorySelection, setRepositorySelection] = useState<number | null>(null);
  const [branchSelection, setBranchSelection] = useState("");
  const [scope, setScope] = useState<SecretScanScope>("CURRENT_FILES");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [findingOffset, setFindingOffset] = useState(0);
  const [secretType, setSecretType] = useState("");
  const [severity, setSeverity] = useState("");
  const [disposition, setDisposition] = useState("");
  const [file, setFile] = useState("");
  const [dismissalReasons, setDismissalReasons] = useState<Record<number, string>>({});
  const [actionError, setActionError] = useState("");

  const repositories = useQuery({ queryKey: ["secret-repositories"], queryFn: getSecretRepositories, retry: false });
  const repositoryId = repositorySelection ?? repositories.data?.[0]?.id ?? null;
  const selectedRepository = repositories.data?.find((item) => item.id === repositoryId);
  const branch = branchSelection || selectedRepository?.default_branch || "";
  const branches = useQuery({
    queryKey: ["secret-branches", repositoryId],
    queryFn: () => getSecretBranches(repositoryId!),
    enabled: repositoryId !== null,
    retry: false,
  });
  const history = useQuery({
    queryKey: ["secret-scans", historyOffset],
    queryFn: () => getSecretScans(historyOffset),
    refetchInterval: (query) => query.state.data?.some(active) ? 5000 : false,
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["secret-scan", selectedRunId],
    queryFn: () => getSecretScan(selectedRunId!),
    enabled: selectedRunId !== null,
    refetchInterval: (query) => query.state.data && active(query.state.data) ? 2500 : false,
    retry: false,
  });
  const findings = useQuery({
    queryKey: ["secret-findings", selectedRunId, findingOffset, secretType, severity, disposition, file],
    queryFn: () => getSecretFindings(selectedRunId!, { offset: findingOffset, secretType, severity, disposition, file }),
    enabled: selectedRunId !== null && detail.data?.status === "COMPLETED",
    retry: false,
  });
  const scan = useMutation({
    mutationFn: startSecretScan,
    onSuccess: async (run) => {
      setActionError("");
      setSelectedRunId(run.id);
      setHistoryOffset(0);
      await queryClient.invalidateQueries({ queryKey: ["secret-scans"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Could not start scan."),
  });
  const cancel = useMutation({
    mutationFn: cancelSecretScan,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["secret-scan"] });
      await queryClient.invalidateQueries({ queryKey: ["secret-scans"] });
    },
    onError: () => setActionError("Could not cancel the scan."),
  });
  const updateFinding = useMutation({
    mutationFn: ({ id, next, reason }: { id: number; next: "OPEN" | "DISMISSED"; reason?: string }) =>
      updateSecretFinding(id, next, reason),
    onSuccess: async () => {
      setActionError("");
      await queryClient.invalidateQueries({ queryKey: ["secret-findings"] });
    },
    onError: () => setActionError("Could not update the finding. Check repository access and try again."),
  });

  const equivalentActive = history.data?.some((run) =>
    active(run) && run.repository_id === repositoryId && run.branch === branch && run.scope === scope
  ) ?? false;
  const selected = detail.data;
  const accessRevoked = (detail.error instanceof ApiError && detail.error.status === 403)
    || (branches.error instanceof ApiError && branches.error.status === 403);
  const resetFilters = () => setFindingOffset(0);

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Security" title="Secret Scanner" description="Scan a connected repository only when you choose to. Results stay inside Kodeistry and potential credentials are always masked." />

      <Card><CardContent className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label htmlFor="secret-repository" className="text-sm font-medium">Repository</label>
            <select id="secret-repository" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={repositoryId ?? ""} onChange={(event) => {
              const repo = repositories.data?.find((item) => item.id === Number(event.target.value));
              setRepositorySelection(repo?.id ?? null);
              setBranchSelection(repo?.default_branch ?? "");
            }} disabled={repositories.isLoading || !repositories.data?.length}>
              {(repositories.data ?? []).map((repo) => <option key={repo.id} value={repo.id}>{repo.full_name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="secret-branch" className="text-sm font-medium">Branch</label>
            <select id="secret-branch" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={branch} onChange={(event) => setBranchSelection(event.target.value)} disabled={branches.isLoading || !branches.data?.length}>
              {(branches.data ?? []).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="secret-scope" className="text-sm font-medium">Scope</label>
            <select id="secret-scope" className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={scope} onChange={(event) => setScope(event.target.value as SecretScanScope)}>
              <option value="CURRENT_FILES">Current files</option>
              <option value="GIT_HISTORY">Git history</option>
            </select>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {scope === "GIT_HISTORY"
            ? "Git history covers commits reachable from the selected branch, including deleted secrets in older commits. It does not cover other branches or public sources."
            : "Current files checks the selected branch's latest tracked files. A removed secret may still exist in Git history."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => repositoryId && scan.mutate({ repository_id: repositoryId, branch, scope })} disabled={!repositoryId || !branch || !branches.data?.some((item) => item.name === branch) || scan.isPending || equivalentActive}>
            <ScanSearch className="size-4" />{scan.isPending ? "Starting..." : "Start Scan"}
          </Button>
          {equivalentActive && <span className="text-xs text-muted-foreground">An equivalent scan is already queued or running.</span>}
        </div>
        <p className="text-xs text-muted-foreground">Large files, Git LFS objects, submodules, and archives may be outside coverage. Kodeistry reports limits with each run.</p>
        {repositories.isLoading && <p className="text-sm text-muted-foreground">Loading connected repositories...</p>}
        {repositories.isError && <p role="alert" className="text-sm text-red-500">Could not load connected repositories. <button className="underline" onClick={() => repositories.refetch()}>Retry</button></p>}
        {branches.isError && <p role="alert" className="text-sm text-red-500">Could not load branches. <button className="underline" onClick={() => branches.refetch()}>Retry</button></p>}
        {repositories.data?.length === 0 && <EmptyState icon={FolderGit2} title="No connected repositories" description="Connect and synchronize a GitHub repository before scanning." action={<Button asChild size="sm"><Link href="/settings/integrations/github">Open GitHub settings</Link></Button>} />}
        {actionError && <p role="alert" className="text-sm text-red-500">{actionError}</p>}
      </CardContent></Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]">
        <Card><CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Scan history</h2><Clock3 className="size-4 text-muted-foreground" /></div>
          {history.isLoading && <p className="text-sm text-muted-foreground">Loading scans...</p>}
          {history.isError && <p role="alert" className="text-sm text-red-500">Could not load scan history. <button className="underline" onClick={() => history.refetch()}>Retry</button></p>}
          {history.data?.length === 0 && <p className="text-sm text-muted-foreground">No scans yet. Choose a repository and click Start Scan.</p>}
          <div className="space-y-2">
            {(history.data ?? []).map((run) => <button key={run.id} type="button" onClick={() => { setSelectedRunId(run.id); setFindingOffset(0); }} className={"w-full rounded-lg border p-3 text-left text-sm hover:bg-accent " + (selectedRunId === run.id ? "border-violet-500" : "")}>
              <div className="flex items-center justify-between gap-2"><span className="font-medium">Scan #{run.id}</span><span className="text-xs">{run.status}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{scopeText(run.scope)} · {run.branch}</p>
              <p className="mt-1 text-xs text-muted-foreground">{dateText(run.created_at)}</p>
            </button>)}
          </div>
          <div className="flex justify-between">
            <Button size="sm" variant="outline" disabled={historyOffset === 0} onClick={() => setHistoryOffset(Math.max(0, historyOffset - 20))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={(history.data?.length ?? 0) < 20} onClick={() => setHistoryOffset(historyOffset + 20)}>Next</Button>
          </div>
        </CardContent></Card>

        <Card><CardContent className="space-y-5 p-5 sm:p-6">
          {!selectedRunId && <EmptyState icon={ShieldAlert} title="Select a scan" description="Choose a run from scan history to see progress and masked findings." />}
          {detail.isLoading && <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Loading scan...</p>}
          {accessRevoked && <p role="alert" className="text-sm text-red-500">Access to this connected repository has been revoked. Scan details are unavailable.</p>}
          {detail.isError && !accessRevoked && <p role="alert" className="text-sm text-red-500">Could not load scan details. <button className="underline" onClick={() => detail.refetch()}>Retry</button></p>}
          {selected && <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-semibold">Scan #{selected.id}</h2><p className="text-sm text-muted-foreground">{scopeText(selected.scope)} · {selected.branch}</p></div>
              <div className="flex gap-2">
                {active(selected) && <Button size="sm" variant="outline" disabled={cancel.isPending || selected.cancel_requested} onClick={() => cancel.mutate(selected.id)}>{selected.cancel_requested ? "Cancelling..." : "Cancel"}</Button>}
                {!active(selected) && <Button size="sm" variant="outline" disabled={scan.isPending} onClick={() => scan.mutate({ repository_id: selected.repository_id, branch: selected.branch, scope: selected.scope })}>Rescan</Button>}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/25 p-4 text-sm">
              <div className="flex justify-between"><span>Status: <strong>{selected.status}</strong></span><span>{selected.stage}</span></div>
              {active(selected) && <div role="progressbar" aria-label="Scan in progress" className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-pulse rounded-full bg-violet-500" /></div>}
              {selected.status === "FAILED" && <p role="alert" className="mt-2 text-red-500">Scan failed ({selected.error_code ?? "unknown error"}). You can start a new scan.</p>}
              {selected.status === "CANCELLED" && <p className="mt-2 text-muted-foreground">This scan was cancelled. No findings were changed.</p>}
            </div>
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Resolved commit</dt><dd className="break-all font-mono">{selected.resolved_commit_sha ?? "Pending"}</dd></div>
              <div><dt className="text-muted-foreground">Scanner</dt><dd>Gitleaks {selected.scanner_version}</dd></div>
              <div><dt className="text-muted-foreground">Created</dt><dd>{dateText(selected.created_at)}</dd></div>
              <div><dt className="text-muted-foreground">Completed</dt><dd>{dateText(selected.completed_at)}</dd></div>
              <div><dt className="text-muted-foreground">Files / commits</dt><dd>{selected.files_scanned ?? "—"} / {selected.commits_scanned ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Potential findings</dt><dd>{selected.status === "COMPLETED" ? selected.findings_count : "Pending"}</dd></div>
            </dl>
            {selected.coverage_note && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mr-1 inline size-3.5" />{selected.coverage_note}</p>}
            {selected.status === "COMPLETED" && <>
              <div className="border-t pt-5"><h3 className="font-semibold">Potential secrets</h3><p className="mt-1 text-xs text-muted-foreground">Validity: Not checked. A matching format does not prove a credential is active.</p></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input aria-label="Filter by secret type" placeholder="Secret type" value={secretType} onChange={(event) => { setSecretType(event.target.value); resetFilters(); }} />
                <Input aria-label="Filter by file" placeholder="File path" value={file} onChange={(event) => { setFile(event.target.value); resetFilters(); }} />
                <select aria-label="Filter by severity" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={severity} onChange={(event) => { setSeverity(event.target.value); resetFilters(); }}><option value="">All severities</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option></select>
                <select aria-label="Filter by disposition" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={disposition} onChange={(event) => { setDisposition(event.target.value); resetFilters(); }}><option value="">All dispositions</option><option value="OPEN">Open</option><option value="DISMISSED">Dismissed</option><option value="REMOVED_FROM_SCANNED_SCOPE">Removed from scanned scope</option></select>
              </div>
              {findings.isLoading && <p className="text-sm text-muted-foreground">Loading masked findings...</p>}
              {findings.isError && <p role="alert" className="text-sm text-red-500">Could not load findings. <button className="underline" onClick={() => findings.refetch()}>Retry</button></p>}
              {findings.data?.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No potential secrets detected in this scan&apos;s scope. This does not guarantee the repository contains no secrets.</p>}
              <div className="space-y-3">{(findings.data ?? []).map((item: SecretFinding, index) => <div key={item.id + "-" + index} className="space-y-3 rounded-lg border p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.secret_type}</strong><span className="text-xs">{item.severity} · {item.confidence} confidence · {item.disposition}</span></div>
                <p className="break-all font-mono text-xs">{item.file_path}:{item.line} · {item.commit_sha.slice(0, 12)}</p>
                <p className="text-xs text-muted-foreground">Rule {item.rule_id} · {item.branch} · Preview {item.preview} · Validity: Not checked</p>
                <p className="text-xs text-muted-foreground">First detected {dateText(item.first_detected_at)} · Last seen {dateText(item.last_seen_at)}</p>
                <p className="text-xs text-muted-foreground">Remediation: revoke or rotate the credential, update dependent services, remove it from tracked code, consider history cleanup, then rescan manually.</p>
                {item.disposition === "OPEN" && <div className="flex flex-wrap gap-2">
                  <select aria-label={"Dismissal reason for finding " + item.id} className="h-9 rounded-lg border border-input bg-background px-2 text-xs" value={dismissalReasons[item.id] ?? ""} onChange={(event) => setDismissalReasons({ ...dismissalReasons, [item.id]: event.target.value })}>
                    <option value="">Choose a reason</option><option value="EXAMPLE_VALUE">Example value</option><option value="TEST_CREDENTIAL">Test credential</option><option value="FALSE_POSITIVE">False positive</option>
                  </select>
                  <Button size="sm" variant="outline" disabled={!dismissalReasons[item.id] || updateFinding.isPending} onClick={() => updateFinding.mutate({ id: item.id, next: "DISMISSED", reason: dismissalReasons[item.id] })}>Dismiss</Button>
                </div>}
                {item.disposition === "DISMISSED" && <Button size="sm" variant="outline" disabled={updateFinding.isPending} onClick={() => updateFinding.mutate({ id: item.id, next: "OPEN" })}>Restore finding</Button>}
              </div>)}</div>
              <div className="flex justify-between"><Button size="sm" variant="outline" disabled={findingOffset === 0} onClick={() => setFindingOffset(Math.max(0, findingOffset - 20))}>Previous</Button><Button size="sm" variant="outline" disabled={(findings.data?.length ?? 0) < 20} onClick={() => setFindingOffset(findingOffset + 20)}>Next</Button></div>
            </>}
          </div>}
        </CardContent></Card>
      </div>

      <Card><CardContent className="space-y-3 p-5 text-sm sm:p-6">
        <h2 className="font-semibold">If a credential may be exposed</h2>
        <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
          <li>Revoke or rotate it. Deleting it from code does not revoke it.</li>
          <li>Update services that depend on it.</li>
          <li>Remove it from tracked code and use environment variables or a secret manager.</li>
          <li>Consider Git history cleanup where appropriate; current files and history are different scopes.</li>
          <li>Click Rescan after remediation. Scanning never changes your repository.</li>
        </ol>
        <p className="text-xs text-muted-foreground">Kodeistry never checks whether a discovered credential is valid and does not post these findings to GitHub.</p>
        <Link href="/repositories" className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline dark:text-violet-400">Connected repositories <ArrowRight className="size-3" /></Link>
      </CardContent></Card>
    </div>
  );
}
