"use client";

import { useCurrentTenant } from "@/hooks/use-current-tenant";
import type { AnalyticsFilters, Timeframe } from "@/types/analytics";
import type { RepositoryItem } from "@/types/repository";
import { cn } from "@/lib/utils";

const periods: { value: Timeframe; label: string }[] = [
  { value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "3m", label: "3M" },
  { value: "6m", label: "6M" }, { value: "12m", label: "12M" },
];

export function TimeframePicker({ value, onChange }: { value: Timeframe; onChange: (value: Timeframe) => void }) {
  return <div className="inline-flex rounded-lg border bg-card p-1" aria-label="Analytics timeframe">{periods.map((period) => (
    <button key={period.value} type="button" onClick={() => onChange(period.value)} className={cn("rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors", value === period.value && "bg-muted text-foreground")}>{period.label}</button>
  ))}</div>;
}

export function ReportFilters({ filters, repositories, onChange, allowCustom = true }: { filters: AnalyticsFilters; repositories: RepositoryItem[]; onChange: (filters: AnalyticsFilters) => void; allowCustom?: boolean }) {
  const { canManage } = useCurrentTenant();
  const selectClass = "h-9 rounded-md border border-input bg-card px-2.5 text-xs outline-none focus:border-ring";
  return <div className="flex flex-wrap items-end gap-2">
    <select aria-label="Repository" value={filters.repository_id ?? ""} onChange={(event) => onChange({ ...filters, repository_id: event.target.value ? Number(event.target.value) : undefined })} className={selectClass}>
      <option value="">{canManage ? "All repositories" : "All assigned repositories"}</option>{repositories.map((repo) => <option key={repo.id} value={repo.id}>{repo.full_name}</option>)}
    </select>
    <select aria-label="Severity" value={filters.severity ?? ""} onChange={(event) => onChange({ ...filters, severity: event.target.value || undefined })} className={selectClass}>
      <option value="">All severities</option>{["critical", "high", "medium", "low", "info"].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
    </select>
    <select aria-label="Category" value={filters.category ?? ""} onChange={(event) => onChange({ ...filters, category: event.target.value || undefined })} className={selectClass}>
      <option value="">All categories</option>{["security", "bug", "performance", "quality", "style", "testing"].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
    </select>
    <select aria-label="Finding status" value={filters.status ?? ""} onChange={(event) => onChange({ ...filters, status: (event.target.value || undefined) as AnalyticsFilters["status"] })} className={selectClass}>
      <option value="">All statuses</option><option value="open">Open</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option>
    </select>
    {allowCustom ? <button type="button" className={cn(selectClass, filters.timeframe === "custom" && "border-primary text-foreground")} onClick={() => onChange({ ...filters, timeframe: "custom" })}>Custom range</button> : null}
    {filters.timeframe === "custom" ? <><label className="text-[11px] text-muted-foreground">From<input type="date" value={filters.start_date ?? ""} onChange={(event) => onChange({ ...filters, start_date: event.target.value })} className={`${selectClass} ml-2`} /></label><label className="text-[11px] text-muted-foreground">To<input type="date" value={filters.end_date ?? ""} onChange={(event) => onChange({ ...filters, end_date: event.target.value })} className={`${selectClass} ml-2`} /></label></> : null}
  </div>;
}
