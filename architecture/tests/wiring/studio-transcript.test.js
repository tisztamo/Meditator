// studio-transcript is the agent twin of studio-stream (agent-loop.md §13 M4): it shows
// the tool-calling LOOP — each step's assistant text, tool calls and observations, plus
// the final answer — and only when the focused entity is an agent (/conn/focusedKind).
// Driven against the fake hub: pub the kind + backfill, fire live agent/* events, assert
// the rendered transcript. Also asserts studio-stream yields the column to an agent.
import "./setup.js";
import { test, expect } from "bun:test";
import { delay } from "./setup.js";
import { mountHub } from "./studioHarness.js";
import "../../../src/studio/ui/studioTranscript.js";
import "../../../src/studio/ui/studioStream.js";

const settle = () => delay(10);

const STEP = {
  k: "agent-step", index: 0, assistantText: "Let me look at the file.",
  calls: [{ name: "read_file", args: { path: "main.py" } }],
  observations: [{ name: "read_file", observation: "1\tprint('hi')", isError: false }],
};
const ANSWER = { k: "agent-answer", t: "Done — the test passes.", reason: "finish-tool", steps: 3 };

test("transcript hides for a mind and shows for an agent", async () => {
  const { hub, el } = mountHub(`<studio-transcript id="transcript"></studio-transcript>`);
  await settle();
  expect(el.style.display).toBe("none");            // nothing focused yet → hidden
  hub.pub("focusedKind", "mind");
  await settle();
  expect(el.style.display).toBe("none");            // a mind's stream owns the column
  hub.pub("focusedKind", "agent");
  await settle();
  expect(el.style.display).toBe("");                // an agent → the transcript shows
});

test("a backfill of steps + answer renders assistant text, calls, observations, answer", async () => {
  const { hub, el } = mountHub(`<studio-transcript id="transcript"></studio-transcript>`);
  await settle();
  hub.pub("focusedKind", "agent");
  hub.fire("focusReset", "a1");
  await settle();
  hub.pub("backfill", [STEP, ANSWER]);
  await settle();

  expect(el.querySelectorAll(".ag-step").length).toBe(1);
  expect(el.querySelector(".ag-say").textContent).toContain("look at the file");
  const call = el.querySelector(".ag-call");
  expect(call.textContent).toContain("read_file");
  expect(call.textContent).toContain("main.py");
  expect(el.querySelector(".ag-obs pre").textContent).toContain("print('hi')");
  expect(el.querySelector(".ag-answer").textContent).toContain("the test passes");
});

test("live agent/* events append steps, mark errors, and fill the tool palette", async () => {
  const { hub, el } = mountHub(`<studio-transcript id="transcript"></studio-transcript>`);
  await settle();
  hub.pub("focusedKind", "agent");
  hub.fire("focusReset", "a1");
  await settle();
  hub.pub("backfill", []);                          // empty batch → replay over, live begins
  await settle();

  hub.fire("event", { process: "agent", kind: "tools", names: ["terminal", "read_file", "finish"] });
  hub.fire("event", { process: "agent", kind: "status", state: "reasoning", step: 1, maxSteps: 40 });
  hub.fire("event", {
    process: "agent", kind: "step", index: 0, assistantText: "Running it.",
    calls: [{ name: "terminal", args: { command: "python3 main.py" } }],
    observations: [{ name: "terminal", observation: "NameError: boom", isError: true }],
  });
  await settle();

  expect(el.querySelectorAll(".ag-tool").length).toBe(3);
  expect(el.querySelector(".ag-status").textContent).toContain("reasoning");
  expect(el.querySelector(".ag-status").textContent).toContain("1/40");
  expect(el.querySelectorAll(".ag-step").length).toBe(1);
  const obs = el.querySelector(".ag-obs");
  expect(obs.classList.contains("err")).toBe(true);
  expect(obs.textContent).toContain("NameError: boom");

  // A second live step accrues (not replaced).
  hub.fire("event", { process: "agent", kind: "answer", answer: "Fixed.", reason: "no-tools" });
  await settle();
  expect(el.querySelector(".ag-answer").textContent).toContain("Fixed");
});

test("studio-stream hides and ignores telemetry when an agent is focused", async () => {
  const { hub, el } = mountHub(`<studio-stream id="stream"></studio-stream>`);
  await settle();
  hub.pub("focusedKind", "agent");
  await settle();
  expect(el.style.display).toBe("none");
  // Agent backfill must not build a mind's stream DOM.
  hub.pub("backfill", [STEP, ANSWER]);
  await settle();
  expect(el.querySelector(".ag-step")).toBe(null);
  expect(el.querySelector(".say")).toBe(null);
});
