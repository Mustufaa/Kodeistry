"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Clipboard, FileCode2, GitCommitHorizontal, GitPullRequest, ShieldAlert, Sparkles } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { FindingResolution } from "@/components/findings/finding-resolution";
import { TableSkeleton } from "@/components/dashboard/skeletons";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { getRepositories } from "@/lib/api/repositories";
import { getReview } from "@/lib/api/reviews";
import { toast } from "sonner";
import { formatDate, shortSha } from "@/lib/format";

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenantId } = useCurrentTenant();
  const [copied, setCopied] = useState("");
  const reviewQuery = useQuery({ queryKey: ["review", tenantId, id], queryFn: () => getReview(tenantId!, Number(id)), enabled: !!tenantId && !!id, refetchInterval: (query) => query.state.data?.findings?.some((finding) => finding.verification_status === "RECHECKING") ? 3000 : false });
  const repositoriesQuery = useQuery({ queryKey: ["repositories", tenantId], queryFn: () => getRepositories(tenantId!), enabled: !!tenantId });
  const review = reviewQuery.data;
  const repository = repositoriesQuery.data?.find((repo) => repo.id === review?.repository_id);
  const severityCounts = useMemo(() => {
    const result = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const finding of review?.findings ?? []) {
      if (finding.severity in result) result[finding.severity as keyof typeof result] += 1;
    }
    return result;
  }, [review?.findings]);

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1600);
  }

  if (reviewQuery.isLoading) return <TableSkeleton rows={7} />;
  if (reviewQuery.isError || !review) return <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-5 text-sm">Couldn&apos;t load this review. <Button asChild size="sm" variant="outline" className="ml-3"><Link href="/reviews">Back to reviews</Link></Button></div>;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={repository?.full_name ?? `Repository ${review.repository_id}`}
        title={`Pull request #${review.pull_request_number}`}
        description={`Review run #${review.id} ? ${formatDate(review.created_at)}`}
        actions={<><Button asChild variant="ghost"><Link href="/reviews"><ArrowLeft className="size-4" />Reviews</Link></Button>{repository?.html_url ? <Button asChild variant="outline"><a href={repository.html_url} target="_blank" rel="noreferrer"><GitPullRequest className="size-4" />Open repository</a></Button> : null}</>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="Review summary">
        <Card className="sm:col-span-2"><CardContent className="flex h-full items-center gap-4 p-5"><div className="grid size-10 place-items-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400"><Sparkles className="size-5" /></div><div><p className="text-xs text-muted-foreground">Review status</p><div className="mt-2"><StatusBadge value={review.status} /></div></div></CardContent></Card>
        {([
          ["Observed in review", review.findings_count, "text-foreground"],
          ["Critical", severityCounts.critical, "text-red-600 dark:text-red-400"],
          ["High", severityCounts.high, "text-orange-400"],
          ["Medium", severityCounts.medium, "text-amber-700 dark:text-amber-400"],
        ] as const).map(([label, value, tone]) => <Card key={label}><CardContent className="p-5"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p></CardContent></Card>)}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="border-b px-5 py-4"><CardTitle className="flex items-center gap-2"><ShieldAlert className="size-4 text-violet-600 dark:text-violet-400" />Review findings</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(review.findings ?? []).length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><div className="grid size-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Check className="size-5" /></div><h2 className="mt-4 text-sm font-semibold">No findings detected</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">Kodeistry completed this review without identifying actionable issues.</p></div>
            ) : (
              <div className="divide-y">{review.findings?.map((finding, index) => {
                const key = `${finding.filename}-${finding.line}-${index}`;
                return (
                  <article key={key} className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge value={finding.severity} /><StatusBadge value={finding.verification_status} /><StatusBadge value={finding.triage_status} /><span className="rounded-md border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{finding.category}</span></div>
                    <div className="mt-4 flex items-center gap-2 font-mono text-xs text-muted-foreground"><FileCode2 className="size-4" /><span className="break-all text-foreground">{finding.filename}</span><span>:</span><span>{finding.line}</span></div>
                    <p className="mt-4 text-sm leading-6 text-foreground/90">{finding.message}</p>
                    {finding.suggestion ? (
                      <div className="mt-5 overflow-hidden rounded-xl border bg-background">
                        <div className="flex items-center justify-between border-b px-4 py-2.5"><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Suggested fix</span><button type="button" onClick={() => copy(finding.suggestion!, key)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">{copied === key ? <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" /> : <Clipboard className="size-3.5" />}{copied === key ? "Copied" : "Copy"}</button></div>
                        <pre className="max-h-80 overflow-auto p-4 font-mono text-xs leading-6 text-foreground/85"><code>{finding.suggestion}</code></pre>
                      </div>
                    ) : null}
                    <FindingResolution finding={finding} />
                  </article>
                );
              })}</div>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-5">
          <Card><CardHeader className="border-b px-5 py-4"><CardTitle>Review metadata</CardTitle></CardHeader><CardContent className="space-y-5 p-5 text-sm">
            <div><p className="text-xs text-muted-foreground">Repository</p><p className="mt-1 break-all font-medium">{repository?.full_name ?? `Repository ${review.repository_id}`}</p></div>
            <div><p className="text-xs text-muted-foreground">Pull request</p><p className="mt-1 font-medium">#{review.pull_request_number}</p></div>
            <div><p className="text-xs text-muted-foreground">Commit</p><button type="button" onClick={() => copy(review.commit_sha, "commit")} className="mt-1 inline-flex items-center gap-2 font-mono text-xs hover:text-violet-600 dark:hover:text-violet-400"><GitCommitHorizontal className="size-4 text-muted-foreground" />{shortSha(review.commit_sha)}{copied === "commit" ? <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" /> : <Clipboard className="size-3.5 text-muted-foreground" />}</button></div>
            <div><p className="text-xs text-muted-foreground">Completed</p><p className="mt-1 text-xs">{formatDate(review.completed_at)}</p></div>
          </CardContent></Card>
        </aside>
      </div>
    </div>
  );
}
