"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Bug, CheckCircle2, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { getFindings } from "@/lib/api/analytics";
import { formatDate } from "@/lib/format";
import type { AnalyticsFilters } from "@/types/analytics";

const filters: AnalyticsFilters = { timeframe: "12m", status: "open" };
const priority = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const { tenantId, user } = useCurrentTenant();
  const findingsQuery = useQuery({
    queryKey: ["findings", tenantId, filters, "reminders", user?.id],
    queryFn: () => getFindings(tenantId!, filters),
    enabled: !!tenantId && !!user,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
  });
  // Do not display cached private content after a failed permission recheck.
  const findings = findingsQuery.isError ? [] : (findingsQuery.data ?? [])
    .filter((finding) => finding.status === "open" &&
      finding.verification_status !== "RESOLVED" && finding.triage_status === "ACTIVE")
    .sort((a, b) => priority[a.severity] - priority[b.severity] ||
      Date.parse(b.created_at) - Date.parse(a.created_at));
  const count = findings.length;
  const loading = !tenantId || !user || findingsQuery.isPending;

  function showReminders() {
    setOpen(true);
    if (tenantId && user) void findingsQuery.refetch();
  }

  function closeReminders() {
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }

  return (
    <>
      <Button ref={launcherRef} variant="ghost" size="icon"
        className="relative size-9 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Notifications${count ? `: ${count} open issues` : ""}`}
        aria-haspopup="dialog" aria-expanded={open} onClick={showReminders}>
        <Bell className="size-4" />
        {count > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-violet-600 px-1 text-[10px] leading-4 text-white" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>}
      </Button>
      {open && <Modal title="Bug & issue reminders" onClose={closeReminders}>
        <p className="mb-4 text-xs text-muted-foreground">
          Open findings detected in the last 12 months. Updates every 30 seconds.
          Issues stay here until verified as resolved or dismissed.
        </p>
        {loading ? <div role="status" aria-label="Loading issue reminders" className="space-y-3">
          {[1, 2, 3].map((id) => <div key={id} className="h-20 rounded-lg bg-muted motion-safe:animate-pulse" />)}
        </div> : findingsQuery.isError ? <div role="alert" className="space-y-3 py-6 text-center">
          <p className="text-sm">Couldn&apos;t load issue reminders.</p>
          <Button variant="outline" size="sm" onClick={() => void findingsQuery.refetch()} disabled={findingsQuery.isFetching}>
            <RefreshCw className="size-4" /> Retry
          </Button>
        </div> : count === 0 ? <div className="py-8 text-center" role="status">
          <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-medium">No open issues</p>
          <p className="mt-1 text-xs text-muted-foreground">No unresolved findings in this period for repositories you can access.</p>
        </div> : <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{count} open {count === 1 ? "issue" : "issues"}</p>
            <Button variant="ghost" size="sm" onClick={() => void findingsQuery.refetch()} disabled={findingsQuery.isFetching}>
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
          </div>
          <ul className="max-h-[50dvh] space-y-2 overflow-y-auto overscroll-contain">
            {findings.slice(0, 50).map((finding) => {
              const Icon = finding.category === "security" ? ShieldAlert : finding.category === "bug" ? Bug : TriangleAlert;
              const urgent = finding.severity === "critical" || finding.severity === "high";
              return <li key={finding.id}>
                <Link href={`/reviews/${finding.review_id}`} onClick={() => setOpen(false)}
                  className="block rounded-lg border p-3 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none">
                  <div className="flex items-center gap-2">
                    <Icon aria-hidden="true" className={`size-4 shrink-0 ${urgent ? "text-red-600 dark:text-red-400" : "text-violet-600 dark:text-violet-400"}`} />
                    <span className="text-xs font-semibold capitalize">{finding.severity} {finding.category}</span>
                  </div>
                  <p className="mt-2 break-words text-sm font-medium">{finding.repository_name} · PR #{finding.pull_request_number}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Finding #{finding.id} needs attention. Open review for details.</p>
                  <time dateTime={finding.created_at} className="mt-2 block text-[11px] text-muted-foreground">
                    Detected {formatDate(finding.created_at)}
                  </time>
                </Link>
              </li>;
            })}
          </ul>
          {count > 50 && <p className="mt-3 text-xs text-muted-foreground">Showing the 50 highest-priority issues. Open findings to see more.</p>}
        </>}
        <div className="mt-4 border-t pt-3">
          <Link href="/findings" onClick={() => setOpen(false)} className="text-sm font-medium text-primary hover:underline">
            View all findings
          </Link>
        </div>
      </Modal>}
    </>
  );
}

