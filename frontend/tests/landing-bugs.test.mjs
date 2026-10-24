import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const components = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../components/landing");

// Run the real component effects and frame callbacks with a deterministic clock.
// This tests automatic playback and visibility behavior without adding a browser dependency.
function mountLandingBugs({ width = 1280, reduced = false } = {}) {
  let active;
  let now = 1000;
  let nextFrame = 1;
  const frames = new Map();
  const media = { matches: reduced };
  const modules = new Map();

  function events() {
    const listeners = new Map();
    return {
      addEventListener(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
      },
      removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
      dispatch(name) { for (const fn of listeners.get(name) ?? []) fn(); },
    };
  }

  Object.assign(media, events());
  const window = {
    ...events(),
    innerWidth: width,
    innerHeight: 900,
    matchMedia: () => media,
    requestAnimationFrame(fn) {
      const id = nextFrame++;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const document = {
    ...events(),
    hidden: false,
    createTreeWalker: () => ({ nextNode: () => null }),
    fonts: { ready: Promise.resolve() },
  };

  function element(top = 0, height = 400, elementWidth = width) {
    return {
      top, height, width: elementWidth, style: {}, dataset: {},
      getBoundingClientRect() {
        return { top: this.top, bottom: this.top + this.height, left: 0, right: this.width, width: this.width, height: this.height };
      },
      querySelectorAll: () => [],
    };
  }

  const regions = [element(100, 650), element(900, 800), element(2600, 200)];
  const page = element(0, 2800);
  page.clientWidth = width;
  page.scrollHeight = 2800;
  page.querySelectorAll = (selector) => selector.includes("section") ? regions : [];
  page.querySelector = () => regions[2];

  const React = {
    createContext(defaultValue) {
      const context = { current: defaultValue };
      context.Provider = { context };
      return context;
    },
    useContext: (context) => context.current,
    useRef(initialValue) {
      const index = active.cursor++;
      return active.hooks[index] ??= { current: initialValue };
    },
    useState(initialValue) {
      const instance = active;
      const index = instance.cursor++;
      const slot = instance.hooks[index] ??= { value: initialValue };
      return [slot.value, (next) => { slot.value = typeof next === "function" ? next(slot.value) : next; }];
    },
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useEffect(fn, deps) {
      const index = active.cursor++;
      const previous = active.hooks[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) active.effects.push({ index, fn, deps });
    },
  };

  const jsx = (type, props) => ({ type, props });
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const loadedModule = { exports: {} };
    modules.set(filename, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const loadDependency = (name) => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) };
      const base = path.resolve(path.dirname(filename), name);
      return load([".tsx", ".ts"].map((ext) => base + ext).find((candidate) => fs.existsSync(candidate)));
    };
    const evaluate = vm.runInNewContext("(function(require,module,exports) {" + source + "\n})", {
      window, document, NodeFilter: { SHOW_TEXT: 4 },
      ResizeObserver: class { observe() {} disconnect() {} },
    }, { filename });
    evaluate(loadDependency, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }

  function visit(node, fn) {
    if (Array.isArray(node)) return node.forEach((child) => visit(child, fn));
    if (!node || typeof node !== "object") return;
    fn(node);
    visit(node.props?.children, fn);
  }

  function mount(Component, props = {}) {
    const instance = { hooks: [], cursor: 0, effects: [], elements: [], tree: null };
    instance.render = () => {
      active = instance;
      instance.cursor = 0;
      instance.effects = [];
      instance.tree = Component(props);
      active = null;
      visit(instance.tree, (node) => {
        if (node.type?.context) node.type.context.current = node.props.value;
        const ref = node.props?.ref;
        if (!ref || ref.current) return;
        const dom = element(150, 400, Math.min(width, 700));
        if (node.props.className === "overlay") dom.parentElement = page;
        for (const [key, value] of Object.entries(node.props)) {
          if (key.startsWith("data-")) dom.dataset[key.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
        }
        dom.className = node.props.className;
        ref.current = dom;
        instance.elements.push(dom);
      });
      for (const effect of instance.effects) {
        instance.hooks[effect.index]?.cleanup?.();
        instance.hooks[effect.index] = { deps: effect.deps, cleanup: effect.fn() };
      }
    };
    instance.dispose = () => instance.hooks.forEach((hook) => hook?.cleanup?.());
    instance.render();
    return instance;
  }

  const { CrawlingBug } = load(path.join(components, "crawling-bug.tsx"));
  const { SectionInsect } = load(path.join(components, "section-insect.tsx"));
  const crawlers = [mount(CrawlingBug), mount(SectionInsect, { path: "hero" }), mount(SectionInsect, { path: "grid" })];
  const bugs = crawlers.map((crawler) => crawler.elements.find((dom) => dom.dataset.landingBug));
  const overlay = crawlers[0].elements.find((dom) => dom.className === "overlay");
  const tracks = crawlers.slice(1).map((crawler) => crawler.elements.find((dom) => dom.className === "track"));
  let buttonCount = 0;
  visit(crawlers[0].tree, (node) => { if (node.type === "button") buttonCount++; });
  return {
    bugs, tracks, overlay, window, document, media, buttonCount,
    positions: () => bugs.map((bug) => bug.style.transform),
    advance(milliseconds = 2000) {
      for (let elapsed = 0; elapsed < milliseconds; elapsed += 1000 / 60) {
        now += 1000 / 60;
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback(now));
      }
    },
    dispose() {
      crawlers.forEach((crawler) => crawler.dispose());
      assert.equal(frames.size, 0, "Unmount must cancel pending animation frames");
    },
  };
}

function assertAllMoved(app, previous) {
  app.positions().forEach((position, index) => assert.notEqual(position, previous[index], app.bugs[index].dataset.landingBug + " must move"));
}

test("All three bugs show and move automatically without playback or visibility controls", () => {
  const app = mountLandingBugs({ reduced: true });
  try {
    const initial = app.positions();
    app.advance();
    assertAllMoved(app, initial);
    app.bugs.forEach((bug) => assert.equal(bug.dataset.motion, "on"));
    assert.equal(app.overlay.style.visibility, "visible");
    app.tracks.forEach((track) => assert.notEqual(track.style.visibility, "hidden"));
    assert.equal(app.buttonCount, 0);
  } finally { app.dispose(); }
});

for (const width of [390, 820, 1440]) {
  test("Crawlers start, pause offscreen, and resume at viewport width " + width, () => {
    const app = mountLandingBugs({ width });
    try {
      const initial = app.positions();
      app.advance();
      assertAllMoved(app, initial);

      app.document.hidden = true;
      app.document.dispatch("visibilitychange");
      const hidden = app.positions();
      app.advance();
      assert.deepEqual(app.positions(), hidden);
      app.document.hidden = false;
      app.document.dispatch("visibilitychange");
      app.advance();
      assertAllMoved(app, hidden);

      app.tracks.forEach((track) => { track.top = 2000; });
      app.window.dispatch("scroll");
      const offscreen = app.positions();
      app.advance();
      assert.deepEqual(app.positions().slice(1), offscreen.slice(1));
      app.tracks.forEach((track) => { track.top = 150; });
      app.window.dispatch("scroll");
      app.advance();
      app.positions().slice(1).forEach((position, index) => assert.notEqual(position, offscreen[index + 1]));
    } finally { app.dispose(); }
  });
}
