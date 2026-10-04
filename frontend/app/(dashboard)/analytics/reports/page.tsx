"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { ReportFilters } from "@/components/analytics/analytics-filters";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { getAnalytics } from "@/lib/api/analytics";
import { getRepositories } from "@/lib/api/repositories";
import { downloadReportCsv } from "@/lib/report-csv";
import { formatDate } from "@/lib/format";
import type { AnalyticsFilters, Timeframe } from "@/types/analytics";

export default function ReportsPage() {
  const { tenantId } = useCurrentTenant();
  const [mode, setMode] = useState<"weekly" | "monthly" | "custom">("weekly");
  const [filters, setFilters] = useState<AnalyticsFilters>({ timeframe: "7d" });
  const query = useQuery({ queryKey: ["report", tenantId, filters], queryFn: () => getAnalytics(tenantId!, filters), enabled: !!tenantId && (filters.timeframe !== "custom" || !!filters.start_date && !!filters.end_date) });
  const repositories = useQuery({ queryKey: ["repositories", tenantId], queryFn: () => getRepositories(tenantId!), enabled: !!tenantId });
  const data = query.data;
  const title = mode === "weekly" ? "Weekly Code Review Report" : mode === "monthly" ? "Monthly Code Review Report" : "Custom Code Review Report";
  const period = data ? `${data.start_date} — ${data.end_date}` : "Select a valid reporting period";
  const metricCards = useMemo(() => data ? [
    ["Reviews", data.summary.reviews], ["Findings", data.summary.findings], ["Critical", data.summary.critical], ["Resolved", data.summary.resolved], ["Resolution Rate", data.summary.resolution_rate == null ? "—" : `${data.summary.resolution_rate}%`],
  ] : [], [data]);
  const reportTrend = useMemo(() => {
    if (!data || mode !== "monthly") return data?.trend ?? [];
    const weeks: typeof data.trend = [];
    for (let index = 0; index < data.trend.length; index += 7) {
      const group = data.trend.slice(index, index + 7);
      weeks.push({ date: group[0].date, label: `Week ${weeks.length + 1}`, total: group.reduce((sum, item) => sum + item.total, 0), critical: group.reduce((sum, item) => sum + item.critical, 0), high: group.reduce((sum, item) => sum + item.high, 0), medium: group.reduce((sum, item) => sum + item.medium, 0), low: group.reduce((sum, item) => sum + item.low, 0), info: group.reduce((sum, item) => sum + item.info, 0) });
    }
    return weeks;
  }, [data, mode]);
  function choose(next: "weekly" | "monthly" | "custom") {
    setMode(next); const timeframe: Timeframe = next === "weekly" ? "7d" : next === "monthly" ? "30d" : "custom";
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 29);
    setFilters({ ...filters, timeframe, start_date: next === "custom" ? start.toISOString().slice(0, 10) : undefined, end_date: next === "custom" ? end.toISOString().slice(0, 10) : undefined });
  }
  function exportReport() { if (!data) return; downloadReportCsv(data, `kodeistry-${mode}-report-${data.end_date}.csv`); toast.success("Report downloaded"); }
  return <div className="space-y-6">
    <PageHeader title="Reports" description="Shareable, engineering-focused summaries built from review data." actions={<Button onClick={exportReport} disabled={!data}><Download className="size-4" />Export CSV</Button>} />
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div className="inline-flex w-fit rounded-lg border bg-card p-1">{(["weekly", "monthly", "custom"] as const).map((item) => <button key={item} onClick={() => choose(item)} className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${mode === item ? "bg-muted text-foreground" : "text-muted-foreground"}`}>{item === "custom" ? "Custom Range" : `${item} Report`}</button>)}</div><ReportFilters filters={filters} repositories={repositories.data ?? []} onChange={setFilters} allowCustom={false} /></div>
    <Card><CardHeader className="border-b px-6 py-5"><CardTitle className="text-lg">{title}</CardTitle><p className="text-sm text-muted-foreground">{period}</p></CardHeader><CardContent className="space-y-7 p-6">
      {query.isError ? <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t generate this report for the selected period.</p> : null}
      <section><h2 className="mb-3 text-base font-semibold">Summary</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{metricCards.map(([label, value]) => <div key={label} className="rounded-lg border bg-background p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p></div>)}</div>{data?.summary.resolution_rate != null ? <p className="mt-3 text-xs text-muted-foreground">{data.summary.resolved} of {data.summary.actionable} actionable findings resolved.</p> : null}</section>
      <section><h2 className="mb-3 text-base font-semibold">Findings trend</h2><div className="h-72 rounded-lg border bg-background p-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={reportTrend}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} /><Bar dataKey="total" name="Findings" fill="#8b78ff" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
      <div className="grid gap-5 lg:grid-cols-2"><section><h2 className="mb-3 text-base font-semibold">Severity distribution</h2><div className="divide-y rounded-lg border">{data?.severity.map((item) => <div key={item.name} className="flex justify-between px-4 py-3 text-sm"><span className="capitalize text-muted-foreground">{item.name}</span><strong>{item.count}</strong></div>)}</div></section><section><h2 className="mb-3 text-base font-semibold">Top categories</h2><div className="divide-y rounded-lg border">{data?.categories.length ? data.categories.map((item) => <div key={item.name} className="flex justify-between px-4 py-3 text-sm"><span className="capitalize text-muted-foreground">{item.name}</span><strong>{item.count}</strong></div>) : <p className="p-6 text-sm text-muted-foreground">No category data.</p>}</div></section></div>
      <div className="grid gap-5 lg:grid-cols-2"><section><h2 className="mb-3 text-base font-semibold">Most affected repositories</h2><div className="divide-y rounded-lg border">{data?.repositories.length ? data.repositories.map((item) => <div key={item.name} className="flex justify-between gap-4 px-4 py-3 text-sm"><span className="truncate">{item.name}</span><strong>{item.count}</strong></div>) : <p className="p-6 text-sm text-muted-foreground">No repository findings.</p>}</div></section><section><h2 className="mb-3 text-base font-semibold">Issue health</h2><div className="grid grid-cols-2 gap-3">{data ? [["Open", data.summary.open], ["Dismissed", data.summary.dismissed], ["Average age", data.summary.average_issue_age_days == null ? "—" : `${data.summary.average_issue_age_days}d`], ["Oldest open", data.summary.oldest_open_finding_days == null ? "—" : `${data.summary.oldest_open_finding_days}d`]].map(([label, value]) => <div key={label} className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>) : null}</div></section></div>
      {data ? <section><h2 className="mb-3 text-base font-semibold">Engineering detail</h2><div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">{[["Pull requests reviewed", data.summary.pull_requests], ["Repositories reviewed", data.summary.repositories], ["Security findings", data.summary.security], ["Bug findings", data.summary.bugs], ["Performance findings", data.summary.performance], ["Quality findings", data.summary.quality], ["Average findings / review", data.summary.average_findings_per_review ?? "—"], ["Most common category", data.summary.most_common_category ?? "—"]].map(([label, value]) => <div key={label} className="bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-base font-semibold capitalize">{value}</p></div>)}</div></section> : null}
      <div className="grid gap-5 lg:grid-cols-2"><section><h2 className="mb-3 text-base font-semibold">Critical findings</h2><div className="divide-y rounded-lg border">{data?.critical_findings.length ? data.critical_findings.map((finding) => <div key={finding.id} className="px-4 py-3"><p className="line-clamp-2 text-sm font-medium">{finding.message}</p><p className="mt-1 font-mono text-[11px] text-muted-foreground">{finding.repository_name} · {finding.filename}:{finding.line}</p></div>) : <p className="p-6 text-sm text-muted-foreground">No critical findings.</p>}</div></section><section><h2 className="mb-3 text-base font-semibold">Recently resolved</h2><div className="divide-y rounded-lg border">{data?.recently_resolved.length ? data.recently_resolved.map((finding) => <div key={finding.id} className="px-4 py-3"><p className="line-clamp-2 text-sm font-medium">{finding.message}</p><p className="mt-1 text-[11px] text-muted-foreground">Resolved {formatDate(finding.resolved_at)}</p></div>) : <p className="p-6 text-sm text-muted-foreground">No findings resolved in this period.</p>}</div></section></div>
    </CardContent></Card>
  </div>;
}
