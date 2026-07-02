// The agent loop end-to-end, fully offline (agent-loop.md §7, §12): an <m-agent>
// seeds its <m-objective> as the first user turn, <m-reason> returns a tool call,
// <m-terminal> (in agent mode) runs it and returns a raw `observation`, the loop
// appends it and repeats — until the model answers with no tool call. Exercises the
// whole assemble → reason → run tools → append → repeat cycle and the transcript
// integrity the providers require (every tool_call answered by exactly one tool msg).
// The dry reasoner (llm.js dryCompleteWithTools, debugTag "reason") drives two tool
// steps then stops; NO real process is ever spawned. Modeled on act-terminal-dry.
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
    process.env.MEDITATOR_DRY_RUN = "1";                 // reason + tools, all offline
    process.env.MEDITATOR_SANDBOX_BACKEND = "none";      // belt-and-suspenders
    resetBackendProbe();
});

afterAll(() => {
    document.body.innerHTML = "";   // disconnect any agent so it can't linger in the shared jsdom
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
    resetBackendProbe();
});

// Build a fresh agent, load its components, and collect its step/done events. No
// `model` attr on the agent → m-reason resolves the null-ref hardcoded fallback, so
// no models.yaml is needed offline (the same way act-terminal-dry avoids it).
async function runAgent(html) {
    const steps = [];
    let done = null;
    document.body.innerHTML = html;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    agent.addEventListener("step", e => steps.push(e.detail));
    agent.addEventListener("done", e => { done = e.detail; });
    // The loop can't finish before _whenAlive settles (toolSettleMs + a poll), so
    // attaching listeners now catches every step. Poll until the loop ends.
    for (let i = 0; i < 120 && !agent._done; i++) await delay(25);
    return { agent, steps, done };
}

// Provider contract (agent-loop.md §12): every assistant tool_call is answered by
// exactly one `tool` message carrying the matching tool_call_id.
function assertTranscriptValid(messages) {
    const pending = new Set();
    for (const m of messages) {
        if (m.role === "assistant" && m.tool_calls) {
            for (const c of m.tool_calls) {
                expect(typeof c.id).toBe("string");
                pending.add(c.id);
            }
        } else if (m.role === "tool") {
            expect(pending.has(m.tool_call_id)).toBe(true);   // answers a real, open call
            pending.delete(m.tool_call_id);
        }
    }
    expect(pending.size).toBe(0);                             // and every call was answered
}

const CODER = (extra = "") => `
  <m-agent name="coder-test" maxSteps="10" toolSettleMs="60" stopWhen="no-tools" ${extra}>
    You are a coding agent. Do the task, checking your work, and reply with a short
    summary and no tool call when it is done.
    <m-objective name="objective">Make the failing tests pass.</m-objective>
    <m-reason name="reason" toolTokens="512" temperature="0.1"></m-reason>
    <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
  </m-agent>
`;

test("the terminal registers as a tool, and in agent mode (not a mind's hand)", async () => {
    const { agent } = await runAgent(CODER());
    expect(agent._tools.map(t => t.name)).toContain("terminal");
    const terminal = agent.querySelector("m-terminal");
    expect(terminal._forAgent).toBe(true);
});

test("the objective seeds the first user turn", async () => {
    const { agent } = await runAgent(CODER());
    expect(agent._messages[0]).toEqual({ role: "user", content: "Make the failing tests pass." });
});

test("the loop takes tool-calling steps then answers with no tool call (no-tools stop)", async () => {
    const { agent, steps, done } = await runAgent(CODER());

    expect(agent._done).toBe(true);
    expect(done).not.toBeNull();
    expect(done.reason).toBe("answered");
    expect(done.answer).toMatch(/dry run/i);

    // Two tool steps were taken (the dry reasoner runs the terminal twice), then it
    // answered — so 3 reason calls, 2 of which called a tool.
    expect(steps.length).toBe(2);
    expect(done.steps).toBe(3);
    for (const s of steps) {
        expect(s.calls.map(c => c.name)).toContain("terminal");
        expect(s.observations.some(o => /dry-run: no command was executed/i.test(o.observation))).toBe(true);
    }
});

test("the transcript is provider-valid: every tool_call answered by one tool message", async () => {
    const { agent } = await runAgent(CODER());
    assertTranscriptValid(agent._messages);
    // Concretely: 3 assistant turns (2 with a tool_call, 1 final answer) + 2 tool msgs + the seed.
    const roles = agent._messages.map(m => m.role);
    expect(roles.filter(r => r === "assistant").length).toBe(3);
    expect(roles.filter(r => r === "tool").length).toBe(2);
    // No real process ran — the observations came from the dry stub.
    const toolMsgs = agent._messages.filter(m => m.role === "tool");
    expect(toolMsgs.every(m => /dry-run/i.test(m.content))).toBe(true);
});

