import assert from "node:assert/strict";
import test from "node:test";
import { firstName, greetingForHour, localMinute, serverMinute, subscribeToLocalMinute } from "../lib/dashboard-greeting.ts";

test("greetings switch at each specified local-hour boundary", () => {
  for (const [hour, expected] of [[0,"Night"],[4,"Night"],[5,"Morning"],[11,"Morning"],[12,"Afternoon"],[16,"Afternoon"],[17,"Evening"],[20,"Evening"],[21,"Night"],[23,"Night"]]) {
    assert.equal(greetingForHour(hour).title, `Good ${expected}`);
  }
  assert.equal(serverMinute(), null, "server must not render a guess about local time");
});

test("name precedence handles email and OAuth identities without revealing email", () => {
  assert.equal(firstName({ full_name: "  Alex   Rivers ", github_login: "arivers" }), "Alex");
  assert.equal(firstName({ full_name: "李 小明", github_login: "fallback" }), "李");
  assert.equal(firstName({ full_name: "  ", github_login: "octo-dev" }), "octo-dev");
  assert.equal(firstName({ full_name: "private@example.com", github_login: "octocat" }), "octocat");
  assert.equal(firstName({}), "Developer");
});

test("clock updates at a boundary, resumes after inactivity, and cleans up", (t) => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date(2026, 9, 31, 11, 59, 59, 995) });
  const observed = [];
  const unsubscribe = subscribeToLocalMinute(() => observed.push(localMinute()));
  try {
    const before = observed.at(-1);
    t.mock.timers.tick(5);
    assert.equal(observed.at(-1), before + 1);
    assert.equal(greetingForHour(new Date(observed.at(-1) * 60_000).getHours()).title, "Good Afternoon");
    t.mock.timers.setTime(new Date(2026, 10, 1, 0, 1).getTime());
    window.dispatchEvent(new Event("focus"));
    assert.equal(new Date(observed.at(-1) * 60_000).getDate(), 1);
    assert.equal(greetingForHour(new Date(observed.at(-1) * 60_000).getHours()).title, "Good Night");
    unsubscribe();
    const count = observed.length;
    t.mock.timers.tick(120_000);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(observed.length, count);
  } finally {
    unsubscribe();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    t.mock.timers.reset();
  }
});
