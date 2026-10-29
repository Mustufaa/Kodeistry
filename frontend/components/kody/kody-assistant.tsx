"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import { RotateCcw, Send, Trash2, X } from "lucide-react";

import { askKody, type ChatHistoryItem } from "@/lib/api/chat";
import styles from "./kody-assistant.module.css";
import { usePreferences } from "@/components/settings/preferences-provider";

type Message = ChatHistoryItem & { id: number };
const WELCOME = "Hi! I'm Kody. Ask me about Kodeistry, GitHub setup, or AI code reviews.";
const QUESTIONS = [
  "What is Kodeistry?",
  "How do I connect GitHub?",
  "How do AI code reviews work?",
  "Why are my repositories not showing?",
];
const INTERNAL_LINKS = new Set([
  "/", "/register", "/login", "/onboarding", "/onboarding/github", "/dashboard",
  "/repositories", "/reviews", "/findings", "/analytics", "/analytics/reports",
  "/settings/integrations/github", "/secret-scanner",
]);
const INLINE_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(\/[^)]+\))/g;

function inlineMarkdown(value: string): ReactNode[] {
  return value.split(INLINE_TOKEN).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\((\/[^)]+)\)$/.exec(part);
    if (link && INTERNAL_LINKS.has(link[2])) return <Link key={index} href={link[2]}>{link[1]}</Link>;
    return part;
  });
}

function MessageText({ content }: { content: string }) {
  return <div className={styles.messageText}>{content.split("\n").map((line, index) => {
    const numbered = /^(\d+)\.\s+(.+)$/.exec(line);
    if (numbered) return <p key={index} className={styles.listLine}><span>{numbered[1]}.</span>{inlineMarkdown(numbered[2])}</p>;
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) return <p key={index} className={styles.listLine}><span>&bull;</span>{inlineMarkdown(bullet[1])}</p>;
    return <p key={index}>{inlineMarkdown(line) || "\u00a0"}</p>;
  })}</div>;
}

function KodyRobot() {
  return (
    <svg className={styles.robot} viewBox="0 0 84 94" aria-hidden="true" focusable="false">
      <ellipse className={styles.shadow} cx="42" cy="89" rx="23" ry="3" />
      <g className={styles.robotFloat}>
        <path className={styles.neck} d="M36 55h12v8H36z" />
        <g className={styles.rightArm}>
          <rect x="58" y="59" width="12" height="18" rx="6" />
          <circle cx="66" cy="77" r="5" />
        </g>
        <rect className={styles.body} x="24" y="58" width="36" height="26" rx="13" />
        <path className={styles.bodyShine} d="M30 66c4-6 11-7 17-5" />
        <circle className={styles.badge} cx="42" cy="72" r="4" />
        <path className={styles.leg} d="M31 81v7m22-7v7" />
        <g className={styles.waveArm}>
          <circle cx="22" cy="65" r="6" />
          <rect x="9" y="48" width="12" height="22" rx="6" transform="rotate(-30 20 63)" />
          <path className={styles.hand} d="M8 47c-2-2-3-5-1-7 2-2 4-1 5 1-1-4 1-6 3-6 3 0 3 3 3 5 1-3 4-3 5-1 2 2 0 6-2 9l-5 6z" />
        </g>
        <rect className={styles.ear} x="4" y="29" width="13" height="23" rx="7" />
        <rect className={styles.ear} x="67" y="29" width="13" height="23" rx="7" />
        <rect className={styles.head} x="12" y="8" width="60" height="51" rx="20" />
        <path className={styles.headShine} d="M23 18c10-9 28-9 40 1" />
        <rect className={styles.face} x="18" y="15" width="48" height="38" rx="15" />
        <path className={styles.eye} d="M27 34c2-6 8-6 10 0m10 0c2-6 8-6 10 0" />
        <path className={styles.smile} d="M37 42c3 3 7 3 10 0" />
      </g>
    </svg>
  );
}

export function KodyAssistant() {
  const { preferences } = usePreferences();
  return preferences.showAssistant ? <KodyAssistantContent showGreeting={preferences.showGreeting} /> : null;
}

