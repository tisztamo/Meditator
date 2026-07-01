// Service mode (agent-loop.md §10): an agent with a membrane but no static <m-objective>
// idles until a task lands, works each task, and RETURNS to idle for the next rather than
// retiring — the deliberate inversion of the one-shot coder. Tasks arrive as bubbling
// `task` events (what m-ws fires on client input for an agent). Fully offline: the dry
// reasoner drives each task to a finish; no real socket or process is involved.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
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

// A service agent: no <m-objective>, a membrane (<m-console> — a task port that needs no
// socket), finish-tool stop. `persist="off"` keeps m-context off the filesystem.
const SERVICE = `
  <m-agent name="svc" maxSteps="10" toolSettleMs="60" stopWhen="finish-tool">
    You are a service coding agent. Call finish(summary) when the task is done.
    <m-reason name="reason" toolTokens="256"></m-reason>
    <m-terminal name="terminal" network="off"></m-terminal>
    <m-context name="context" persist="off"></m-context>
    <m-console name="console"></m-console>
  </m-agent>
`;

async function wakeService() {
    document.body.innerHTML = SERVICE;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    const done = [];
    agent.addEventListener("done", e => done.push(e.detail));
    for (let i = 0; i < 120 && !agent._alive; i++) await delay(25);   // wait for wake
    return { agent, done };
}

test("with no objective but a membrane, the agent idles instead of retiring", async () => {
    const { agent, done } = await wakeService();
    expect(agent._alive).toBe(true);
    expect(agent._taskActive).toBe(false);   // nothing running
    expect(agent._retired).toBe(false);      // and it did NOT retire — it awaits a task
    expect(agent._messages.length).toBe(0);
    expect(done.length).toBe(0);
});

test("a task runs to a finish, then the agent returns to idle and serves a second task", async () => {
    const { agent, done } = await wakeService();

    agent.fire("task", { text: "First task: fix the parser." });
    for (let i = 0; i < 120 && done.length < 1; i++) await delay(25);
    expect(done.length).toBe(1);
    expect(done[0].reason).toBe("finish-tool");
    // Back to idle, NOT retired — the transcript survives for continuity.
    expect(agent._retired).toBe(false);
    expect(agent._taskActive).toBe(false);
    expect(agent._done).toBe(false);         // reset for the next task

    agent.fire("task", { text: "Second task: add a test." });
    for (let i = 0; i < 120 && done.length < 2; i++) await delay(25);
    expect(done.length).toBe(2);             // it served the second task too
    expect(agent._messages.some(m => m.role === "user" && /Second task/.test(m.content))).toBe(true);
});

test("a task arriving mid-run folds into the running task as a user note (not a second loop)", async () => {
    const { agent } = await wakeService();
    agent.fire("task", { text: "Primary task." });
    for (let i = 0; i < 40 && !agent._taskActive; i++) await delay(5);
    expect(agent._taskActive).toBe(true);

    // A second task arrives while the first is still running → folded, not started fresh.
    agent.fire("task", { text: "Also please do this." });
    // It becomes a pending nudge folded into the next user turn (arrival-order, §open-Q3).
    const folded = agent._nudges.some(n => /Also please do this/.test(n))
        || agent._messages.some(m => m.role === "user" && /Also please do this/.test(m.content));
    expect(folded).toBe(true);
});

test("m-ws under an agent turns client input into a bubbling `task`, not a mind interrupt", async () => {
    // A real socket on an ephemeral port (0), so we exercise the dual-use m-ws path
    // without a fixed port. We drive one client message through handleClientMessage
    // directly with a fake client (no live connection needed) — the agent-mode branch
    // must fire a bubbling `task` the kernel folds into a user turn, NOT an
    // interrupt-request (a mind concept the agent never listens for).
    document.body.innerHTML = `
      <m-agent name="svc-ws" maxSteps="10" toolSettleMs="60" stopWhen="finish-tool">
        Service agent.
        <m-reason name="reason" toolTokens="256"></m-reason>
        <m-terminal name="terminal" network="off"></m-terminal>
        <m-ws name="ws" port="0"></m-ws>
      </m-agent>`;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    const ws = agent.querySelector("m-ws");
    const interrupts = [];
    agent.addEventListener("interrupt-request", e => interrupts.push(e.detail));
    for (let i = 0; i < 120 && !(agent._alive && ws.server); i++) await delay(25);
    expect(ws._forAgent()).toBe(true);

    // A fake open client; feed it a completed line of input.
    const client = { readyState: 1, OPEN: 1, send() {} };
    ws.clientBuffers.set(client, { inputBuffer: "", clientId: "t1" });
    ws.handleClientMessage(client, "please add a changelog\n");

    for (let i = 0; i < 120 && !agent._taskActive && agent._messages.length === 0; i++) await delay(25);
    expect(agent._messages.some(m => m.role === "user" && /add a changelog/.test(m.content))).toBe(true);
    expect(interrupts.length).toBe(0);   // never an attention interrupt — this is an agent
});

test("tasks arriving before wake completes are buffered and drained", async () => {
    document.body.innerHTML = SERVICE;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    const done = [];
    agent.addEventListener("done", e => push(done, e.detail));
    function push(arr, v) { arr.push(v); }
    // Fire immediately — before _alive. It must buffer, not drop.
    agent.fire("task", { text: "Early task before wake." });
    for (let i = 0; i < 160 && done.length < 1; i++) await delay(25);
    expect(done.length).toBe(1);
    expect(agent._messages.some(m => m.role === "user" && /Early task before wake/.test(m.content))).toBe(true);
});
