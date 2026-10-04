"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, ExternalLink, MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";

import { ReportFilters, TimeframePicker } from "@/components/analytics/analytics-filters";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { TableSkeleton } from "@/components/dashboard/skeletons";
import { FindingResolution } from "@/components/findings/finding-resolution";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { downloadFindingsCsv, getAnalytics, getFindings, updateFindingStatus } from "@/lib/api/analytics";
import { getRepositories } from "@/lib/api/repositories";
import { formatDate } from "@/lib/format";
import type { AnalyticsFilters, AnalyticsFinding, FindingStatus } from "@/types/analytics";

export default function FindingsPage() {
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AnalyticsFilters>({ timeframe: "30d" });
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const findingsQuery = useQuery({ queryKey: ["findings", tenantId, filters], queryFn: () => getFindings(tenantId!, filters), enabled: !!tenantId && (filters.timeframe !== "custom" || !!filters.start_date && !!filters.end_date) });
  const analyticsQuery = useQuery({ queryKey: ["analytics", tenantId, filters], queryFn: () => getAnalytics(tenantId!, filters), enabled: !!tenantId && (filters.timeframe !== "custom" || !!filters.start_date && !!filters.end_date) });
  const repositories = useQuery({ queryKey: ["repositories", tenantId], queryFn: () => getRepositories(tenantId!), enabled: !!tenantId });
  const mutation = useMutation({ mutationFn: ({ id, status }: { id: number; status: FindingStatus }) => updateFindingStatus(tenantId!, id, status), onSuccess: (_, variables) => { queryClient.invalidateQueries({ queryKey: ["findings", tenantId] }); queryClient.invalidateQueries({ queryKey: ["analytics", tenantId] }); queryClient.invalidateQueries({ queryKey: ["dashboard", tenantId] }); toast.success(variables.status === "resolved" ? "Finding resolved" : "Finding dismissed"); }, onError: () => toast.error("Could not update the finding") });
  const findings = useMemo(() => (findingsQuery.data ?? []).filter((finding) => `${finding.message} ${finding.repository_name} ${finding.filename} ${finding.category}`.toLowerCase().includes(search.trim().toLowerCase())), [findingsQuery.data, search]);
  const summary = analyticsQuery.data?.summary;
  const metrics = [["Total", summary?.findings], ["Critical", summary?.critical], ["High", summary?.high], ["Open", summary?.open], ["Resolved", summary?.resolved]];
  async function exportCsv() { if (!tenantId) return; try { await downloadFindingsCsv(tenantId, filters); toast.success("Findings exported"); } catch { toast.error("Could not export findings"); } }
  function setStatus(finding: AnalyticsFinding, status: FindingStatus) { mutation.mutate({ id: finding.id, status }); }

  return <div className="space-y-6">
    <PageHeader title="Findings" description="Investigate, fix, and track issues detected across reviewed pull requests." actions={<Button onClick={exportCsv} disabled={!findingsQuery.data}><Download className="size-4" />Export CSV</Button>} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold tracking-tight ${label === "Critical" && value ? "text-red-600 dark:text-red-400" : ""}`}>{value ?? 0}</p></CardContent></Card>)}</section>
    <div className="space-y-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><TimeframePicker value={filters.timeframe} onChange={(timeframe) => setFilters({ ...filters, timeframe })} /><ReportFilters filters={filters} repositories={repositories.data ?? []} onChange={setFilters} /></div><div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search issue, repository, or file…" /></div></div>
    <Card className="overflow-hidden"><CardContent className="p-0">{findingsQuery.isLoading ? <div className="p-5"><TableSkeleton rows={8} /></div> : findingsQuery.isError ? <p className="p-6 text-sm text-red-600 dark:text-red-400">Couldn&apos;t load findings.</p> : findings.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-sm"><thead className="border-b bg-muted/35 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Severity</th><th className="px-4 py-3 font-medium">Issue</th><th className="px-4 py-3 font-medium">Repository</th><th className="px-4 py-3 font-medium">PR</th><th className="px-4 py-3 font-medium">File</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Detected</th><th className="px-4 py-3 font-medium">Actions</th></tr></thead><tbody className="divide-y">{findings.map((finding) => <Fragment key={finding.id}><tr className="align-top hover:bg-accent/40"><td className="px-4 py-4"><StatusBadge value={finding.severity} /></td><td className="max-w-[320px] px-4 py-4"><button className="line-clamp-2 text-left font-medium leading-5 hover:text-primary" onClick={() => setExpanded(expanded === finding.id ? null : finding.id)}>{finding.message}</button></td><td className="max-w-48 px-4 py-4"><span className="block truncate">{finding.repository_name}</span></td><td className="px-4 py-4 font-mono text-xs">#{finding.pull_request_number}</td><td className="max-w-48 px-4 py-4 font-mono text-xs text-muted-foreground"><span className="block truncate" title={finding.filename}>{finding.filename}:{finding.line}</span></td><td className="px-4 py-4 capitalize text-muted-foreground">{finding.category}</td><td className="px-4 py-4"><StatusBadge value={finding.status} /></td><td className="px-4 py-4 whitespace-nowrap text-xs text-muted-foreground">{formatDate(finding.created_at)}</td><td className="px-4 py-3"><div className="flex items-center gap-1"><Button asChild size="icon" variant="ghost" title="View finding"><Link href={`/reviews/${finding.review_id}`}><MoreHorizontal className="size-4" /></Link></Button><Button size="icon" variant="ghost" title="How to fix" onClick={() => setExpanded(expanded === finding.id ? null : finding.id)}><Check className="size-4" /></Button>{finding.github_url ? <Button asChild size="icon" variant="ghost" title="Open PR"><a href={finding.github_url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /></a></Button> : null}</div></td></tr>{expanded === finding.id ? <tr><td colSpan={9} className="bg-muted/20 px-5 py-5"><div className="mb-3 flex items-center justify-between"><div><p className="font-medium">Finding #{finding.id}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{finding.filename}:{finding.line}</p></div></div><FindingResolution finding={finding} compact onResolve={() => setStatus(finding, "resolved")} onDismiss={() => setStatus(finding, "dismissed")} /></td></tr> : null}</Fragment>)}</tbody></table></div> : <div className="p-12 text-center"><p className="text-sm font-medium">No findings match these filters</p><p className="mt-1 text-sm text-muted-foreground">Try a wider date range or clear a filter.</p></div>}</CardContent></Card>
  </div>;
}
