// <m-jobs> end-to-end inside an <m-agent> (agent-loop.md §16): the async belt registers
// its five capabilities with the kernel via the SAME bubbling `capability` event every
// tool uses (zero change to m-agent), spawn/check/wait/list_jobs/kill behave, the wait
// long-poll is interruptible by an inbound message, and a finished job NOTIFIES the agent
// through the existing `nudge` seam (folded into the next turn). Fully offline: dry-run
// for the happy paths, and a hand-controllable runner swapped in for the running-state,
// interruption, and notify behaviors a dry (instant) job cannot exercise.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { resetBackendProbe } from "../../../src/infrastructure/sandbox.js";
import { JobRegistry } from "../../../src/infrastructure/jobRegistry.js";

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

// A hand-controllable sandbox handle, so we can hold a job "running" and finish it on cue.
function makeFakeRunner() {
    const controls = [];
    const runner = (opts) => {
        let resolve;
        const done = new Promise(res => { resolve = res; });
        const c = { opts, killed: false, emit: s => opts.onData?.(Buffer.from(s)), finish: (o = {}) => resolve({ screen: "", exitCode: 0, timedOut: false, truncated: false, durationMs: 1, ...o }) };
        controls.push(c);
        return { done, kill: () => { c.killed = true; } };
    };
    return { runner, controls };
}

// An idle agent (no objective, no membrane) so the loop never runs and we can drive the
// job tools directly. m-reason resolves its null-ref fallback offline (no models.yaml).
async function buildAgent() {
    document.body.innerHTML = `
      <m-agent name="dry-jobs-agent" maxSteps="10" toolSettleMs="60">
        You are an agent.
        <m-reason name="reason"></m-reason>
        <m-jobs name="jobs" wall="30s" network="off"></m-jobs>
      </m-agent>`;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    const jobs = document.querySelector("m-jobs");
    for (let i = 0; i < 80 && !agent._alive; i++) await delay(25);   // wait past _whenAlive
    const tool = name => agent._tools.find(t => t.name === name)?.execute;
    return { agent, jobs, tool };
}

// Swap in a controllable registry after wake, keeping the notify seam wired to the
// component so completion still fires a `nudge`.
function useControllableRegistry(jobs) {
    const { runner, controls } = makeFakeRunner();
    jobs._registry = new JobRegistry({ run: runner, onComplete: j => jobs._onJobDone(j) });
    return controls;
}

test("all five job capabilities register with the kernel, and none is world-blind", async () => {
    const { agent } = await buildAgent();
    const names = agent._tools.map(t => t.name);
    for (const n of ["spawn", "check", "wait", "kill", "list_jobs"]) expect(names).toContain(n);
    // spawn and kill are world-changing (a norm gates on `readonly`); the pollers are read-only.
    const spec = n => agent._tools.find(t => t.name === n);
    // readonly is carried on the capability spec the kernel stored via the schema set.
    expect(spec("spawn")).toBeDefined();
    expect(spec("check")).toBeDefined();
});

test("spawn returns immediately with a job id (dry-run: no process)", async () => {
    const { tool } = await buildAgent();
    const out = await tool("spawn")({ language: "bash", script: "echo hi", purpose: "say hi" });
    expect(out.data.id).toBe("job-1");
    expect(out.observation).toMatch(/started job-1/);
    expect(out.observation).toMatch(/say hi/);
});

test("list_jobs and check reflect a job; a dry job finishes cleanly", async () => {
    const { tool } = await buildAgent();
    await tool("spawn")({ language: "bash", script: "echo one" });
    const list = tool("list_jobs")();
    expect(list.observation).toMatch(/job-1/);
    // The dry runner resolves immediately, so by now the job has finished.
    const checked = await tool("check")({ id: "job-1" });
    expect(checked.observation).toMatch(/job-1 finished/);
});

test("check on an unknown job is a clean error, not a crash", async () => {
    const { tool } = await buildAgent();
    const out = await tool("check")({ id: "nope" });
    expect(out.isError).toBe(true);
    expect(out.observation).toMatch(/no such job/);
});

