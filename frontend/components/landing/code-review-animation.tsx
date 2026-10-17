"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Code2, Pause, Play, ScanLine, ShieldCheck } from "lucide-react";

import styles from "./code-review-animation.module.css";

type Issue = {
  file: string;
  label: string;
  before: string;
  after: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  color: string;
};

const SCAN_START = 1600;
const SCAN_DURATION = 6000;
const BEAM_START = 8;
const BEAM_END = 91;
const RESOLVE_DELAY = 650;
const COMPLETE_AT = 8200;
const LOOP_END = 11800;
const STATIC_FRAME = COMPLETE_AT + 100;

const issues: Issue[] = [
  {
    file: "query.ts",
    label: "Security issue",
    before: "db.query(`SELECT * FROM users WHERE id=${id}`)",
    after: 'db.query("SELECT * FROM users WHERE id=$1", [id])',
    startX: 12, startY: 12, x: 29, y: 8, color: "violet",
  },
  {
    file: "profile.ts",
    label: "Logic bug",
    before: "user.name.toLowerCase()",
    after: 'user?.name?.toLowerCase() ?? "Guest"',
    startX: 36, startY: 88, x: 55, y: 93, color: "amber",
  },
  {
    file: "notify.ts",
    label: "Unhandled error",
    before: "sendNotice(id)",
    after: "sendNotice(id).catch(onError)",
    startX: 61, startY: 5, x: 78, y: 10, color: "coral",
  },
];

const detectedAt = (x: number) => SCAN_START + ((x - BEAM_START) / (BEAM_END - BEAM_START)) * SCAN_DURATION;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const particleRays = [
  [-21, -18], [0, -27], [22, -15], [-23, 11], [23, 14], [1, 25],
];

function PixelBug() {
  return (
    <svg className={styles.bugSvg} viewBox="0 0 28 28" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <rect x="5" y="2" width="3" height="5" fill="currentColor" />
      <rect x="20" y="2" width="3" height="5" fill="currentColor" />
      <rect x="1" y="10" width="4" height="3" fill="currentColor" />
      <rect x="0" y="18" width="5" height="3" fill="currentColor" />
      <rect x="23" y="10" width="4" height="3" fill="currentColor" />
      <rect x="23" y="18" width="5" height="3" fill="currentColor" />
      <rect x="5" y="6" width="18" height="17" fill="currentColor" />
      <rect x="8" y="23" width="4" height="3" fill="currentColor" />
      <rect x="16" y="23" width="4" height="3" fill="currentColor" />
      <rect x="8" y="10" width="4" height="4" fill="#161322" />
      <rect x="17" y="10" width="4" height="4" fill="#161322" />
      <rect x="9" y="10" width="1" height="1" fill="#ffffff" />
      <rect x="18" y="10" width="1" height="1" fill="#ffffff" />
      <rect x="12" y="17" width="5" height="2" fill="#161322" />
      <rect x="7" y="7" width="3" height="2" fill="#ffffff" opacity=".48" />
    </svg>
  );
}

