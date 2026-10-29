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
  const frames = new Map(), idle = new Map(), timers = new Map(), refs = [];
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
  const rect = { left: width - 240, right: width - 30, top: 210, bottom: 450 };
  const card = { isConnected: true, getBoundingClientRect: () => rect };
  const page = {
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 80 }) }),
    querySelectorAll: () => [card],
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
        reduceQuality: () => { stats.reducedQuality++; },
        resize: (size) => stats.sizes.push(size),
        render: () => { stats.rendered++; if (slowGPU) clock += 30; },
        dispose: () => { stats.disposed++; },
      };
    },
  };
  const math = Object.create(Math);
  math.random = () => 0.5;
  const motion = evaluate("robot-journey.ts", {}, { Math: math });
  const Component = evaluate("RoboticBug.tsx", {
    react: React, "react/jsx-runtime": { jsx, jsxs: jsx },
    "./robot-scene": scene, "./robot-journey": motion,
    "./static-robotic-bug": { RoboticBugIcon: () => null },
    "./robotic-bug.module.css": { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) },
  }, { window, document, navigator: { hardwareConcurrency: 8, deviceMemory: constrained ? 1 : 8 },
    performance: { now: () => clock }, Math: math,
    setTimeout: (fn, delay) => { const key = ++id; timers.set(key, { fn, due: clock + delay }); return key; },
    clearTimeout: key => timers.delete(key) }).default;
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
  const [overlay, robot, scan, label] = refs.map((ref) => ref.current);
  overlay.parentElement = page;
  function start() { cleanup = effect(); }
  function flushIdle() { const callbacks = [...idle.values()]; idle.clear(); callbacks.forEach((fn) => fn()); }
  start();
  return {
    stats, window, document, media, overlay, robot, scan, label, rect, frames, idle, timers, start, flushIdle,
    cleanup: () => cleanup(),
    advance(seconds = 1) {
      flushIdle();
      for (let i = 0; i < seconds * 60; i++) {
        clock += 1000 / 60;
        for (const [key, timer] of timers) { if (timer.due <= clock) { timers.delete(key); timer.fn(); } }
        const callbacks = [...frames.values()]; frames.clear();
        callbacks.forEach((fn) => fn(clock));
        if (!scan.hidden) stats.phases.add(label.textContent);
      }
    },
    assertClean() {
      cleanup();
      assert.equal(frames.size, 0);
      assert.equal(idle.size, 0);
      assert.equal(timers.size, 0);
      assert.equal(window.count() + document.count() + media.count(), 0);
      assert.equal(robot.children.length, 0);
      assert.equal(stats.created, stats.disposed);
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
test("Cursor following moves toward the pointer without preventing an eventual exit", () => {
  const app = harness(); app.advance(6);
  app.window.dispatch("pointermove", { pointerType: "mouse", clientX: 1000, clientY: 650 });
  app.advance(.3);
  assert.equal(app.overlay.dataset.mode, "following");
  const before = app.robot.style.transform;
  app.advance(1); assert.notEqual(app.robot.style.transform, before);
  app.advance(60);
  assert.ok(Number(app.overlay.dataset.cycles) >= 1);
  app.window.dispatch("pointerout", { pointerType: "mouse", relatedTarget: null });
  app.advance(.2); assert.notEqual(app.overlay.dataset.mode, "following");
  app.assertClean();
});

test("Short decorative pauses retain all three scan labels", () => {
  const app = harness(); app.advance(60);
  assert.deepEqual([...app.stats.phases], ["SCANNING CODE...", "BUG DETECTED", "FIX SUGGESTED"]);
  app.assertClean();
});

for (const width of [320, 390, 820, 1440]) {
  test("60s of actual frame callbacks exits, re-enters and resizes at width " + width, () => {
    const app = harness({ width, coarse: width < 640 });
    app.advance(1);
    app.window.dispatch("pointermove", { pointerType: "touch", clientX: 10, clientY: 10 });
    const size = width <= 640 ? 150 : 260;
    assert.equal(app.stats.sizes.at(-1), size);
    let exited = false, reentered = false;
    for (let i = 0; i < 600; i++) {
      app.advance(.1);
      assert.notEqual(app.overlay.dataset.mode, "following");
      const [x, y] = app.robot.style.transform.match(/-?\d+\.\d+/g).map(Number);
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      if (app.overlay.dataset.phase === "waiting") {
        assert.ok(x + size <= 0 || x >= width || y + size <= 0 || y >= 900);
        assert.equal(app.frames.size, 0);
        exited = true;
      } else if (exited && app.overlay.dataset.phase === "entering") reentered = true;
    }
    assert.ok(exited && reentered);
    app.window.innerWidth = 320; app.window.dispatch("resize"); app.advance(4);
    assert.equal(app.stats.sizes.at(-1), 150);
    app.assertClean();
  });
}

test("Hidden tab stops frames and timers; showing the tab resumes", () => {
  const app = harness(); app.advance();
  app.document.hidden = true; app.document.dispatch("visibilitychange");
  const rendered = app.stats.rendered, position = app.robot.style.transform;
  app.advance(10);
  assert.equal(app.frames.size, 0); assert.equal(app.timers.size, 0);
  assert.equal(app.stats.rendered, rendered); assert.equal(app.robot.style.transform, position);
  app.document.hidden = false; app.document.dispatch("visibilitychange"); app.advance();
  assert.ok(app.stats.rendered > rendered);
  app.assertClean();
});

test("Reduced motion prevents rendering and reacts to live preference changes", () => {
  const app = harness({ reduced: true }); app.advance(60);
  assert.equal(app.stats.buttonCount, 0);
  assert.equal(app.stats.created, 0);
  assert.equal(app.frames.size, 0);
  assert.equal(app.robot.style.visibility, "hidden");
  app.media.matches = false; app.media.dispatch("change"); app.advance(2);
  assert.ok(app.stats.rendered > 0);
  app.media.matches = true; app.media.dispatch("change");
  const rendered = app.stats.rendered; app.advance(60);
  assert.equal(app.stats.rendered, rendered);
  assert.equal(app.overlay.dataset.motion, "reduced");
  assert.equal(app.frames.size, 0); assert.equal(app.timers.size, 0);
  app.assertClean();
});

test("WebGL failure selects the visible static fallback", () => {
  const app = harness({ failWebGL: true }); app.advance();
  assert.equal(app.robot.children.length, 0);
  assert.equal(app.frames.size, 0); assert.equal(app.stats.created, 0);
  assert.equal(app.overlay.dataset.renderer, "unavailable");
  app.assertClean();
});

test("Constrained devices keep animating at lower quality", () => {
  const app = harness({ constrained: true }); app.advance();
  const rendered = app.stats.rendered; app.advance(2);
  assert.ok(app.stats.rendered > rendered);
  app.assertClean();
});

test("Slow GPUs lower quality and complete cycles instead of freezing", () => {
  const app = harness({ slowGPU: true }); app.advance(30);
  assert.ok(app.stats.reducedQuality > 0);
  assert.ok(Number(app.overlay.dataset.cycles) >= 1);
  const rendered = app.stats.rendered; app.advance(10);
  assert.ok(app.stats.rendered > rendered);
  app.assertClean();
});

test("Context loss stops animation until restoration", () => {
  const app = harness(); app.advance();
  const canvas = app.robot.children[0];
  canvas.dispatch("webglcontextlost", { preventDefault() {} });
  app.advance(); assert.equal(app.frames.size, 0);
  app.document.dispatch("visibilitychange"); app.advance(); assert.equal(app.frames.size, 0);
  canvas.dispatch("webglcontextrestored"); app.advance();
  assert.ok(app.frames.size > 0);
  app.assertClean();
});

test("Unmount during the offscreen delay cancels the re-entry timer", () => {
  const app = harness();
  for(let i=0;i<600 && app.overlay.dataset.phase!=="waiting";i++) app.advance(.1);
  assert.equal(app.overlay.dataset.phase,"waiting");
  assert.equal(app.timers.size,1);
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
test("Landscape touch devices use the small mobile canvas and keep moving through scroll", () => {
  const app = harness({ coarse: true, width: 844 });
  app.advance();
  assert.equal(app.stats.sizes.at(-1), 150);
  assert.equal(app.robot.style.width, "150px");
  const rendered = app.stats.rendered;
  app.window.dispatch("scroll"); app.advance();
  assert.ok(app.stats.rendered > rendered);
  app.assertClean();
});


test("loader keeps a visible static bug pending, loading and under reduced motion", () => {
  const jsx = (type, props) => ({ type, props });
  const styles = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
  const fallback = evaluate("static-robotic-bug.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, "./robotic-bug.module.css": styles,
  });
  const media = { ...events(), matches: true }, idle = new Map();
  let motion = "pending", effect, loading;
  const Animated = () => null;
  const { RoboticBugLoader } = evaluate("robotic-bug-loader.tsx", {
    react: { useState: () => [motion, value => { motion = value; }], useEffect: fn => { effect = fn; } },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/dynamic": { __esModule: true, default: (_load, options) => { loading = options.loading; return Animated; } },
    "./static-robotic-bug": fallback,
  }, {
    window: { matchMedia: () => media, requestIdleCallback: fn => { idle.set(1, fn); return 1; }, cancelIdleCallback: key => idle.delete(key) },
    setTimeout, clearTimeout,
  });
  function assertStatic(tree) {
    assert.equal(tree.type, fallback.StaticRoboticBug);
    const dom = tree.type(tree.props);
    assert.equal(dom.props["data-renderer"], "static");
    assert.notEqual(dom.props.children.props.hidden, true);
    assert.equal(fallback.RoboticBugIcon().type, "svg");
  }
  assertStatic(RoboticBugLoader());
  assertStatic(loading());
  const cleanup = effect();
  idle.get(1)(); idle.clear();
  assert.equal(motion, "reduced");
  assertStatic(RoboticBugLoader());
  media.matches = false; media.dispatch("change");
  assert.equal(RoboticBugLoader().type, Animated);
  media.matches = true; media.dispatch("change");
  assertStatic(RoboticBugLoader());
  cleanup();
  assert.equal(media.count(), 0);
  assert.equal(idle.size, 0);
});
