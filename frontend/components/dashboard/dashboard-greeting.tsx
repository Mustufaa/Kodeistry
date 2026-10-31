"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { firstName, greetingForHour, localMinute, serverMinute, subscribeToLocalMinute, type GreetingUser } from "@/lib/dashboard-greeting";

export function DashboardGreeting({ user, actions }: { user?: GreetingUser; actions?: ReactNode }) {
  const minute = useSyncExternalStore(subscribeToLocalMinute, localMinute, serverMinute);
  const date = minute === null ? null : new Date(minute * 60_000);
  const greeting = date ? greetingForHour(date.getHours()) : null;
  const ready = !!user && !!greeting && !!date;

  return <header className="relative isolate py-2 sm:py-3">
    <div aria-hidden="true" className="pointer-events-none absolute -inset-x-4 -top-4 -z-10 h-44 rounded-3xl bg-[radial-gradient(ellipse_at_top_left,var(--primary),transparent_70%)] opacity-[0.07] sm:-inset-x-6 dark:opacity-[0.10]" />
    <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">Overview</p>
    {ready ? <div className="dashboard-greeting-enter flex min-h-24 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight font-semibold tracking-[-0.035em] text-foreground [overflow-wrap:anywhere] sm:text-3xl xl:text-4xl">
          {greeting.title}, {firstName(user)}! <span aria-hidden="true" className="inline-block align-baseline text-[0.85em]">{greeting.emoji}</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{greeting.subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <CalendarDays aria-hidden="true" className="size-4 text-violet-600 dark:text-violet-400" />
        <time dateTime={`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`}>
          {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </time>
      </div>
    </div> : <div className="flex min-h-24 flex-col justify-center gap-3" role="status" aria-label="Loading your greeting">
      <h1 className="sr-only">Dashboard overview</h1>
      <div aria-hidden="true" className="h-8 w-3/4 max-w-md rounded-md bg-muted motion-safe:animate-pulse" />
      <div aria-hidden="true" className="h-5 w-full max-w-sm rounded-md bg-muted motion-safe:animate-pulse" />
    </div>}
    {actions ? <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div> : null}
  </header>;
}
