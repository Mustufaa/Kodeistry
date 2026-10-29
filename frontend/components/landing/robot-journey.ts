/** Pure animation clock: all distances are CSS pixels and all times are seconds. */
export type Point = { x: number; y: number };
export type Viewport = { width: number; height: number; size: number; header: number };
export type Phase = "entering" | "touring" | "pausing" | "exiting" | "waiting";
export const SPEED = 120;
export const PAUSE = 0.75;
export const REENTRY_DELAY = 3;
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const same = (a: Point | undefined, b: Point) => a && distance(a, b) < 24;

type Leg = { points: Point[]; lengths: number[]; length: number; travelled: number; target: Point };
export class RobotJourney {
  viewport: Viewport;
  position: Point;
  heading = Math.PI / 2;
  speed = 0;
  phase: Phase = "entering";
  cycles = 0;
  remaining = 0;
  tourDistance = 0;
  private leg!: Leg;
  private retargetIn = 0;
  private consumedPointer?: Point;
  private waypoint = 0;
  private side = 1;
  private tangent = Math.PI / 2;

  constructor(viewport: Viewport) {
    this.viewport = viewport;
    // Only later cycles enter from off-screen; show the first robot immediately.
    this.position = this.safe({ x: viewport.width * 0.72, y: viewport.height * 0.46 });
    this.begin("touring", this.nextTarget());
  }
  private safe(point: Point): Point {
    const { width, height, size, header } = this.viewport;
    const inset = Math.min(size / 2 + 12, width / 2);
    const top = Math.min(header + size / 2 + 12, height / 2);
    const bottom = Math.max(top, height - size / 2 - 20);
    return { x: clamp(point.x, inset, width - inset), y: clamp(point.y, top, bottom) };
  }
  private entry() {
    return this.safe({ x: this.viewport.width * (this.side === 1 ? 0.28 : 0.72), y: this.viewport.height * 0.46 });
  }
  private outside(exit: boolean) {
    const { width, height, size } = this.viewport;
    const right = exit ? this.side === 1 : this.side !== 1;
    return { x: right ? width + size / 2 + 24 : -size / 2 - 24, y: this.position?.y ?? height * 0.46 };
  }
  private nextTarget() {
    this.waypoint++;
    return this.safe({
      x: this.viewport.width * (this.waypoint % 2 ? 0.75 : 0.25),
      y: this.viewport.height * (this.waypoint % 3 === 0 ? 0.7 : 0.45),
    });
  }
  private begin(phase: Phase, target: Point) {
    this.phase = phase;
    const start = { ...this.position };
    const length = distance(start, target);
    // A tangent-continuous cubic, sampled by arc length, avoids frame-rate
    // dependent steering circles and never clamps an exit back on screen.
    const reach = Math.min(length * 0.32, 110);
    const c1 = { x: start.x + Math.sin(this.tangent) * reach, y: start.y + Math.cos(this.tangent) * reach };
    const c2 = { x: target.x - (target.x - start.x) * 0.23, y: target.y - (target.y - start.y) * 0.23 };
    const points: Point[] = [start];
    const lengths = [0];
    for (let i = 1; i <= 64; i++) {
      const t = i / 64, u = 1 - t;
      const point = {
        x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * target.x,
        y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * target.y,
      };
      lengths.push(lengths[i - 1] + distance(points[i - 1], point));
      points.push(point);
    }
    this.leg = { points, lengths, length: lengths[64], travelled: 0, target };
  }
  get fullyOutside() {
    const { width, height, size } = this.viewport;
    return this.position.x + size / 2 <= 0 || this.position.x - size / 2 >= width ||
      this.position.y + size / 2 <= 0 || this.position.y - size / 2 >= height;
  }
  resize(viewport: Viewport) {
    this.viewport = viewport;
    // Only reposition while already hidden; visible legs continue from their
    // current position, including a resize partway through an exit.
    if (this.phase === "waiting") { this.position = this.outside(true); return; }
    if (this.phase === "pausing") return;
    this.begin(this.phase, this.phase === "exiting" ? this.outside(true) : this.safe(this.leg.target));
  }
  advance(seconds: number, pointer?: Point) {
    let dt = Math.max(0, seconds);
    // Carry unused time across transitions so 60/90/120/144Hz share a clock.
    while (dt > 0.000001) {
      if (this.phase === "waiting" || this.phase === "pausing") {
        this.speed = 0;
        const elapsed = Math.min(dt, this.remaining);
        this.remaining -= elapsed;
        dt -= elapsed;
        if (this.remaining > 0.000001) break;
        if (this.phase === "waiting") {
          this.side *= -1;
          this.position = this.outside(false);
          this.heading = this.side * Math.PI / 2;
          this.tangent = this.heading;
          this.tourDistance = 0;
          this.consumedPointer = undefined;
          this.begin("entering", this.entry());
        } else this.begin("touring", this.nextTarget());
        continue;
      }
      const step = Math.min(dt, 1 / 30);
      dt -= step;
      this.retargetIn -= step;
      if (this.phase === "touring") {
        const budget = clamp(Math.hypot(this.viewport.width, this.viewport.height) * 0.8, 550, 1400);
        if (this.tourDistance >= budget) this.begin("exiting", this.outside(true));
        else if (pointer && !same(this.consumedPointer, pointer) && this.retargetIn <= 0) {
          const target = this.safe(pointer);
          if (distance(this.position, target) < 30) {
            this.consumedPointer = { ...pointer };
          } else if (distance(this.leg.target, target) > 24) this.begin("touring", target);
          this.retargetIn = 0.25;
        }
      }
      const leg = this.leg;
      const travel = Math.min(SPEED * step, leg.length - leg.travelled);
      leg.travelled += travel;
      if (this.phase === "touring") this.tourDistance += travel;
      this.speed = SPEED;
      let index = 1;
      while (index < 64 && leg.lengths[index] < leg.travelled) index++;
      const a = leg.points[index - 1], b = leg.points[index];
      const t = (leg.travelled - leg.lengths[index - 1]) / Math.max(0.000001, leg.lengths[index] - leg.lengths[index - 1]);
      this.position = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const desired = Math.atan2(b.x - a.x, b.y - a.y);
      this.tangent = desired;
      const diff = Math.atan2(Math.sin(desired - this.heading), Math.cos(desired - this.heading));
      this.heading += diff * (1 - Math.exp(-12 * step));
      if (leg.travelled >= leg.length - 0.000001) {
        // Return unused distance as time; this also completes zero-length legs.
        dt += step - travel / SPEED;
        if (this.phase === "exiting") {
          this.phase = "waiting";
          this.remaining = REENTRY_DELAY;
          this.cycles++;
        } else if (this.phase === "entering") this.begin("touring", this.nextTarget());
        else {
          if (pointer && distance(this.position, this.safe(pointer)) < 30) this.consumedPointer = { ...pointer };
          this.phase = "pausing";
          this.remaining = PAUSE;
        }
      }
    }
  }
}