export function CodeReviewAnimation() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const reconcileRef = useRef<(() => void) | null>(null);
  const resetTiltRef = useRef<(() => void) | null>(null);
  // The server and first client render show a completed scan. Reduced motion stays here.
  const [elapsed, setElapsed] = useState(STATIC_FRAME);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sceneSize, setSceneSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const scene = sceneRef.current;
    const visual = visualRef.current;
    if (!scene || !visual) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = false;
    let pageVisible = document.visibilityState === "visible";
    let started = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const reconcile = () => {
      if (interval) clearInterval(interval);
      interval = undefined;
      setReducedMotion(motion.matches);
      if (motion.matches) {
        setElapsed(STATIC_FRAME);
        resetTiltRef.current?.();
        return;
      }
      if (!inView || !pageVisible || pausedRef.current) {
        resetTiltRef.current?.();
        return;
      }
      if (!started) {
        started = true;
        setElapsed(0);
      }
      interval = setInterval(() => setElapsed((value) => (value + 50) % LOOP_END), 50);
    };
    reconcileRef.current = reconcile;

    const intersection = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      reconcile();
    }, { threshold: 0.15 });
    intersection.observe(scene);

    const resize = new ResizeObserver(([entry]) => {
      setSceneSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    resize.observe(visual);

    const onVisibilityChange = () => {
      pageVisible = document.visibilityState === "visible";
      reconcile();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    motion.addEventListener("change", reconcile);

    return () => {
      intersection.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motion.removeEventListener("change", reconcile);
      if (interval) clearInterval(interval);
      reconcileRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const editor = editorRef.current;
    if (!scene || !editor) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;

    const reset = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pointer = null;
      editor.style.setProperty("--tilt-x", "0deg");
      editor.style.setProperty("--tilt-y", "0deg");
    };
    resetTiltRef.current = reset;

    const onPointerMove = (event: PointerEvent) => {
      if (!finePointer.matches || motion.matches || pausedRef.current) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!pointer) return;
        const bounds = scene.getBoundingClientRect();
        const relativeX = clamp((pointer.x - bounds.left) / bounds.width);
        const relativeY = clamp((pointer.y - bounds.top) / bounds.height);
        editor.style.setProperty("--tilt-x", ((0.5 - relativeY) * 8).toFixed(2) + "deg");
        editor.style.setProperty("--tilt-y", ((relativeX - 0.5) * 8).toFixed(2) + "deg");
      });
    };
    scene.addEventListener("pointermove", onPointerMove);
    scene.addEventListener("pointerleave", reset);
    return () => {
      scene.removeEventListener("pointermove", onPointerMove);
      scene.removeEventListener("pointerleave", reset);
      reset();
      resetTiltRef.current = null;
    };
  }, []);

  const togglePaused = () => {
    if (reducedMotion) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (next) resetTiltRef.current?.();
    reconcileRef.current?.();
  };

  const scanning = elapsed >= SCAN_START && elapsed <= SCAN_START + SCAN_DURATION;
  const complete = elapsed >= COMPLETE_AT;
  const beamX = (BEAM_START + (BEAM_END - BEAM_START) * clamp((elapsed - SCAN_START) / SCAN_DURATION)) * sceneSize.width / 100;

  return (
    <div className={styles.scene} ref={sceneRef}>
      <div className={styles.sceneTop}>
        <span className={styles.exampleLabel}><span className={styles.labelPixel} aria-hidden="true" /> Example scan</span>
        <button
          type="button"
          className={styles.pauseButton}
          onClick={togglePaused}
          disabled={reducedMotion}
          aria-label={paused ? "Resume example scan" : "Pause example scan"}
          aria-pressed={paused}
          title={reducedMotion ? "Animation disabled by reduced motion setting" : paused ? "Resume example scan" : "Pause example scan"}
        >
          {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
          <span>{paused ? "Resume" : "Pause"}</span>
        </button>
      </div>

      <div ref={visualRef} className={styles.visual} aria-hidden="true">
        <span className={styles.sceneGrid} />
        <span className={styles.floatTile + " " + styles.floatOne} style={{ transform: "translate3d(0," + Math.sin(elapsed / 1100) * 5 + "px,0)" }}>{"{ }"}</span>
        <span className={styles.floatTile + " " + styles.floatTwo} style={{ transform: "translate3d(0," + Math.sin(elapsed / 1250 + 1) * 5 + "px,0)" }}><Code2 size={16} /></span>

        <div ref={editorRef} className={styles.editor}>
          <div className={styles.editorBar}>
            <span className={styles.windowSquares}><i /><i /><i /></span>
            <span className={styles.editorTitle}><Code2 size={13} /> pull-request / review.ts</span>
            <span className={styles.editorTag}>AI REVIEW</span>
          </div>
          <div className={styles.codeList}>
            {issues.map((issue, index) => {
              const detected = elapsed >= detectedAt(issue.x);
              const resolved = elapsed >= detectedAt(issue.x) + RESOLVE_DELAY;
              return (
                <div key={issue.file} className={[styles.codeBlock, detected && !resolved ? styles.blockDetected : "", resolved ? styles.blockResolved : ""].join(" ")}>
                  <div className={styles.blockHeader}>
                    <span className={styles.lineNumber}>{String(index * 4 + 8).padStart(2, "0")}</span>
                    <span className={styles.fileName}>{issue.file}</span>
                    <span className={styles.blockStatus}>{resolved ? <Check size={12} /> : detected ? <ScanLine size={12} /> : <span className={styles.issueDot} />}{resolved ? "Resolved" : detected ? "Detected" : "Issue"}</span>
                  </div>
                  <code className={styles.codeLine}>{resolved ? issue.after : issue.before}</code>
                </div>
              );
            })}
          </div>
          <div className={styles.editorFoot}><span><span className={styles.footSquare} /> kodeistry.ai</span><span>3 checks</span></div>
        </div>

        {sceneSize.width > 0 && scanning && (
          <span className={styles.scanBeam} style={{ transform: "translate3d(" + beamX + "px,0,0) translateX(-50%)" }} />
        )}

        {sceneSize.width > 0 && issues.map((issue, index) => {
          const foundAt = detectedAt(issue.x);
          const resolvedAt = foundAt + RESOLVE_DELAY;
          const crawl = clamp(elapsed / foundAt);
          const x = (issue.startX + (issue.x - issue.startX) * crawl) * sceneSize.width / 100;
          const y = (issue.startY + (issue.y - issue.startY) * crawl) * sceneSize.height / 100
            + (elapsed < foundAt ? Math.sin(elapsed / 140 + index) * 1.5 : 0);
          const detected = elapsed >= foundAt && elapsed < resolvedAt;
          const visible = elapsed < resolvedAt;
          const burst = elapsed >= resolvedAt && elapsed < resolvedAt + 550;
          const particleProgress = clamp((elapsed - resolvedAt) / 550);

          return (
            <div key={issue.file} className={[styles.bugLayer, styles["bug" + index]].join(" ")}>
              {visible && (
                <span
                  className={[styles.bug, styles[issue.color], detected ? styles.detectedBug : ""].join(" ")}
                  style={{ transform: "translate3d(" + x + "px," + y + "px,0) translate(-50%,-50%)" }}
                >
                  <PixelBug />
                  {detected && <span className={styles.bugLabel}>{issue.label}</span>}
                </span>
              )}
              {burst && particleRays.map(([dx, dy], particle) => (
                <span
                  key={particle}
                  className={[styles.particle, styles[issue.color]].join(" ")}
                  style={{
                    opacity: 1 - particleProgress,
                    transform: "translate3d(" + (x + dx * particleProgress) + "px," + (y + dy * particleProgress) + "px,0)",
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div className={styles.statusBar} aria-live="off">
        <span className={styles.statusText}><ShieldCheck size={15} aria-hidden="true" />{complete ? "Scan complete · 3 bugs resolved" : paused ? "Scan paused" : scanning ? "AI scanner in progress" : "Tracking code issues"}</span>
        <span className={styles.statusCount}>{issues.filter((issue) => elapsed >= detectedAt(issue.x) + RESOLVE_DELAY).length} / 3 resolved</span>
      </div>
    </div>
  );
}
