"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CircleAlert, GitPullRequest, MessageSquare, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { useCollaboration } from "./collaboration-provider";
import { collab, Notice, Page, relativeTime, safeNoticeHref } from "@/lib/api/collaboration";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { tenantId } = useCurrentTenant();
  const live = useCollaboration();
  const query = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const count = useQuery({ queryKey: ["collaboration", tenantId, "unread"], queryFn: () => collab<{ count: number }>(tenantId!, "/notifications/unread-count"), enabled: !!tenantId, refetchInterval: live.connected ? false : 15000 });
  const inbox = useInfiniteQuery({ queryKey: ["collaboration", tenantId, "notifications", unread], enabled: !!tenantId && open,
    initialPageParam: null as number | null, queryFn: ({ pageParam }) => collab<Page<Notice>>(tenantId!, "/notifications?unread=" + unread + (pageParam ? "&before=" + pageParam : "")), getNextPageParam: page => page.next_cursor });
  const items = [...new Map(inbox.data?.pages.flatMap(page => page.items).map(item => [item.id, item]) ?? []).values()];
  async function mark(item?: Notice, navigate = false) {
    if (!tenantId) return;
    setBusy(true); setError("");
    try {
      await collab(tenantId, item ? "/notifications/" + item.id + "/read" : "/notifications/read-all", "POST");
      await query.invalidateQueries({ queryKey: ["collaboration", tenantId] });
      if (navigate && item) {
        const href = safeNoticeHref(item.href);
        setOpen(false);
        const chat = href.match(/^\/dashboard\?chat=(\d+)$/);
        if (chat) window.dispatchEvent(new CustomEvent("kodeistry-open-chat", { detail: Number(chat[1]) }));
        else router.push(href);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><Button variant="ghost" size="icon" aria-label={"Notifications" + (count.data?.count ? ", " + count.data.count + " unread" : "")} className="relative size-9 rounded-lg"><Bell className="size-4" />{!!count.data?.count && <Badge className="absolute -right-2 -top-1">{count.data.count > 99 ? "99+" : count.data.count}</Badge>}</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[70] bg-black/20" /><Dialog.Content className="fixed right-3 top-[max(76px,env(safe-area-inset-top))] z-[71] flex max-h-[calc(100dvh-100px)] w-[calc(100vw-24px)] max-w-[400px] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      <div className="flex items-center justify-between border-b p-4"><Dialog.Title className="text-sm font-semibold">Notifications</Dialog.Title><Dialog.Close aria-label="Close notifications" className="rounded p-1 hover:bg-accent"><X className="size-4" /></Dialog.Close></div>
      <Dialog.Description className="sr-only">Updates from your authorized repositories and team conversations.</Dialog.Description>
      <div className="flex items-center gap-1 border-b p-2"><Button size="sm" variant={unread ? "ghost" : "secondary"} aria-pressed={!unread} onClick={() => setUnread(false)}>All</Button><Button size="sm" variant={unread ? "secondary" : "ghost"} aria-pressed={unread} onClick={() => setUnread(true)}>Unread</Button><Button variant="ghost" size="sm" className="ml-auto text-xs" disabled={busy || !count.data?.count} onClick={() => mark()}><Check className="mr-1 size-3" />Mark all read</Button></div>
      {error && <p role="alert" className="p-3 text-xs text-destructive">{error} Try the action again.</p>}
      <div className="min-h-0 flex-1 divide-y overflow-y-auto">
        {inbox.isPending ? <div aria-label="Loading notifications" role="status" className="space-y-3 p-4"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div> : inbox.isError ? <div role="alert" className="p-6 text-center text-sm">Could not load notifications.<Button variant="ghost" onClick={() => inbox.refetch()}>Retry</Button></div> : items.length === 0 ? <div className="p-8 text-center"><Bell className="mx-auto mb-3 size-7 text-muted-foreground/50" /><p className="text-sm font-medium">{unread ? "You're all caught up" : "No notifications yet"}</p><p className="mt-1 text-xs text-muted-foreground">Team and review updates will appear here.</p></div> : items.map(item => {
          const Icon = item.event_type.startsWith("finding") || item.event_type === "review_failed" ? CircleAlert : item.event_type.startsWith("review") ? GitPullRequest : ["direct_message", "chat_mention"].includes(item.event_type) ? MessageSquare : Users;
          return <article key={item.id} className={cn("flex gap-3 p-3", !item.read_at && "bg-violet-500/5")}><Icon className={cn("mt-1 size-4 shrink-0", item.event_type.includes("critical") ? "text-red-500" : item.event_type.includes("high") || item.event_type.includes("failed") ? "text-amber-500" : "text-violet-500")} /><div className="min-w-0 flex-1"><button disabled={busy} onClick={() => mark(item, true)} className="w-full rounded text-left focus-visible:outline-2 focus-visible:outline-ring"><span className="block text-xs font-semibold">{item.title}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{item.message}</span></button><div className="mt-2 flex items-center justify-between"><time dateTime={item.created_at} title={new Date(item.created_at).toLocaleString()} className="text-[10px] text-muted-foreground">{relativeTime(item.created_at)}</time>{!item.read_at && <button disabled={busy} onClick={() => mark(item)} className="rounded text-[10px] text-violet-600 hover:underline dark:text-violet-400">Mark as read</button>}</div></div></article>;
        })}
        {inbox.hasNextPage && <Button variant="ghost" className="w-full" disabled={inbox.isFetchingNextPage} onClick={() => inbox.fetchNextPage()}>{inbox.isFetchingNextPage ? "Loading…" : "Load more"}</Button>}
      </div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

