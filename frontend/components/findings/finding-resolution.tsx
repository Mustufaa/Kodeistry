"use client";

import { useState } from "react";
import { DialogFrame } from "@/components/ui/dialog-frame";
import { Clipboard, ExternalLink, RefreshCw, Sparkles, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { generateFixAssistant, getFixAssistant, getTracking, recheckFinding, triageFinding } from "@/lib/api/fix-workflow";
import { formatDate, shortSha } from "@/lib/format";
import type { AnalyticsFinding } from "@/types/analytics";
import type { ReviewFinding } from "@/types/review";
import type { TriageStatus } from "@/types/fix-workflow";

type Finding = AnalyticsFinding | ReviewFinding;

export function FindingResolution({ finding, compact = false }: { finding: Finding; compact?: boolean }) {
  const { tenantId, canManage } = useCurrentTenant();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [triage, setTriage] = useState<TriageStatus | null>(null);
  const [reason, setReason] = useState("");
  const suggestionQuery = useQuery({
    queryKey: ["fix-assistant", tenantId, finding.id],
    queryFn: () => getFixAssistant(tenantId!, finding.id),
    enabled: open && !!tenantId,
    refetchInterval: (query) => ["QUEUED", "RUNNING"].includes(query.state.data?.state ?? "") ? 2500 : false,
  });
  const trackingQuery = useQuery({
    queryKey: ["tracking", tenantId, finding.id],
    queryFn: () => getTracking(tenantId!, finding.id),
    enabled: open && !!tenantId,
    refetchInterval: (query) => query.state.data?.verification_status === "RECHECKING" ? 2500 : false,
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tracking", tenantId, finding.id] });
    queryClient.invalidateQueries({ queryKey: ["findings", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["review", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["analytics", tenantId] });
  };
  const generate = useMutation({
    mutationFn: () => generateFixAssistant(tenantId!, finding.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fix-assistant", tenantId, finding.id] }),
    onError: (error) => toast.error(error.message),
  });
  const recheck = useMutation({
    mutationFn: () => recheckFinding(tenantId!, finding.id),
    onSuccess: () => { invalidate(); toast.success("Recheck queued"); },
    onError: (error) => toast.error(error.message),
  });
  const updateTriage = useMutation({
    mutationFn: () => triageFinding(tenantId!, finding.id, triage!, reason.trim()),
    onSuccess: () => { invalidate(); setTriage(null); setReason(""); toast.success("Triage updated"); },
    onError: (error) => toast.error(error.message),
  });

  async function copyPrompt() {
    if (!suggestionQuery.data?.prompt) return;
    try { await navigator.clipboard.writeText(suggestionQuery.data.prompt); toast.success("Fix prompt copied"); }
    catch { toast.error("Could not copy prompt"); }
  }

  const suggestion = suggestionQuery.data?.suggestion;
  const tracking = trackingQuery.data;
  const verification = tracking?.verification_status ?? finding.verification_status ?? "OPEN";
  const triageStatus = tracking?.triage_status ?? finding.triage_status ?? "ACTIVE";

  return <div className={compact ? "" : "mt-5"}>
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge value={verification} />
      {triageStatus !== "ACTIVE" ? <StatusBadge value={triageStatus} /> : null}
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Sparkles className="size-4" />Fix Assistant & tracking</Button>
    </div>
    {open ? <DialogFrame label={`Finding #${finding.id}`} onClose={() => setOpen(false)} className="inset-y-0 right-0 ml-auto mr-0 h-full w-full max-w-2xl overflow-hidden p-0">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b p-5">
          <div><h2 id="finding-dialog-title" className="text-lg font-semibold">Finding #{finding.id}</h2><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{finding.filename}:{finding.line} · {shortSha(finding.commit_sha)}</p></div>
          <Button size="icon" variant="ghost" aria-label="Close" onClick={() => setOpen(false)}><X className="size-4" /></Button>
        </header>
        <div className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 text-sm [overflow-wrap:anywhere]">
          <section className="space-y-2"><div className="flex flex-wrap gap-2"><StatusBadge value={finding.severity} /><StatusBadge value={verification} /><StatusBadge value={triageStatus} /></div><p className="leading-6">{finding.message}</p><p className="text-xs text-muted-foreground">Historical review finding at {finding.commit_sha}. Current verification is shown below.</p></section>
          <section className="space-y-3 border-t pt-5">
            <h3 className="font-semibold">Fix Assistant</h3>
            {suggestionQuery.isLoading ? <p role="status">Loading suggestion…</p> : suggestionQuery.isError ? <div role="alert">Could not load the suggestion. <Button size="sm" variant="outline" onClick={() => suggestionQuery.refetch()}>Retry</Button></div> : null}
            {suggestionQuery.data ? <p className="font-mono text-xs text-muted-foreground">Assistant source commit: {shortSha(suggestionQuery.data.source_commit)}</p> : null}
            {suggestionQuery.data?.stale ? <p className="rounded-md border border-amber-500/40 p-3 text-amber-700 dark:text-amber-300">This suggestion refers to an older commit. Recheck the current PR before applying it.</p> : null}
            {suggestionQuery.data?.state === "EMPTY" || suggestionQuery.data?.state === "FAILED" ? <div className="space-y-2"><p className="text-muted-foreground">{suggestionQuery.data.state === "FAILED" ? suggestionQuery.data.error_code === "SOURCE_UNAVAILABLE" ? "Source at the analyzed commit is unavailable or repository access was denied." : "Generation failed. You can retry." : "Generate a suggestion from the analyzed commit."}</p>{canManage ? <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>{generate.isPending ? "Queueing…" : suggestionQuery.data.state === "FAILED" ? "Retry generation" : "Generate suggestion"}</Button> : null}</div> : null}
            {["QUEUED", "RUNNING"].includes(suggestionQuery.data?.state ?? "") ? <p role="status">Generating a source-bound suggestion…</p> : null}
            {suggestion ? <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Generated suggestion requiring code review. No tests were executed by Kodeistry.</p>
              {([["Explanation", suggestion.explanation], ["When it occurs", suggestion.conditions], ["Practical impact", suggestion.impact], ["Suggested fix", suggestion.suggested_fix], ["Regression test suggestion", suggestion.regression_test]] as const).filter(([, value]) => !!value).map(([label, value]) => <div key={label}><h4 className="font-medium">{label}</h4><p className="mt-1 whitespace-pre-wrap leading-6 text-muted-foreground">{value}</p></div>)}
              <div><h4 className="font-medium">Reviewable unified diff</h4>{suggestion.unified_diff ? <pre className="mt-2 max-h-80 overflow-auto rounded-md border bg-background p-3 font-mono text-xs">{suggestion.unified_diff}</pre> : <p className="mt-1 text-muted-foreground">No safe patch could be derived from the available context.</p>}</div>
            </div> : null}
            {suggestionQuery.data?.prompt ? <Button size="sm" variant="outline" onClick={copyPrompt}><Clipboard className="size-4" />Copy fix prompt</Button> : null}
          </section>
          <section className="space-y-3 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Fix tracking</h3>{canManage ? <Button size="sm" variant="outline" disabled={recheck.isPending || triageStatus !== "ACTIVE"} onClick={() => recheck.mutate()}><RefreshCw className="size-4" />Recheck now</Button> : null}</div>
            {trackingQuery.isLoading ? <p role="status">Loading tracking…</p> : trackingQuery.isError ? <div role="alert">Could not load tracking. <Button size="sm" variant="outline" onClick={() => trackingQuery.refetch()}>Retry</Button></div> : null}
            {tracking ? <div className="space-y-2"><p><StatusBadge value={tracking.verification_status} /> {tracking.stale ? <span className="text-amber-700 dark:text-amber-300">Pending current commit check</span> : null}</p><p className="text-muted-foreground">{tracking.verification_reason || "No verification completed yet."}</p><p className="font-mono text-xs text-muted-foreground">Last checked: {tracking.checked_commit_sha ? shortSha(tracking.checked_commit_sha) : "—"} · {tracking.checked_at ? formatDate(tracking.checked_at) : "Never"}</p></div> : null}
            {tracking?.history.length ? <div><h4 className="font-medium">Verification history</h4><ol className="mt-2 space-y-2">{tracking.history.map((item) => <li key={item.id} className="rounded-md border p-3"><div className="flex flex-wrap items-center gap-2"><StatusBadge value={item.status} /><span className="font-mono text-xs">{shortSha(item.checked_commit_sha)}</span><span className="text-xs text-muted-foreground">{formatDate(item.checked_at)}</span></div><p className="mt-2 text-muted-foreground">{item.reason}</p>{item.evidence?.path ? <p className="mt-1 font-mono text-xs">{item.evidence.path}{item.evidence.line ? `:${item.evidence.line}` : ""}</p> : null}{item.evidence?.assessment ? <p className="mt-1 text-xs text-muted-foreground">{item.evidence.assessment}</p> : null}</li>)}</ol></div> : <p className="text-muted-foreground">No completed rechecks yet.</p>}
          </section>
          <section className="space-y-3 border-t pt-5">
            <h3 className="font-semibold">Triage</h3><p className="text-muted-foreground">Triage is separate from verification. Dismissal does not count as a verified fix.</p>
            <div className="flex flex-wrap gap-2">{canManage && (["ACTIVE", "DISMISSED", "FALSE_POSITIVE"] as const).map((value) => <Button key={value} size="sm" variant={triageStatus === value ? "default" : "outline"} onClick={() => { setTriage(value); setReason(""); }}>{value.replace("_", " ")}</Button>)}</div>
            {triage ? <div className="space-y-2"><label className="block font-medium" htmlFor="triage-reason">Reason for {triage.toLowerCase().replace("_", " ")}</label><textarea id="triage-reason" className="min-h-20 w-full rounded-md border bg-background p-2" value={reason} maxLength={2000} onChange={(event) => setReason(event.target.value)} /><Button size="sm" disabled={reason.trim().length < 3 || updateTriage.isPending} onClick={() => updateTriage.mutate()}>Save triage</Button></div> : null}
            {tracking?.triage_reason ? <p className="text-xs text-muted-foreground">Recorded reason: {tracking.triage_reason}</p> : null}
          </section>
          {finding.github_url ? <a className="inline-flex items-center gap-2 text-sm text-primary underline" href={finding.github_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Open PR on GitHub</a> : null}
        </div>
      </div>
    </DialogFrame> : null}
  </div>;
}
