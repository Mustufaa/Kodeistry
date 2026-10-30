"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentTenant } from "@/hooks/use-current-tenant";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  sender: string;
  initials: string;
  text: string;
  time: string;
  isSelf: boolean;
};

const initialChatMessages: ChatMessage[] = [
  {
    id: "1",
    sender: "Alex Rivers",
    initials: "AR",
    text: "Hey! Can someone check PR #14 before we merge?",
    time: "11:20 AM",
    isSelf: false,
  },
  {
    id: "2",
    sender: "Elena Rostova",
    initials: "ER",
    text: "Reviewing right now. Looks like the SQL sanitizer caught 1 issue.",
    time: "11:24 AM",
    isSelf: false,
  },
];

export function TeamChatDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [input, setInput] = useState("");
  const { user } = useCurrentTenant();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userName = user?.full_name || user?.github_login || "You";
  const userInitials = userName
    .split(/[\s_-]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: userName,
      initials: userInitials,
      text: input.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isSelf: true,
    };

    setMessages((prev) => [...prev, newMsg]);
    setInput("");
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 gap-1.5 rounded-lg border-border/80 px-2.5 text-xs font-medium hover:bg-accent hover:text-foreground"
      >
        <MessageSquare className="size-3.5 text-violet-600 dark:text-violet-400" />
        <span className="hidden sm:inline">Team Chat</span>
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in">
          <div
            className="flex h-full w-full max-w-sm flex-col border-l bg-background shadow-2xl animate-in slide-in-from-right duration-200"
            role="dialog"
            aria-label="Team Chat"
          >
            {/* Header */}
            <div className="flex h-16 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
                  <MessageSquare className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Team Chat</h3>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500" /> Active team channel
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg"
                onClick={() => setOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* Messages Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="rounded-lg bg-accent/40 p-2.5 text-center text-xs text-muted-foreground">
                Collaborate in real time with teammates on reviews, code findings, and PR approvals.
              </div>

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex gap-2.5 text-xs",
                    m.isSelf ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
                      m.isSelf
                        ? "bg-violet-600 text-white"
                        : "bg-muted text-muted-foreground border"
                    )}
                  >
                    {m.initials}
                  </div>
                  <div
                    className={cn(
                      "flex max-w-[75%] flex-col gap-1",
                      m.isSelf ? "items-end" : "items-start"
                    )}
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {m.sender} · {m.time}
                    </span>
                    <div
                      className={cn(
                        "rounded-2xl px-3 py-2 text-xs leading-relaxed",
                        m.isSelf
                          ? "rounded-tr-xs bg-violet-600 text-white"
                          : "rounded-tl-xs bg-accent text-foreground border"
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSend} className="border-t p-3 bg-card/40 flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message team..."
                className="h-9 text-xs"
                autoFocus
              />
              <Button type="submit" size="sm" className="h-9 px-3 gap-1 bg-violet-600 hover:bg-violet-700 text-white shrink-0">
                <Send className="size-3.5" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

