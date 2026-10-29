"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// Keep the decorative Three.js chunk out of the initial hydration work.
const RoboticBug = dynamic(() => import("./RoboticBug"), { ssr: false });
export function RoboticBugLoader() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(id);
  }, []);
  return ready ? <RoboticBug /> : null;
}
