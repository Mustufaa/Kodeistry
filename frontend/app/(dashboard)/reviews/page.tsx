"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GitPullRequest, Search, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { TableSkeleton } from "@/components/dashboard/skeletons";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { getRepositories } from "@/lib/api/repositories";
import { getReviews } from "@/lib/api/reviews";
import { formatDate, shortSha } from "@/lib/format";

export default function ReviewsPage() {
  const { tenantId } = useCurrentTenant();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const reviewsQuery = useQuery({ queryKey: ["reviews", tenantId], queryFn: () => getReviews(tenantId!), enabled: !!tenantId });
  const repositoriesQuery = useQuery({ queryKey: ["repositories", tenantId], queryFn: () => getRepositories(tenantId!), enabled: !!tenantId });
  const repositories = useMemo(() => new Map((repositoriesQuery.data ?? []).map((repo) => [repo.id, repo.full_name])), [repositoriesQuery.data]);
  const reviews = useMemo(() => (reviewsQuery.data ?? []).filter((review) => {
    const matchesStatus = status === "all" || review.status === status;
    const haystack = `${repositories.get(review.repository_id) ?? ""} ${review.pull_request_number} ${review.commit_sha}`.toLowerCase();
    return matchesStatus && haystack.includes(search.trim().toLowerCase());
  }), [repositories, reviewsQuery.data, search, status]);

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="AI review runs" title="Reviews" description="Every pull request analyzed by Kodeistry, with status and finding counts." />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search repository, PR, or commit?" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <select aria-label="Filter reviews by status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring">
          <option value="all">All statuses</option><option value="COMPLETED">Completed</option><option value="RUNNING">Running</option><option value="PENDING">Pending</option><option value="FAILED">Failed</option>
        </select>
      </div>

      {reviewsQuery.isError ? <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4 text-sm">Couldn&apos;t load review history. <button className="ml-2 font-medium text-violet-600 dark:text-violet-400" onClick={() => reviewsQuery.refetch()}>Try again</button></div> : null}
      <Card className="overflow-hidden"><CardContent className="p-0">
        {reviewsQuery.isLoading ? <div className="p-5"><TableSkeleton /></div> : reviews.length === 0 ? <div className="p-5"><EmptyState icon={ShieldCheck} title={search || status !== "all" ? "No matching reviews" : "No code reviews yet"} description={search || status !== "all" ? "Adjust your search or status filter." : "Review runs will appear here when GitHub pull request events are processed."} /></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
            <thead className="border-b bg-muted/35 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Repository / PR</th><th className="px-4 py-3 font-medium">Commit</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Findings</th><th className="px-4 py-3 font-medium">Created</th><th className="px-5 py-3" /></tr></thead>
            <tbody className="divide-y">{reviews.map((review) => (
              <tr key={review.id} className="group transition-colors hover:bg-accent/45">
                <td className="px-5 py-4"><Link href={`/reviews/${review.id}`} className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg border bg-background"><GitPullRequest className="size-4 text-violet-600 dark:text-violet-400" /></div><div><p className="font-medium">{repositories.get(review.repository_id) ?? `Repository ${review.repository_id}`}</p><p className="mt-0.5 text-xs text-muted-foreground">Pull request #{review.pull_request_number}</p></div></Link></td>
                <td className="px-4 py-4 font-mono text-xs text-muted-foreground">{shortSha(review.commit_sha)}</td><td className="px-4 py-4"><StatusBadge value={review.status} /></td><td className="px-4 py-4"><span className="font-medium">{review.findings_count}</span></td><td className="px-4 py-4 text-xs text-muted-foreground">{formatDate(review.created_at)}</td><td className="px-5 py-4"><Link href={`/reviews/${review.id}`} aria-label={`Open review ${review.id}`} className="grid size-8 place-items-center rounded-md text-muted-foreground opacity-0 transition group-hover:bg-accent group-hover:text-foreground group-hover:opacity-100"><ArrowRight className="size-4" /></Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </CardContent></Card>
    </div>
  );
}
