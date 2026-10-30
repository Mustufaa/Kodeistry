"use client";

import { useSyncExternalStore } from "react";

const changed = "kodeistry-security-updates-read";
const sessionFallback = new Map<string, string>();
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changed, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changed, listener);
  };
}
function snapshot(key: string) {
  if (sessionFallback.has(key)) return sessionFallback.get(key)!;
  try { return window.localStorage.getItem(key) ?? "[]"; }
  catch { return sessionFallback.get(key) ?? "[]"; }
}
function parse(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(-500) : [];
  } catch { return []; }
}

export function useSecurityUpdateReads(userId: number) {
  const key = "kodeistry:security-reads:v1:" + userId;
  const raw = useSyncExternalStore(subscribe, () => snapshot(key), () => "[]");
  return {
    readIds: new Set(parse(raw)),
    markRead(ids: string[]) {
      const merged = JSON.stringify([...new Set([...parse(snapshot(key)), ...ids])].slice(-500));
      try {
        window.localStorage.setItem(key, merged);
        sessionFallback.delete(key);
      } catch { sessionFallback.set(key, merged); }
      window.dispatchEvent(new Event(changed));
    },
  };
}
