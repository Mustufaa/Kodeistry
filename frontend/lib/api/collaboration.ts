import { apiRequest } from "./client";
export type Channel = { id: number; name: string; kind: "team" | "repository" | "direct"; repository_id: number | null; revision: number; unread: number; last_read_id: number };
export type Person = { id: number; full_name: string; github_avatar_url: string | null };
export type Message = { id: number; channel_id: number; client_id: string; sender_id: number; sender: string; avatar?: string | null; body: string; reply_to_id: number | null; created_at: string; edited_at: string | null; deleted_at: string | null };
export type Notice = { id: number; event_type: string; title: string; message: string; href: string; created_at: string; read_at: string | null };
export type Page<T> = { items: T[]; next_cursor: number | null };
export type Participant = { user_id: number; read_id: number; online: boolean; typing: boolean };
export type Snapshot = { type: "sync"; channels: Channel[]; unread: number; notification_revision: number; permissions: string; participants: Participant[] };
export const collaborationPath = (team: number) => `/tenants/${team}/collaboration`;
export function collab<T>(team: number, path: string, method = "GET", body?: unknown) { return apiRequest<T>(collaborationPath(team) + path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
export function safeNoticeHref(href: string) { return /^\/(?:reviews\/\d+|repositories\/\d+|team|dashboard(?:\?chat=\d+)?)$/.test(href) ? href : "/dashboard"; }
export function relativeTime(value: string) {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  const [amount, unit] = seconds < 60 ? [0, "second"] : seconds < 3600 ? [Math.floor(seconds / 60), "minute"] : seconds < 86400 ? [Math.floor(seconds / 3600), "hour"] : [Math.floor(seconds / 86400), "day"];
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(-(amount as number), unit as Intl.RelativeTimeFormatUnit);
}
