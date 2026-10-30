"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Reply, Copy, Pencil, Trash2, X, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollaboration } from "./collaboration-provider";
import { Channel, collab, Message, Page, Person } from "@/lib/api/collaboration";
import { cn } from "@/lib/utils";
type Pending = { client_id: string; body: string; reply_to_id: number | null; mentions: number[]; failed: boolean };
export function Conversation({ team, channel, user }: { team: number; channel: Channel; user: { id: number; full_name: string } }) {
  const query = useQueryClient();
  const live = useCollaboration();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [reply, setReply] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [mentions, setMentions] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLInputElement>(null);
  const nearBottom = useRef(true);
  const previousHeight = useRef<number | null>(null);
  const lastRead = useRef(0);
  const [atBottom, setAtBottom] = useState(true);
  const [visible, setVisible] = useState(true);
  useEffect(() => { const listener = () => setVisible(!document.hidden); document.addEventListener("visibilitychange", listener); return () => document.removeEventListener("visibilitychange", listener); }, []);
  useEffect(() => { const timer = setTimeout(() => setSearchTerm(search), 300); return () => clearTimeout(timer); }, [search]);
  const base = "/channels/" + channel.id;
  const history = useInfiniteQuery({ queryKey: ["collaboration", team, "messages", channel.id, searchTerm], initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => collab<Page<Message>>(team, base + "/messages?limit=40&q=" + encodeURIComponent(searchTerm) + (pageParam ? "&before=" + pageParam : "")),
    getNextPageParam: page => page.next_cursor, refetchInterval: live.connected ? false : 15000 });
  const people = useQuery({ queryKey: ["collaboration", team, "people", channel.id], queryFn: () => collab<Person[]>(team, "/people?channel_id=" + channel.id) });
  const messages = useMemo(() => [...new Map(history.data?.pages.flatMap(p => p.items).map(m => [m.id, m]) ?? []).values()].sort((a, b) => a.id - b.id), [history.data]);
  const latest = messages.at(-1)?.id;
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    if (previousHeight.current !== null) { element.scrollTop += element.scrollHeight - previousHeight.current; previousHeight.current = null; }
    else if (nearBottom.current && !searchTerm) element.scrollTop = element.scrollHeight;
  }, [messages, pending, searchTerm]);
  useEffect(() => {
    if (!latest || searchTerm || !atBottom || !visible || lastRead.current >= latest) return;
    lastRead.current = latest;
    void collab(team, base + "/read", "POST", { message_id: latest }).then(() => query.invalidateQueries({ queryKey: ["collaboration", team, "channels"] })).catch(() => { lastRead.current = 0; });
  }, [latest, base, team, searchTerm, atBottom, visible, query]);
  const mentionMatch = input.match(/@([^@\s]*)$/);
  const candidates = mentionMatch ? people.data?.filter(p => p.id !== user.id && p.full_name.toLowerCase().includes(mentionMatch[1].toLowerCase())).slice(0, 5) ?? [] : [];
  async function send(item: Pending) {
    setPending(p => p.map(m => m.client_id === item.client_id ? { ...m, failed: false } : m));
    try {
      await collab<Message>(team, base + "/messages", "POST", item);
      await query.invalidateQueries({ queryKey: ["collaboration", team, "messages", channel.id] });
      setPending(p => p.filter(m => m.client_id !== item.client_id));
    } catch (e) { setPending(p => p.map(m => m.client_id === item.client_id ? { ...m, failed: true } : m)); setError((e as Error).message); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!input.trim() || busy) return;
    setError(""); nearBottom.current = true;
    if (editing) {
      setBusy(true);
      try { await collab(team, base + "/messages/" + editing.id, "PATCH", { body: input }); setEditing(null); setInput(""); await query.invalidateQueries({ queryKey: ["collaboration", team, "messages", channel.id] }); }
      catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      return;
    }
    const item: Pending = { client_id: crypto.randomUUID(), body: input.trim(), reply_to_id: reply?.id ?? null, mentions, failed: false };
    setPending(p => [...p, item]); setInput(""); setReply(null); setMentions([]); void send(item);
  }
  async function remove(message: Message) {
    if (!window.confirm("Delete your message?")) return;
    try { await collab(team, base + "/messages/" + message.id, "DELETE"); await query.invalidateQueries({ queryKey: ["collaboration", team, "messages", channel.id] }); }
    catch (e) { setError((e as Error).message); }
  }
  const other = live.participants.filter(p => p.user_id !== user.id);
  useEffect(() => { if (reply || editing) composer.current?.focus(); }, [reply, editing]);
  function startReply(message: Message) { setReply(message); setEditing(null); }
  function startEdit(message: Message) { setEditing(message); setReply(null); setInput(message.body); }
  const typingNames = other.filter(p => p.typing).map(p => people.data?.find(person => person.id === p.user_id)?.full_name || "Teammate");
  return <>
    <div className="shrink-0 px-3 py-2"><Input aria-label="Search messages" className="h-9 text-xs" placeholder="Search this conversation" value={search} onChange={e => setSearch(e.target.value)} /></div>
    <div className="shrink-0 px-4 pb-2 text-[10px] text-muted-foreground">{other.filter(p => p.online).length} online in this conversation</div>
    <ScrollArea className="min-h-0 flex-1" viewportRef={viewport} onScroll={event => {
      const el = event.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; setAtBottom(nearBottom.current);
      if (el.scrollTop < 30 && history.hasNextPage && !history.isFetchingNextPage) { previousHeight.current = el.scrollHeight; void history.fetchNextPage(); }
    }}><div className="space-y-2 px-3 pb-4">
      {history.hasNextPage && <Button variant="ghost" size="sm" className="w-full" disabled={history.isFetchingNextPage} onClick={() => { previousHeight.current = viewport.current?.scrollHeight ?? null; void history.fetchNextPage(); }}>{history.isFetchingNextPage ? "Loading…" : "Load earlier messages"}</Button>}
      {history.isPending ? <div role="status" aria-label="Loading messages" className="space-y-4 p-2"><Skeleton className="h-14 w-3/4" /><Skeleton className="ml-auto h-12 w-2/3" /><Skeleton className="h-14 w-3/4" /></div> : history.isError ? <div role="alert" className="p-4 text-center text-sm">Messages could not be loaded.<Button variant="ghost" onClick={() => history.refetch()}>Retry</Button></div> : messages.length === 0 ? <div className="py-12 text-center"><MessageSquare className="mx-auto mb-3 size-8 text-violet-500/60" /><p className="text-sm font-medium">{searchTerm ? "No matching messages" : "Start the conversation"}</p><p className="mt-1 text-xs text-muted-foreground">{searchTerm ? "Try another search." : "Share a question or discuss your next review."}</p></div> : null}
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const day = new Date(message.created_at).toLocaleDateString();
        const newDay = !previous || new Date(previous.created_at).toLocaleDateString() !== day;
        const grouped = !newDay && previous?.sender_id === message.sender_id && new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 300000;
        const self = message.sender_id === user.id;
        const original = message.reply_to_id ? messages.find(m => m.id === message.reply_to_id) : null;
        return <div key={message.id}>{newDay && <div className="my-4 text-center text-[10px] text-muted-foreground">{day}</div>}<div className={cn("group flex gap-2", self && "flex-row-reverse")}>
          <div className="w-7 shrink-0">{!grouped && <div className="relative"><Avatar name={message.sender} src={message.avatar} /><span title={live.participants.some(p => p.user_id === message.sender_id && p.online) ? "Online" : "Offline"} className={cn("absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-background", live.participants.some(p => p.user_id === message.sender_id && p.online) ? "bg-emerald-500" : "bg-muted-foreground")} /></div>}</div>
          <div className={cn("min-w-0 max-w-[85%]", self && "text-right")}>
            {!grouped && <div className="mb-1 text-[10px] text-muted-foreground">{self ? "You" : message.sender} · <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>}
            <div className={cn("rounded-xl border px-3 py-2 text-left text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]", self ? "border-violet-500/20 bg-violet-500/10" : "bg-accent/50")}>
              {message.reply_to_id && <div className="mb-2 border-l-2 border-violet-400 pl-2 text-[10px] text-muted-foreground"><Reply className="mr-1 inline size-3" />{original ? original.deleted_at ? "Deleted message" : original.sender + ": " + original.body.slice(0, 100) : "Reply to earlier message #" + message.reply_to_id}</div>}
              {message.deleted_at ? <span className="italic text-muted-foreground">Message deleted</span> : message.body}
            </div>
            <div className="flex flex-wrap items-center gap-1 py-0.5 text-[10px] text-muted-foreground">{message.edited_at && <span>Edited</span>}{self && channel.kind === "direct" && other.some(p => p.read_id >= message.id) && <span className="inline-flex items-center gap-1 text-violet-500"><CheckCheck className="size-3" />Read</span>}
              {!message.deleted_at && <div className="flex items-center sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">{[
                { label: "Reply", icon: Reply, action: () => startReply(message) },
                { label: "Copy message", icon: Copy, action: () => { void navigator.clipboard.writeText(message.body).catch(() => setError("Could not copy this message.")); } },
                ...(self ? [{ label: "Edit message", icon: Pencil, action: () => startEdit(message) }, { label: "Delete message", icon: Trash2, action: () => { void remove(message); } }] : [])
              ].map(({ label, icon: Icon, action }) => <Tooltip key={label} label={label}><button type="button" aria-label={label} onClick={action} className="rounded p-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"><Icon className="size-3" /></button></Tooltip>)}</div>}
            </div>
          </div>
        </div></div>;
      })}
      {pending.filter(p => !messages.some(m => m.client_id === p.client_id)).map(item => <div key={item.client_id} className="ml-9 rounded-xl border border-dashed p-3 text-xs"><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{item.body}</p><span className="text-[10px] text-muted-foreground">{item.failed ? "Could not send. " : "Sending…"}</span>{item.failed && <button className="text-violet-500 underline" onClick={() => send(item)}>Retry message</button>}</div>)}
    </div></ScrollArea>
    <div className="shrink-0 border-t bg-background px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="min-h-4 text-[10px] text-muted-foreground" role="status">{typingNames.length > 0 && typingNames.join(", ") + " typing…"}</div>
      {error && <div role="alert" className="mb-2 flex items-center text-xs text-destructive"><span className="flex-1">{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X className="size-3" /></button></div>}
      {(reply || editing) && <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted p-2 text-xs"><span className="min-w-0 flex-1 truncate">{editing ? "Editing your message" : "Reply to " + reply!.sender + ": " + reply!.body}</span><button aria-label="Cancel reply or edit" onClick={() => { setReply(null); setEditing(null); setInput(""); }}><X className="size-3" /></button></div>}
      {candidates.length > 0 && <div aria-label="Mention suggestions" className="mb-2 rounded-lg border bg-popover p-1">{candidates.map(person => <button key={person.id} type="button" className="block w-full rounded p-2 text-left text-xs hover:bg-accent" onClick={() => { setInput(input.replace(/@([^@\s]*)$/, "@" + person.full_name + " ")); setMentions(ids => [...new Set([...ids, person.id])]); composer.current?.focus(); }}>{person.full_name}</button>)}</div>}
      <form onSubmit={submit} className="flex items-center gap-2"><Input ref={composer} aria-label="Message" value={input} maxLength={4000} onChange={e => { setInput(e.target.value); live.typing(channel.id); }} placeholder="Message · @ to mention" className="min-w-0 flex-1 text-base sm:text-xs" /><Button disabled={!input.trim() || busy} type="submit" size="icon" aria-label={editing ? "Save message" : "Send message"} className="shrink-0 bg-violet-600 text-white hover:bg-violet-700"><Send className="size-4" /></Button></form>
      <p className="mt-1 text-right text-[10px] text-muted-foreground">{input.length}/4000</p>
    </div>
  </>;
}
