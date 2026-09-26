// Contract: agent governance (review §3.1 row "Agent governance", mAgent.js _govern /
// _runOne; target shape in §5: `proposal {proposalId, args}` → governors reply
// `governed {proposalId, decision: deny|hold|allow, args?}` → the agent proceeds on
// quorum/deadline).
//
// Parties: the REAL <m-agent> (the proposer, under test) and a governor wired into the
// agent's archml the way an <m-norm> would be — a child that subscribes to the agent's
// `proposal` boundary with the "!scope/@proposal" ref (the same idiom m-repeat-guard
// uses for `step`). No governor component exists in src yet (the norm subsystem is
// handed off to design-agents-norms-codex.md), so the policy side is a minimal
// component defined here; the agent, its dry reasoner and its dry m-terminal are real.
//
// Pinned outcomes (must survive the migration to plain-data request/reply):
//   - a governor's DENY keeps the tool from running, and the refusal is what the
//     agent observes (a `refused: …` tool message), never the tool's result
//   - an ASYNC decision (hold, then deny) still vetoes: the tool waits for it
//   - a MODIFY is what actually runs (the tool's echo shows the patched args), and it
//     is disclosed to the agent's own loop
//   - a MODIFY into an invalid shape is caught by re-validation and never runs
//
// Why it breaks under async delivery today: the verdict travels back through the
// `proposal` event itself — `deny()`/`hold()` closures in detail, `args` mutated in
// place — and _govern reads `denied`, `holds` and `proposal.args` the moment `fire`
// returns. Deferred, the governor's deny/hold land after _govern has already returned
// (the tool ran), and its args patch is applied to a copy.
import { test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { waitFor, quiet, delay } from "./helpers.js";
import { MBaseComponent } from "../../../../src/mindComponents/shared/mBaseComponent.js";
import { loadMindComponents } from "../../../../src/startup/loadMindComponents.js";
import { resetBackendProbe } from "../../../../src/infrastructure/sandbox.js";

let savedDry, savedBackend;

beforeAll(() => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
    process.env.MEDITATOR_DRY_RUN = "1";                 // dry reasoner + dry terminal
    process.env.MEDITATOR_SANDBOX_BACKEND = "none";
    resetBackendProbe();
});

afterEach(() => { document.body.innerHTML = ""; });

afterAll(() => {
    document.body.innerHTML = "";
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
    resetBackendProbe();
});

// The policy side: a norm-shaped governor configured entirely by archml attributes.
//   tool     which tool it governs
//   deny     veto reason (synchronous deny)
//   hold     ms to deliberate before deciding (an async policy — e.g. an LLM norm)
//   script   rewrite the governed call's `script` arg to this (a modify)
//   badpatch rewrite `script` to a non-string (a modify the schema must reject)
class ContractGovernor extends MBaseComponent {
    onConnect() {
        this.sub("!scope/@proposal", e => this._govern(e?.detail)).catch(() => {});
    }
    _govern(p) {
        if (!p || p.name !== this.attr("tool")) return;
        const reason = this.attr("deny");
        const holdMs = Number(this.attr("hold") || 0);
        if (reason && holdMs > 0) {
            p.hold(delay(holdMs).then(() => p.deny(reason)));
        } else if (reason) {
            p.deny(reason);
        }
        if (this.attr("script") != null) p.args.script = this.attr("script");
        if (this.attr("badpatch") != null) p.args.script = 12345;
    }
}
if (!customElements.get("t-contract-governor")) customElements.define("t-contract-governor", ContractGovernor);

// A dry coder whose reasoner calls `terminal` twice ('ls -a', then an echo) and then
// answers — so every run makes two governed proposals.
async function runGoverned(governorAttrs) {
    document.body.innerHTML = `
      <m-agent name="contract-governed" maxSteps="10" toolSettleMs="60" stopWhen="no-tools">
        You are a coding agent. Do the task and reply with a short summary and no tool call.
        <m-objective name="objective">Make the failing tests pass.</m-objective>
        <m-reason name="reason" toolTokens="512" temperature="0.1"></m-reason>
        <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
        <t-contract-governor name="norm" tool="terminal" ${governorAttrs}></t-contract-governor>
      </m-agent>`;
    const agent = document.querySelector("m-agent");
    const steps = [];
    let done = null;
    agent.addEventListener("step", e => steps.push(e.detail));
    agent.addEventListener("done", e => { done = e.detail; });
    await loadMindComponents(document);
    await waitFor(() => done, 5000);
    await quiet();
    const termObs = steps.flatMap(s => s.observations || []).filter(o => o.name === "terminal");
    return { done, steps, termObs };
}

test("a governor's DENY keeps the tool from running; the agent observes the refusal", async () => {
    const { done, termObs } = await runGoverned(`deny="terminal is not permitted in this context"`);
    expect(done).toBeTruthy();
    expect(termObs.length).toBeGreaterThan(0);
    for (const o of termObs) {
        expect(o.isError).toBe(true);
        expect(o.observation).toMatch(/^refused: terminal is not permitted/i);
        expect(o.observation).not.toMatch(/dry-run: no command was executed/i);   // the tool never ran
    }
});

test("an ASYNC decision (hold, then deny) still vetoes: the tool waits for the governor", async () => {
    const { done, termObs } = await runGoverned(`deny="async policy: denied after review" hold="30"`);
    expect(done).toBeTruthy();
    expect(termObs.length).toBeGreaterThan(0);
    for (const o of termObs) {
        expect(o.isError).toBe(true);
        expect(o.observation).toMatch(/^refused: async policy: denied after review/i);
        expect(o.observation).not.toMatch(/dry-run: no command was executed/i);
    }
});

test("a MODIFY is what runs, and the agent is told its call was adjusted", async () => {
    const { done, termObs } = await runGoverned(`script="echo policy-approved-run"`);
    expect(done).toBeTruthy();
    expect(termObs.length).toBeGreaterThan(0);
    for (const o of termObs) {
        expect(o.isError).toBe(false);
        // The dry terminal echoes the script it was actually handed.
        expect(o.observation).toMatch(/echo policy-approved-run/);
        expect(o.observation).not.toMatch(/ls -a|echo "checking"/);   // the model's original never ran
        expect(o.observation).toMatch(/a governing norm adjusted this call's arguments/i);
    }
});

test("a MODIFY into an invalid shape is re-validated and never runs", async () => {
    const { done, termObs } = await runGoverned(`badpatch=""`);
    expect(done).toBeTruthy();
    expect(termObs.length).toBeGreaterThan(0);
    for (const o of termObs) {
        expect(o.isError).toBe(true);
        expect(o.observation).toMatch(/failed the schema/i);
        expect(o.observation).not.toMatch(/dry-run: no command was executed/i);
    }
});
