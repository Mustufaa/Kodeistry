"use client";

import { useEffect, useRef } from "react";
import { createRobotScene } from "./robot-scene";
import { RobotJourney, PAUSE, type Point } from "./robot-journey";
import styles from "./robotic-bug.module.css";

export default function RoboticBug() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const robotRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current, robot = robotRef.current;
    const scan = scanRef.current, label = labelRef.current;
    if (!overlay || !robot || !scan || !label) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const lowPower = coarse.matches || (device.deviceMemory ?? 8) <= 4 ||
      navigator.hardwareConcurrency <= 4 || Boolean(device.connection?.saveData);
    let scene: ReturnType<typeof createRobotScene> | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let journey: RobotJourney | undefined;
    let pointer: Point | undefined;
    let frame = 0, last = 0, now = 0, size = 0;
    let dirty = true, disposed = false, contextLost = false;
    let interval = 1000 / (lowPower ? 30 : 60), samples = 0, cost = 0;
    let wake: ReturnType<typeof setTimeout> | undefined;
    let wakeStarted = 0;
    let idle: number | undefined;

    function measure() {
      dirty = false;
      const width = window.innerWidth, height = window.innerHeight;
      const nextSize = Math.max(1, Math.min(coarse.matches || width <= 640 ? 150 : 260, width - 16, height - 16));
      const header = overlay!.parentElement?.querySelector("header")?.getBoundingClientRect().bottom ?? 80;
      const viewport = { width, height, size: nextSize, header };
      if (!journey) journey = new RobotJourney(viewport);
      else journey.resize(viewport);
      if (nextSize !== size) {
        size = nextSize;
        robot!.style.width = size + "px";
        robot!.style.height = size + "px";
        scene?.resize(size);
      }
    }
    function paint() {
      if (!journey) return;
      overlay!.dataset.phase = journey.phase;
      overlay!.dataset.cycles = String(journey.cycles);
      overlay!.dataset.mode = pointer && journey.phase === "touring" ? "following" : journey.phase;
      robot!.style.transform = `translate3d(${(journey.position.x - size / 2).toFixed(2)}px, ${(journey.position.y - size / 2).toFixed(2)}px, 0)`;
      robot!.style.visibility = journey.phase === "waiting" ? "hidden" : "visible";
      scan!.hidden = journey.phase !== "pausing" || coarse.matches;
      if (!scan!.hidden) {
        const elapsed = PAUSE - journey.remaining;
        scan!.dataset.phase = elapsed < .25 ? "scanning" : elapsed < .5 ? "detected" : "fixed";
        label!.textContent = elapsed < .25 ? "SCANNING CODE..." : elapsed < .5 ? "BUG DETECTED" : "FIX SUGGESTED";
      }
    }
    function stop() {
      window.cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      if (wake !== undefined) {
        clearTimeout(wake);
        wake = undefined;
        // Preserve the remainder of the intentional off-screen delay.
        if (journey?.phase === "waiting") journey.remaining = Math.max(0, journey.remaining - (performance.now() - wakeStarted) / 1000);
      }
    }
    function start() {
      if (disposed || !scene || contextLost || reduced.matches || document.hidden || frame || wake !== undefined) return;
      overlay!.dataset.motion = "running";
      if (journey?.phase === "waiting") {
        // No animation frames or WebGL rendering during the re-entry delay.
        wakeStarted = performance.now();
        wake = setTimeout(() => {
          wake = undefined;
          journey?.advance((performance.now() - wakeStarted) / 1000);
          if (dirty) measure();
          paint();
          start();
        }, Math.max(1, journey.remaining * 1000));
      } else frame = window.requestAnimationFrame(tick);
    }
    function tick(timestamp: number) {
      frame = 0;
      if (!scene || disposed || document.hidden || reduced.matches || contextLost) return;
      if (last && timestamp - last < interval - 1) { start(); return; }
      const dt = last ? Math.min((timestamp - last) / 1000, 0.1) : 0;
      last = timestamp;
      now += dt;
      if (dirty) measure();
      const previousHeading = journey!.heading;
      journey!.advance(dt, pointer);
      paint();
      if (journey!.phase !== "waiting") {
        const diff = journey!.heading - previousHeading;
        const renderStart = performance.now();
        scene.render(dt, now, journey!.speed / (size / 5.8), journey!.heading, diff, Math.max(-1, Math.min(1, diff / Math.max(dt, .001) / 2.6)));
        cost += performance.now() - renderStart;
        if (++samples === 120) {
          if (cost / samples > 24) { interval = 1000 / 15; scene.reduceQuality(); }
          cost = samples = 0;
        }
      } else last = 0;
      start();
    }
    function onPointer(event: PointerEvent) {
      if (event.pointerType === "mouse") pointer = { x: event.clientX, y: event.clientY };
    }
    function releasePointer() { pointer = undefined; }
    function onPointerOut(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.relatedTarget === null) releasePointer();
    }
    function onLayout() { dirty = true; }
    function onContextLost(event: Event) {
      event.preventDefault();
      contextLost = true;
      stop();
      robot!.style.visibility = "hidden";
      overlay!.dataset.renderer = "unavailable";
    }
    function onContextRestored() {
      contextLost = false;
      dirty = true;
      overlay!.dataset.renderer = "webgl";
      start();
    }
    function initialize() {
      idle = undefined;
      if (disposed || reduced.matches || document.hidden || scene) return;
      canvas = document.createElement("canvas");
      canvas.className = styles.canvas;
      canvas.setAttribute("aria-hidden", "true");
      robot!.prepend(canvas);
      try {
        scene = createRobotScene(canvas, lowPower);
        canvas.addEventListener("webglcontextlost", onContextLost);
        canvas.addEventListener("webglcontextrestored", onContextRestored);
        measure();
        overlay!.dataset.renderer = "webgl";
        start();
      } catch {
        canvas.remove();
        overlay!.dataset.renderer = "unavailable";
      }
    }
    function resume() {
      stop();
      if (reduced.matches) {
        overlay!.dataset.motion = "reduced";
        overlay!.dataset.phase = "reduced";
        robot!.style.visibility = "hidden";
        return;
      }
      if (document.hidden) { releasePointer(); return; }
      dirty = true;
      if (scene) start();
      else if (idle === undefined) {
        if ("requestIdleCallback" in window) idle = window.requestIdleCallback(initialize, { timeout: 1800 });
        else initialize();
      }
    }
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerout", onPointerOut, { passive: true });
    window.addEventListener("blur", releasePointer);
    window.addEventListener("resize", onLayout, { passive: true });
    window.addEventListener("scroll", onLayout, { passive: true });
    window.visualViewport?.addEventListener("resize", onLayout, { passive: true });
    document.addEventListener("visibilitychange", resume);
    reduced.addEventListener("change", resume);
    resume();
    return () => {
      disposed = true;
      stop();
      if (idle !== undefined) window.cancelIdleCallback(idle);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("blur", releasePointer);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout);
      window.visualViewport?.removeEventListener("resize", onLayout);
      document.removeEventListener("visibilitychange", resume);
      reduced.removeEventListener("change", resume);
      canvas?.removeEventListener("webglcontextlost", onContextLost);
      canvas?.removeEventListener("webglcontextrestored", onContextRestored);
      scene?.dispose();
      canvas?.remove();
      robot.style.visibility = "hidden";
    };
  }, []);
  return (
    <div ref={overlayRef} className={styles.overlay} aria-hidden="true" data-robotic-bug data-renderer="pending">
      <div ref={robotRef} className={styles.robot} data-bug-body>
        <div ref={scanRef} className={styles.scan} hidden><b ref={labelRef}>SCANNING CODE...</b><small>Decorative demo</small></div>
      </div>
    </div>
  );
}
