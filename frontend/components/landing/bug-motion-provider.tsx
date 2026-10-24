"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";

type BugMotion = {
  enabled: boolean;
  hidden: boolean;
  togglePlayback: () => void;
  toggleVisibility: () => void;
};

const BugMotionContext = createContext<BugMotion | null>(null);

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function BugMotionProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getReducedMotion, () => true);
  const [mode, setMode] = useState<"system" | "play" | "pause">("system");
  const [hidden, setHidden] = useState(false);
  const enabled = !hidden && (mode === "play" || (mode === "system" && !reducedMotion));

  const togglePlayback = () => {
    if (enabled) setMode("pause");
    else {
      // A deliberate Play action may override reduced motion for these three bugs.
      setMode("play");
      setHidden(false);
    }
  };

  return (
    <BugMotionContext.Provider value={{
      enabled,
      hidden,
      togglePlayback,
      toggleVisibility: () => setHidden((value) => !value),
    }}>
      {children}
    </BugMotionContext.Provider>
  );
}

export function useBugMotion() {
  const value = useContext(BugMotionContext);
  if (!value) throw new Error("Landing bugs must be inside BugMotionProvider");
  return value;
}
