import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import * as THREE from "three";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../components/landing");
const transpile = (name) => ts.transpileModule(fs.readFileSync(path.join(root, name), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
function evaluate(name, imports, globals = {}) {
  const loadedModule = { exports: {} };
  vm.runInNewContext("(function(require,module,exports) {" + transpile(name) + "\n})", globals, { filename: name })(
    (key) => { if (!(key in imports)) throw new Error("Unexpected import " + key); return imports[key]; }, loadedModule, loadedModule.exports,
  );
  return loadedModule.exports;
}
function events() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, event = {}) { for (const fn of listeners.get(type) ?? []) fn(event); },
    count: () => [...listeners.values()].reduce((sum, entries) => sum + entries.size, 0),
  };
}
function harness({ width = 1280, reduced = false, coarse = false, failWebGL = false, constrained = false, slowGPU = false } = {}) {
  let clock = 0, id = 0, cleanup, effect;
  const frames = new Map(), idle = new Map(), refs = [];
  const stats = { created: 0, disposed: 0, rendered: 0, reducedQuality: 0, sizes: [], phases: new Set(), buttonCount: 0 };
  const media = { ...events(), matches: reduced };
  const window = {
    ...events(), innerWidth: width, innerHeight: 900, devicePixelRatio: 2,
    matchMedia: (query) => query.includes("reduced") ? media : { matches: coarse },
    requestAnimationFrame: (fn) => { const key = ++id; frames.set(key, fn); return key; },
    cancelAnimationFrame: (key) => frames.delete(key),
    requestIdleCallback: (fn) => { const key = ++id; idle.set(key, fn); return key; },
    cancelIdleCallback: (key) => idle.delete(key),
  };
  function element() {
    return {
      ...events(), style: {}, dataset: {}, hidden: true, isConnected: true, children: [],
      setAttribute() {}, prepend(child) { this.children.unshift(child); child.parent = this; },
      remove() { this.parent.children = this.parent.children.filter((child) => child !== this); },
    };
  }
  const document = { ...events(), hidden: false, createElement: element };
  const stageRect = { left: 0, top: 0, width, height: 900 };
  const observers = { resize: undefined, visibility: undefined, connected: 0 };
  const rect = { left: width - 240, right: width - 30, top: 210, bottom: 450 };
  const card = { isConnected: true, getBoundingClientRect: () => rect };
  const page = {
    ...events(), isConnected: true,
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 80 }) }),
    querySelectorAll: (selector) => selector.includes("data-bug") ? [card] : [],
  };
  const React = {
    useRef: () => { const ref = { current: null }; refs.push(ref); return ref; },
    useEffect: (fn) => { effect = fn; },
  };
  const jsx = (type, props) => ({ type, props });
  const scene = {
    createRobotScene() {
      if (failWebGL) throw new Error("WebGL unavailable");
      stats.created++;
      return {
        metrics: size => ({ radius: size / 2, pixelsPerUnit: size / 5.8 }),
        reduceQuality: () => { stats.reducedQuality++; },
        resize: (size) => stats.sizes.push(size),
        render: () => { stats.rendered++; if (slowGPU) clock += 30; },
        dispose: () => { stats.disposed++; },
      };
    },
  };
  const math = Object.create(Math);
  math.random = () => 0.5;
  const motion = evaluate("robot-motion.ts", {}, { Math: math });
  const Component = evaluate("RoboticBug.tsx", {
    react: React, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "./robot-scene": scene, "./robot-motion": motion,
    "./robotic-bug.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
  }, { window, document, navigator: { hardwareConcurrency: 8, deviceMemory: constrained ? 1 : 8 },
    performance: { now: () => clock }, Math: math, setTimeout, clearTimeout, setInterval, clearInterval,
    ResizeObserver: class {
      constructor(callback) { observers.resize = callback; }
      observe() { observers.connected++; }
      disconnect() { observers.connected--; }
    },
    IntersectionObserver: class {
      constructor(callback) { observers.visibility = callback; }
      observe() { observers.connected++; observers.visibility([{ isIntersecting: true }]); }
      disconnect() { observers.connected--; }
    } }).default;
  const tree = Component();
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (node.type === "button") stats.buttonCount++;
    if (node.props?.ref) {
      const dom = element();
      dom.className = node.props.className;
      dom.hidden = node.props.hidden ?? false;
      node.props.ref.current = dom;
    }
    visit(node.props?.children);
  }
  visit(tree);
  const [overlay, robot, scan, label, pause] = refs.map((ref) => ref.current);
  overlay.parentElement = page;
  overlay.closest = () => page;
  overlay.getBoundingClientRect = () => ({ ...stageRect, right: stageRect.left + stageRect.width, bottom: stageRect.top + stageRect.height });
  function start() { cleanup = effect(); }
  function flushIdle() { const callbacks = [...idle.values()]; idle.clear(); callbacks.forEach((fn) => fn()); }
  start();
  return {
    stats, window, document, media, overlay, robot, scan, label, pause, rect, stageRect, observers, page, frames, idle, start, flushIdle,
    cleanup: () => cleanup(),
    advance(seconds = 1) {
      flushIdle();
      for (let i = 0; i < seconds * 60; i++) {
        clock += 1000 / 60;
        const callbacks = [...frames.values()]; frames.clear();
        callbacks.forEach((fn) => fn(clock));
        if (!scan.hidden) stats.phases.add(label.textContent);
      }
    },
    assertClean() {
      cleanup();
      assert.equal(frames.size, 0);
      assert.equal(idle.size, 0);
      assert.equal(window.count() + document.count() + media.count() + page.count(), 0);
      assert.equal(robot.children.length, 0);
      assert.equal(stats.created, stats.disposed);
      assert.equal(observers.connected, 0);
    },
  };
}

