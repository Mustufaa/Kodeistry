import assert from "node:assert/strict";
import test from "node:test";
import { RobotJourney, SPEED, REENTRY_DELAY, PAUSE } from "../components/landing/robot-journey.ts";

const widths = [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440, 1920, 2560];
const viewport = (width, height = 900) => ({ width, height, size: width <= 640 ? 150 : 260, header: 80 });
for (const width of widths) {
  for (const hz of [60, 90, 120, 144]) {
    test(`${width}px at ${hz}Hz: 90s movement, bounded pauses, geometric exit and re-entry with a stationary cursor`, () => {
      const j = new RobotJourney(viewport(width));
      let exited = false, reentered = false, idle = 0, lastPhase = j.phase;
      const samples = new Map();
      for (let i = 0; i < hz * 90; i++) {
        const before = { ...j.position }, phase = j.phase;
        j.advance(1 / hz, { x: width * .55, y: 400 });
        const moved = Math.hypot(j.position.x - before.x, j.position.y - before.y);
        if (phase !== "waiting") assert.ok(moved <= SPEED / hz + .01, "no visible teleport");
        if (phase === j.phase && ["entering", "touring", "exiting"].includes(phase)) {
          // Curved motion has a shorter chord than its arc.
          if (moved > .01) assert.ok(moved <= SPEED / hz + .01);
          idle = moved < .01 ? idle + 1 / hz : 0;
          assert.ok(idle < 1, "moving state cannot remain stuck");
        }
        if (j.phase === "waiting") {
          assert.ok(j.fullyOutside, "entire canvas must leave before waiting");
          exited = true;
          assert.ok(j.remaining <= REENTRY_DELAY + .001);
        }
        if (lastPhase === "waiting" && j.phase !== "waiting") reentered = true;
        if (j.phase === "pausing") assert.ok(j.remaining <= PAUSE + .001);
        if ([10,20,30,60].includes((i + 1) / hz)) samples.set((i + 1) / hz, { ...j.position, phase: j.phase });
        lastPhase = j.phase;
      }
      assert.ok(exited && reentered && j.cycles >= 1);
      assert.equal(samples.size, 4);
      assert.notDeepEqual(samples.get(10), samples.get(20));
      assert.notDeepEqual(samples.get(20), samples.get(30));
    });
  }
}
test("screen refresh rates produce the same position and speed", () => {
  const results = [60,90,120,144].map(hz => {
    const j = new RobotJourney(viewport(1440));
    for (let i=0;i<hz*3;i++) j.advance(1/hz);
    return j.position;
  });
  for (const point of results) assert.ok(Math.hypot(point.x-results[0].x,point.y-results[0].y)<.1);
});
test("moving cursor cannot extend touring indefinitely; 90s with orientation changes", () => {
  const j = new RobotJourney(viewport(390,844));
  let lastCycles = 0, exits = 0;
  for(let i=0;i<5400;i++) {
    if(i===620) j.resize(viewport(844,390));
    if(i===1220) j.resize(viewport(320,568));
    if(i===2200) j.resize(viewport(2560,1440));
    if(i===3900) j.resize(viewport(390,844));
    const before = {...j.position}, phase = j.phase;
    j.advance(1/60,{x:j.viewport.width*(.5+.4*Math.sin(i/30)),y:j.viewport.height*(.5+.3*Math.cos(i/30))});
    if(phase!=="waiting") assert.ok(Math.hypot(j.position.x-before.x,j.position.y-before.y)<=2.01);
    if(j.cycles>lastCycles) { assert.ok(j.fullyOutside); exits++; lastCycles=j.cycles; }
  }
  assert.ok(exits>=2);
});
test("cursor follow closes distance before the finite exit phase", () => {
  const j = new RobotJourney(viewport(1280,800));
  while(j.phase==="entering") j.advance(1/120);
  const pointer={x:900,y:450}, before=Math.hypot(j.position.x-pointer.x,j.position.y-pointer.y);
  for(let i=0;i<240;i++) j.advance(1/120,pointer);
  assert.ok(Math.hypot(j.position.x-pointer.x,j.position.y-pointer.y)<before-150);
});
test("waiting lasts three seconds and resumes from the same offscreen edge", () => {
  const j=new RobotJourney(viewport(430,900));
  while(j.phase!=="waiting") j.advance(1/120);
  const start={...j.position};
  j.advance(j.remaining-.01);
  assert.equal(j.phase,"waiting");
  assert.deepEqual(j.position,start);
  j.advance(.02);
  assert.equal(j.phase,"entering");
  assert.ok(Math.hypot(j.position.x-start.x,j.position.y-start.y)<2);
});
