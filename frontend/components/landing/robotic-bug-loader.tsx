"use client";

import dynamic from "next/dynamic";

// Next.js requires ssr:false to live in a Client Component.
const RoboticBug = dynamic(() => import("./RoboticBug"), { ssr: false });
export function RoboticBugLoader() { return <RoboticBug />; }

