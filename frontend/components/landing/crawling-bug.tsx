"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./crawling-bug.module.css";

type Point = { x: number; y: number };
type Box = { left: number; top: number; right: number; bottom: number };
type Grid = {
  columns: number;
  rows: number;
  left: number;
  top: number;
  step: number;
  blocked: Uint8Array;
  width: number;
  height: number;
};

const GRID_STEP = 24;
const particleDirections = [
  [-23, -19], [-5, -28], [20, -22], [-27, 8],
  [25, 11], [-12, 25], [12, 27], [30, -2],
];

function rectInPage(rect: DOMRect, page: DOMRect): Box {
  return {
    left: rect.left - page.left,
    top: rect.top - page.top,
    right: rect.right - page.left,
    bottom: rect.bottom - page.top,
  };
}

function expand(box: Box, amount: number): Box {
  return {
    left: box.left - amount,
    top: box.top - amount,
    right: box.right + amount,
    bottom: box.bottom + amount,
  };
}

function pointInBox(point: Point, box: Box) {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

function clearPoint(point: Point, boxes: Box[]) {
  return !boxes.some((box) => pointInBox(point, box));
}

function segmentHitsBox(start: Point, end: Point, box: Box) {
  let near = 0;
  let far = 1;
  for (const [origin, destination, low, high] of [
    [start.x, end.x, box.left, box.right],
    [start.y, end.y, box.top, box.bottom],
  ]) {
    const delta = destination - origin;
    if (Math.abs(delta) < 0.001) {
      if (origin < low || origin > high) return false;
      continue;
    }
    let entry = (low - origin) / delta;
    let exit = (high - origin) / delta;
    if (entry > exit) [entry, exit] = [exit, entry];
    near = Math.max(near, entry);
    far = Math.min(far, exit);
    if (near > far) return false;
  }
  return true;
}

function clearSegment(start: Point, end: Point, boxes: Box[]) {
  return !boxes.some((box) => segmentHitsBox(start, end, box));
}

function makeGrid(width: number, height: number, radius: number, boxes: Box[]): Grid {
  const left = -radius + 1;
  const top = radius;
  const columns = Math.ceil((width + 2 * radius - 2) / GRID_STEP) + 1;
  const rows = Math.ceil(Math.max(1, height - 2 * radius) / GRID_STEP) + 1;
  const blocked = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 1; column < columns - 1; column++) {
      const point = {
        x: Math.min(width + radius - 1, left + column * GRID_STEP),
        y: Math.min(height - radius, top + row * GRID_STEP),
      };
      if (!clearPoint(point, boxes)) blocked[row * columns + column] = 1;
    }
  }
  return { columns, rows, left, top, step: GRID_STEP, blocked, width, height };
}

function gridPoint(grid: Grid, index: number): Point {
  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  return {
    x: Math.min(grid.width - grid.left, grid.left + column * grid.step),
    y: Math.min(grid.height - grid.top, grid.top + row * grid.step),
  };
}

function nearestOpen(grid: Grid, point: Point, boxes: Box[]): number {
  const column = Math.max(0, Math.min(grid.columns - 1, Math.round((point.x - grid.left) / grid.step)));
  const row = Math.max(0, Math.min(grid.rows - 1, Math.round((point.y - grid.top) / grid.step)));
  for (let distance = 0; distance < Math.max(grid.columns, grid.rows); distance++) {
    let closest = -1;
    let score = Infinity;
    for (let y = Math.max(0, row - distance); y <= Math.min(grid.rows - 1, row + distance); y++) {
      for (let x = Math.max(0, column - distance); x <= Math.min(grid.columns - 1, column + distance); x++) {
        if (Math.max(Math.abs(x - column), Math.abs(y - row)) !== distance) continue;
        const index = y * grid.columns + x;
        if (grid.blocked[index]) continue;
        const candidate = gridPoint(grid, index);
        if (!clearSegment(point, candidate, boxes)) continue;
        const candidateScore = Math.hypot(candidate.x - point.x, candidate.y - point.y);
        if (candidateScore < score) {
          closest = index;
          score = candidateScore;
        }
      }
    }
    if (closest >= 0) return closest;
  }
  return -1;
}

