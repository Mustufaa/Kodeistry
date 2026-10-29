"use client";

import { useEffect, useRef } from "react";
import { createRobotScene } from "./robot-scene";
import { contain, distance, viewportBounds, walk, type Point } from "./robot-motion";
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
    const page = overlay?.parentElement;
    if (!overlay || !robot || !scan || !label || !page) return;

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
    let size = 300;
    let dirty = true;
    let initialized = false;
    let frameInterval = 1000 / (lowPower ? 30 : 60);
    let contextLost = false;
    let renderSamples = 0;
    let renderCost = 0;
    let bounds = viewportBounds(window.innerWidth, window.innerHeight, size, 80);
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
    const random = (min: number, max: number) => min + Math.random() * (max - min);

    function stopScan() {
      scanTarget = undefined;
      scanStarted = undefined;
      scanPhase = "";
      scan!.hidden = true;
      nextScan = now + random(10, 18);
    }
    function patrol() {
      target = { x: random(bounds.left, bounds.right), y: random(bounds.top, bounds.bottom) };
      retargetAt = now + random(6, 12);
    }
    function measure() {
      dirty = false;
      const preferredSize = window.innerWidth <= 640 || coarse.matches ? 210 : 300;
      const nextSize = Math.max(1, Math.min(preferredSize, window.innerWidth - 16, window.innerHeight - 16));
      const resized = nextSize !== size || !initialized;
      size = nextSize;
      robot!.style.width = size + "px";
      robot!.style.height = size + "px";
      const header = page!.querySelector("header")?.getBoundingClientRect();
      bounds = viewportBounds(window.innerWidth, window.innerHeight, size, header?.bottom ?? 0);
      state.position = contain(state.position, bounds);
      target = contain(target, bounds);
      if (resized) scene?.resize(size);
      candidates = [];
      for (const element of page!.querySelectorAll("[data-bug-scan], [data-bug-card]")) {
        const rect = element.getBoundingClientRect();
        if (rect.bottom < bounds.top || rect.top > bounds.bottom || rect.right < 0 || rect.left > window.innerWidth) continue;
        const points = [
          { x: rect.left + 18, y: rect.top + 18 },
          { x: rect.right - 18, y: rect.top + 18 },
          { x: rect.left + 18, y: rect.bottom - 18 },
          { x: rect.right - 18, y: rect.bottom - 18 },
        ];
        for (const point of points) {
          const contained = contain(point, bounds);
          if (distance(contained, point) < 30) candidates.push({ element, point: contained });
        }
      }
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
      if (disposed || !scene || contextLost || frame || document.hidden) return;
      // Automatic playback is intentional, including with reduced-motion enabled.
      overlay!.dataset.motion = "running";
      frame = window.requestAnimationFrame(tick);
    }
    function tick(timestamp: number) {
      frame = 0;
      if (disposed || !scene || document.hidden) return;
      if (last && timestamp - last < frameInterval - 1) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      const dt = last ? Math.min((timestamp - last) / 1000, 0.1) : 1 / 60;
      last = timestamp;
      now += dt;
      if (dirty) measure();
      const chasing = pointer !== undefined && now - pointerAt < 2.5;
      let stopped = false;

      if (chasing) {
        if (scanTarget) stopScan();
        target = contain(pointer!, bounds);
        stopped = distance(state.position, target) < size * 0.35;
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
            retargetAt = now + 12;
          } else nextScan = now + 4;
        }
        if (scanTarget) {
          if (!scanTarget.element.isConnected) stopScan();
          else if (scanStarted === undefined && distance(state.position, target) < 18) {
            scanStarted = now;
            state.speed = 0;
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
      const pixelsPerUnit = size / 5.8;
      const steering = walk(state, target, bounds, stopped, dt, 1.5 * pixelsPerUnit);
      position();
      const renderStart = performance.now();
      scene.render(dt, now, state.speed / pixelsPerUnit, state.heading, steering.diff, steering.turn);
      renderCost += performance.now() - renderStart;
      renderSamples++;
      // Keep walking on slower GPUs: lower resolution and frame rate instead
      // of permanently freezing after an expensive shader warm-up.
      if (renderSamples === 120) {
        if (renderCost / renderSamples > 24) {
          frameInterval = 1000 / 15;
          scene.reduceQuality();
        }
        renderSamples = 0;
        renderCost = 0;
      }
      startLoop();
    }
    function onPointer(event: PointerEvent) {
      // Touch and pen scrolling never become follow targets.
      if (event.pointerType !== "mouse" || coarse.matches) return;
      pointer = contain({ x: event.clientX, y: event.clientY }, bounds);
      pointerAt = now;
    }
    function onScroll() {
      dirty = true;
      pointerAt = -100;
      if (scanTarget) { stopScan(); patrol(); }
    }
    function onLayout() {
      onScroll();
    }
    function onVisibility() {
      if (document.hidden) { stopLoop(); scan!.hidden = true; }
      else {
        pointerAt = -100;
        stopScan();
        dirty = true;
        if (!scene) schedule();
        else startLoop();
      }
    }
    function onContextLost(event: Event) {
      event.preventDefault();
      contextLost = true;
      stopLoop();
      stopScan();
      robot!.style.visibility = "hidden";
      overlay!.dataset.renderer = "unavailable";
    }
    function onContextRestored() {
      contextLost = false;
      robot!.style.visibility = "visible";
      overlay!.dataset.renderer = "webgl";
      dirty = true;
      startLoop();
    }
    function initialize() {
      idle = undefined; timer = undefined;
      if (disposed || scene || document.hidden) return;
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
        startLoop();
      } catch {
        // Decoration is optional: no error UI, layout shift, or blocked controls.
        canvas.remove();
        overlay!.dataset.renderer = "unavailable";
      }
    }
    function schedule() {
      if (disposed || scene || idle !== undefined || timer !== undefined) return;
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(initialize, { timeout: 1800 });
      else timer = setTimeout(initialize, 150);
    }

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("resize", onLayout, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", onLayout, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      disposed = true;
      stopLoop();
      if (idle !== undefined) window.cancelIdleCallback(idle);
      if (timer !== undefined) clearTimeout(timer);
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
    <div ref={overlayRef} className={styles.overlay} aria-hidden="true" data-robotic-bug data-renderer="pending">
      <div ref={robotRef} className={styles.robot}>
        <div ref={scanRef} className={styles.scan} hidden>
          <b ref={labelRef}>SCANNING CODE...</b>
          <small>Decorative demo</small>
        </div>
      </div>
    </div>
  );
}

