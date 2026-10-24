"use client";

import { useEffect, useRef } from "react";

import { BUG_PAUSE_MIN, BUG_PAUSE_VARIATION, BUG_SPEED_DESKTOP, BUG_SPEED_MOBILE } from "./bug-motion";
import { PixelInsect } from "./crawling-bug";
import bugStyles from "./crawling-bug.module.css";
import styles from "./section-insect.module.css";

export function SectionInsect({ path }: { path: "hero" | "grid" }) {
  const trackRef = useRef<HTMLSpanElement>(null);
  const mascotRef = useRef<HTMLSpanElement>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const mascot = mascotRef.current;
    const body = bodyRef.current;
    if (!track || !mascot || !body) return;

    let visible = false;
    let frame = 0;
    let lastFrame = 0;
    let position = { x: 0, y: 0 };
    let waypoints: { x: number; y: number }[] = [];
    let nextWaypoint = 0;
    let pauseFor = 0;
    let walking = false;

    const setWalking = (value: boolean) => {
      if (walking === value) return;
      walking = value;
      mascot.dataset.walking = String(value);
    };

    const render = (heading: number) => {
      const size = window.innerWidth <= 640 ? 24 : 32;
      mascot.style.transform = "translate3d(" + (position.x - size / 2) + "px," + (position.y - size / 2) + "px,0)";
      body.style.transform = "rotate(" + heading + "rad)";
    };

    const measure = () => {
      const { width, height } = track.getBoundingClientRect();
      const size = window.innerWidth <= 640 ? 24 : 32;
      const inset = size / 2 + 3;
      const left = Math.min(inset, width / 2);
      const right = Math.max(left, width - inset);
      const top = Math.min(inset, height / 2);
      const bottom = Math.max(top, height - inset);
      waypoints = path === "hero"
        ? [{ x: left, y: top }, { x: left, y: bottom }, { x: right, y: bottom }, { x: right, y: top }]
        : [{ x: left, y: bottom }, { x: right, y: bottom }, { x: right, y: top }, { x: left, y: top }];
      position = { ...waypoints[0] };
      nextWaypoint = 0;
      pauseFor = 0;
      render(0);
    };

    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = 0;
      setWalking(false);
    };

    const tick = (time: number) => {
      frame = 0;
      if (!visible || document.hidden) {
        stop();
        return;
      }
      const delta = lastFrame ? Math.min((time - lastFrame) / 1000, 0.05) : 0;
      lastFrame = time;
      if (pauseFor > 0) {
        pauseFor = Math.max(0, pauseFor - delta);
        setWalking(false);
      } else if (waypoints.length) {
        const target = waypoints[(nextWaypoint + 1) % waypoints.length];
        const dx = target.x - position.x;
        const dy = target.y - position.y;
        const distance = Math.hypot(dx, dy);
        const heading = Math.atan2(dy, dx);
        const step = Math.min(distance, (window.innerWidth <= 640 ? BUG_SPEED_MOBILE : BUG_SPEED_DESKTOP) * delta);
        if (distance > 0) {
          position.x += dx / distance * step;
          position.y += dy / distance * step;
        }
        render(heading);
        setWalking(step > 0);
        if (distance - step < 0.01) {
          nextWaypoint = (nextWaypoint + 1) % waypoints.length;
          pauseFor = BUG_PAUSE_MIN + Math.random() * BUG_PAUSE_VARIATION;
          setWalking(false);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (frame || !visible || document.hidden) return;
      lastFrame = 0;
      frame = window.requestAnimationFrame(tick);
    };

    const updateActivity = () => {
      const bounds = track.getBoundingClientRect();
      visible = bounds.width > 0 && bounds.height > 0 &&
        bounds.bottom > 0 && bounds.top < window.innerHeight &&
        bounds.right > 0 && bounds.left < window.innerWidth;
      if (visible && !document.hidden) start();
      else stop();
    };

    const handleResize = () => {
      measure();
      updateActivity();
    };

    measure();
    updateActivity();
    window.addEventListener("scroll", updateActivity, { passive: true });
    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", updateActivity);
    return () => {
      stop();
      window.removeEventListener("scroll", updateActivity);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", updateActivity);
    };
  }, [path]);

  return (
    <span ref={trackRef} className={styles.track} data-bug-ui aria-hidden="true">
      <span ref={mascotRef} className={bugStyles.mascot + " " + styles.sectionMascot} data-landing-bug={path} data-motion="on" data-walking="false">
        <span ref={bodyRef} className={bugStyles.insect}><PixelInsect /></span>
      </span>
    </span>
  );
}