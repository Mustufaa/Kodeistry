"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Check, CheckCircle2, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { useSecurityUpdateReads } from "@/hooks/use-security-update-reads";
import { formatDate } from "@/lib/format";
import type { SecurityFeed } from "@/lib/security-feed";

export function NotificationBell() {
  const { user } = useCurrentTenant();
  return user ? <SecurityNotifications key={user.id} userId={user.id} /> : (
    <Button variant="ghost" size="icon" disabled aria-label="Loading notifications"><Bell className="size-4" /></Button>
  );
}

function SecurityNotifications({ userId }: { userId: number }) {
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const { readIds, markRead } = useSecurityUpdateReads(userId);
  const feed = useQuery<SecurityFeed>({
    queryKey: ["public-security-updates"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/security-updates", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Security updates are temporarily unavailable.");
      return response.json();
    },
    staleTime: 300_000, refetchInterval: 300_000, refetchOnWindowFocus: true, retry: 1,
  });
  const items = feed.data?.items ?? [];
  const unread = items.filter(item => !readIds.has(item.id)).length;
  const visible = unreadOnly ? items.filter(item => !readIds.has(item.id)) : items;
  const unavailable = feed.data?.sources.filter(source => !source.available) ?? [];

  function close() {
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }

  return <>
    <Button ref={launcherRef} variant="ghost" size="icon"
      className="relative size-9 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label={`Notifications${unread ? `: ${unread} unread security updates` : ""}`}
      aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setOpen(true); void feed.refetch(); }}>
      <Bell className="size-4" />
      {unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-4 rounded-full bg-violet-600 px-1 text-[10px] leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
    </Button>
    {open && <Modal title="Security updates" onClose={close}>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Latest public vulnerabilities, confirmed exploitation and known ransomware use from CISA.
        These alerts do not mean your repositories are affected.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter security updates" className="flex rounded-lg bg-muted p-1">
          <Button size="sm" variant={unreadOnly ? "ghost" : "secondary"} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>All</Button>
          <Button size="sm" variant={unreadOnly ? "secondary" : "ghost"} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Unread ({unread})</Button>
        </div>
        <Button size="icon" variant="ghost" aria-label="Refresh security updates" disabled={feed.isFetching} onClick={() => void feed.refetch()}><RefreshCw className="size-4" /></Button>
        {unread > 0 && <Button size="sm" variant="ghost" onClick={() => markRead(items.map(item => item.id))}><Check className="size-3.5" /> Mark all read</Button>}
      </div>
      {feed.isError && <div role="alert" className="mb-3 rounded-lg border border-amber-500/30 p-3 text-xs">
        {items.length ? "Refresh failed. Showing previously fetched updates." : "Couldn't load security updates."}
        <Button variant="ghost" size="sm" disabled={feed.isFetching} onClick={() => void feed.refetch()}>Retry</Button>
      </div>}
      {unavailable.length > 0 && <p role="status" className="mb-3 text-xs text-amber-700 dark:text-amber-400">
        {unavailable.map(source => source.name).join(", ")} temporarily unavailable. Other sources are still shown.
      </p>}
      {feed.isPending ? <div role="status" aria-label="Loading security updates" className="space-y-3">
        {[1, 2, 3].map(id => <div key={id} className="h-24 rounded-lg bg-muted motion-safe:animate-pulse" />)}
      </div> : visible.length ? <ul className="max-h-[48dvh] space-y-3 overflow-y-auto overscroll-contain">
        {visible.map(item => {
          const isRead = readIds.has(item.id);
          const label = item.kind === "ransomware" ? "Known ransomware use" : item.kind === "exploited" ? "Confirmed exploitation" : `${item.severity ?? "Unknown"} severity`;
          return <li key={item.id} className={`rounded-xl border p-3 ${isRead ? "" : "border-violet-500/30 bg-violet-500/5"}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300"><ShieldAlert className="size-3.5 shrink-0" />{item.source}</span>
              {!isRead && <span className="text-[10px] font-medium text-violet-700 dark:text-violet-300">Unread</span>}
            </div>
            <p className={`mt-2 text-[11px] font-semibold capitalize ${item.kind !== "advisory" || item.severity === "critical" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>{label}</p>
            <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => markRead([item.id])}
              className="mt-1 block break-words text-sm font-semibold hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
              {item.title}<ExternalLink aria-hidden="true" className="ml-1 inline size-3" /><span className="sr-only"> (opens in a new tab)</span>
            </a>
            <p className="mt-2 line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground">{item.summary}</p>
            <p className="mt-2 text-[10px] text-muted-foreground">{item.reference} · {item.source === "CISA KEV" ? "Added to CISA" : "Published"} <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time></p>
            {!isRead && <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={() => markRead([item.id])}><Check className="size-3" />Mark as read</Button>}
          </li>;
        })}
      </ul> : !feed.isError && <div className="py-8 text-center" role="status">
        <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm font-medium">{unreadOnly ? "You're all caught up" : "No security updates available"}</p>
      </div>}
      <div className="mt-4 space-y-1 border-t pt-3 text-[10px] leading-relaxed text-muted-foreground">
        <p>Checks every 5 minutes while the app is open. Sources refresh approximately every 15 minutes. Read status is saved in this browser.</p>
        {feed.data?.sources.map(source => source.checkedAt && <p key={source.name}>{source.name} checked: {formatDate(source.checkedAt)}</p>)}
      </div>
    </Modal>}
  </>;
}

