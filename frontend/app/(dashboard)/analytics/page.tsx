"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, FileText, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { ReportFilters, TimeframePicker } from "@/components/analytics/analytics-filters";
import { PageHeader } from "@/components/dashboard/page-header";
import { TableSkeleton } from "@/components/dashboard/skeletons";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { getAnalytics } from "@/lib/api/analytics";
import { getRepositories } from "@/lib/api/repositories";
import { formatDate } from "@/lib/format";
import { downloadReportCsv } from "@/lib/report-csv";
import type { AnalyticsFilters, ComparisonMetric } from "@/types/analytics";

const severityColors: Record<string, string> = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#3b82f6", info: "#71717a" };
const statusColors: Record<string, string> = { open: "#f97316", resolved: "#22c55e", dismissed: "#71717a" };

function Comparison({ metric, label, inverse = false }: { metric?: ComparisonMetric | null; label: string; inverse?: boolean }) {
  if (!metric || metric.percent_change == null) return <span className="text-[11px] text-muted-foreground">No prior comparison</span>;
  const up = metric.percent_change > 0; const positive = inverse ? !up : up;
  return <span className={`inline-flex items-center gap-1 text-[11px] ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>{up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(metric.percent_change)}% vs {label}</span>;
}

export default function AnalyticsPage() {
  const { tenantId, canManage } = useCurrentTenant();
  const [filters, setFilters] = useState<AnalyticsFilters>({ timeframe: "30d" });
  const query = useQuery({ queryKey: ["analytics", tenantId, filters], queryFn: () => getAnalytics(tenantId!, filters), enabled: !!tenantId && (filters.timeframe !== "custom" || !!filters.start_date && !!filters.end_date) });
  const repositoriesQuery = useQuery({ queryKey: ["repositories", tenantId], queryFn: () => getRepositories(tenantId!), enabled: !!tenantId });
  const data = query.data;
  const metrics = [
    ["Reviews", data?.summary.reviews, null], ["Findings", data?.summary.findings, data?.comparison.findings], ["Critical", data?.summary.critical, data?.comparison.critical],
    ["Resolved", data?.summary.resolved, data?.comparison.resolved], ["Resolution Rate", data?.summary.resolution_rate == null ? "—" : `${data.summary.resolution_rate}%`, null],
  ] as const;
  async function exportReport() {
    if (!tenantId) return;
    try {
      const fresh = await getAnalytics(tenantId, filters);
      downloadReportCsv(fresh, "kodeistry-report-" + fresh.end_date + ".csv");
      toast.success("Report downloaded");
    } catch { toast.error("Unable to export this report. Check your access and try again."); }
  }

  return <div className="space-y-6">
    <PageHeader title="Analytics" description={canManage ? "Understand review quality and code issues over time." : "Analytics for your assigned repositories only."} actions={<><Button asChild variant="outline"><Link href="/analytics/reports"><FileText className="size-4" />Reports</Link></Button><Button onClick={exportReport} disabled={!data}><Download className="size-4" />Export Report</Button></>} />
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><TimeframePicker value={filters.timeframe} onChange={(timeframe) => setFilters({ ...filters, timeframe })} /><ReportFilters filters={filters} repositories={repositoriesQuery.data ?? []} onChange={setFilters} /></div>
    {query.isError ? <div role="alert" className="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-4 text-sm">Couldn&apos;t load analytics for these filters. <button className="ml-2 font-medium text-primary" onClick={() => query.refetch()}>Try again</button></div> : null}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(([label, value, comparison]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p>{query.isLoading ? <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" /> : <p className="mt-2 text-2xl font-semibold tracking-tight">{value ?? 0}</p>}<div className="mt-2"><Comparison metric={comparison} label={data?.comparison.label ?? "previous period"} inverse={label !== "Resolved"} /></div></CardContent></Card>)}</section>

    <Card><CardHeader className="flex-row items-center justify-between border-b px-5 py-4"><div><CardTitle>Findings Over Time</CardTitle><p className="mt-1 text-xs text-muted-foreground">Track issues detected across your reviewed pull requests.</p></div><span className="text-xs text-muted-foreground">{data ? `${data.start_date} — ${data.end_date}` : ""}</span></CardHeader><CardContent className="h-[340px] p-5">{query.isLoading ? <TableSkeleton rows={6} /> : <ResponsiveContainer width="100%" height="100%"><LineChart data={data?.trend ?? []} margin={{ left: -18, right: 12, top: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /><XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={28} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} /><Line type="monotone" dataKey="total" name="Findings" stroke="#8b78ff" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer>}</CardContent></Card>

    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader className="border-b px-5 py-4"><CardTitle>Findings by Severity</CardTitle></CardHeader><CardContent className="h-72 p-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.severity ?? []} layout="vertical" margin={{ left: 10, right: 18 }}><CartesianGrid horizontal={false} stroke="var(--border)" /><XAxis type="number" allowDecimals={false} hide /><YAxis type="category" dataKey="name" width={68} tickFormatter={(value) => value[0].toUpperCase() + value.slice(1)} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} /><Bar dataKey="count" radius={[0, 4, 4, 0]}>{data?.severity.map((item) => <Cell key={item.name} fill={severityColors[item.name]} />)}</Bar></BarChart></ResponsiveContainer></CardContent></Card>
      <Card><CardHeader className="border-b px-5 py-4"><CardTitle>Finding Status</CardTitle></CardHeader><CardContent className="flex min-h-72 items-center gap-6 p-5">{data?.summary.findings ? <><div className="h-52 flex-1"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.status} dataKey="count" nameKey="name" innerRadius={55} outerRadius={78} paddingAngle={2}>{data.status.map((item) => <Cell key={item.name} fill={statusColors[item.name]} />)}</Pie><Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} /></PieChart></ResponsiveContainer></div><div className="w-36 space-y-3">{data.status.map((item) => <div key={item.name} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2 capitalize"><i className="size-2 rounded-full" style={{ background: statusColors[item.name] }} />{item.name}</span><strong>{item.count}</strong></div>)}</div></> : <div className="m-auto text-center text-sm text-muted-foreground"><ShieldCheck className="mx-auto mb-3 size-6" />No findings in this period.</div>}</CardContent></Card>
      <Card><CardHeader className="border-b px-5 py-4"><CardTitle>Top Issue Categories</CardTitle></CardHeader><CardContent className="p-5"><div className="space-y-4">{data?.categories.length ? data.categories.map((item) => <div key={item.name}><div className="mb-1.5 flex justify-between text-xs"><span className="capitalize text-muted-foreground">{item.name}</span><span>{item.count}</span></div><div className="h-1.5 rounded bg-muted"><div className="h-full rounded bg-primary" style={{ width: `${Math.max(4, item.count / Math.max(...data.categories.map((x) => x.count)) * 100)}%` }} /></div></div>) : <p className="py-12 text-center text-sm text-muted-foreground">No category data for this period.</p>}</div></CardContent></Card>
      <Card><CardHeader className="border-b px-5 py-4"><CardTitle>Repositories With Most Findings</CardTitle></CardHeader><CardContent className="p-5"><div className="divide-y">{data?.repositories.length ? data.repositories.map((item, index) => <div key={item.name} className="flex items-center gap-3 py-3 text-sm"><span className="w-5 font-mono text-xs text-muted-foreground">{index + 1}</span><span className="min-w-0 flex-1 truncate">{item.name}</span><strong>{item.count}</strong></div>) : <p className="py-12 text-center text-sm text-muted-foreground">No repository findings for this period.</p>}</div></CardContent></Card>
    </div>

    <Card><CardHeader className="flex-row items-center justify-between border-b px-5 py-4"><div><CardTitle>Recent Critical Findings</CardTitle><p className="mt-1 text-xs text-muted-foreground">Issues requiring immediate attention.</p></div><Button asChild size="sm" variant="ghost"><Link href="/findings">View all</Link></Button></CardHeader><CardContent className="p-0">{data?.critical_findings.length ? <div className="divide-y">{data.critical_findings.map((finding) => <Link key={finding.id} href={`/reviews/${finding.review_id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-accent/50"><AlertTriangle className="size-4 shrink-0 text-red-600 dark:text-red-400" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{finding.message}</p><p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{finding.repository_name} · {finding.filename}:{finding.line}</p></div><StatusBadge value={finding.status} /><span className="hidden text-xs text-muted-foreground sm:block">{formatDate(finding.created_at)}</span></Link>)}</div> : <p className="p-8 text-center text-sm text-muted-foreground">No critical findings in this period.</p>}</CardContent></Card>
  </div>;
}
