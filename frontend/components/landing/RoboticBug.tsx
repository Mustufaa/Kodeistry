"use client";

import { useEffect, useRef } from "react";
import { createRobotScene } from "./robot-scene";
import { GROUND_Y, patrolTarget, contain, distance, viewportBounds, walk, type Point } from "./robot-motion";
import styles from "./robotic-bug.module.css";

type ScanTarget = { element: Element; point: Point };

export default function RoboticBug() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const robotRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const robot = robotRef.current;
    const scan = scanRef.current;
    const label = labelRef.current;
    const page = overlay?.closest("[data-landing-page]");
    if (!overlay || !robot || !scan || !label || !page) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const lowPower = (device.deviceMemory ?? 8) <= 4 || navigator.hardwareConcurrency <= 4 || coarse.matches || Boolean(device.connection?.saveData);
    let scene: ReturnType<typeof createRobotScene> | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let disposed = false;
    let frame = 0;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let now = 0;
    let last = 0;
    let size = 200;
    let dirty = true;
    let initialized = false;
    let frameInterval = 1000 / (lowPower ? 30 : 60);
    let contextLost = false;
    let renderSamples = 0;
    let renderCost = 0;
    let bounds = viewportBounds(window.innerWidth, window.innerHeight - 104, size, 80);
    const state = { position: { x: bounds.right, y: bounds.top + 80 }, heading: -1, speed: 0 };
    let target = { ...state.position };
    let pointer: Point | undefined;
    let pointerAt = -100;
    let retargetAt = 0;
    let nextScan = 8;
    let scanTarget: ScanTarget | undefined;
    let scanStarted: number | undefined;
    let scanPhase = "";
    let candidates: ScanTarget[] = [];
    let radius = size / 2;
    let pixelsPerUnit = size / 5.8;
    let wasChasing = false;
    let movementAnchor = { ...state.position };
    let movementCheckedAt = 0;
    const random = (min: number, max: number) => min + Math.random() * (max - min);

    function stopScan() {
      scanTarget = undefined;
      scanStarted = undefined;
      scanPhase = "";
      scan!.hidden = true;
      nextScan = now + random(10, 18);
    }
    function patrol() {
      target = patrolTarget(state.position, bounds, [], 0);
      retargetAt = now + random(6, 12);
    }
    function measure() {
      dirty = false;
      const rect = overlay!.getBoundingClientRect();
      const preferredSize = window.innerWidth <= 640 || coarse.matches ? 210 : 300;
      const nextSize = Math.max(1, Math.min(preferredSize, rect.width - 16, rect.height - 120));
      const resized = nextSize !== size || !initialized;
      size = nextSize;
      robot!.style.width = size + "px";
      robot!.style.height = size + "px";
      const header = page!.querySelector("header")?.getBoundingClientRect();
      const metrics = scene?.metrics(size);
      radius = metrics?.radius ?? size * .48;
      pixelsPerUnit = metrics?.pixelsPerUnit ?? size / 5.8;
      // Leave the header and the bottom assistant/controls area clear.
      bounds = viewportBounds(rect.width, Math.max(size + 16, rect.height - 104), radius * 2, header?.bottom ?? 0);
      state.position = contain(state.position, bounds);
      target = contain(target, bounds);
      if (resized) scene?.resize(size);
      candidates = [...page!.querySelectorAll("[data-bug-scan], [data-bug-card]")].flatMap((element) => {
        const card = element.getBoundingClientRect();
        if (card.bottom < 0 || card.top > window.innerHeight) return [];
        return [{ element, point: contain({ x: card.right - 20, y: card.top + 20 }, bounds) }];
      });
    }

    function position() {
      robot!.style.transform = `translate3d(${(state.position.x - size / 2).toFixed(2)}px, ${(state.position.y - size / 2).toFixed(2)}px, 0)`;
    }
    function stopLoop() {
      window.cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    }
    function startLoop() {
      if (disposed || !initialized || frame || document.hidden || reduced.matches) return;
      overlay!.dataset.motion = "running";
      frame = window.requestAnimationFrame(tick);
    }
    function tick(timestamp: number) {
      frame = 0;
      if (disposed || !initialized || document.hidden || reduced.matches) return;
      if (last && timestamp - last < frameInterval - 1) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      const dt = last ? Math.min((timestamp - last) / 1000, 0.1) : 1 / 60;
      last = timestamp;
      now += dt;
      if (dirty) measure();
      const chasing = pointer !== undefined && now - pointerAt < 3;
      if (wasChasing && !chasing) patrol();
      wasChasing = chasing;
      let stopped = false;

      if (chasing) {
        if (scanTarget) stopScan();
        const separation = distance(state.position, pointer!);
        const standOff = Math.min(radius * .7, 60);
        const ratio = Math.max(0, (separation - standOff) / Math.max(separation, 1));
        target = contain({ x: state.position.x + (pointer!.x - state.position.x) * ratio, y: state.position.y + (pointer!.y - state.position.y) * ratio }, bounds);
        stopped = separation <= standOff + 2;
        overlay!.dataset.mode = stopped ? "locked" : "following";
      } else {
        if (!scanTarget && now >= nextScan) {
          // DOM geometry is read only when selecting a target or after scrolling/resizing.
          measure();
          const nearest = candidates.reduce<ScanTarget | undefined>((best, candidate) =>
            !best || distance(state.position, candidate.point) < distance(state.position, best.point) ? candidate : best, undefined);
          if (nearest) {
            scanTarget = nearest;
            target = { ...nearest.point };
            retargetAt = now + Math.max(12, distance(state.position, target) / (size / 5.8) + 5);
          } else nextScan = now + 4;
        }
        if (scanTarget) {
          if (!scanTarget.element.isConnected) stopScan();
          else if (scanStarted === undefined && distance(state.position, target) < 18) {
            scanStarted = now;
          }
          if (scanStarted !== undefined) {
            stopped = true;
            const elapsed = now - scanStarted;
            const phase = elapsed < 1.6 ? "scanning" : elapsed < 2.8 ? "detected" : "fixed";
            if (phase !== scanPhase) {
              scanPhase = phase;
              scan!.hidden = false;
              scan!.dataset.phase = phase;
              label!.textContent = phase === "scanning" ? "SCANNING CODE..." : phase === "detected" ? "BUG DETECTED" : "FIX SUGGESTED ✓";
            }
            if (elapsed >= 4.3) { stopScan(); patrol(); }
          } else if (now > retargetAt) { stopScan(); patrol(); }
          overlay!.dataset.mode = scanStarted === undefined ? "approaching" : "scanning";
        } else {
          if (distance(state.position, target) < 18 || now > retargetAt) {
            patrol();
          }
          overlay!.dataset.mode = "patrol";
        }
      }
      const steering = walk(state, target, bounds, stopped, dt, 1.5 * pixelsPerUnit);
      position();
      // Allow a full smooth turn before deciding that progress has stalled.
      if (now - movementCheckedAt >= 3) {
        if (!stopped && distance(state.position, movementAnchor) < 2) {
          stopScan();
          patrol();
          state.speed = 0;
        }
        movementAnchor = { ...state.position };
        movementCheckedAt = now;
      }
      const renderStart = performance.now();
      const gaze = chasing ? Math.atan2(pointer!.x - state.position.x, (pointer!.y - state.position.y) / GROUND_Y) - state.heading : steering.diff;
      if (!contextLost) scene?.render(dt, now, steering.actualSpeed / pixelsPerUnit, state.heading, Math.atan2(Math.sin(gaze), Math.cos(gaze)), steering.turn);
      renderCost += performance.now() - renderStart;
      renderSamples++;
      // Keep walking on slower GPUs: lower resolution and frame rate instead
      // of permanently freezing after an expensive shader warm-up.
      if (renderSamples === 120) {
        if (renderCost / renderSamples > 24) {
          frameInterval = 1000 / 15;
          scene?.reduceQuality();
        }
        renderSamples = 0;
        renderCost = 0;
      }
      startLoop();
    }
    function onPointer(event: PointerEvent) {
      // Touch and pen scrolling never become follow targets.
      if (event.pointerType !== "mouse" || coarse.matches) return;
      const rect = overlay!.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      pointerAt = now;
    }
    function onScroll() {
      dirty = true;
      pointerAt = -100;
      if (scanTarget) { stopScan(); patrol(); }
    }
    function renderStill() {
      if (!initialized || document.hidden) return;
      measure();
      position();
      if (!contextLost) scene?.render(0, now, 0, state.heading, 0, 0);
    }
    function onLayout() {
      onScroll();
      if (reduced.matches) renderStill();
    }
    function onMotion() {
      stopLoop();
      stopScan();
      overlay!.dataset.motion = reduced.matches ? "reduced" : "running";
      renderStill();
      startLoop();
    }
    function onVisibility() {
      if (document.hidden) { stopLoop(); scan!.hidden = true; }
      else {
        pointerAt = -100;
        stopScan();
        dirty = true;
        if (!initialized) schedule();
        else onMotion();
      }
    }
    function onContextLost(event: Event) {
      event.preventDefault();
      contextLost = true;
      stopLoop();
      stopScan();
      robot!.style.visibility = "visible";
      overlay!.dataset.renderer = "fallback";
      startLoop();
    }
    function onContextRestored() {
      contextLost = false;
      robot!.style.visibility = "visible";
      overlay!.dataset.renderer = "webgl";
      dirty = true;
      onMotion();
    }
    function initialize() {
      idle = undefined; timer = undefined;
      if (disposed || initialized || document.hidden) return;
      canvas = document.createElement("canvas");
      canvas.className = styles.canvas;
      canvas.setAttribute("aria-hidden", "true");
      robot!.prepend(canvas);
      try {
        scene = createRobotScene(canvas, lowPower);
        canvas.addEventListener("webglcontextlost", onContextLost);
        canvas.addEventListener("webglcontextrestored", onContextRestored);
        measure();
        initialized = true;
        patrol();
        robot!.style.visibility = "visible";
        overlay!.dataset.renderer = "webgl";
        onMotion();
      } catch {
        // Keep a visible, animated SVG robot when WebGL is unavailable.
        scene?.dispose();
        scene = undefined;
        canvas.remove();
        initialized = true;
        measure();
        patrol();
        robot!.style.visibility = "visible";
        overlay!.dataset.renderer = "fallback";
        onMotion();
      }
    }
    function schedule() {
      if (disposed || initialized || idle !== undefined || timer !== undefined) return;
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(initialize, { timeout: 1800 });
      else timer = setTimeout(initialize, 150);
    }

    const resizeObserver = new ResizeObserver(onLayout);
    resizeObserver.observe(overlay);
    reduced.addEventListener("change", onMotion);
    // Some browsers update matches before delivering the change event. Reconcile
    // without rendering while reduced/hidden, so playback also resumes reliably.
    const preferenceTimer = setInterval(() => {
      if (!initialized || document.hidden) return;
      if (overlay.dataset.motion !== (reduced.matches ? "reduced" : "running")) onMotion();
    }, 1000);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("resize", onLayout, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", onLayout, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    measure();
    position();
    robot.style.visibility = "visible";
    schedule();
    return () => {
      disposed = true;
      stopLoop();
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
      resizeObserver.disconnect();
      reduced.removeEventListener("change", onMotion);
      clearInterval(preferenceTimer);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onScroll);
      window.visualViewport?.removeEventListener("resize", onLayout);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas?.removeEventListener("webglcontextlost", onContextLost);
      canvas?.removeEventListener("webglcontextrestored", onContextRestored);
      scene?.dispose();
      canvas?.remove();
      robot.style.visibility = "hidden";
      scan.hidden = true;
    };
  }, []);

  return (
    <>
    <div ref={overlayRef} className={styles.overlay} aria-hidden="true" data-robotic-bug data-renderer="pending">
      <div ref={robotRef} className={styles.robot}>
        <svg className={styles.fallback} viewBox="0 0 200 200" aria-hidden="true" data-robot-fallback>
          <g fill="none" stroke="#cbd0de" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M78 76 53 58 35 76M74 100 45 96 25 117M78 123 50 140 40 161M122 76 147 58 165 76M126 100 155 96 175 117M122 123 150 140 160 161" />
            <path d="M89 57 80 35 68 30M111 57 120 35 132 30" strokeWidth="3" />
          </g>
          <ellipse cx="100" cy="103" rx="32" ry="48" fill="#f4f4f5" stroke="#505467" strokeWidth="3" />
          <path d="M100 67v79M73 94h54M74 116h52" stroke="#a0a5b4" strokeWidth="2" />
          <rect x="82" y="49" width="36" height="28" rx="12" fill="#161622" stroke="#cbd0de" strokeWidth="3" />
          <path d="M90 60h5m10 0h5" stroke="#b9aaff" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <div ref={scanRef} className={styles.scan} hidden>
          <b ref={labelRef}>SCANNING CODE...</b>
          <small>Decorative demo</small>
        </div>
      </div>
    </div>
    </>
  );
}

