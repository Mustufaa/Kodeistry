"use client";

import { useState } from "react";
import { Check, ChevronDown, Clipboard, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buildFixPrompt, historicalApproach, historicalWhy, verificationFor } from "@/lib/fix-prompt";
import type { AnalyticsFinding } from "@/types/analytics";

async function copyPrompt(finding: AnalyticsFinding) {
  await navigator.clipboard.writeText(buildFixPrompt(finding));
  toast.success("Prompt copied");
}

export function FixPromptDialog({ finding, open, onClose }: { finding: AnalyticsFinding; open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="fix-prompt-title">
    <button aria-label="Close dialog" className="absolute inset-0 bg-black/70" onClick={onClose} />
    <div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 id="fix-prompt-title" className="text-base font-semibold">Fix this issue</h2><p className="mt-1 text-xs text-muted-foreground">Review the context before giving this prompt to a coding agent.</p></div><Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X className="size-4" /></Button></div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 font-mono text-[13px] leading-6">{buildFixPrompt(finding)}</pre>
      <div className="flex justify-end border-t p-4"><Button onClick={() => copyPrompt(finding)}><Clipboard className="size-4" />Copy Prompt</Button></div>
    </div>
  </div>;
}

export function FindingResolution({ finding, onResolve, onDismiss, compact = false }: { finding: AnalyticsFinding; onResolve?: () => void; onDismiss?: () => void; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  return <div className={compact ? "" : "mt-5"}>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setExpanded((value) => !value)}><ChevronDown className={`size-4 transition ${expanded ? "rotate-180" : ""}`} />How to Fix</Button>
      <Button size="sm" variant="outline" onClick={() => copyPrompt(finding)}><Clipboard className="size-4" />Copy Fix Prompt</Button>
      <Button size="sm" variant="ghost" onClick={() => setPromptOpen(true)}>View Prompt</Button>
      {finding.github_url ? <Button asChild size="sm" variant="ghost"><a href={finding.github_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />Open on GitHub</a></Button> : null}
      {onResolve && finding.status !== "resolved" ? <Button size="sm" variant="ghost" onClick={onResolve}><Check className="size-4" />Resolve</Button> : null}
      {onDismiss && finding.status !== "dismissed" ? <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button> : null}
    </div>
    {expanded ? <div className="mt-4 grid gap-5 rounded-lg border bg-background p-5 text-sm leading-6">
      <section><h3 className="font-medium">Problem</h3><p className="mt-1 text-muted-foreground">{finding.message}</p></section>
      <section><h3 className="font-medium">Why it matters</h3><p className="mt-1 text-muted-foreground">{finding.why_it_matters || historicalWhy(finding)}</p></section>
      <section><h3 className="font-medium">Recommended approach</h3><p className="mt-1 text-muted-foreground">{finding.recommended_approach || historicalApproach(finding)}</p></section>
      {finding.suggestion ? <section><h3 className="font-medium">Suggested Fix</h3><pre className="mt-2 max-h-72 overflow-auto rounded-md border bg-card p-4 font-mono text-[13px] leading-6"><code>{finding.suggestion}</code></pre></section> : null}
      <section><h3 className="font-medium">Verify the fix</h3><p className="mt-1 text-muted-foreground">{finding.verification_steps || verificationFor(finding)}</p></section>
    </div> : null}
    <FixPromptDialog finding={finding} open={promptOpen} onClose={() => setPromptOpen(false)} />
  </div>;
}
