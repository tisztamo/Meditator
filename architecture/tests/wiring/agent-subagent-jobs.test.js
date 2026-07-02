// PARALLEL SUB-AGENTS: a background job that IS another <m-agent> (agent-loop.md §16). This
// is the payoff of the async job registry — a background job need not be a shell command; it
// can be a whole sub-agent running its own tool-calling loop. The lead's <m-jobs> discovers
// its role="subagent" children and offers spawn_agent alongside spawn; a spawned sub-agent
// runs in the background, in the SAME registry as shell jobs, so check / wait / kill /
// list_jobs collect it uniformly, and its completion NOTIFIES the lead through the same nudge
// seam. Fully offline: the dry reasoner drives each worker's whole loop (terminal ×2 →
// finish) with no model and no process. Modeled on agent-jobs + agent-compose.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { resetBackendProbe } from "../../../src/infrastructure/sandbox.js";

let savedDry, savedBackend;

// A lead agent (no objective, no membrane, so its OWN loop never auto-runs — we drive the
// job tools directly) with two private sub-agents it may spawn as background jobs. Each
// worker is a full agent with its own reasoner + terminal; finish-tool so the dry loop runs
// terminal ×2 then finish. The lead's <m-reason> is declared FIRST so `reason/reply` (a
// name-based ref) resolves to it, not to a worker's identically-named reasoner.
const LEAD = () => `
  <m-agent name="lead" maxSteps="10" toolSettleMs="60">
    You are the lead.
    <m-reason name="reason"></m-reason>

    <m-agent name="worker-a" role="subagent" maxSteps="8" toolSettleMs="60" stopWhen="finish-tool">
      You are a worker. Do the task, checking your work, then finish(summary).
      <m-reason name="reason" toolTokens="512" temperature="0.1"></m-reason>
      <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
    </m-agent>

    <m-agent name="worker-b" role="subagent" maxSteps="8" toolSettleMs="60" stopWhen="finish-tool">
      You are a worker. Do the task, checking your work, then finish(summary).
      <m-reason name="reason" toolTokens="512" temperature="0.1"></m-reason>
      <m-terminal name="terminal" wall="10s" network="off"></m-terminal>
    </m-agent>

    <m-jobs name="jobs" wall="30s" network="off"></m-jobs>
  </m-agent>
`;

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
    process.env.MEDITATOR_DRY_RUN = "1";
    process.env.MEDITATOR_SANDBOX_BACKEND = "none";
    resetBackendProbe();
    // Pre-register every component (a throwaway load) so each build()'s innerHTML then
    // upgrades in production order — the lead's `capability` listener attached before its
    // tools offer — rather than depending on cross-file registration state (agent-loop.md §14).
    document.body.innerHTML = LEAD();
    await loadMindComponents(document);
    document.body.innerHTML = "";
});

afterAll(() => {
    document.body.innerHTML = "";
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
    resetBackendProbe();
});

async function build() {
    document.body.innerHTML = LEAD();
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");                 // the lead (first in doc order)
    const jobs = agent.querySelector('[name="jobs"]');
    const workerA = agent.querySelector('[name="worker-a"]');
    const workerB = agent.querySelector('[name="worker-b"]');
    // Wait for the lead to come alive AND both workers to settle (their own reason up),
    // rather than a fixed delay — robust under load.
    for (let i = 0; i < 200; i++) {
        if (agent._alive && workerA._alive && workerB._alive) break;
        await delay(20);
    }
    const tool = name => agent._tools.find(t => t.name === name)?.execute;
    return { agent, jobs, workerA, workerB, tool };
}

test("m-jobs discovers the sub-agents and offers spawn_agent alongside the shell tools", async () => {
    const { agent } = await build();
    const names = agent._tools.map(t => t.name);
    for (const n of ["spawn", "spawn_agent", "check", "wait", "list_jobs", "kill"]) expect(names).toContain(n);
    // spawn_agent names the available workers in its schema, so the model knows what it can run.
    const spec = agent._tools.find(t => t.name === "spawn_agent");
    expect(spec.parameters.properties.agent.description).toMatch(/worker-a/);
    expect(spec.parameters.properties.agent.description).toMatch(/worker-b/);
});

test("a sub-agent nested in an AGENT is a background job, NOT a blocking hand on the lead", async () => {
    const { agent, workerA, workerB } = await build();
    // The workers idle as sub-agents and never registered themselves as blocking tools on
    // the lead — the only way to reach them is spawn_agent (the background path).
    const names = agent._tools.map(t => t.name);
    expect(names).not.toContain("worker-a");
    expect(names).not.toContain("worker-b");
    expect(workerA._asHand).toBe(true);
    expect(workerA._taskActive).toBe(false);   // did not auto-begin
    expect(workerB._messages.length).toBe(0);
});

