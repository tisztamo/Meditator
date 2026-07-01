// <m-context> as the agent's working memory (agent-loop.md §10), fully offline:
//   1. COMPACTION — when the transcript overruns `budget`, m-context condenses the oldest
//      messages (one dry `complete` call) and asks m-agent to splice the summary in, and
//      m-agent applies the splice WITHOUT orphaning any tool response (agent-loop.md §12).
//   2. PERSISTENCE + RESTORE — a finished agent's transcript is written to its home, and a
//      fresh agent pointed at that home wakes RESUMING it (skipping the objective seed).
// The dry reasoner (llm.js) drives the loop; the dry `complete` returns a canned summary
// for the "condense/summary" prompt, so no model or network is touched.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { resetBackendProbe } from "../../../src/infrastructure/sandbox.js";

let savedDry, savedBackend, tmpRoot;

beforeAll(() => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
    process.env.MEDITATOR_DRY_RUN = "1";
    process.env.MEDITATOR_SANDBOX_BACKEND = "none";
    resetBackendProbe();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mctx-"));
});

afterAll(() => {
    document.body.innerHTML = "";
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
    resetBackendProbe();
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Compaction ──────────────────────────────────────────────────────────────

test("an over-budget transcript is compacted: the oldest turns fold into a summary head", async () => {
    // A bare agent (no <m-reason> → the real loop never starts) with just <m-context>, so
    // we drive the transcript + step ourselves — exactly the seam m-agent fires between
    // steps. persist="off" keeps the test off the filesystem.
    document.body.innerHTML = `
      <m-agent name="ctx-compact" toolSettleMs="60">
        The agent.
        <m-context name="context" budget="40" keepRecent="2" summaryChars="60" persist="off"></m-context>
      </m-agent>`;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    await delay(120);   // let m-context bind its subs and publish the (empty) restore

    // A transcript well over the 40-char budget, ending — as a real step boundary does —
    // on a `tool` message. keepRecent=2 would cut mid-group, so the plan must advance the
    // cut past the trailing tool to the final assistant, keeping the transcript valid.
    const big = [
        { role: "user", content: "The task is to refactor the parser and make every test pass." },
        { role: "assistant", content: "Let me look.", tool_calls: [{ id: "c1", type: "function", function: { name: "terminal", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "c1", content: "output ".repeat(30) },
        { role: "assistant", content: "More.", tool_calls: [{ id: "c2", type: "function", function: { name: "terminal", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "c2", content: "more output ".repeat(30) },
        { role: "assistant", content: "Nearly done." },
    ];
    agent._messages = big.map(m => ({ ...m }));   // the array m-agent owns
    agent.pub("transcript", [...agent._messages]); // mirror it into m-context
    await delay(30);
    agent.fire("step", { index: 2, assistantText: "", calls: [], observations: [] });

    // m-context summarizes (dry) and publishes `compacted`; m-agent splices the head.
    for (let i = 0; i < 80 && agent._messages.length === big.length; i++) await delay(25);

    expect(agent._messages.length).toBeLessThan(big.length);
    expect(agent._messages[0].role).toBe("user");
    expect(agent._messages[0].content).toContain("[Earlier context, condensed]");
    // The kept tail is verbatim and the split never orphaned a tool response.
    expect(agent._messages.at(-1)).toEqual({ role: "assistant", content: "Nearly done." });
    for (let i = 0; i < agent._messages.length; i++) {
        if (agent._messages[i].role === "tool") expect(i).toBeGreaterThan(0);
    }
});

// ── Persistence + restore ─────────────────────────────────────────────────────

test("a fresh agent persists its transcript to its home", async () => {
    const dir = path.join(tmpRoot, "persist");
    document.body.innerHTML = `
      <m-agent name="ctx-persist" maxSteps="10" toolSettleMs="60" stopWhen="no-tools">
        The agent.
        <m-objective name="objective">Persist me.</m-objective>
        <m-reason name="reason" toolTokens="256"></m-reason>
        <m-terminal name="terminal" network="off"></m-terminal>
        <m-context name="context" persist="${dir}"></m-context>
      </m-agent>`;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    for (let i = 0; i < 160 && !agent._done; i++) await delay(25);
    expect(agent._done).toBe(true);

    const file = path.join(dir, "transcript.json");
    for (let i = 0; i < 40 && !fs.existsSync(file); i++) await delay(25);
    expect(fs.existsSync(file)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(Array.isArray(saved.messages)).toBe(true);
    expect(saved.messages.length).toBeGreaterThan(0);
    expect(saved.messages[0]).toEqual({ role: "user", content: "Persist me." });
});

test("an agent wakes resuming a persisted transcript instead of seeding fresh", async () => {
    const dir = path.join(tmpRoot, "resume");
    fs.mkdirSync(dir, { recursive: true });
    // A mid-task transcript with a distinctive marker and two completed tool rounds, so the
    // dry reasoner (which counts tool rounds) answers immediately on resume.
    const persisted = {
        savedAt: new Date().toISOString(),
        step: 2,
        messages: [
            { role: "user", content: "RESUME-MARKER-42: finish fixing the parser." },
            { role: "assistant", content: "looking", tool_calls: [{ id: "c1", type: "function", function: { name: "terminal", arguments: "{}" } }] },
            { role: "tool", tool_call_id: "c1", content: "ok" },
            { role: "assistant", content: "again", tool_calls: [{ id: "c2", type: "function", function: { name: "terminal", arguments: "{}" } }] },
            { role: "tool", tool_call_id: "c2", content: "ok" },
        ],
    };
    fs.writeFileSync(path.join(dir, "transcript.json"), JSON.stringify(persisted));

    // NO <m-objective> and no membrane: without the restore this agent would have "nothing
    // to do". So a completed loop that carries the marker proves the restore took over.
    document.body.innerHTML = `
      <m-agent name="ctx-resume" maxSteps="10" toolSettleMs="60" stopWhen="no-tools">
        The agent.
        <m-reason name="reason" toolTokens="256"></m-reason>
        <m-terminal name="terminal" network="off"></m-terminal>
        <m-context name="context" persist="${dir}"></m-context>
      </m-agent>`;
    await loadMindComponents(document);
    const agent = document.querySelector("m-agent");
    for (let i = 0; i < 160 && !agent._done; i++) await delay(25);

    expect(agent._done).toBe(true);
    expect(agent._restoredMessages?.length).toBe(5);
    // The distinctive marker survived — it resumed the persisted transcript, did not seed.
    expect(agent._messages.some(m => /RESUME-MARKER-42/.test(m.content || ""))).toBe(true);
    expect(agent._messages[0].content).toContain("RESUME-MARKER-42");
});
