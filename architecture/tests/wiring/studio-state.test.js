// Studio panes derive their state from /conn/ topics, never from the hub's fields
// (S2). Driven against the fake hub: we pub topics and assert the pane reacts,
// without the hub ever calling focus()/onMsg() to populate its own focusedId.
import "./setup.js";
import { test, expect } from "bun:test";
import { delay } from "./setup.js";
import { mountHub } from "./studioHarness.js";
import "../../../src/studio/ui/studioSpeak.js";
import "../../../src/studio/ui/studioToast.js";

const settle = () => delay(10);

test("speak stays disabled until a focused mind is awake (state from topics)", async () => {
  const { hub, el } = mountHub(`<studio-speak class="foot"></studio-speak>`);
  await settle();
  expect(el.input.disabled).toBe(true);       // nothing focused yet
  hub.pub("roster", [{ id: "m1", state: "awake" }]);
  hub.pub("focused", "m1");
  await settle();
  expect(el.input.disabled).toBe(false);      // focused + awake → enabled
  expect(el.btn.disabled).toBe(false);
});

test("speak enables for a mind that is only listed after focus (waking default)", async () => {
  const { hub, el } = mountHub(`<studio-speak class="foot"></studio-speak>`);
  await settle();
  hub.pub("focused", "m1");                    // focused before the roster lists it
  await settle();
  expect(el.input.disabled).toBe(true);        // "waking" → still disabled
  hub.pub("roster", [{ id: "m1", state: "awake" }]);
  await settle();
  expect(el.input.disabled).toBe(false);       // roster says awake → enabled
});

test("speak re-disables when the focused mind sleeps (lifecycle topic)", async () => {
  const { hub, el } = mountHub(`<studio-speak class="foot"></studio-speak>`);
  await settle();
  hub.pub("roster", [{ id: "m1", state: "awake" }]);
  hub.pub("focused", "m1");
  await settle();
  expect(el.input.disabled).toBe(false);
  hub.pub("lifecycle", { id: "m1", state: "sleeping" });
  await settle();
  expect(el.input.disabled).toBe(true);
});

test("toast shows a crash notice only for the focused mind (focus from topic)", async () => {
  const { hub, el } = mountHub(`<studio-toast></studio-toast>`);
  await settle();
  hub.pub("focused", "m1");
  await settle();
  hub.pub("lifecycle", { id: "m2", state: "crashed" });   // a different mind
  await settle();
  expect(el.classList.contains("show")).toBe(false);
  hub.pub("lifecycle", { id: "m1", state: "crashed" });   // the focused mind
  await settle();
  expect(el.classList.contains("show")).toBe(true);
  expect(el.textContent).toContain("crashed");
});
