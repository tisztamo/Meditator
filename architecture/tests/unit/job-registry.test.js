// The JOB REGISTRY (jobRegistry.js) — the bookkeeping behind an agent's async agency
// (agent-loop.md §16). Tested with an INJECTED fake runner (a controllable handle), so the
// whole lifecycle — spawn returns immediately, live output accrues, check reads only the
// NEW output, kill wins over the eventual outcome, onComplete notifies once — is proven
// deterministically with no sandbox and no process.
import { test, expect } from "bun:test";
import { JobRegistry, Job } from "../../../src/infrastructure/jobRegistry.js";

// A hand-controllable sandbox handle: resolve/reject its `done` when the test chooses, and
// push live stdout chunks through the onData hook the registry wired in.
function makeFakeRunner() {
    const controls = [];
    const runner = (opts) => {
        let resolve, reject;
        const done = new Promise((res, rej) => { resolve = res; reject = rej; });
        const control = {
            opts,
            killed: false,
            emit: chunk => opts.onData?.(Buffer.from(chunk)),
            finish: (outcome = {}) => resolve({ screen: "", exitCode: 0, timedOut: false, truncated: false, durationMs: 1, ...outcome }),
            fail: err => reject(err),
        };
        controls.push(control);
        return { done, kill: () => { control.killed = true; } };
    };
    return { runner, controls };
}

test("spawn returns immediately with a running job and a fresh id", () => {
    const { runner } = makeFakeRunner();
    const reg = new JobRegistry({ run: runner });
    const j1 = reg.spawn({ language: "bash" }, { command: "tests" });
    const j2 = reg.spawn({ language: "bash" });
    expect(j1).toBeInstanceOf(Job);
    expect(j1.id).toBe("job-1");
    expect(j2.id).toBe("job-2");
    expect(j1.running).toBe(true);
    expect(j1.command).toBe("tests");
    expect(reg.list().map(j => j.id)).toEqual(["job-1", "job-2"]);
});

test("check reads only the output that is NEW since last time (cursor advances)", () => {
    const { runner, controls } = makeFakeRunner();
    const reg = new JobRegistry({ run: runner });
    const job = reg.spawn({ language: "bash" });

    controls[0].emit("line 1\n");
    expect(job.readNew()).toEqual({ text: "line 1\n", dropped: 0 });
    // Nothing new yet → empty, no double-read.
    expect(job.readNew()).toEqual({ text: "", dropped: 0 });

    controls[0].emit("line 2\n");
    controls[0].emit("line 3\n");
    expect(job.readNew()).toEqual({ text: "line 2\nline 3\n", dropped: 0 });
});

test("the live tail is capped, and readNew reports the dropped gap honestly", () => {
    const { runner, controls } = makeFakeRunner();
    const reg = new JobRegistry({ run: runner, maxBuffer: 10 });
    const job = reg.spawn({ language: "bash" });

    controls[0].emit("0123456789ABCDE");   // 15 chars into a 10-char tail → 5 scrolled past
    const { text, dropped } = job.readNew();
    expect(text).toBe("56789ABCDE");        // only the last 10 survive
    expect(dropped).toBe(5);                // and the model is told 5 chars were lost
});

test("a finished job settles to done with its outcome, and stops being running", async () => {
    const { runner, controls } = makeFakeRunner();
    const reg = new JobRegistry({ run: runner });
    const job = reg.spawn({ language: "bash" });
    controls[0].emit("ok\n");
    controls[0].finish({ exitCode: 0 });
    await job.done;
    expect(job.running).toBe(false);
    expect(job.state).toBe("done");
    expect(job.outcome.exitCode).toBe(0);
});

test("a timed-out run settles to state 'timeout'", async () => {
    const { runner, controls } = makeFakeRunner();
    const reg = new JobRegistry({ run: runner });
    const job = reg.spawn({ language: "bash" });
    controls[0].finish({ exitCode: 124, timedOut: true });
    await job.done;
    expect(job.state).toBe("timeout");
});

test("kill marks the job killed, and its eventual outcome does not overwrite that", async () => {
    const { runner, controls } = makeFakeRunner();
    const reg = new JobRegistry({ run: runner });
    const job = reg.spawn({ language: "bash" });

    expect(reg.kill("job-1")).toBe(true);
    expect(job.state).toBe("killed");
    expect(controls[0].killed).toBe(true);

    // The process still eventually resolves (killed → exit) — but the state stays 'killed'.
    controls[0].finish({ exitCode: 137, timedOut: true });
    await job.done;
    expect(job.state).toBe("killed");

    // Killing a job that already stopped is a no-op.
    expect(reg.kill("job-1")).toBe(false);
});

test("onComplete fires exactly once, when a job settles", async () => {
    const { runner, controls } = makeFakeRunner();
    const completed = [];
    const reg = new JobRegistry({ run: runner, onComplete: j => completed.push(j.id) });
    const job = reg.spawn({ language: "bash" });
    expect(completed).toEqual([]);            // not while running
    controls[0].finish({ exitCode: 0 });
    await job.done;
    expect(completed).toEqual(["job-1"]);     // once on completion
});

test("a spawn failure (a hand-slip) settles the job to 'error' and still notifies", async () => {
    const { runner, controls } = makeFakeRunner();
    const completed = [];
    const reg = new JobRegistry({ run: runner, onComplete: j => completed.push(j.state) });
    const job = reg.spawn({ language: "bash" });
    controls[0].fail(new Error("the binary is missing"));
    await job.done.catch(() => {});
    expect(job.state).toBe("error");
    expect(completed).toEqual(["error"]);
});

test("a runner that throws synchronously is caught, and the job records the failure", () => {
    const reg = new JobRegistry({ run: () => { throw new Error("cannot spawn"); } });
    const job = reg.spawn({ language: "bash" });
    expect(job.state).toBe("error");
    expect(job.error.message).toBe("cannot spawn");
});

test("killAll stops every running job (called on agent sleep)", () => {
    const { runner, controls } = makeFakeRunner();
    const reg = new JobRegistry({ run: runner });
    reg.spawn({ language: "bash" });
    reg.spawn({ language: "bash" });
    reg.killAll();
    expect(controls.every(c => c.killed)).toBe(true);
    expect(reg.list().every(j => j.state === "killed")).toBe(true);
});

test("summary reads honestly for each lifecycle state", async () => {
    const { runner, controls } = makeFakeRunner();
    const reg = new JobRegistry({ run: runner });
    const job = reg.spawn({ language: "bash" }, { command: "npm test" });
    expect(job.summary()).toMatch(/job-1: running/);
    expect(job.summary()).toMatch(/npm test/);
    controls[0].finish({ exitCode: 3 });
    await job.done;
    expect(job.summary()).toMatch(/finished \(exit 3/);
});
