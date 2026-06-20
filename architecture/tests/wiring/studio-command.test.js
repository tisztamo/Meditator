// The Studio command path (S1): panes dispatch a bubbling "studio-command"; the
// hub's run() listener maps it to the supervisor message verbatim. We assert both
// the hub's routing (run → send) and the end-to-end path (a pane action → a
// message on the wire), driving the real StudioConn with its socket stubbed out.
import "./setup.js";
import { test, expect } from "bun:test";
import { delay } from "./setup.js";
import { mountHub, detachedHub } from "./studioHarness.js";
import "../../../src/studio/ui/studioSpeak.js";
import "../../../src/studio/ui/studioRoster.js";
import "../../../src/studio/ui/studioRefresh.js";

const settle = () => delay(10);

// ----------------------------------------- hub routing: run() maps verbatim
test("run() routes speak to an input message for the focused mind", () => {
  const conn = detachedHub();
  conn.focusedId = "m1";
  conn.run({ cmd: "speak", text: "hello" });
  expect(conn.sent).toEqual([{ type: "input", data: { id: "m1", message: "hello" } }]);
});

test("run() routes wake / refresh / sleep / force / dismiss verbatim", () => {
  const conn = detachedHub();
  conn.run({ cmd: "wake", file: "a.archml", dryRun: true, modelProfile: "p", name: "n" });
  conn.run({ cmd: "refresh" });
  conn.run({ cmd: "sleep", id: "m1" });
  conn.run({ cmd: "force", id: "m2" });
  conn.run({ cmd: "dismiss", id: "m3" });
  expect(conn.sent).toEqual([
    { type: "wake", data: { file: "a.archml", dryRun: true, modelProfile: "p", name: "n", origin: null, projectRoot: null } },
    { type: "refresh" },
    { type: "sleep", data: { id: "m1" } },
    { type: "force", data: { id: "m2" } },
    { type: "dismiss", data: { id: "m3" } },
  ]);
});

test("run() forwards an edited origin story and an external project root on wake", () => {
  const conn = detachedHub();
  conn.run({ cmd: "wake", file: "lab/companion.archml", dryRun: false, modelProfile: "local-dev",
             name: "companion-1", origin: "An opening this instance begins on.", projectRoot: "/home/u/spinoff" });
  expect(conn.sent).toEqual([
    { type: "wake", data: { file: "lab/companion.archml", dryRun: false, modelProfile: "local-dev",
      name: "companion-1", origin: "An opening this instance begins on.", projectRoot: "/home/u/spinoff" } },
  ]);
});

test("run() routes focus to a focus message and arms the focus", () => {
  const conn = detachedHub();
  conn.run({ cmd: "focus", id: "m1" });
  expect(conn.focusedId).toBe("m1");
  expect(conn.sent).toEqual([{ type: "focus", data: { id: "m1", sinceSeq: null } }]);
});

test("run() ignores an empty or unknown command", () => {
  const conn = detachedHub();
  conn.run(undefined);
  conn.run({});
  conn.run({ cmd: "nope", id: "m1" });
  expect(conn.sent).toEqual([]);
});

// --------------------------------- end to end: pane action → message on the wire
test("speak: Send dispatches a command the hub forwards as input", async () => {
  const { hub, el } = mountHub(`<studio-speak class="foot"></studio-speak>`);
  await settle();
  hub.pub("roster", [{ id: "m1", state: "awake" }]);
  hub.pub("focused", "m1");
  hub.focusedId = "m1";        // the hub's own focus, which run() reads for speak
  await settle();
  el.input.value = "hi there";
  el.btn.click();
  expect(hub.sent).toEqual([{ type: "input", data: { id: "m1", message: "hi there" } }]);
  expect(el.input.value).toBe("");        // cleared after sending
});

test("roster: the Sleep button dispatches a sleep command for that mind", async () => {
  const { hub, el } = mountHub(`<studio-roster></studio-roster>`);
  await settle();
  hub.pub("roster", [{ id: "m1", state: "awake", file: "f", port: 1, home: "h" }]);
  await settle();
  el.querySelector('button[action="sleep"]').click();
  expect(hub.sent).toEqual([{ type: "sleep", data: { id: "m1" } }]);
});

test("roster: clicking a live card dispatches a focus command", async () => {
  const { hub, el } = mountHub(`<studio-roster></studio-roster>`);
  await settle();
  hub.pub("roster", [{ id: "m1", state: "awake", file: "f", port: 1, home: "h" }]);
  await settle();
  el.querySelector('[data-id="m1"]').click();
  expect(hub.sent.some(m => m.type === "focus" && m.data.id === "m1")).toBe(true);
});

test("roster: Force confirms first, then dispatches a force command", async () => {
  const orig = globalThis.confirm;
  globalThis.confirm = () => true;
  try {
    const { hub, el } = mountHub(`<studio-roster></studio-roster>`);
    await settle();
    hub.pub("roster", [{ id: "m1", state: "sleeping", file: "f", port: 1, home: "h" }]);
    await settle();
    el.querySelector('button[action="force"]').click();
    expect(hub.sent).toEqual([{ type: "force", data: { id: "m1" } }]);
  } finally { globalThis.confirm = orig; }
});

test("roster: declining the Force confirmation dispatches nothing", async () => {
  const orig = globalThis.confirm;
  globalThis.confirm = () => false;
  try {
    const { hub, el } = mountHub(`<studio-roster></studio-roster>`);
    await settle();
    hub.pub("roster", [{ id: "m1", state: "sleeping", file: "f", port: 1, home: "h" }]);
    await settle();
    el.querySelector('button[action="force"]').click();
    expect(hub.sent).toEqual([]);
  } finally { globalThis.confirm = orig; }
});

test("refresh: the ⟳ control dispatches a refresh command", async () => {
  const { hub, el } = mountHub(`<studio-refresh></studio-refresh>`);
  await settle();
  el.click();
  expect(hub.sent).toEqual([{ type: "refresh" }]);
});