function findRoute(start: Point, goal: Point, grid: Grid, boxes: Box[]): Point[] {
  if (clearSegment(start, goal, boxes)) return [goal];
  const first = nearestOpen(grid, start, boxes);
  const last = nearestOpen(grid, goal, boxes);
  if (first < 0 || last < 0) return [];
  const previous = new Int32Array(grid.blocked.length).fill(-1);
  const queue = new Int32Array(grid.blocked.length);
  let head = 0;
  let tail = 0;
  previous[first] = first;
  queue[tail++] = first;
  const directions = [
    [1, 0], [0, 1], [-1, 0], [0, -1],
    [1, 1], [-1, 1], [-1, -1], [1, -1],
  ];
  while (head < tail && previous[last] === -1) {
    const current = queue[head++];
    const x = current % grid.columns;
    const y = Math.floor(current / grid.columns);
    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= grid.columns || ny < 0 || ny >= grid.rows) continue;
      const next = ny * grid.columns + nx;
      if (grid.blocked[next] || previous[next] !== -1) continue;
      if (!clearSegment(gridPoint(grid, current), gridPoint(grid, next), boxes)) continue;
      if (dx && dy && (grid.blocked[y * grid.columns + nx] || grid.blocked[ny * grid.columns + x])) continue;
      previous[next] = current;
      queue[tail++] = next;
    }
  }
  if (previous[last] === -1) return [];
  const cells: Point[] = [];
  for (let index = last; index !== first; index = previous[index]) cells.push(gridPoint(grid, index));
  cells.push(gridPoint(grid, first));
  cells.reverse();
  const rough = [start, ...cells, goal];
  const smooth: Point[] = [];
  let index = 0;
  while (index < rough.length - 1) {
    let next = Math.min(rough.length - 1, index + 12);
    while (next > index + 1 && !clearSegment(rough[index], rough[next], boxes)) next--;
    smooth.push(rough[next]);
    index = next;
  }
  return smooth;
}

function measureLayout(page: HTMLElement, radius: number) {
  const pageRect = page.getBoundingClientRect();
  const width = page.clientWidth;
  const height = page.scrollHeight;
  const obstacles: Box[] = [];
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim() || node.parentElement?.closest("[data-bug-ui]")) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.width > 1 && rect.height > 1) obstacles.push(expand(rectInPage(rect, pageRect), radius + 6));
    }
  }
  for (const control of page.querySelectorAll("a, button, input, select, textarea, [role='button']")) {
    if (control.closest("[data-bug-ui]")) continue;
    obstacles.push(expand(rectInPage(control.getBoundingClientRect(), pageRect), radius + 9));
  }
  const regions = [...page.querySelectorAll("main > section, footer")];
  const points: Point[] = [];
  const add = (x: number, y: number) => {
    const point = { x, y };
    if (
      x < radius + 2 || x > width - radius - 2 ||
      y < radius + 2 || y > height - radius - 2 ||
      !clearPoint(point, obstacles) ||
      points.some((other) => Math.hypot(other.x - x, other.y - y) < radius * 1.6)
    ) return;
    points.push(point);
  };
  for (const region of regions) {
    const box = rectInPage(region.getBoundingClientRect(), pageRect);
    const before = points.length;
    const sampleY = [box.top + radius + 10, (box.top + box.bottom) / 2, box.bottom - radius - 10];
    const sampleX = [radius + 5, width - radius - 5, (box.left + box.right) / 2];
    for (const y of sampleY) {
      for (const x of sampleX) add(x, y);
    }
    const cards = [...region.querySelectorAll("[data-bug-card]")];
    for (let index = 0; index < cards.length; index++) {
      if (cards.length > 5 && index !== 0 && index !== cards.length - 1 && index % 2 === 0) continue;
      const card = rectInPage(cards[index].getBoundingClientRect(), pageRect);
      add(card.left + (card.right - card.left) * 0.25, card.top - 7);
      add(card.left + (card.right - card.left) * 0.75, card.top - 7);
      add(card.left + (card.right - card.left) * 0.5, card.bottom + 7);
      add(card.left - 7, (card.top + card.bottom) / 2);
      add(card.right + 7, (card.top + card.bottom) / 2);
    }
    if (points.length === before) {
      for (let y = box.top + radius; y < box.bottom - radius && points.length === before; y += GRID_STEP) {
        for (let x = radius + 4; x < width - radius && points.length === before; x += GRID_STEP) add(x, y);
      }
    }
  }
  points.sort((a, b) => a.y - b.y || a.x - b.x);
  return { points, obstacles, grid: makeGrid(width, height, radius, obstacles), width, height };
}

