"use client";

import { useEffect } from "react";

let locks = 0;
let restore: (() => void) | undefined;

/** Reference counted: closing one dialog must not unlock a second overlay. */
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    if (locks++ === 0) {
      const body = document.body, html = document.documentElement;
      const x = window.scrollX, y = window.scrollY;
      const previous = { position: body.style.position, top: body.style.top, left: body.style.left,
        width: body.style.width, paddingRight: body.style.paddingRight, overflow: html.style.overflow };
      const gutter = window.innerWidth - html.clientWidth;
      body.style.position = "fixed";
      body.style.top = `-${y}px`;
      body.style.left = `-${x}px`;
      body.style.width = "100%";
      if (gutter > 0) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gutter}px`;
      html.style.overflow = "hidden";
      restore = () => {
        Object.assign(body.style, { position: previous.position, top: previous.top, left: previous.left,
          width: previous.width, paddingRight: previous.paddingRight });
        html.style.overflow = previous.overflow;
        const behavior = html.style.scrollBehavior;
        html.style.scrollBehavior = "auto";
        window.scrollTo(x, y);
        html.style.scrollBehavior = behavior;
      };
    }
    return () => {
      if (--locks === 0) { restore?.(); restore = undefined; }
    };
  }, [active]);
}
