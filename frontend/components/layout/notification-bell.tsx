"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Check, Clock, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  title: string;
  description: string;
  time: string;
  read: boolean;
  type: "review" | "security" | "system";
  href?: string;
};

const initialNotifications: Notification[] = [
  {
    id: "1",
    title: "AI Review Completed",
    description: "PR #42 in backend-service has 2 suggestions.",
    time: "10m ago",
    read: false,
    type: "review",
    href: "/reviews",
  },
  {
    id: "2",
    title: "Critical Vulnerability Detected",
    description: "Hardcoded API key pattern caught in auth.py.",
    time: "1h ago",
    read: false,
    type: "security",
    href: "/findings",
  },
  {
    id: "3",
    title: "GitHub App Synced",
    description: "Successfully re-indexed 22 connected repositories.",
    time: "3h ago",
    read: true,
    type: "system",
    href: "/repositories",
  },
];

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative size-9 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Notifications"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute right-2 top-2 flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-violet-600" />
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border bg-popover p-0 shadow-xl z-50 text-popover-foreground animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Check className="size-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 divide-y overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">No notifications</p>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => markRead(item.id)}
                  className={cn(
                    "flex flex-col gap-1 p-3.5 transition-colors hover:bg-accent/40 cursor-pointer text-left",
                    !item.read && "bg-violet-500/[0.04]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                      {!item.read && <span className="size-1.5 rounded-full bg-violet-600 shrink-0" />}
                      {item.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="size-2.5" /> {item.time}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                  {item.href && (
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-violet-600 hover:underline dark:text-violet-400"
                    >
                      View details <ExternalLink className="size-2.5" />
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t p-2 text-center bg-muted/20">
            <Link
              href="/reviews"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              View activity log
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