test("spawn_agent starts a background job that runs the sub-agent's WHOLE loop to completion", async () => {
    const { tool } = await build();
    const out = await tool("spawn_agent")({ agent: "worker-a", task: "do the piece", purpose: "the piece" });
    expect(out.data.id).toBe("job-1");
    expect(out.data.agent).toBe("worker-a");
    expect(out.observation).toMatch(/started job-1/);

    // It is registered as an AGENT job in the same registry as shell jobs.
    const list = tool("list_jobs")();
    expect(list.data.jobs[0].kind).toBe("agent");

    // Wait on it — the dry worker runs terminal ×2 then finish, so it completes; the final
    // report speaks in agent terms (completed / could not complete), not a shell exit code,
    // and carries the worker's own summary back to the lead.
    const done = await tool("wait")({ id: "job-1", timeout: "10s" });
    expect(done.observation).toMatch(/completed/);
    expect(done.observation).toMatch(/inspected the workspace/i);   // the worker's dry finish summary
    expect(done.isError).toBeFalsy();
});

test("check shows the sub-agent's step progress while it works", async () => {
    const { tool } = await build();
    await tool("spawn_agent")({ agent: "worker-b", task: "another piece" });
    // Await completion, then check drains the tail: it must include the per-step progress the
    // sub-agent streamed (a [step N] line naming a tool it reached for), never a black box.
    const done = await tool("wait")({ id: "job-1", timeout: "10s" });
    expect(done.observation).toMatch(/\[step \d+\]/);
    expect(done.observation).toMatch(/terminal|finish/);
});

test("a finished sub-agent job NOTIFIES the lead: a nudge folded into its next turn", async () => {
    const { agent, tool } = await build();
    await tool("spawn_agent")({ agent: "worker-a", task: "the piece", purpose: "compute the thing" });
    expect(agent._nudges.length).toBe(0);              // nothing while it runs
    await tool("wait")({ id: "job-1", timeout: "10s" });
    // The registry's onComplete fired a `nudge`; the lead caught it and queued it for its
    // next turn — the "best last" way to learn a job finished (agent-loop.md §16).
    expect(agent._nudges.some(t => /job-1/.test(t) && /finished its work/.test(t))).toBe(true);
});

test("spawn_agent on an unknown sub-agent is a clean error listing the available ones", async () => {
    const { tool } = await build();
    const out = await tool("spawn_agent")({ agent: "nobody", task: "x" });
    expect(out.isError).toBe(true);
    expect(out.observation).toMatch(/no such sub-agent/);
    expect(out.observation).toMatch(/worker-a/);
});

test("spawn_agent with no task is refused, not started", async () => {
    const { tool } = await build();
    const out = await tool("spawn_agent")({ agent: "worker-a", task: "   " });
    expect(out.isError).toBe(true);
    expect(out.observation).toMatch(/no task/);
});

test("a busy sub-agent turns work away rather than corrupting its single-threaded transcript", async () => {
    const { workerA, tool } = await build();
    // busy/available reflect the single-flight loop state.
    expect(workerA.busy).toBe(false);
    expect(workerA.available).toBe(true);
    workerA._taskActive = true;                        // simulate mid-task
    expect(workerA.busy).toBe(true);
    expect(workerA.available).toBe(false);
    const out = await tool("spawn_agent")({ agent: "worker-a", task: "second piece" });
    expect(out.isError).toBe(true);
    expect(out.observation).toMatch(/busy/);
    workerA._taskActive = false;                       // restore
});

test("_abortTask (what kill invokes on an agent job) stops the loop at a safe point", async () => {
    const { workerB } = await build();
    // Put the worker mid-task, then abort as registry.kill()→handle.kill() would.
    workerB._taskActive = true;
    workerB._done = false;
    let resolved = null;
    workerB._handResolve = d => { resolved = d; };
    workerB._abortTask("the work was stopped");
    expect(workerB._taskActive).toBe(false);           // reset to idle
    expect(resolved).toBeTruthy();                     // the in-flight handle resolved
    expect(resolved.reason).toMatch(/the work was stopped/);
});

test("with a sandbox but no sub-agents, spawn_agent is NOT offered (only shell jobs)", async () => {
    // A bare async agent (the coder-async shape): shell jobs register, spawn_agent does not.
    document.body.innerHTML = `
      <m-agent name="solo" maxSteps="10" toolSettleMs="60">
        You are alone.
        <m-reason name="reason"></m-reason>
        <m-jobs name="jobs" wall="30s" network="off"></m-jobs>
      </m-agent>`;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    for (let i = 0; i < 80 && !agent._alive; i++) await delay(25);
    const names = agent._tools.map(t => t.name);
    expect(names).toContain("spawn");                  // dry-run gives a shell path
    expect(names).not.toContain("spawn_agent");        // no sub-agents to run
});
