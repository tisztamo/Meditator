// <m-repeat-guard> as a pure observer on an agent (agent-loop.md §9): it watches the
// `step` boundary and, when the SAME action recurs, first NUDGES then HALTS — and
// m-agent folds a nudge into the next user turn and treats a halt as a stop condition,
// with NO change to the kernel.
//
// This also pins the events-refactor fix: the guard subscribes to the agent's `step`
// with the "@" event ref (..m-agent/@step) and reads e.detail. If that ref were wrong
// (the stale pre-refactor "/step" topic form the design doc showed), the guard would
// never hear a step and NO nudge would ever fire — so every assertion below would fail.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let savedDry;

beforeAll(() => { savedDry = process.env.MEDITATOR_DRY_RUN; process.env.MEDITATOR_DRY_RUN = "1"; });
afterAll(() => {
    document.body.innerHTML = "";
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
});

// A bare agent with just the guard (no <m-reason> → the real loop never starts; we drive
// synthetic `step` events ourselves, which is exactly what m-agent fires between steps).
async function makeGuardedAgent(attrs = `nudgeAt="2" haltAt="3"`) {
    document.body.innerHTML = `
      <m-agent name="guarded" toolSettleMs="60">
        The agent.
        <m-repeat-guard ${attrs}></m-repeat-guard>
      </m-agent>`;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    const nudges = [], halts = [];
    agent.addEventListener("nudge", e => nudges.push(e.detail));
    agent.addEventListener("halt", e => halts.push(e.detail));
    await delay(120);   // let the guard's async sub bind to ..m-agent/@step
    return { agent, nudges, halts };
}

let seq = 0;
const fireStep = (agent, name, args = {}) =>
    agent.fire("step", { index: ++seq, assistantText: "", calls: [{ id: "c" + seq, name, args }], observations: [] });

test("a repeated action nudges at nudgeAt, and m-agent folds it into the next user turn", async () => {
    const { agent, nudges } = await makeGuardedAgent();
    fireStep(agent, "terminal", { language: "bash", script: "make test" });
    expect(nudges.length).toBe(0);                       // first occurrence — quiet

    fireStep(agent, "terminal", { language: "bash", script: "make test" });
    expect(nudges.length).toBe(1);                       // second → nudge (the ref resolved!)
    expect(nudges[0].text).toMatch(/same action 2 times/);
    expect(nudges[0].severity).toBe(2);
    // m-agent's own handler folded it — it will become a [note] on the next turn.
    expect(agent._nudges.length).toBe(1);
    expect(agent._nudges[0]).toMatch(/genuinely different approach/);
});

test("the same action escalating to haltAt halts once, and m-agent records the stop", async () => {
    const { agent, nudges, halts } = await makeGuardedAgent();
    fireStep(agent, "terminal", { language: "bash", script: "make test" });
    fireStep(agent, "terminal", { language: "bash", script: "make test" });
    fireStep(agent, "terminal", { language: "bash", script: "make test" });   // 3rd → halt
    expect(halts.length).toBe(1);
    expect(halts[0].reason).toMatch(/Repeated the same action 3/);
    expect(agent._halt).toMatch(/Repeated the same action/);   // m-agent's stop condition is armed

    fireStep(agent, "terminal", { language: "bash", script: "make test" });   // 4th
    expect(halts.length).toBe(1);                              // the halt fires only once
    expect(nudges.length).toBe(1);                             // (one nudge on the 2nd, then halt)
});

test("distinct actions never trip the guard", async () => {
    const { agent, nudges, halts } = await makeGuardedAgent();
    fireStep(agent, "read_file", { path: "a.js" });
    fireStep(agent, "read_file", { path: "b.js" });
    fireStep(agent, "edit", { path: "a.js", old: "x", new: "y" });
    fireStep(agent, "terminal", { language: "bash", script: "ls" });
    expect(nudges.length).toBe(0);
    expect(halts.length).toBe(0);
});

test("the action signature is argument-order-independent (stable stringify)", async () => {
    const { agent, nudges } = await makeGuardedAgent();
    // Same call, arguments serialized in a different key order → the SAME signature.
    fireStep(agent, "terminal", { language: "bash", script: "ls" });
    fireStep(agent, "terminal", { script: "ls", language: "bash" });
    expect(nudges.length).toBe(1);
});