function PixelInsect() {
  return (
    <svg viewBox="0 0 48 48" className={styles.insectSvg} shapeRendering="crispEdges" focusable="false">
      <g className={styles.legOdd} style={{ transformOrigin: "16px 17px" }}>
        <path d="M17 18H12V12H7V9H4" />
      </g>
      <g className={styles.legEven} style={{ transformOrigin: "23px 17px" }}>
        <path d="M23 18V11H17V7H14" />
      </g>
      <g className={styles.legOdd} style={{ transformOrigin: "30px 18px" }}>
        <path d="M29 19V12H34V8H37" />
      </g>
      <g className={styles.legEven} style={{ transformOrigin: "16px 31px" }}>
        <path d="M17 30H12V36H7V39H4" />
      </g>
      <g className={styles.legOdd} style={{ transformOrigin: "23px 31px" }}>
        <path d="M23 30V37H17V41H14" />
      </g>
      <g className={styles.legEven} style={{ transformOrigin: "30px 30px" }}>
        <path d="M29 29V36H34V40H37" />
      </g>
      <g className={styles.antennaA} style={{ transformOrigin: "39px 20px" }}>
        <path d="M39 20H43V15H46" />
      </g>
      <g className={styles.antennaB} style={{ transformOrigin: "39px 28px" }}>
        <path d="M39 28H43V33H46" />
      </g>
      <rect x="11" y="16" width="24" height="16" className={styles.shellEdge} />
      <rect x="14" y="18" width="20" height="12" className={styles.shell} />
      <rect x="17" y="19" width="8" height="10" className={styles.chrome} />
      <rect x="18" y="20" width="4" height="3" className={styles.chromeLight} />
      <rect x="27" y="19" width="4" height="10" className={styles.chromeShade} />
      <rect x="34" y="19" width="8" height="10" className={styles.headEdge} />
      <rect x="36" y="21" width="5" height="6" className={styles.head} />
      <rect x="39" y="22" width="2" height="2" className={styles.eye} />
    </svg>
  );
}