function KodyAssistantContent({ showGreeting }: { showGreeting: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ id: 0, role: "assistant", content: WELCOME }]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const retryRef = useRef<{ message: string; history: ChatHistoryItem[] } | null>(null);
  const nextIdRef = useRef(1);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => composerRef.current?.focus());
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && rootRef.current?.contains(event.target as Node)) {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => launcherRef.current?.focus());
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const viewport = window.visualViewport;
    let frame = 0;
    function measure() {
      frame = 0;
      if (!root) return;
      const height = viewport?.height ?? window.innerHeight;
      const bottom = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
      root.style.setProperty("--kody-height", height + "px");
      root.style.setProperty("--kody-bottom", bottom + "px");
      root.dataset.compact = String(height < 500);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(measure); }
    measure();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      root?.style.removeProperty("--kody-height");
      root?.style.removeProperty("--kody-bottom");
      if (root) delete root.dataset.compact;
    };
  }, [open]);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (stickToBottomRef.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, pending, open]);

  async function requestAnswer(message: string, history: ChatHistoryItem[]) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    retryRef.current = { message, history };
    setPending(true);
    setError("");
    try {
      const reply = await askKody(message, history, controller.signal);
      if (controller.signal.aborted) return;
      setMessages((current) => [...current, { id: nextIdRef.current++, role: "assistant", content: reply }]);
      retryRef.current = null;
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Kody could not answer right now.");
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setPending(false); }
    }
  }

  function sendMessage(value: string) {
    const message = value.trim();
    if (!message || pending || requestRef.current || message.length > 1000) return;
    const history = messages.filter((item) => item.id !== 0).slice(-8).map(({ role, content }) => ({ role, content }));
    stickToBottomRef.current = true;
    setMessages((current) => [...current, { id: nextIdRef.current++, role: "user", content: message }]);
    setDraft("");
    void requestAnswer(message, history);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(draft);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendMessage(draft);
    }
  }

  function clearConversation() {
    requestRef.current?.abort();
    requestRef.current = null;
    retryRef.current = null;
    setPending(false);
    setError("");
    setMessages([{ id: 0, role: "assistant", content: WELCOME }]);
    stickToBottomRef.current = true;
    composerRef.current?.focus();
  }

  function closePanel() {
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }

  return (
    <div ref={rootRef} className={styles.root} data-open={open}>
      <aside id="kody-panel" className={styles.panel} data-open={open} role="dialog" aria-label="Kody assistant" aria-hidden={!open} inert={!open}>
        <header className={styles.header}>
          <span className={styles.avatar} aria-hidden="true"><KodyRobot /></span>
          <span className={styles.identity}><strong>Kody</strong><small>Your Kodeistry Assistant</small></span>
          <button type="button" className={styles.iconButton} onClick={clearConversation} aria-label="Clear conversation" title="Clear conversation"><Trash2 size={16} /></button>
          <button type="button" className={styles.iconButton} onClick={closePanel} aria-label="Close Kody assistant"><X size={18} /></button>
        </header>
        <div
          className={styles.messages}
          ref={listRef}
          role="log"
          aria-label="Conversation"
          aria-live="polite"
          onScroll={(event) => {
            const element = event.currentTarget;
            stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72;
          }}
        >
          {messages.map((item) => <div key={item.id} className={item.role === "user" ? styles.userRow : styles.assistantRow}><div className={item.role === "user" ? styles.userBubble : styles.assistantBubble}><MessageText content={item.content} /></div></div>)}
          {messages.length === 1 && <div className={styles.suggestions} aria-label="Suggested questions">{QUESTIONS.map((question) => <button key={question} type="button" onClick={() => sendMessage(question)}>{question}</button>)}</div>}
          {pending && <p className={styles.loading} role="status"><span aria-hidden="true">... </span> Kody is thinking...</p>}
          {error && <div className={styles.error} role="alert"><p>{error}</p><button type="button" disabled={pending} onClick={() => { const retry = retryRef.current; if (retry) void requestAnswer(retry.message, retry.history); }}><RotateCcw size={13} /> Retry</button></div>}
        </div>
        <form className={styles.composer} onSubmit={submit}>
          <label className={styles.srOnly} htmlFor="kody-message">Message Kody</label>
          <textarea id="kody-message" ref={composerRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onComposerKeyDown} maxLength={1000} rows={2} placeholder="Ask Kody a question..." />
          <button type="submit" aria-label="Send message" disabled={!draft.trim() || pending}><Send size={17} /></button>
        </form>
        <p className={styles.note}>AI answers may be inaccurate. Never share passwords or tokens.</p>
      </aside>
      {showGreeting && <span className={styles.tip} data-open={open}>Hi, I&apos;m Kody! Need help?</span>}
      <button
        ref={launcherRef}
        type="button"
        className={styles.launcher}
        aria-label="Open Kody assistant"
        aria-expanded={open}
        aria-controls="kody-panel"
        onClick={() => open ? closePanel() : setOpen(true)}
      >
        <KodyRobot />
      </button>
    </div>
  );
}
