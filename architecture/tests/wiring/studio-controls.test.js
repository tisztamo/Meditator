// The stray controls, now folded into the mesh (S3): studio-streammode owns the
// flow/raw preference and publishes it; studio-panes drives the mobile column
// switcher off /conn/focused and a declared /view/ ref. No pane reaches across
// the DOM for any of them.
import "./setup.js";
import { test, expect, beforeEach, afterEach } from "bun:test";
import { delay } from "./setup.js";
import { getPref } from "../../../src/studio/ui/studioPrefs.js";
import "./studioHarness.js";   // defines test-conn for the panes test
import "../../../src/studio/ui/studioStreamMode.js";
import "../../../src/studio/ui/studioPanes.js";

// An isolated localStorage so the persistence assertions are deterministic and do
// not leak a saved pref into other test files sharing the process.
let _origLS;
beforeEach(() => {
  _origLS = globalThis.localStorage;
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
});
afterEach(() => { globalThis.localStorage = _origLS; });

test("streammode defaults to fold and cycles fold→flow→raw→fold, persisting each", () => {
  document.body.innerHTML = `<studio-streammode class="streammode"></studio-streammode>`;
  const el = document.querySelector("studio-streammode");
  expect(el.mode).toBe("fold");
  expect(el.textContent).toBe("fold");
  expect(el.classList.contains("fold")).toBe(true);

  el.click();
  expect(el.mode).toBe("flow");
  expect(el.textContent).toBe("flow");
  expect(getPref("streamMode")).toBe("flow");

  el.click();
  expect(el.mode).toBe("raw");
  expect(el.textContent).toBe("raw");
  expect(el.classList.contains("raw")).toBe(true);
  expect(getPref("streamMode")).toBe("raw");

  el.click();                                        // wraps back to fold
  expect(el.mode).toBe("fold");
  expect(getPref("streamMode")).toBe("fold");
});

test("streammode publishes its mode string so the stream can subscribe", async () => {
  document.body.innerHTML = `<studio-streammode name="streammode"></studio-streammode>`;
  const el = document.querySelector("studio-streammode");
  let mode = null;
  el.on("mode", v => { mode = v; });                 // late subscriber gets the replay
  await delay(1);
  expect(mode).toBe("fold");                         // current = fold (default)
  el.click();
  expect(mode).toBe("flow");                         // republished
  el.click();
  expect(mode).toBe("raw");
});

test("streammode restores a saved preference (raw)", () => {
  globalThis.localStorage.setItem("studioPrefs", JSON.stringify({ streamMode: "raw" }));
  document.body.innerHTML = `<studio-streammode></studio-streammode>`;
  const el = document.querySelector("studio-streammode");
  expect(el.mode).toBe("raw");
  expect(el.textContent).toBe("raw");
});

test("panes set data-pane on the view and mark the active button", async () => {
  document.body.innerHTML =
    `<test-conn name="conn"><main name="view"></main>` +
    `<studio-panes class="panebar"></studio-panes></test-conn>`;
  const main = document.querySelector("main");
  const panes = document.querySelector("studio-panes");
  await delay(10);
  expect(main.getAttribute("data-pane")).toBe("minds");      // default pane
  const streamBtn = panes.querySelector('button[data-pane="stream"]');
  streamBtn.click();
  expect(main.getAttribute("data-pane")).toBe("stream");
  expect(streamBtn.classList.contains("active")).toBe(true);
  expect(getPref("pane")).toBe("stream");                    // persisted
});

test("panes jump to the Stream pane when a mind is focused (/conn/focused)", async () => {
  document.body.innerHTML =
    `<test-conn name="conn"><main name="view"></main>` +
    `<studio-panes class="panebar"></studio-panes></test-conn>`;
  const hub = document.querySelector("test-conn");
  const main = document.querySelector("main");
  await delay(10);
  expect(main.getAttribute("data-pane")).toBe("minds");
  hub.pub("focused", "m1");
  await delay(10);
  expect(main.getAttribute("data-pane")).toBe("stream");
});
