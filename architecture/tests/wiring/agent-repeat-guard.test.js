// <m-repeat-guard> as a monitor on an agent (agent-loop.md §9): it answers the `step`
// boundary and, when the SAME action recurs, first NUDGES then HALTS — and m-agent
// folds a nudge into the next user turn and treats a halt as a stop condition, with NO
// change to the kernel.
//
// Under the message rule the step is a request and the guard's signal is its reply
// (doc/architecture/message-rule.md): these tests ask the way m-agent does and read the
// answer, never a `nudge` / `halt` event read back after the fire.
//
// This also pins the events-refactor fix: the guard answers the agent's `step` through
// the "@" event ref (!scope/@step). If that ref were wrong (the stale pre-refactor
// "/step" topic form the design doc showed), the guard would never hear a step and
// never answer — so every assertion below would fail.
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

// A bare agent with just the guard (no <m-reason> → the real loop never starts; we send
// synthetic `step` requests ourselves, which is exactly what m-agent sends between steps).
async function makeGuardedAgent(attrs = `nudgeAt="2" haltAt="3"`) {
    document.body.innerHTML = `
      <m-agent name="guarded" toolSettleMs="60">
        The agent.
        <m-repeat-guard ${attrs}></m-repeat-guard>
      </m-agent>`;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    await delay(120);   // let the guard's async sub bind to !scope/@step
    return { agent };
}

let seq = 0;
const stepOf = (name, args) => ({ index: ++seq, assistantText: "", calls: [{ id: "c" + seq, name, args }], observations: [] });
// Ask the guard about one step; resolves to its answer ({} when it has nothing to say).
async function askStep(agent, name, args = {}) {
    const reply = await agent.request("step", stepOf(name, args), { deadline: 1000 });
    expect(reply.status).toBe("ok");
    expect(reply.from).toBe("m-repeat-guard");
    return reply.data;
}

test("a repeated action nudges at nudgeAt, and m-agent folds it into the next user turn", async () => {
    const { agent } = await makeGuardedAgent();
    expect(await askStep(agent, "terminal", { language: "bash", script: "make test" })).toEqual({});   // first — quiet

    const second = await askStep(agent, "terminal", { language: "bash", script: "make test" });
    expect(second.nudge).toMatch(/same action 2 times/);   // second → nudge (the ref resolved!)
    expect(second.severity).toBe(2);
    expect(second.halt).toBeUndefined();

    // m-agent consults its monitors the same way at a real step boundary and folds the
    // answer — it will become a [note] on the next turn.
    await agent._consultMonitors(stepOf("terminal", { language: "bash", script: "make test" }));
    expect(agent._halt).toMatch(/Repeated the same action 3/);   // the third is the halt
    expect(agent._nudges).toHaveLength(0);
});

test("m-agent folds a monitor's nudge into its pending notes", async () => {
    const { agent } = await makeGuardedAgent(`nudgeAt="2" haltAt="9"`);
    await agent._consultMonitors(stepOf("terminal", { script: "ls" }));
    expect(agent._nudges).toHaveLength(0);
    await agent._consultMonitors(stepOf("terminal", { script: "ls" }));
    expect(agent._nudges).toHaveLength(1);
    expect(agent._nudges[0]).toMatch(/genuinely different approach/);
    expect(agent._halt).toBeNull();
});

test("the same action escalating to haltAt halts once", async () => {
    const { agent } = await makeGuardedAgent();
    const answers = [];
    for (let i = 0; i < 4; i++) answers.push(await askStep(agent, "terminal", { language: "bash", script: "make test" }));
    expect(answers[0]).toEqual({});
    expect(answers[1].nudge).toBeTruthy();                       // one nudge on the 2nd…
    expect(answers[2].halt).toMatch(/Repeated the same action 3/);   // …then the halt on the 3rd
    expect(answers[3]).toEqual({});                              // the halt is answered only once
});

test("distinct actions never trip the guard", async () => {
    const { agent } = await makeGuardedAgent();
    const answers = [
        await askStep(agent, "read_file", { path: "a.js" }),
        await askStep(agent, "read_file", { path: "b.js" }),
        await askStep(agent, "edit", { path: "a.js", old: "x", new: "y" }),
        await askStep(agent, "terminal", { language: "bash", script: "ls" }),
    ];
    for (const a of answers) expect(a).toEqual({});
});

test("the action signature is argument-order-independent (stable stringify)", async () => {
    const { agent } = await makeGuardedAgent();
    // Same call, arguments serialized in a different key order → the SAME signature.
    await askStep(agent, "terminal", { language: "bash", script: "ls" });
    const second = await askStep(agent, "terminal", { script: "ls", language: "bash" });
    expect(second.nudge).toBeTruthy();
});
