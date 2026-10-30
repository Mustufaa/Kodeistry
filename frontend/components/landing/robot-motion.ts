export type Point = { x: number; y: number };
export type Bounds = { left: number; right: number; top: number; bottom: number };
export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
export const GROUND_Y = 7.5 / Math.hypot(7.5, 6.2);

export function viewportBounds(width: number, height: number, size: number, headerBottom: number): Bounds {
  const inset = size / 2 + 8;
  const left = Math.min(inset, width / 2);
  const top = Math.min(Math.max(inset, headerBottom + inset * 0.65), height / 2);
  return { left, right: Math.max(left, width - inset), top, bottom: Math.max(top, height - inset) };
}
export function contain(point: Point, bounds: Bounds): Point {
  return { x: clamp(point.x, bounds.left, bounds.right), y: clamp(point.y, bounds.top, bounds.bottom) };
}
export function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Same smooth steering as the original; account for the camera's ground projection. */
export function walk(
  state: { position: Point; heading: number; speed: number },
  target: Point, bounds: Bounds, stopped: boolean, dt: number, maxSpeed: number,
) {
  const desired = Math.atan2(target.x - state.position.x, (target.y - state.position.y) / GROUND_Y);
  const diff = Math.atan2(Math.sin(desired - state.heading), Math.cos(desired - state.heading));
  const step = stopped ? 0 : clamp(diff, -2.6 * dt, 2.6 * dt);
  state.heading += step;
  const turnPenalty = 1 - Math.min(Math.abs(diff) / 1.2, 1) * 0.7;
  state.speed += ((stopped ? 0 : maxSpeed * turnPenalty) - state.speed) * Math.min(1, dt * 3.5);
  state.position = contain({
    x: state.position.x + Math.sin(state.heading) * state.speed * dt,
    y: state.position.y + Math.cos(state.heading) * state.speed * GROUND_Y * dt,
  }, bounds);
  return { diff, turn: step / Math.max(dt, 0.0001) / 2.6 };
}


export type Obstacle = { left: number; right: number; top: number; bottom: number };

/** Project a decoration into nearby free space without hiding it over page controls. */
export function avoidContent(point: Point, bounds: Bounds, obstacles: Obstacle[], radius: number): Point {
  const inside = (candidate: Point) => obstacles.some(rect =>
    candidate.x > rect.left - radius && candidate.x < rect.right + radius &&
    candidate.y > rect.top - radius && candidate.y < rect.bottom + radius);
  const origin = contain(point, bounds);
  if (!inside(origin)) return origin;
  const candidates = obstacles.flatMap(rect => [
    { x: rect.left - radius, y: origin.y }, { x: rect.right + radius, y: origin.y },
    { x: origin.x, y: rect.top - radius }, { x: origin.x, y: rect.bottom + radius },
  ]).concat([
    { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
    { x: bounds.left, y: bounds.bottom }, { x: bounds.right, y: bounds.bottom },
  ]).map(candidate => contain(candidate, bounds)).filter(candidate => !inside(candidate));
  return candidates.reduce((nearest, candidate) =>
    !nearest || distance(origin, candidate) < distance(origin, nearest) ? candidate : nearest,
  undefined as Point | undefined) ?? origin;
}

/** Only choose destinations in the current free corridor, so a heading cannot trap patrol. */
export function canTravel(from: Point, to: Point, obstacles: Obstacle[], radius: number): boolean {
  const steps = Math.max(1, Math.ceil(distance(from, to) / 12));
  for (let step = 1; step <= steps; step++) {
    const point = { x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps };
    if (obstacles.some(rect => point.x > rect.left - radius + .01 && point.x < rect.right + radius - .01 &&
      point.y > rect.top - radius + .01 && point.y < rect.bottom + radius - .01)) return false;
  }
  return true;
}

export function patrolTarget(from: Point, bounds: Bounds, obstacles: Obstacle[], radius: number, random = Math.random): Point {
  const candidates = [
    { x: bounds.left, y: from.y }, { x: bounds.right, y: from.y },
    { x: from.x, y: bounds.top }, { x: from.x, y: bounds.bottom },
    ...Array.from({ length: 16 }, (_, index) => {
      const angle = index * Math.PI / 8;
      return contain({ x: from.x + Math.cos(angle) * 180, y: from.y + Math.sin(angle) * 180 }, bounds);
    }),
  ].filter(point => distance(from, point) > 24 && canTravel(from, point, obstacles, radius));
  return candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] : from;
}