export function CrawlingBug() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<((value: boolean) => void) | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const overlay = overlayRef.current;
    const mascot = mascotRef.current;
    const body = bodyRef.current;
    const label = labelRef.current;
    const page = overlay?.parentElement;
    if (!overlay || !mascot || !body || !label || !page) return;

    let isHidden = false;
    let radius = window.innerWidth <= 640 ? 22 : 32;
    let layout = measureLayout(page, radius);
    let position: Point | null = null;
    let route: Point[] = [];
    let routeIndex = 0;
    let targetIndex = 0;
    let direction = 1;
    let heading = 0;
    let pauseFor = 0;
    let phase: "walk" | "sweep" | "detected" | "particles" | "respawn" = "walk";
    let phaseTime = 0;
    let visibleTime = 0;
    let scanAfter = 15 + Math.random() * 5;
    let frameId = 0;
    let measureId = 0;
    let lastFrame = 0;
    let disposed = false;
    let walking = false;

    const render = () => {
      if (!position) return;
      mascot.style.transform = "translate3d(" + (position.x - radius) + "px," + (position.y - radius) + "px,0)";
      body.style.transform = "rotate(" + heading + "rad)";
    };

    const setWalking = (value: boolean) => {
      if (walking === value) return;
      walking = value;
      mascot.dataset.walking = String(value);
    };

    const setPhase = (next: typeof phase) => {
      phase = next;
      phaseTime = 0;
      mascot.dataset.phase = next;
      setWalking(next === "walk" && pauseFor <= 0);
    };

    const pickStart = () => {
      const firstVisible = layout.points.find((point) => {
        const rect = page.getBoundingClientRect();
        return point.y + rect.top > 70 && point.y + rect.top < window.innerHeight - radius;
      });
      position = firstVisible ? { ...firstVisible } : layout.points[0] ? { ...layout.points[0] } : {
        x: Math.max(radius + 3, Math.min(layout.width - radius - 3, layout.width / 2)),
        y: Math.max(radius + 3, Math.min(layout.height - radius - 3, 115)),
      };
      targetIndex = Math.max(0, layout.points.findIndex((point) => point.y > position!.y + radius * 2));
      overlay.style.visibility = "visible";
      render();
    };

    const nextRoute = () => {
      if (!position || layout.points.length === 0) return;
      for (let attempt = 0; attempt < layout.points.length; attempt++) {
        const target = layout.points[targetIndex];
        if (targetIndex >= layout.points.length - 1) direction = -1;
        else if (targetIndex <= 0) direction = 1;
        targetIndex += direction;
        if (Math.hypot(target.x - position.x, target.y - position.y) < radius * 1.5) continue;
        const next = findRoute(position, target, layout.grid, layout.obstacles);
        if (next.length) {
          route = next;
          routeIndex = 0;
          return;
        }
      }
      route = [];
      pauseFor = 1.2;
    };

    const placeLabel = () => {
      if (!position) return;
      const labelWidth = 105;
      const labelHeight = 24;
      const choices = [
        { x: 0, y: -radius - 18 }, { x: 0, y: radius + 18 },
        { x: radius + 59, y: 0 }, { x: -radius - 59, y: 0 },
      ];
      const choice = choices.find((offset) => {
        const center = { x: position!.x + offset.x, y: position!.y + offset.y };
        const box = {
          left: center.x - labelWidth / 2, right: center.x + labelWidth / 2,
          top: center.y - labelHeight / 2, bottom: center.y + labelHeight / 2,
        };
        return box.left >= 0 && box.right <= layout.width &&
          box.top >= 0 && box.bottom <= layout.height &&
          !layout.obstacles.some((obstacle) =>
            box.left < obstacle.right && box.right > obstacle.left &&
            box.top < obstacle.bottom && box.bottom > obstacle.top
          );
      }) ?? choices[0];
      label.style.left = radius + choice.x + "px";
      label.style.top = radius + choice.y + "px";
    };

    const respawn = () => {
      if (!position) return;
      const rect = page.getBoundingClientRect();
      const visiblePoints = layout.points.filter((point) =>
        point.y + rect.top > radius + 35 &&
        point.y + rect.top < window.innerHeight - radius &&
        Math.hypot(point.x - position!.x, point.y - position!.y) > radius * 3
      );
      const options = visiblePoints.length ? visiblePoints : layout.points;
      if (options.length) position = { ...options[Math.floor(Math.random() * options.length)] };
      route = [];
      routeIndex = 0;
      targetIndex = Math.max(0, layout.points.findIndex((point) => point.y > position!.y + radius * 2));
      visibleTime = 0;
      scanAfter = 15 + Math.random() * 5;
      pauseFor = 0.4;
      render();
      setPhase("walk");
    };

    const stop = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = 0;
      mascot.dataset.paused = "true";
      setWalking(false);
    };

    const tick = (time: number) => {
      frameId = 0;
      if (isHidden || document.hidden) {
        stop();
        return;
      }
      const delta = lastFrame ? Math.min((time - lastFrame) / 1000, 0.05) : 0;
      lastFrame = time;
      phaseTime += delta;
      if (phase === "walk") {
        visibleTime += delta;
        if (visibleTime >= scanAfter) {
          route = [];
          setPhase("sweep");
        } else if (pauseFor > 0) {
          pauseFor = Math.max(0, pauseFor - delta);
          setWalking(pauseFor <= 0);
        } else {
          if (!route.length) nextRoute();
          let remaining = (window.innerWidth <= 640 ? 29 : 40) * delta;
          while (remaining > 0 && routeIndex < route.length && position) {
            const target = route[routeIndex];
            const distance = Math.hypot(target.x - position.x, target.y - position.y);
            if (distance < 0.01) {
              routeIndex++;
              continue;
            }
            heading = Math.atan2(target.y - position.y, target.x - position.x);
            const amount = Math.min(remaining, distance);
            position.x += (target.x - position.x) / distance * amount;
            position.y += (target.y - position.y) / distance * amount;
            remaining -= amount;
            if (amount >= distance - 0.01) routeIndex++;
          }
          if (route.length && routeIndex >= route.length) {
            route = [];
            pauseFor = 0.45 + Math.random() * 0.8;
            setWalking(false);
          } else setWalking(route.length > 0);
          render();
        }
      } else if (phase === "sweep" && phaseTime >= 0.75) {
        placeLabel();
        setPhase("detected");
      } else if (phase === "detected" && phaseTime >= 0.7) {
        setPhase("particles");
      } else if (phase === "particles" && phaseTime >= 0.7) {
        setPhase("respawn");
      } else if (phase === "respawn" && phaseTime >= 0.35) {
        respawn();
      }
      frameId = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (frameId || isHidden || document.hidden) return;
      lastFrame = 0;
      mascot.dataset.paused = "false";
      frameId = window.requestAnimationFrame(tick);
    };

    const measure = () => {
      measureId = 0;
      radius = window.innerWidth <= 640 ? 22 : 32;
      layout = measureLayout(page, radius);
      if (!position) pickStart();
      else {
        position.x = Math.max(-radius + 1, Math.min(layout.width + radius - 1, position.x));
        position.y = Math.max(radius, Math.min(layout.height - radius, position.y));
        route = [];
        routeIndex = 0;
        targetIndex = Math.max(0, layout.points.findIndex((point) => point.y > position!.y + radius * 2));
        render();
      }
      start();
    };

    const scheduleMeasure = () => {
      if (disposed) return;
      if (!measureId) measureId = window.requestAnimationFrame(measure);
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    controllerRef.current = (value) => {
      isHidden = value;
      overlay.style.visibility = value ? "hidden" : "visible";
      if (value) stop();
      else start();
    };
    pickStart();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(page);
    for (const element of page.querySelectorAll("header, main > section, footer, [data-bug-card]")) observer.observe(element);
    window.addEventListener("resize", scheduleMeasure);
    document.addEventListener("visibilitychange", handleVisibility);
    document.fonts.ready.then(scheduleMeasure).catch(() => {});
    start();

    return () => {
      disposed = true;
      controllerRef.current = null;
      stop();
      if (measureId) window.cancelAnimationFrame(measureId);
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    const button = toggleRef.current;
    const footer = overlayRef.current?.parentElement?.querySelector("footer");
    if (!button || !footer) return;

    const updatePosition = () => {
      const gap = window.innerWidth <= 640 ? 10 : 16;
      const footerVisibleHeight = window.innerHeight - footer.getBoundingClientRect().top;
      button.style.bottom = Math.max(gap, footerVisibleHeight + gap) + "px";
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, []);

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    controllerRef.current?.(next);
  };

  return (
    <>
      <div ref={overlayRef} className={styles.overlay} data-bug-ui aria-hidden="true">
        <div ref={mascotRef} className={styles.mascot} data-phase="walk" data-walking="false" data-paused="true">
          <div ref={bodyRef} className={styles.insect}><PixelInsect /></div>
          <span className={styles.scanBeam} />
          <div ref={labelRef} className={styles.detectedLabel}>Bug detected</div>
          <div className={styles.particles}>
            {particleDirections.map(([x, y], index) => (
              <span
                key={index}
                style={{ "--particle-x": x + "px", "--particle-y": y + "px" } as React.CSSProperties}
              />
            ))}
          </div>
        </div>
      </div>
      <button ref={toggleRef} type="button" className={styles.toggle} data-bug-ui onClick={toggle}>
        {hidden ? "Show bug" : "Hide bug"}
      </button>
    </>
  );
}