test("Strict Mode cancels deferred initialization and route unmount releases the single renderer", () => {
  const app = harness();
  app.cleanup(); app.start(); app.advance();
  assert.equal(app.stats.created, 1);
  assert.equal(app.robot.children.length, 1);
  app.cleanup(); app.start(); app.advance();
  assert.equal(app.stats.created, 2);
  assert.equal(app.stats.disposed, 1);
  app.assertClean();
});
test("Patrol moves, follows a mouse, then resumes patrol after inactivity", () => {
  const app = harness();
  app.advance(1); const initial = app.robot.style.transform;
  app.advance(2); assert.notEqual(app.robot.style.transform, initial);
  app.window.dispatch("pointermove", { pointerType: "mouse", clientX: 180, clientY: 500 });
  app.advance(0.2); assert.ok(["following", "locked"].includes(app.overlay.dataset.mode));
  app.advance(3); assert.notEqual(app.overlay.dataset.mode, "following");
  app.assertClean();
});
test("Decorative scan visits all three phases and scrolling cancels it", () => {
  const app = harness();
  app.advance(45);
  assert.deepEqual([...app.stats.phases], ["SCANNING CODE...", "BUG DETECTED", "FIX SUGGESTED ✓"]);
  app.window.dispatch("scroll"); assert.equal(app.scan.hidden, true);
  const position = app.robot.style.transform;
  app.advance(1); assert.notEqual(app.robot.style.transform, position);
  app.assertClean();
});
for (const width of [320, 360, 375, 390, 430, 768, 1024, 1366, 1920]) {
  test("Viewport containment and touch scrolling at width " + width, () => {
    const app = harness({ width, coarse: width < 640 });
    app.advance(1);
    app.window.dispatch("pointermove", { pointerType: "touch", clientX: 10, clientY: 10 });
    app.advance(1);
    assert.notEqual(app.overlay.dataset.mode, "following");
    const size = width <= 640 ? 210 : 300;
    assert.equal(app.stats.sizes.at(-1), size);
    for (let i = 0; i < 60; i++) {
      app.advance(1);
      const [x, y] = app.robot.style.transform.match(/-?\d+\.\d+/g).map(Number);
      assert.ok(x >= 0 && x + size <= app.stageRect.width, "canvas stays horizontally contained");
      assert.ok(y >= 0 && y + size <= app.stageRect.height, "canvas stays vertically contained");
    }
    app.stageRect.width = 320; app.window.innerWidth = 320; app.observers.resize(); app.advance();
    assert.equal(app.stats.sizes.at(-1), 210);
    app.assertClean();
  });
}
test("Hidden tab stops scheduling frames and resumes without a movement jump", () => {
  const app = harness(); app.advance();
  app.document.hidden = true; app.document.dispatch("visibilitychange");
  const rendered = app.stats.rendered, position = app.robot.style.transform;
  app.advance(10);
  assert.equal(app.frames.size, 0); assert.equal(app.stats.rendered, rendered);
  assert.equal(app.robot.style.transform, position);
  app.document.hidden = false; app.document.dispatch("visibilitychange"); app.advance();
  assert.ok(app.stats.rendered > rendered);
  app.assertClean();
});
test("Reduced motion renders a still robot without controls, then resumes on preference change", () => {
  const app = harness({ reduced: true }); app.advance();
  const initial = app.robot.style.transform;
  app.advance(3);
  assert.equal(app.robot.style.transform, initial);
  assert.equal(app.frames.size, 0);
  assert.equal(app.stats.buttonCount, 0);
  app.media.matches = false; app.media.dispatch("change"); app.advance(3);
  assert.notEqual(app.robot.style.transform, initial);
  app.assertClean();
});
test("Patrol makes progress in every ten-second window for two minutes", () => {
  for (const width of [320, 1366]) {
    const app = harness({ width });
    for (let window = 0; window < 12; window++) {
      const positions = new Set();
      for (let second = 0; second < 10; second++) { app.advance(1); positions.add(app.robot.style.transform); }
      assert.ok(positions.size >= 4, `stalled at ${window * 10}s on ${width}px`);
      assert.equal(app.frames.size, 1);
    }
    app.assertClean();
  }
});

