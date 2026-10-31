"use client";

import { useEffect, useRef, type RefObject } from "react";

type Phase = "visible" | "dismantling" | "hidden" | "assembling";
const parts: Record<string, [number, number, number]> = {
  neck: [0, 2, 8], head: [-3, -17, -8], body: [-3, 5, 5],
  "left-arm": [-17, -5, -22], "right-arm": [9, -4, 22],
  "left-leg": [-11, 7, -15], "right-leg": [7, 7, 15],
};

/** One cancelable visibility timeline. Chat state stays mounted throughout. */
export function useKodyVisibility(ref: RefObject<HTMLButtonElement | null>, open: boolean) {
  // Preserve input modality when opening/closing chat restarts the effect.
  const keyboardInput = useRef(true);
  const lastPointer = useRef("mouse");
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const launcher: HTMLButtonElement = element;
    const root = launcher.parentElement!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let phase: Phase = "visible";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let animations: Animation[] = [];
    let generation = 0;
    let mouseOver = lastPointer.current === "mouse" && matchMedia("(any-hover: hover)").matches && launcher.matches(":hover");
    const held = () => open || document.hidden || mouseOver || (keyboardInput.current && launcher.matches(":focus-within"));
    function setPhase(next: Phase) {
      phase = next;
      launcher.dataset.phase = root.dataset.kodyPhase = next;
      launcher.dataset.away = String(next === "hidden");
      launcher.hidden = next === "hidden";
      launcher.inert = next === "hidden";
    }
    function cancel() {
      generation++;
      clearTimeout(timer);
      animations.forEach(animation => animation.cancel());
      animations = [];
    }
    function schedule() {
      clearTimeout(timer);
      if (!held()) timer = setTimeout(() => { if (!held()) transition(false); }, 10_000);
    }
    function transition(show: boolean) {
      // Reverse an interrupted dismantle from the current pose, without a jump.
      if (show && phase === "dismantling" && animations.length) {
        generation++;
        clearTimeout(timer);
        setPhase("assembling");
        animations.forEach(animation => animation.reverse());
        finish(true);
        return;
      }
      cancel();
      setPhase(show ? "assembling" : "dismantling");
      const duration = reduced.matches ? 120 : 1800;
      function animate(element: Element, frames: Keyframe[]) {
        animations.push(element.animate(frames, { duration, fill: "both", direction: show ? "reverse" : "normal", easing: "ease-in-out" }));
      }
      if (reduced.matches) {
        animate(launcher, [{ opacity: 1 }, { opacity: 0 }]);
      } else {
        launcher.querySelectorAll<SVGElement>("[data-kody-part]").forEach((element, index) => {
          const [x, y, angle] = parts[element.dataset.kodyPart!];
          const detached = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
          animate(element, [
            { transform: "none", opacity: 1, offset: 0 },
            { transform: element.dataset.kodyPart === "head" ? "translateY(2px) rotate(3deg)" : "none", opacity: 1, offset: .1667 },
            { transform: detached, opacity: 1, offset: .42 + index * .016 },
            { transform: `${detached} scale(.35)`, opacity: 0, offset: .8333 },
            { transform: `${detached} scale(0)`, opacity: 0, offset: 1 },
          ]);
        });
        launcher.querySelectorAll("[data-kody-fragment]").forEach((element, index) => {
          const angle = index * 2.4;
          const scatter = `translate(${Math.cos(angle) * 24 - 7}px, ${Math.sin(angle) * 21 - 5}px) rotate(${index * 31}deg)`;
          animate(element, [
            { opacity: 0, transform: "scale(.2)", offset: 0 },
            { opacity: 0, transform: "scale(.4)", offset: .5 },
            { opacity: .8, transform: scatter, offset: .67 },
            { opacity: .3, transform: `${scatter} scale(.5)`, offset: .8333 },
            { opacity: 0, transform: `${scatter} scale(0)`, offset: 1 },
          ]);
        });
        for (const element of launcher.querySelectorAll("[data-kody-eyes]")) animate(element, [
          { opacity: 1, offset: 0 }, { opacity: .08, offset: .1667 }, { opacity: 0, offset: 1 },
        ]);
        for (const element of launcher.querySelectorAll("[data-kody-energy]")) animate(element, [
          { opacity: 0, transform: "scale(.5)", offset: 0 }, { opacity: 0, offset: .5 },
          { opacity: .4, transform: "scale(1)", offset: .65 }, { opacity: 0, transform: "scale(.1)", offset: 1 },
        ]);
      }
      finish(show);
    }
    function finish(show: boolean) {
      const token = ++generation;
      void Promise.all(animations.map(animation => animation.finished)).then(() => {
        if (token !== generation) return;
        cancel();
        setPhase(show ? "visible" : "hidden");
        if (show) schedule();
        else timer = setTimeout(() => transition(true), 5_000);
      }).catch(() => { /* Cancellation is expected on interaction/unmount. */ });
    }
    function interact() {
      if (phase === "hidden" || phase === "dismantling") transition(true);
      else if (phase === "visible") schedule();
    }
    function visibility() {
      cancel();
      setPhase("visible");
      root.dataset.tabHidden = String(document.hidden);
      schedule();
    }
    function pointerDown(event: PointerEvent) {
      keyboardInput.current = false;
      lastPointer.current = event.pointerType;
      if (event.pointerType !== "mouse") mouseOver = false;
      if (launcher.contains(event.target as Node)) interact();
      else if (phase === "visible") schedule();
    }
    function keyboard(event: globalThis.KeyboardEvent) {
      if (event.key !== "Tab") return;
      keyboardInput.current = true;
      if (phase === "visible") schedule();
    }
    function pointerEnter(event: PointerEvent) {
      lastPointer.current = event.pointerType;
      mouseOver = event.pointerType === "mouse";
      interact();
    }
    function pointerLeave() { mouseOver = false; interact(); }
    const events = ["focus", "blur"] as const;
    events.forEach(event => launcher.addEventListener(event, interact));
    launcher.addEventListener("pointerenter", pointerEnter);
    launcher.addEventListener("pointerleave", pointerLeave);
    launcher.addEventListener("pointercancel", pointerLeave);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", visibility);
    visibility();
    return () => {
      cancel(); setPhase("visible");
      events.forEach(event => launcher.removeEventListener(event, interact));
      launcher.removeEventListener("pointerenter", pointerEnter);
      launcher.removeEventListener("pointerleave", pointerLeave);
      launcher.removeEventListener("pointercancel", pointerLeave);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", visibility);
    };
  }, [ref, open]);
}
