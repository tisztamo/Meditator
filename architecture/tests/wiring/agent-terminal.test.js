// The terminal as an AGENT tool, run against the REAL sandbox on this host
// (agent-loop.md §4). This is the reuse win the doc emphasizes: an agent's terminal
// is a thin wrapper over the SAME infrastructure/sandbox.js the mind's hand uses, but
// SIMPLER — it awaits the run synchronously and returns the raw screen as an
// `observation` the model reads, with none of the mind's grace-race / deferred-
// sensation machinery. Skips the real-exec assertions gracefully if no backend.
// Modeled on act-terminal.test.js.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { probeBackend, resetBackendProbe } from "../../../src/infrastructure/sandbox.js";

let agent, terminal, workspaceDir, savedDry, savedBackend;
let BACKEND = "none";

beforeAll(async () => {
    // Real execution: dry-run off, host probe (not a forced backend).
    savedDry = process.env.MEDITATOR_DRY_RUN;
    savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
    delete process.env.MEDITATOR_DRY_RUN;
    delete process.env.MEDITATOR_SANDBOX_BACKEND;
    resetBackendProbe();
    BACKEND = await probeBackend();

    workspaceDir = path.join(os.tmpdir(), "med-agent-ws-" + Date.now());

    // A bare agent: the terminal is what we exercise, and we drive it directly (no
    // model), exactly as act-terminal drives m-act._execute directly. No <m-reason>
    // means the loop never starts — we just want the registered tool.
    document.body.innerHTML = `
      <m-agent name="at" toolSettleMs="60">
        The agent.
        <m-terminal name="terminal" wall="5s"></m-terminal>
      </m-agent>
    `;
    document.querySelector('[name="terminal"]').setAttribute("workspace", workspaceDir);

    await loadMindComponents(document);
    await delay(250);   // let m-terminal probe the backend and retry-register

    agent = document.querySelector("m-agent");
    terminal = agent.querySelector('[name="terminal"]');
});

afterAll(() => {
    document.body.innerHTML = "";   // disconnect the agent so it can't linger in the shared jsdom
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
    resetBackendProbe();
    try { fs.rmSync(workspaceDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("the terminal detects agent mode (not a mind's hand)", () => {
    expect(terminal._forAgent).toBe(true);
});

test("with no backend the tool fails safe (does not register) — else it registers", () => {
    if (BACKEND === "none") {
        expect(agent._tools.map(t => t.name)).not.toContain("terminal");
    } else {
        expect(agent._tools.map(t => t.name)).toContain("terminal");
    }
});

test("a real run returns the raw screen as an observation, with the exit code", async () => {
    if (BACKEND === "none") return;   // no sandbox on this host — skip real-exec
    const out = await terminal._terminal({ language: "bash", script: "echo balanced-42", purpose: "sanity" });
    // The AGENT contract (agent-loop.md §4): a raw `observation` string, not a mind's
    // first-person `experience`.
    expect(typeof out.observation).toBe("string");
    expect(out.experience).toBeUndefined();
    expect(out.observation).toContain("balanced-42");
    expect(out.observation).toMatch(/exit 0/);
    expect(out.isError).toBe(false);
    expect(out.data.exitCode).toBe(0);
});

test("a nonzero exit is surfaced as isError, with the output still readable", async () => {
    if (BACKEND === "none") return;
    const out = await terminal._terminal({ language: "bash", script: "echo oops >&2; exit 3", purpose: "failure" });
    expect(out.observation).toContain("oops");     // stderr folds into the screen
    expect(out.observation).toMatch(/exit 3/);
    expect(out.isError).toBe(true);
    expect(out.data.exitCode).toBe(3);
});

test("bad input is a clean error observation, never a throw", async () => {
    const empty = await terminal._terminal({ language: "bash", script: "   " });
    expect(empty.isError).toBe(true);
    expect(empty.observation).toMatch(/no script/i);
    const badLang = await terminal._terminal({ language: "ruby", script: "puts 1" });
    expect(badLang.isError).toBe(true);
    expect(badLang.observation).toMatch(/unsupported language/i);
});
