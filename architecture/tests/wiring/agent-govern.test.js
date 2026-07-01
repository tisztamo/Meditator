// The GOVERN seam (agent-loop.md §6, §11, milestone 5), fully offline. Between reason
// and act, m-agent fires a bubbling `proposal` event a governor may VETO or MODIFY before
// the tool runs. This proves the seam a norm attaches to — WITHOUT building the norm
// subsystem (handed off to design-agents-norms-codex.md): a tiny hand-rolled governor
// stands in for an <m-norm>. Covered: default permit (no governor), synchronous deny,
// synchronous modify (re-validated), and asynchronous deny via hold(promise). The dry
// reasoner drives the terminal loop; NO model, NO real process. Modeled on agent-loop.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { resetBackendProbe } from "../../../src/infrastructure/sandbox.js";

let savedDry, savedBackend;

beforeAll(() => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
    process.env.MEDITATOR_DRY_RUN = "1";
    process.env.MEDITATOR_SANDBOX_BACKEND = "none";
    resetBackendProbe();
});

afterAll(() => {
    document.body.innerHTML = "";
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
    resetBackendProbe();
});

const CODER = `
  <m-agent name="governed-coder" maxSteps="10" toolSettleMs="60" stopWhen="no-tools">
    You are a coding agent. Do the task and reply with a short summary and no tool call.
    <m-objective name="objective">Make the failing tests pass.</m-objective>
    <m-reason name="reason" toolTokens="512" temperature="0.1"></m-reason>
    <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
  </m-agent>
`;

// Build an agent, attach a governor (a plain `proposal` listener standing in for an
// <m-norm>) BEFORE the loop can run, collect its step observations, and run to the end.
async function runGoverned(governor) {
    const proposals = [];
    document.body.innerHTML = CODER;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    // The seam: a governor is just a subscriber on the bubbling `proposal` event.
    agent.addEventListener("proposal", e => {
        proposals.push({ name: e.detail.name, args: JSON.parse(JSON.stringify(e.detail.args)) });
        if (governor) governor(e.detail);
    });
    const steps = [];
    agent.addEventListener("step", e => steps.push(e.detail));
    for (let i = 0; i < 120 && !agent._done; i++) await delay(25);
    return { agent, proposals, steps };
}

test("no governor wired: a proposal fires per tool call and the call proceeds unchanged", async () => {
    const { agent, proposals, steps } = await runGoverned(null);
    expect(agent._done).toBe(true);
    // The dry reasoner calls `terminal` twice, so two proposals were seen…
    expect(proposals.filter(p => p.name === "terminal").length).toBe(2);
    // …and, ungoverned, both actually ran (their observations came back from the tool).
    for (const s of steps) {
        expect(s.observations.some(o => /dry-run: no command was executed/i.test(o.observation))).toBe(true);
        expect(s.observations.some(o => /^refused:/i.test(o.observation))).toBe(false);
    }
});

test("synchronous VETO: a governor that denies a tool refuses it before it runs", async () => {
    const { agent, steps } = await runGoverned(p => {
        if (p.name === "terminal") p.deny("terminal is not permitted in this context");
    });
    expect(agent._done).toBe(true);
    // Every terminal call was refused — the observation is the refusal, never a tool result.
    const termObs = steps.flatMap(s => s.observations).filter(o => o.name === "terminal");
    expect(termObs.length).toBeGreaterThan(0);
    for (const o of termObs) {
        expect(o.isError).toBe(true);
        expect(o.observation).toMatch(/refused: terminal is not permitted/i);
        expect(o.observation).not.toMatch(/dry-run: no command was executed/i);
    }
});

test("synchronous MODIFY: a governor can rewrite the args, and the patch is re-validated", async () => {
    // Rewrite every terminal script to a fixed safe one — the executed call carries the
    // governor's args, not the reasoner's original.
    const { agent } = await runGoverned(p => {
        if (p.name === "terminal") p.args.script = 'echo "policy-approved run"';
    });
    expect(agent._done).toBe(true);
    // The transcript's assistant tool_calls still hold the ORIGINAL script (what the model
    // proposed), but what ran used the patched args — the seam mutated the object execute()
    // received. In dry mode the observation is fixed, so we assert the patch was accepted
    // (no schema rejection) and the call was not refused.
    const toolMsgs = agent._messages.filter(m => m.role === "tool");
    expect(toolMsgs.length).toBeGreaterThan(0);
    for (const m of toolMsgs) {
        expect(m.content).not.toMatch(/^refused:/i);
        expect(m.content).not.toMatch(/failed the schema/i);
    }
});

test("MODIFY into an invalid shape is caught by the post-patch re-validation", async () => {
    // A governor that patches the required `script` to a non-string violates the tool's
    // schema; because validation runs AFTER governance, the bad patch is rejected rather
    // than reaching the tool.
    const { agent } = await runGoverned(p => {
        if (p.name === "terminal") p.args.script = 12345;   // not a string
    });
    expect(agent._done).toBe(true);
    const termMsgs = agent._messages.filter(m => m.role === "tool");
    expect(termMsgs.some(m => /failed the schema/i.test(m.content))).toBe(true);
});

test("asynchronous VETO: a governor may hold(promise) to decide, and m-agent awaits it", async () => {
    // An async policy (e.g. an LLM norm) registers its decision with hold(); the loop must
    // not run the tool until that promise settles and the deny lands.
    const { agent, steps } = await runGoverned(p => {
        if (p.name !== "terminal") return;
        p.hold(delay(30).then(() => p.deny("async policy: denied after review")));
    });
    expect(agent._done).toBe(true);
    const termObs = steps.flatMap(s => s.observations).filter(o => o.name === "terminal");
    expect(termObs.length).toBeGreaterThan(0);
    for (const o of termObs) {
        expect(o.isError).toBe(true);
        expect(o.observation).toMatch(/refused: async policy: denied after review/i);
    }
});