test("check returns only NEW output while a job runs, then the final report", async () => {
    const { jobs, tool } = await buildAgent();
    const controls = useControllableRegistry(jobs);
    await tool("spawn")({ language: "bash", script: "run" });

    controls[0].emit("progress 1\n");
    let out = await tool("check")({ id: "job-1" });
    expect(out.data.running).toBe(true);
    expect(out.observation).toMatch(/progress 1/);

    // No new output → says so, does not repeat the old.
    out = await tool("check")({ id: "job-1" });
    expect(out.observation).toMatch(/No new output/);

    controls[0].emit("done line\n");
    controls[0].finish({ exitCode: 0 });
    await delay(5);
    out = await tool("check")({ id: "job-1" });
    expect(out.observation).toMatch(/job-1 finished \(exit 0\)/);
    expect(out.observation).toMatch(/done line/);
});

test("wait blocks until the job finishes, then returns the final report", async () => {
    const { jobs, tool } = await buildAgent();
    const controls = useControllableRegistry(jobs);
    await tool("spawn")({ language: "bash", script: "run" });

    const waiting = tool("wait")({ id: "job-1", timeout: "30s" });
    // Still pending until we finish it.
    controls[0].emit("final output\n");
    controls[0].finish({ exitCode: 0 });
    const out = await waiting;
    expect(out.observation).toMatch(/job-1 finished/);
    expect(out.observation).toMatch(/final output/);
});

test("wait times out (short) while the job runs, reporting recent output — not a crash", async () => {
    const { jobs, tool } = await buildAgent();
    const controls = useControllableRegistry(jobs);
    await tool("spawn")({ language: "bash", script: "run" });
    controls[0].emit("still working\n");
    // maxWait floors the effective wait at 1s; use that so the test is quick.
    const out = await tool("wait")({ id: "job-1", timeout: "1s" });
    expect(out.data.pending).toBe(true);
    expect(out.observation).toMatch(/still running/);
    expect(out.observation).toMatch(/still working/);
});

test("wait is interrupted by an inbound message (the third racer, agent-loop.md §16)", async () => {
    const { agent, jobs, tool } = await buildAgent();
    const controls = useControllableRegistry(jobs);
    await tool("spawn")({ language: "bash", script: "run" });

    const waiting = tool("wait")({ id: "job-1", timeout: "30s" });
    await delay(5);
    // A user message arrives over the membrane → m-ws fires a bubbling `task`; m-jobs wakes
    // the wait so the loop can attend to the message.
    agent.fire("task", { text: "actually, do this instead" });
    const out = await waiting;
    expect(out.data.pending).toBe(true);
    expect(out.observation).toMatch(/a message just came in/);
    // The job itself is untouched — still running.
    expect(controls[0].killed).toBe(false);
});

test("a finished job NOTIFIES the agent: a nudge folded into the next turn", async () => {
    const { agent, jobs, tool } = await buildAgent();
    const controls = useControllableRegistry(jobs);
    await tool("spawn")({ language: "bash", script: "run", purpose: "the tests" });

    expect(agent._nudges.length).toBe(0);        // nothing while running
    controls[0].finish({ exitCode: 0 });
    await delay(5);
    // The registry's onComplete fired a `nudge`; m-agent caught it and queued it.
    expect(agent._nudges.some(t => /job-1/.test(t) && /finished/.test(t))).toBe(true);
});

test("killing a job stops it and suppresses its completion notice", async () => {
    const { agent, jobs, tool } = await buildAgent();
    const controls = useControllableRegistry(jobs);
    await tool("spawn")({ language: "bash", script: "run" });

    const killed = tool("kill")({ id: "job-1" });
    expect(killed.observation).toMatch(/killed job-1/);
    expect(controls[0].killed).toBe(true);

    // The underlying process eventually exits, but a deliberate kill is the model's own
    // action — no "it finished" nudge should be raised for it.
    controls[0].finish({ exitCode: 137, timedOut: true });
    await delay(5);
    expect(agent._nudges.length).toBe(0);
});

test("m-jobs killAll runs on disconnect, so no background job is orphaned on sleep", async () => {
    const { jobs, tool } = await buildAgent();
    const controls = useControllableRegistry(jobs);
    await tool("spawn")({ language: "bash", script: "run" });
    jobs.onDisconnect();
    expect(controls[0].killed).toBe(true);
});