test("WebGL failure keeps a visible moving fallback", () => {
  const app = harness({ failWebGL: true }); app.advance();
  assert.equal(app.robot.children.length, 0);
  assert.ok(app.frames.size > 0);
  assert.equal(app.stats.created, 0);
  assert.equal(app.robot.style.visibility, "visible");
  assert.equal(app.overlay.dataset.renderer, "fallback");
  const initial = app.robot.style.transform; app.advance(3);
  assert.notEqual(app.robot.style.transform, initial);
  app.assertClean();
});
test("Constrained devices keep animating at lower quality", () => {
  const app = harness({ constrained: true }); app.advance();
  const rendered = app.stats.rendered; app.advance(2);
  assert.ok(app.stats.rendered > rendered);
  assert.ok(app.frames.size > 0);
  app.assertClean();
});
test("Slow GPUs lower quality while continuing to patrol and follow the mouse", () => {
  const app = harness({ slowGPU: true }); app.advance(10);
  assert.ok(app.frames.size > 0);
  assert.ok(app.stats.reducedQuality > 0);
  const position = app.robot.style.transform;
  app.window.dispatch("pointermove", { pointerType: "mouse", clientX: 180, clientY: 500 });
  app.advance(1);
  assert.equal(app.overlay.dataset.mode, "following");
  assert.notEqual(app.robot.style.transform, position);
  app.assertClean();
});
test("Context loss keeps the fallback moving without rendering into the lost context", () => {
  const app = harness(); app.advance();
  const canvas = app.robot.children[0];
  canvas.dispatch("webglcontextlost", { preventDefault() {} });
  const rendered = app.stats.rendered, position = app.robot.style.transform;
  app.advance(3);
  assert.ok(app.frames.size > 0);
  assert.equal(app.stats.rendered, rendered);
  assert.notEqual(app.robot.style.transform, position);
  assert.equal(app.overlay.dataset.renderer, "fallback");
  app.document.dispatch("visibilitychange"); app.advance();
  assert.equal(app.stats.rendered, rendered);
  canvas.dispatch("webglcontextrestored"); app.advance();
  assert.ok(app.stats.rendered > rendered);
  assert.equal(app.overlay.dataset.renderer, "webgl");
  app.assertClean();
});
test("Original geometry keeps six IK legs, white/black armor, antennae, and alternating tripods", () => {
  const context = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const { createRobotModel } = evaluate("robot-model.ts", { three: THREE }, {
    document: { createElement: () => ({ getContext: () => context }) },
  });
  const scene = new THREE.Scene();
  const model = createRobotModel(scene);
  const bug = scene.children[0], body = bug.children[0];
  assert.equal(bug.children.length, 37, "body plus six sets of six leg objects");
  const head = body.children.find((item) => item instanceof THREE.Group);
  assert.equal(head.children.filter((item) => item instanceof THREE.Group).length, 2);
  model.animate(1 / 60, 0, 1.5, 0, 0, 0);
  const feet = bug.children.filter((item) => item.geometry?.type === "ConeGeometry");
  assert.equal(feet.length, 6);
  const heights = feet.map((foot) => foot.position.y);
  assert.equal(heights[0], heights[3]); assert.equal(heights[3], heights[4]);
  assert.equal(heights[1], heights[2]); assert.equal(heights[2], heights[5]);
  assert.ok(feet.every((foot) => foot.position.toArray().every(Number.isFinite)));
  assert.equal(body.children[0].material.color.getHex(), 0xffffff);
  assert.equal(body.children[0].geometry.parameters.widthSegments, 72);
  const before = head.rotation.y; model.animate(0.05, 1, 1.5, 0.4, 0.4, 0.5);
  assert.notEqual(head.rotation.y, before);
});


