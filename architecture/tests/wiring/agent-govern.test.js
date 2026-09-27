// The GOVERN seam (agent-loop.md §6, §11, milestone 5), fully offline. Between reason
// and act, m-agent sends a `proposal` request its governors answer — permit, deny (a
// VETO) or modify (a patch) — before the tool runs (shared/governance.js, message-rule.md).
// This proves the seam a norm attaches to — WITHOUT building the norm subsystem (handed
// off to design-agents-norms-codex.md): a tiny hand-rolled governor part stands in for
// an <m-norm>. Covered: default permit (no governor), synchronous deny, synchronous
// modify (re-validated), asynchronous deny (a later answer), and the quorum: a governor
// that never answers denies at the deadline. The dry reasoner drives the terminal loop;
// NO model, NO real process. Modeled on agent-loop.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import { delay } from "./setup.js";
import { MBaseComponent } from "../../../src/mindComponents/shared/mBaseComponent.js";
import { governProposals } from "../../../src/mindComponents/shared/governance.js";
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

// A governor part standing in for an <m-norm>: it answers with whatever the test's
// `decide(proposal)` returns (undefined permits).
let decide = null;
class TestGovernor extends MBaseComponent {
    static provides = { governor: true };
    onConnect() { governProposals(this, p => decide?.(p)).catch(() => {}); }
}
if (!customElements.get("t-test-governor")) customElements.define("t-test-governor", TestGovernor);

const coder = (governed, attrs = "") => `
  <m-agent name="governed-coder" maxSteps="10" toolSettleMs="60" stopWhen="no-tools" ${attrs}>
    You are a coding agent. Do the task and reply with a short summary and no tool call.
    <m-objective name="objective">Make the failing tests pass.</m-objective>
    <m-reason name="reason" toolTokens="512" temperature="0.1"></m-reason>
    <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
    ${governed ? `<t-test-governor name="norm"></t-test-governor>` : ""}
  </m-agent>
`;

// Build an agent with a governor part (or none), record every proposal it sends (a plain
// listener still hears the request), collect its step observations, and run to the end.
async function runGoverned(governor, attrs = "") {
    const proposals = [];
    decide = governor;
    document.body.innerHTML = coder(!!governor, attrs);
    const agent = document.querySelector("m-agent");
    agent.addEventListener("proposal", e => {
        proposals.push({ name: e.detail.name, args: JSON.parse(JSON.stringify(e.detail.args)) });
    });
    await loadMindComponents(document);
    const steps = [];
    agent.addEventListener("step", e => steps.push(e.detail));
    for (let i = 0; i < 160 && !agent._done; i++) await delay(25);
    decide = null;
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
        if (p.name === "terminal") return { decision: "deny", reason: "terminal is not permitted in this context" };
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
        if (p.name === "terminal") return { decision: "modify", patch: { script: 'echo "policy-approved run"' } };
    });
    expect(agent._done).toBe(true);
    // The transcript's assistant tool_calls still hold the ORIGINAL script (what the model
    // proposed), but what ran used the patched args. We assert the patch was accepted
    // (no schema rejection) and the call was not refused.
    const toolMsgs = agent._messages.filter(m => m.role === "tool");
    expect(toolMsgs.length).toBeGreaterThan(0);
    for (const m of toolMsgs) {
        expect(m.content).not.toMatch(/^refused:/i);
        expect(m.content).not.toMatch(/failed the schema/i);
        // …and the patch is DISCLOSED to the agent's own loop (finding 7): the observation
        // it reads next turn says a norm adjusted the args, so it never acts on a silent rewrite.
        expect(m.content).toMatch(/a governing norm adjusted this call's arguments/i);
    }
});

test("an UNMODIFIED call carries no disclosure note (only a real patch is marked)", async () => {
    // A governor that inspects but leaves the args alone must not trigger the disclosure,
    // not even when it answers with an empty patch.
    const { agent } = await runGoverned(p => { void p.args; return { decision: "modify", patch: {} }; });
    expect(agent._done).toBe(true);
    const toolMsgs = agent._messages.filter(m => m.role === "tool");
    expect(toolMsgs.length).toBeGreaterThan(0);
    for (const m of toolMsgs) {
        expect(m.content).not.toMatch(/a governing norm adjusted/i);
    }
});

test("MODIFY into an invalid shape is caught by the post-patch re-validation", async () => {
    // A governor that patches the required `script` to a non-string violates the tool's
    // schema; because validation runs AFTER governance, the bad patch is rejected rather
    // than reaching the tool.
    const { agent } = await runGoverned(p => {
        if (p.name === "terminal") return { decision: "modify", patch: { script: 12345 } };   // not a string
    });
    expect(agent._done).toBe(true);
    const termMsgs = agent._messages.filter(m => m.role === "tool");
    expect(termMsgs.some(m => /failed the schema/i.test(m.content))).toBe(true);
});

test("asynchronous VETO: a governor may answer later, and m-agent waits for it", async () => {
    // An async policy (e.g. an LLM norm) answers when it has decided; the loop must not
    // run the tool until that answer lands.
    const { agent, steps } = await runGoverned(async p => {
        if (p.name !== "terminal") return;
        await delay(30);
        return { decision: "deny", reason: "async policy: denied after review" };
    });
    expect(agent._done).toBe(true);
    const termObs = steps.flatMap(s => s.observations).filter(o => o.name === "terminal");
    expect(termObs.length).toBeGreaterThan(0);
    for (const o of termObs) {
        expect(o.isError).toBe(true);
        expect(o.observation).toMatch(/refused: async policy: denied after review/i);
    }
});

test("a governor that never answers denies at the deadline (a missing norm is not permission)", async () => {
    const { agent, steps } = await runGoverned(() => new Promise(() => {}), `governDeadline="80ms"`);
    expect(agent._done).toBe(true);
    const termObs = steps.flatMap(s => s.observations).filter(o => o.name === "terminal");
    expect(termObs.length).toBeGreaterThan(0);
    for (const o of termObs) {
        expect(o.isError).toBe(true);
        expect(o.observation).toMatch(/^refused: governor "norm" did not answer in time/);
        expect(o.observation).not.toMatch(/dry-run: no command was executed/i);
    }
});

test("a governor that throws denies (its error is the reason)", async () => {
    const { agent, steps } = await runGoverned(() => { throw new Error("policy store unreachable"); });
    expect(agent._done).toBe(true);
    const termObs = steps.flatMap(s => s.observations).filter(o => o.name === "terminal");
    expect(termObs.length).toBeGreaterThan(0);
    for (const o of termObs) expect(o.observation).toMatch(/^refused: governor error: policy store unreachable/);
});
