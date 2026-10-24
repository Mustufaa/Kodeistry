"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";

const KEY = "kodeistry_preferences";
const EVENT = "kodeistry-preferences-change";
export const defaults = { showAssistant: true, showGreeting: true };
export type Preferences = typeof defaults;
type PreferenceKey = keyof Preferences;
const defaultSnapshot = JSON.stringify(defaults);

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, callback);
  };
}

function snapshot() {
  try { return localStorage.getItem(KEY) ?? defaultSnapshot; }
  catch { return defaultSnapshot; }
}

function parse(value: string): Preferences {
  try {
    const data = JSON.parse(value);
    if (!data || typeof data !== "object") return defaults;
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, typeof data[key] === "boolean" ? data[key] : fallback])) as Preferences;
  } catch { return defaults; }
}

function setPreference(key: PreferenceKey, value: boolean) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...parse(snapshot()), [key]: value }));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    toast.error("Could not save your preference. Allow browser storage and try again.");
  }
}

const PreferencesContext = createContext({ preferences: defaults, setPreference });

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => defaultSnapshot);
  const preferences = parse(raw);
  return <PreferencesContext.Provider value={{ preferences, setPreference }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() { return useContext(PreferencesContext); }