test("Scene disposes shared geometry, materials, textures, reflection targets, and renderer exactly once", () => {
  const counts = { renderer: 0, context: 0, pmrem: 0, environment: 0 };
  const released = new Map();
  function track(resource) {
    if (released.has(resource)) return;
    released.set(resource, 0);
    resource.addEventListener("dispose", () => released.set(resource, released.get(resource) + 1));
  }
  const context = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
  const document = { createElement: () => ({ getContext: () => context }) };
  const fakeThree = {
    ...THREE,
    CanvasTexture: class extends THREE.CanvasTexture { constructor(...args) { super(...args); track(this); } },
    WebGLRenderer: class {
      setPixelRatio() {} setClearColor() {} setSize() {}
      render(scene) {
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          track(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) track(material);
        });
      }
      dispose() { counts.renderer++; }
      forceContextLoss() { counts.context++; }
    },
    PMREMGenerator: class {
      fromEquirectangular() { return { texture: new THREE.Texture(), dispose() { counts.environment++; } }; }
      dispose() { counts.pmrem++; }
    },
  };
  const model = evaluate("robot-model.ts", { three: fakeThree }, { document });
  const { createRobotScene } = evaluate("robot-scene.ts", { three: fakeThree, "./robot-model": model }, {
    document, window: { devicePixelRatio: 2 },
  });
  const scene = createRobotScene({}, false);
  scene.render(0.016, 1, 1, 0, 0, 0);
  scene.dispose();
  assert.ok(released.size > 50);
  for (const count of released.values()) assert.equal(count, 1, "shared resources disposed once");
  assert.deepEqual(counts, { renderer: 1, context: 1, pmrem: 1, environment: 1 });
});


test("Only the new robot is mounted by the landing page", () => {
  const page = fs.readFileSync(path.resolve(root, "../../app/page.tsx"), "utf8");
  const bento = fs.readFileSync(path.join(root, "bento-features.tsx"), "utf8");
  assert.match(page, /<RoboticBugLoader \/>/);
  assert.doesNotMatch(page + bento, /<SectionInsect|<CrawlingBug/);
});
test("Landscape touch devices use the larger mobile size and keep moving through scroll", () => {
  const app = harness({ coarse: true, width: 844 });
  app.advance();
  assert.equal(app.stats.sizes.at(-1), 210);
  assert.equal(app.robot.style.width, "210px");
  const rendered = app.stats.rendered;
  app.window.dispatch("scroll"); app.advance();
  assert.ok(app.stats.rendered > rendered);
  app.assertClean();
});


test("Roaming steers around a heading without hiding or leaving the viewport", () => {
  const { avoidContent } = evaluate("robot-motion.ts", {});
  const bounds = { left: 105, right: 270, top: 140, bottom: 680 };
  const heading = { left: 16, right: 359, top: 200, bottom: 320 };
  const point = avoidContent({ x: 230, y: 240 }, bounds, [heading], 84);
  assert.ok(point.y <= 116 || point.y >= 404);
  assert.ok(point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom);
  const free = avoidContent({ x: 230, y: 430 }, bounds, [heading], 84);
  assert.equal(free.x, 230); assert.equal(free.y, 430);
});

test("Patrol chooses a reachable destination instead of getting pinned behind a full-width heading", () => {
  const { patrolTarget, canTravel, distance } = evaluate("robot-motion.ts", {});
  const bounds = { left: 105, right: 270, top: 140, bottom: 680 };
  const obstacles = [{ left: 16, right: 359, top: 200, bottom: 320 }];
  const from = { x: 230, y: 404 };
  for (const random of [0, .25, .5, .75, .99]) {
    const target = patrolTarget(from, bounds, obstacles, 84, () => random);
    assert.ok(distance(from, target) > 24);
    assert.ok(canTravel(from, target, obstacles, 84));
    assert.ok(target.y >= 404);
  }
  assert.equal(canTravel(from, { x: 230, y: 145 }, obstacles, 84), false);
});

test("Steering brakes at every edge, arrives without orbiting and is refresh-rate independent", () => {
  const { walk, distance } = evaluate("robot-motion.ts", {});
  const bounds = { left: 100, right: 900, top: 100, bottom: 700 };
  const results = [];
  for (const hz of [30, 60, 144]) {
    const state = { position: { x: 500, y: 400 }, heading: 0, speed: 0 };
    for (const target of [{x:100,y:400}, {x:900,y:400}, {x:500,y:100}, {x:500,y:700}]) {
      for (let frame = 0; frame < hz * 20; frame++) {
        const before = { ...state.position }, heading = state.heading;
        const result = walk(state, target, bounds, false, 1/hz, 90);
        assert.ok(Math.abs(state.heading - heading) <= 2.6/hz + 1e-8);
        assert.ok(distance(before, state.position) <= 90/hz + 1e-8);
        assert.ok(result.actualSpeed >= 0 && result.actualSpeed <= 90 + 1e-8);
        assert.ok(state.position.x >= 100 && state.position.x <= 900 && state.position.y >= 100 && state.position.y <= 700);
      }
      assert.ok(distance(state.position, target) < 1);
    }
    results.push(state.position);
  }
  assert.ok(distance(results[0], results[2]) < 1);
});
