"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { apiUrl, ApiError } from "@/lib/api/client";
import { collab, collaborationPath, Snapshot, Participant } from "@/lib/api/collaboration";

type Live = { connected: boolean; participants: Participant[]; subscribe: (id: number | null) => void; typing: (id: number) => void };
const Context = createContext<Live>({ connected: false, participants: [], subscribe: () => {}, typing: () => {} });
export const useCollaboration = () => useContext(Context);
export function CollaborationProvider({ children }: { children: React.ReactNode }) {
  const { tenantId } = useCurrentTenant();
  const query = useQueryClient();
  const socket = useRef<WebSocket | null>(null);
  const selected = useRef<number | null>(null);
  const lastTyping = useRef(0);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const subscribe = useCallback((id: number | null) => {
    selected.current = id;
    setParticipants([]);
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: "subscribe", channel_id: id }));
  }, []);
  const typing = useCallback((id: number) => {
    if (Date.now() - lastTyping.current < 2500) return;
    lastTyping.current = Date.now();
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: "typing", channel_id: id }));
  }, []);
  useEffect(() => {
    if (!tenantId) return;
    let stopped = false, attempt = 0, previous: Snapshot | null = null, lastPing = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    async function connect() {
      try {
        const { ticket } = await collab<{ ticket: string }>(tenantId!, "/ticket", "POST");
        if (stopped) return;
        const url = new URL(apiUrl(collaborationPath(tenantId!) + "/ws"), window.location.href);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(url);
        socket.current = ws;
        ws.onopen = () => ws.send(JSON.stringify({ ticket }));
        ws.onmessage = event => {
          const value = JSON.parse(event.data);
          lastPing = Date.now();
          if (value.type === "ping") { ws.send(JSON.stringify({ type: "pong" })); return; }
          if (value.type !== "sync") return;
          const state = value as Snapshot;
          if (previous && previous.permissions !== state.permissions) {
            query.removeQueries({ queryKey: ["collaboration", tenantId] });
            window.dispatchEvent(new Event("kodeistry-permissions-refresh"));
          }
          if (!previous) {
            ws.send(JSON.stringify({ type: "subscribe", channel_id: selected.current }));
            void query.invalidateQueries({ queryKey: ["collaboration", tenantId] });
          }
          attempt = 0;
          setConnected(true);
          query.setQueryData(["collaboration", tenantId, "channels"], state.channels);
          query.setQueryData(["collaboration", tenantId, "unread"], { count: state.unread });
          if (!previous || previous.unread !== state.unread || previous.notification_revision !== state.notification_revision)
            void query.invalidateQueries({ queryKey: ["collaboration", tenantId, "notifications"] });
          for (const channel of state.channels) {
            if (!previous || previous.channels.find(c => c.id === channel.id)?.revision !== channel.revision)
              void query.invalidateQueries({ queryKey: ["collaboration", tenantId, "messages", channel.id] });
          }
          for (const old of previous?.channels ?? []) {
            if (!state.channels.some(c => c.id === old.id)) query.removeQueries({ queryKey: ["collaboration", tenantId, "messages", old.id] });
          }
          setParticipants(state.participants);
          previous = state;
        };
        ws.onclose = event => {
          setConnected(false); setParticipants([]); previous = null;
          if (event.code === 4403) {
            query.removeQueries({ queryKey: ["collaboration", tenantId] });
            window.dispatchEvent(new Event("kodeistry-permissions-refresh"));
          }
          if (!stopped) retry();
        };
        ws.onerror = () => ws.close();
      } catch (error) {
        if (error instanceof ApiError && [401, 403].includes(error.status)) return;
        if (!stopped) retry();
      }
    }
    function retry() { timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++) * (.7 + Math.random() * .6)); }
    const heartbeat = setInterval(() => { if (socket.current?.readyState === WebSocket.OPEN && Date.now() - lastPing > 45000) socket.current.close(); }, 10000);
    void connect();
    return () => { stopped = true; clearTimeout(timer); clearInterval(heartbeat); socket.current?.close(); };
  }, [tenantId, query]);
  return <Context.Provider value={{ connected, participants, subscribe, typing }}>{children}</Context.Provider>;
}
