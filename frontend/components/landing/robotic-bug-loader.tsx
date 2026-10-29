"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { StaticRoboticBug } from "./static-robotic-bug";

// The Three.js chunk is requested only after idle and only when motion is allowed.
const RoboticBug = dynamic(() => import("./RoboticBug"), { ssr: false, loading: () => <StaticRoboticBug /> });
export function RoboticBugLoader() {
  const [motion, setMotion] = useState<"pending" | "reduced" | "ready">("pending");
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => setMotion(media.matches ? "reduced" : "ready");
    if ("requestIdleCallback" in window) idle = window.requestIdleCallback(update, { timeout: 2000 });
    else timer = setTimeout(update, 500);
    media.addEventListener("change", update);
    return () => {
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
      media.removeEventListener("change", update);
    };
  }, []);
  return motion === "ready" ? <RoboticBug /> :
    <StaticRoboticBug motion={motion} />;
}