test("finish-tool mode: the loop ends when the model calls finish()", async () => {
    const { agent, done } = await runAgent(`
      <m-agent name="coder-finish" maxSteps="10" toolSettleMs="60" stopWhen="finish-tool">
        You are a coding agent. Call finish(summary) when the task is complete.
        <m-objective name="objective">Make the failing tests pass.</m-objective>
        <m-reason name="reason" toolTokens="512"></m-reason>
        <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
      </m-agent>
    `);
    expect(agent._done).toBe(true);
    expect(done.reason).toBe("finish-tool");
    expect(done.answer).toMatch(/inspected the workspace/i);
    // finish() is a kernel-registered tool, and its call is answered like any other.
    expect(agent._tools.map(t => t.name)).toContain("finish");
    assertTranscriptValid(agent._messages);
});

// Regression: a reentrancy hazard between m-agent and m-reason. In finish-tool mode, a
// reply with NO tool call folds a "keep working" nudge and immediately republishes the
// next turn SYNCHRONOUSLY — inside m-reason's still-open pub("reply") call (Amanita's
// pub() runs subscribers synchronously, not via a microtask). If m-reason clears its busy
// flag after publishing instead of before, that reentrant turn sees busy still true and is
// silently dropped: no model call is ever made for it, and the loop freezes forever with no
// error and no further steps. Live symptom (what surfaced this): an agent stuck at
// state "reasoning" indefinitely, with no request ever reaching the model.
test("finish-tool mode: a plain-text answer (no tool call) does not freeze the loop", async () => {
    const { agent, done } = await runAgent(`
      <m-agent name="coder-ptf" maxSteps="10" toolSettleMs="60" stopWhen="finish-tool">
        PLAIN_TEXT_FIRST_THEN_FINISH. You are a coding agent. Call finish(summary) when done.
        <m-objective name="objective">Make the failing tests pass.</m-objective>
        <m-reason name="reason" toolTokens="512"></m-reason>
        <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
      </m-agent>
    `);
    expect(agent._done).toBe(true);
    expect(done).not.toBeNull();
    expect(done.reason).toBe("finish-tool");
    // The plain-text answer must have actually been nudged into a second reasoning call
    // (not dropped): the transcript carries the nudge note and the eventual finish call.
    expect(agent._messages.some(m => m.role === "user" && /keep working/i.test(m.content))).toBe(true);
    assertTranscriptValid(agent._messages);
});

// Regression: a purely CONVERSATIONAL request in finish-tool mode must not run away.
// "What tools do you have" is fully answered in one plain-text reply — there is no task to
// finish — but finish-tool mode cannot end on a plain answer, so the old "keep working"
// nudge sent the model hunting the filesystem for a nonexistent objective until the step
// cap (found live: coder-service-2 dug through /tmp, .claude/tasks, env vars, then tripped
// context compaction and looped). The fix: after two consecutive plain answers the kernel
// auto-finishes, concatenating them (with a marker) so the first, substantive answer is
// preserved rather than replaced by a terse retry.
test("finish-tool mode: a conversational answer auto-finishes instead of looping", async () => {
    const { agent, done } = await runAgent(`
      <m-agent name="coder-conv" maxSteps="12" toolSettleMs="60" stopWhen="finish-tool">
        PLAIN_TEXT_ALWAYS. You are a coding agent. Call finish(summary) when done.
        <m-objective name="objective">What tools do you have?</m-objective>
        <m-reason name="reason" toolTokens="512"></m-reason>
        <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
      </m-agent>
    `);
    expect(agent._done).toBe(true);
    expect(done).not.toBeNull();
    expect(done.reason).toBe("answered");
    // Ended well within budget — no runaway toward the step cap.
    expect(done.steps).toBeLessThan(4);
    // The concatenated summary keeps the FIRST substantive answer, not just the retry.
    expect(done.answer).toMatch(/read_file, write_file, edit, terminal/);
    expect(done.answer).toMatch(/\[continued\]/);
    assertTranscriptValid(agent._messages);
});

test("the halt seam stops the loop: a bubbling `halt` event is a stop condition", async () => {
    // A high step budget so the dry loop would otherwise run to completion; a halt
    // fired before it starts must end it at the next turn boundary with reason=halt.
    document.body.innerHTML = `
      <m-agent name="coder-halt" maxSteps="10" toolSettleMs="60">
        You are a coding agent.
        <m-objective name="objective">Loop forever.</m-objective>
        <m-reason name="reason"></m-reason>
        <m-terminal name="terminal" network="off"></m-terminal>
      </m-agent>`;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    let done = null;
    agent.addEventListener("done", e => { done = e.detail; });
    // Fire a halt as soon as the first step starts (an observer would do this on a step
    // event); the loop stops at the next _publishTurn.
    agent.addEventListener("step", () => agent.fire("halt", { reason: "stalled — same action repeated" }), { once: true });
    for (let i = 0; i < 120 && !agent._done; i++) await delay(25);
    expect(agent._done).toBe(true);
    expect(done.halted).toBe(true);
    expect(done.reason).toMatch(/stalled/);
});
