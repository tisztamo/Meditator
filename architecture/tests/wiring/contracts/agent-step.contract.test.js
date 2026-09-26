// Contract: agent step round trip (review §3.1 row "Agent step round trip",
// mAgent.js _onReply/_publishTurn, mRepeatGuard.js _onStep; target shape in §5:
// `halt`/`nudge` carry `turnIndex`, and the agent applies them to that turn or the
// next, explicitly, instead of racing).
//
// Parties: the REAL <m-agent> (fires `step`, folds `nudge`, stops on `halt`) and the
// REAL <m-repeat-guard> (watches `step` via "!scope/@step", fires `nudge`/`halt`).
// Surroundings: the real <m-reason> seam with its model scripted (the model repeats
// the same terminal call every turn — the rut the guard exists to catch), and the real
// dry <m-terminal>. The scripted model also records every turn it is handed, which is
// the observable: what the model actually sees on turn N.
//
// Pinned outcomes (must survive the migration to plain-data events):
//   - the guard's nudge for step N is folded into turn N+1 — the very next thing the
//     model reads — not lost and not a turn late
//   - reaching haltAt stops the loop AT that step: the halt-triggering step is the last
//     tool execution, no further turn is issued, and `done` reports the guard's reason
//
// Why it breaks under async delivery today: m-agent fires `step` and calls
// _publishTurn() on the next line, relying on the guard having run INSIDE that fire
// and on its nudge/halt having already set _nudges/_halt. Deferred, the next turn is
// published before the guard even sees the step: the nudge lands one turn late, and
// the halt lands after another tool call has already run.
import { test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { waitFor, quiet, delay } from "./helpers.js";
import { loadMindComponents } from "../../../../src/startup/loadMindComponents.js";
import { resetBackendProbe } from "../../../../src/infrastructure/sandbox.js";

let savedDry, savedBackend;

beforeAll(() => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
    process.env.MEDITATOR_DRY_RUN = "1";                 // the terminal stays a dry stub
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

// An agent in a rut: the scripted model runs the SAME terminal call every turn and
// never answers, so only the guard (or the step budget) can end the loop.
async function runRut(guardAttrs, maxSteps) {
    document.body.innerHTML = `
      <m-agent name="contract-rut" maxSteps="${maxSteps}" toolSettleMs="60" stopWhen="no-tools">
        You are a coding agent.
        <m-objective name="objective">Make the failing tests pass.</m-objective>
        <m-reason name="reason"></m-reason>
        <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
        <m-repeat-guard ${guardAttrs}></m-repeat-guard>
      </m-agent>`;
    const agent = document.querySelector("m-agent");
    const steps = [];
    let done = null;
    agent.addEventListener("step", e => steps.push(e.detail));
    agent.addEventListener("done", e => { done = e.detail; });
    await loadMindComponents(document);

    // Script the model behind the real m-reason seam (the loop cannot start before the
    // tool-settle window, so this lands before the first turn).
    const turns = [];
    let n = 0;
    agent.querySelector("m-reason")._move = async turn => {
        turns.push(turn.messages.map(m => ({ role: m.role, content: m.content })));
        await delay(2);
        n += 1;
        return {
            text: "Let me run the tests again.",
            tool_calls: [{
                id: `call_rut_${n}`, type: "function",
                function: { name: "terminal", arguments: JSON.stringify({ language: "bash", script: "make test" }) },
            }],
            finish_reason: "tool_calls",
        };
    };

    await waitFor(() => done, 5000);
    await quiet();
    return { done, steps, turns };
}

const notesIn = turn => turn.filter(m => m.role === "user" && /^\[note\]/.test(m.content || ""));

test("the guard's nudge for step N is folded into turn N+1 — the next thing the model reads", async () => {
    // nudgeAt=2: the 2nd identical call nudges; haltAt out of reach; the budget ends it.
    const { done, steps, turns } = await runRut(`nudgeAt="2" haltAt="99"`, 4);
    expect(done).toBeTruthy();
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(turns.length).toBeGreaterThanOrEqual(3);

    expect(notesIn(turns[0])).toHaveLength(0);
    expect(notesIn(turns[1])).toHaveLength(0);          // one run of the action: nothing to say yet
    // Turn 3 is issued right after step 2 — it must already carry step 2's nudge, as the
    // newest message the model reads.
    const t3 = turns[2];
    expect(notesIn(t3)).toHaveLength(1);
    expect(t3.at(-1).role).toBe("user");
    expect(t3.at(-1).content).toMatch(/same action 2 times/);
});

test("reaching haltAt stops the loop at that step: no further tool call, done names the guard", async () => {
    const { done, steps, turns } = await runRut(`nudgeAt="2" haltAt="3"`, 8);
    expect(done).toBeTruthy();
    expect(done.halted).toBe(true);
    expect(done.reason).toMatch(/Repeated the same action 3/);
    expect(done.steps).toBe(3);
    // Exactly three tool executions (the third is the halt-triggering one)…
    expect(steps).toHaveLength(3);
    const ran = steps.flatMap(s => s.observations || []).filter(o => /dry-run: no command was executed/.test(o.observation));
    expect(ran).toHaveLength(3);
    // …and no fourth turn was ever put to the model.
    expect(turns).toHaveLength(3);
});
