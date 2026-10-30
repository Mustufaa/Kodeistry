"use client";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, ArrowLeft, Hash, Plus, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { useCollaboration } from "./collaboration-provider";
import { Conversation } from "./team-chat-conversation";
import { Channel, collab, Person } from "@/lib/api/collaboration";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export function TeamChatDrawer() {
  const { tenantId, user, canManage } = useCurrentTenant();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const query = useQueryClient();
  const { connected, subscribe } = useCollaboration();
  const channels = useQuery({ queryKey: ["collaboration", tenantId, "channels"], queryFn: () => collab<Channel[]>(tenantId!, "/channels"), enabled: !!tenantId, refetchInterval: connected ? false : 15000 });
  const people = useQuery({ queryKey: ["collaboration", tenantId, "people"], queryFn: () => collab<Person[]>(tenantId!, "/people"), enabled: !!tenantId && open });
  const repos = useQuery({ queryKey: ["collaboration", tenantId, "repositories"], queryFn: () => apiRequest<{ id: number; full_name: string }[]>("/tenants/" + tenantId + "/repositories"), enabled: !!tenantId && open && canManage });
  const active = channels.data?.find(c => c.id === selected);
  const activeId = active?.id;
  const unread = channels.data?.reduce((sum, c) => sum + c.unread, 0) ?? 0;
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("chat"));
    const frame = requestAnimationFrame(() => { if (id > 0) { setSelected(id); setOpen(true); } });
    const listener = (event: Event) => { setSelected((event as CustomEvent<number>).detail); setOpen(true); };
    window.addEventListener("kodeistry-open-chat", listener);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("kodeistry-open-chat", listener); };
  }, []);
  useEffect(() => { subscribe(open && activeId ? activeId : null); return () => subscribe(null); }, [open, activeId, subscribe]);
  async function create(body: object) {
    if (!tenantId) return;
    setError(""); setCreating(true);
    try {
      const channel = await collab<{ id: number }>(tenantId, "/channels", "POST", body);
      await query.invalidateQueries({ queryKey: ["collaboration", tenantId, "channels"] });
      setSelected(channel.id); setName("");
    } catch (e) { setError((e as Error).message); }
    finally { setCreating(false); }
  }
  return <Sheet open={open} onOpenChange={setOpen}>
    <Tooltip label="Team chat"><SheetTrigger asChild><Button aria-label={"Team chat" + (unread ? ", " + unread + " unread messages" : "")} className="fixed bottom-[max(24px,env(safe-area-inset-bottom))] right-[calc(100px+env(safe-area-inset-right))] z-[55] size-11 rounded-full bg-violet-600 p-0 text-white shadow-lg hover:bg-violet-700"><MessageSquare className="size-5" />{unread > 0 && <Badge className="absolute -right-2 -top-2 bg-violet-700 text-white">{unread > 99 ? "99+" : unread}</Badge>}</Button></SheetTrigger></Tooltip>
    <SheetContent>
      <div className="shrink-0 border-b px-4 pb-3 pr-14 pt-[max(16px,env(safe-area-inset-top))]">
        <SheetTitle className="flex items-center gap-2 text-base font-semibold"><MessageSquare className="size-4 text-violet-500" />Team Chat</SheetTitle>
        <SheetDescription className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-amber-500")} />{connected ? "Connected to your team" : "Reconnecting · messages remain saved"}</SheetDescription>
      </div>
      {error && <p role="alert" className="px-4 py-2 text-xs text-destructive">{error}</p>}
      {active && tenantId && user ? <>
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2"><Button size="icon" variant="ghost" onClick={() => setSelected(null)} aria-label="Back to channels"><ArrowLeft className="size-4" /></Button><span className="min-w-0 flex-1 truncate text-sm font-medium">{active.name}</span>{canManage && active.kind !== "direct" && <Button size="icon" variant="ghost" aria-label="Archive channel" onClick={async () => { if (!window.confirm("Archive this channel for the team? Its messages will be retained.")) return; try { await collab(tenantId, "/channels/" + active.id, "DELETE"); setSelected(null); await query.invalidateQueries({ queryKey: ["collaboration", tenantId, "channels"] }); } catch (e) { setError((e as Error).message); } }}><Archive className="size-3.5" /></Button>}</div>
        <div className="flex min-h-0 flex-1">
          <ScrollArea className="hidden w-24 shrink-0 border-r sm:block"><nav aria-label="Chat channels" className="space-y-1 p-1.5">{channels.data?.map(c => <button key={c.id} onClick={() => setSelected(c.id)} aria-current={c.id === active.id ? "page" : undefined} className={cn("w-full rounded-lg p-2 text-left text-[11px] hover:bg-accent", c.id === active.id && "bg-violet-500/10 text-violet-600 dark:text-violet-300")}><span className="block truncate" title={c.name}>{c.kind === "direct" ? "" : "# "}{c.name}</span>{c.unread > 0 && <Badge className="mt-1">{c.unread}</Badge>}</button>)}</nav></ScrollArea>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col"><Conversation key={tenantId + ":" + active.id} team={tenantId} channel={active} user={user} /></div>
        </div>
      </> : <ScrollArea className="min-h-0 flex-1"><div className="space-y-5 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">A shared space for reviews, questions, and decisions.</p>
        {channels.isPending ? <div role="status" aria-label="Loading channels" className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : channels.isError ? <div role="alert">Could not load channels. <Button variant="ghost" onClick={() => channels.refetch()}>Retry</Button></div> : <>
          {([['team', 'Team channels'], ['repository', 'Repository channels'], ['direct', 'Direct messages']] as const).map(([kind, title]) => <section key={kind}><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>{channels.data?.filter(c => c.kind === kind).map(channel => <button key={channel.id} onClick={() => setSelected(channel.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><Hash className="size-3.5 shrink-0 text-violet-500" /><span className="min-w-0 flex-1 truncate">{channel.name}</span>{channel.unread > 0 && <Badge>{channel.unread}</Badge>}</button>)}{!channels.data?.some(c => c.kind === kind) && <p className="px-2 py-2 text-xs text-muted-foreground">No conversations yet.</p>}</section>)}
          {!channels.data?.some(c => c.kind === "team") && <Button disabled={creating} variant="outline" onClick={() => create({ name: "general" })}>Open general channel</Button>}
        </>}
        {canManage && <section className="space-y-2 border-t pt-4"><h3 className="text-xs font-medium">Create a channel</h3><form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (name.trim()) void create({ name: name.trim() }); }}><Input aria-label="Channel name" placeholder="Channel name" maxLength={80} value={name} onChange={e => setName(e.target.value)} /><Button disabled={creating || !name.trim()} size="icon" aria-label="Create channel"><Plus className="size-4" /></Button></form><label className="block text-xs text-muted-foreground">Repository<select aria-label="Create repository channel" value="" disabled={creating} onChange={e => create({ repository_id: Number(e.target.value) })} className="mt-1 w-full rounded-lg border bg-background p-2"><option value="">Choose a repository…</option>{repos.data?.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}</select></label></section>}
        <section className="border-t pt-4"><h3 className="mb-2 text-xs font-medium">Start a direct message</h3>{people.isError && <Button variant="ghost" onClick={() => people.refetch()}>Retry loading teammates</Button>}{people.data?.filter(p => p.id !== user?.id).map(person => <button disabled={creating} key={person.id} onClick={() => create({ recipient_id: person.id })} className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs hover:bg-accent"><Avatar name={person.full_name} src={person.github_avatar_url} />{person.full_name}</button>)}</section>
      </div></ScrollArea>}
    </SheetContent>
  </Sheet>;
}

