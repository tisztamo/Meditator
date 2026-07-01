// WORKSPACE COHERENCE (agent-loop.md §8, §14 open-Q #1), against the REAL sandbox. The
// first live run of coder.archml exposed the flaw: the file tools wrote to the workspace
// root but the terminal ran in a per-wake run-<stamp>/ subdir (and only that subdir was
// writable), so `write_file foo.py` → `terminal python3 foo.py` failed with file-not-found,
// then read-only-FS, until the model reverse-engineered the layout. The fix: an agent's
// terminal runs IN the shared workspace root. This test pins that write → run → read
// composes with the plain relative paths a model assumes. Skips real-exec if no backend.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { probeBackend, resetBackendProbe } from "../../../src/infrastructure/sandbox.js";

let agent, ws, savedDry, savedBackend;
let BACKEND = "none";
const tool = name => agent._tools.find(t => t.name === name);

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
    delete process.env.MEDITATOR_DRY_RUN;            // real execution
    delete process.env.MEDITATOR_SANDBOX_BACKEND;    // host probe (not forced)
    resetBackendProbe();
    BACKEND = await probeBackend();

    ws = path.join(os.tmpdir(), "med-agent-coherence-" + Date.now());
    fs.mkdirSync(ws, { recursive: true });

    // A coder-shaped agent: the file tools and the terminal all rooted at the SAME
    // workspace (as coder.archml has them by default via mindHome). No <m-reason> — we
    // drive the tools directly, as agent-terminal / agent-files do. The roots are inlined
    // (not setAttribute'd after) because once these tags are registered by an earlier
    // test file, innerHTML upgrades them synchronously and a file tool reads its `root`
    // in onConnect — a later setAttribute would be too late.
    document.body.innerHTML = `
      <m-agent name="coherence-test" toolSettleMs="60">
        The agent.
        <m-terminal   name="terminal" wall="10s" network="off" workspace="${ws}"></m-terminal>
        <m-read-file  name="read_file" root="${ws}"></m-read-file>
        <m-write-file name="write_file" root="${ws}"></m-write-file>
      </m-agent>
    `;

    await loadMindComponents(document);
    await delay(250);   // terminal probes the backend + registers
    agent = document.querySelector("m-agent");
});

afterAll(() => {
    document.body.innerHTML = "";
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
    resetBackendProbe();
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("the agent terminal runs IN the shared workspace root, not a run-<stamp> subdir", async () => {
    if (BACKEND === "none") return;
    const out = await tool("terminal").execute({ language: "bash", script: "pwd", purpose: "where am I" });
    // The realpath may differ (tmp symlinks), so compare the basename, not the full path.
    expect(out.observation.trim()).toMatch(new RegExp(path.basename(ws) + "\\s*$"));
    // And no per-wake run-<stamp>/ subdir was created under the workspace.
    expect(fs.readdirSync(ws).some(e => e.startsWith("run-"))).toBe(false);
});

test("write_file → terminal run → read_file composes with plain relative paths", async () => {
    if (BACKEND === "none") return;

    // 1. The agent writes an input file and a script — with write_file, to the workspace.
    await tool("write_file").execute({ path: "n.txt", content: "5\n" });
    await tool("write_file").execute({
        path: "fact.py",
        content: "import math\n"
            + "n = int(open('n.txt').read().strip())\n"
            + "open('out.txt', 'w').write(f'{n}! = {math.factorial(n)}\\n')\n",
    });

    // 2. It runs the script via the shell — relative paths, as a model naturally writes.
    //    Before the fix this failed (wrong cwd, then read-only FS); now it just works.
    const run = await tool("terminal").execute({ language: "bash", script: "python3 fact.py", purpose: "run it" });
    expect(run.isError).toBe(false);
    expect(run.observation).toMatch(/exit 0/);

    // 3. The output landed in the SHARED root, and read_file reads it straight back.
    expect(fs.existsSync(path.join(ws, "out.txt"))).toBe(true);
    const read = await tool("read_file").execute({ path: "out.txt" });
    expect(read.isError).toBeFalsy();
    expect(read.observation).toContain("5! = 120");
});
