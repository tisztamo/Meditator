// m-terminal end to end (terminal.md): the most powerful hand, run against the REAL
// sandbox on this host. It proves the loop the doc cares about — a reach becomes a run,
// the run answers as a perceived "screen" with NO mechanism named, the deed is journaled
// backstage (⌁), the grace race splits fast vs deferred, a timeout is calm, and — the
// single most important invariant (§4.3/§7.4) — NO host secret ever rides back into the
// mind as a sensation. Skips the real-exec assertions gracefully if no backend is present.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { probeBackend, resetBackendProbe } from "../../../src/infrastructure/sandbox.js";

let mind, act, terminal, memory, journalDir, workspaceDir, savedDry, savedBackend;
let BACKEND = "none";
const consequences = [];

// Mechanism words that must never reach the mind's prose (terminal.md §7.2).
const MECHANISM = /\bstdout\b|\bstderr\b|exit code|\bsubprocess\b|\bsandbox\b|tool_call|\bschema\b|\bargument\b|"language"/i;

// Wait until a new Sense-terminal consequence shows up (the deferred-result path), or give up.
async function waitForConsequence(from, ms = 5000) {
    for (let i = 0; i < ms / 50 && consequences.length === from; i++) await delay(50);
    return consequences[consequences.length - 1];
}

beforeAll(async () => {
    // Real execution: dry-run off, host probe (not a forced backend).
    savedDry = process.env.MEDITATOR_DRY_RUN;
    savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
    delete process.env.MEDITATOR_DRY_RUN;
    delete process.env.MEDITATOR_SANDBOX_BACKEND;
    resetBackendProbe();
    BACKEND = await probeBackend();

    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    journalDir = path.join(os.tmpdir(), "med-term-journal-" + Date.now());
    workspaceDir = path.join(os.tmpdir(), "med-term-ws-" + Date.now());

    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-act name="hands" every="1" threshold="0.6" cooldown="0s" intentCooldown="1s">
          <m-terminal name="terminal" wall="2s" grace="2s"></m-terminal>
        </m-act>
      </m-mind>
    `;
    document.querySelector('[name="memory"]').setAttribute("journal", journalDir);
    document.querySelector('[name="terminal"]').setAttribute("workspace", workspaceDir);

    await loadMindComponents(document);
    await delay(200);   // let m-terminal probe the backend and retry-register

    mind = document.querySelector("m-mind");
    act = mind.querySelector('[name="hands"]');
    terminal = mind.querySelector('[name="terminal"]');
    memory = mind.querySelector('[name="memory"]');

    mind.addEventListener("interrupt-request", e => {
        const r = e && e.detail;
        if (r && String(r.type || "").startsWith("Sense-terminal")) consequences.push(r);
    });
});

afterAll(() => {
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
    resetBackendProbe();
    for (const d of [journalDir, workspaceDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
});

test("a backend was probed on this host (informational)", () => {
    expect(["bwrap", "unshare", "none"]).toContain(BACKEND);
    if (BACKEND === "none") console.warn("No sandbox backend on this host — real-exec terminal tests are skipped.");
});

test("the terminal hand registers as WORLD-CHANGING when a backend exists (else stays inert)", () => {
    const cap = act._capabilities.find(c => c.name === "terminal");
    if (BACKEND === "none") {
        expect(cap).toBeUndefined();                    // fail-safe: no phantom hand
        return;
    }
    expect(cap).toBeDefined();
    expect(cap.readonly).toBe(false);                   // WORLD-CHANGING (§1)
    // Its felt line joins the body schema, world-facing, no mechanism (§5).
    expect(act.embodiment).toMatch(/read what comes back on the screen/i);
    expect(act.embodiment).not.toMatch(MECHANISM);
});

test("FAST path: a quick run comes back instantly as the screen, self-caused, no mechanism", async () => {
    if (BACKEND === "none") return;
    const out = await terminal._terminal({ language: "python", script: "print('two plus two is', 2 + 2)" });
    expect(out.experience).toMatch(/screen/i);
    expect(out.experience).toMatch(/two plus two is 4/);
    expect(out.experience).toMatch(/\bI\b/);            // efference copy
    expect(out.experience).not.toMatch(MECHANISM);
    expect(out.urgent).toBe(true);                      // the result re-enters urgent (§2)
    expect(out.salience).toBe(0.7);

    // The verbatim transcript is on disk for auditing (§4.5).
    const runDir = fs.readdirSync(workspaceDir).find(d => d.startsWith("run-"));
    expect(runDir).toBeDefined();
    const transcript = fs.readFileSync(path.join(workspaceDir, runDir, ".runs", "run-1.out.txt"), "utf8");
    expect(transcript).toMatch(/two plus two is 4/);
    expect(transcript).toMatch(/--- script ---/);
});

test("ENV SCRUB (the single most important invariant, §4.3/§7.4): no host secret reaches the mind", async () => {
    if (BACKEND === "none") return;
    process.env.MED_TERMINAL_SECRET_KEY = "sk-supersecret-must-not-leak-7281";
    try {
        const out = await terminal._terminal({
            language: "python",
            script: "import os; print('ENV:', sorted(os.environ.keys())); print('VALS:', list(os.environ.values()))",
        });
        // Neither the secret's NAME nor its VALUE may appear as a sensation…
        expect(out.experience).not.toMatch(/MED_TERMINAL_SECRET_KEY/);
        expect(out.experience).not.toMatch(/sk-supersecret/);
        // …and the child saw only the allow-listed env (PATH/HOME/LANG/TMPDIR).
        expect(out.experience).not.toMatch(/OPENROUTER|OPENAI|API_KEY|TOKEN/i);
        expect(out.experience).toMatch(/PATH/);
    } finally {
        delete process.env.MED_TERMINAL_SECRET_KEY;
    }
});

test("a traceback is CONTENT the mind reads, not a hand-slip (debugging is the point, §3)", async () => {
    if (BACKEND === "none") return;
    const out = await terminal._terminal({ language: "python", script: "print(rev)" });
    expect(out.experience).toMatch(/NameError/);
    expect(out.experience).not.toMatch(MECHANISM);
});

test("a runaway run is killed and felt as calm, never as self-blame (§3 timeout)", async () => {
    if (BACKEND === "none") return;
    // A runaway is slow by nature (it dies at wall+killGrace), so its result arrives
    // DEFERRED — reassure now, then the calm "I let it go" lands later.
    terminal.setAttribute("grace", "100ms");
    terminal.setAttribute("wall", "1s");
    terminal.setAttribute("killGrace", "1s");
    const before = consequences.length;
    const started = await terminal._terminal({ language: "python", script: "while True:\n    pass" });
    expect(started.experience).toMatch(/cursor/i);     // ambient reassurance now
    expect(started.urgent).toBe(false);

    const deferred = await waitForConsequence(before, 6000);
    expect(deferred.reason).toMatch(/never settles, so I let it go/i);
    expect(deferred.reason).not.toMatch(/fail|error|wrong|my action|could not/i);
    expect(deferred.reason).not.toMatch(MECHANISM);
    terminal.setAttribute("grace", "2s");
    terminal.setAttribute("wall", "2s");
    terminal.removeAttribute("killGrace");
});

test("SLOW path: a long run reassures now (ambient) and DELIVERS the result later (deferred, urgent)", async () => {
    if (BACKEND === "none") return;
    terminal.setAttribute("grace", "100ms");
    const before = consequences.length;
    const started = await terminal._terminal({ language: "bash", script: "sleep 0.8; echo 'the late answer is 42'" });

    // The "started" sensation is ambient and non-urgent — the blinking cursor lives here (§2/§6d).
    expect(started.experience).toMatch(/cursor/i);
    expect(started.salience).toBe(0.45);
    expect(started.urgent).toBe(false);

    // …then, bursts later, the result arrives on its own through the afferent bus.
    const deferred = await waitForConsequence(before, 4000);
    expect(deferred).toBeDefined();
    expect(deferred.type).toBe("Sense-terminal");
    expect(deferred.reason).toMatch(/the late answer is 42/);
    expect(deferred.urgent).toBe(true);                 // urgent, as m-recall is (§2)
    expect(deferred.reason).not.toMatch(MECHANISM);
    terminal.setAttribute("grace", "2s");
});

test("single-slot desk: a second reach while busy is gently declined, not a second run (§3.1)", async () => {
    if (BACKEND === "none") return;
    terminal.setAttribute("grace", "100ms");
    const before = consequences.length;
    const slow = await terminal._terminal({ language: "bash", script: "sleep 0.7; echo done" });
    expect(slow.experience).toMatch(/cursor/i);         // first run is in flight
    const busy = await terminal._terminal({ language: "python", script: "print('should not run')" });
    expect(busy.experience).toMatch(/desk is still busy/i);
    expect(busy.salience).toBeLessThan(0.3);
    await waitForConsequence(before, 4000);             // let the first run finish & clear the slot
    terminal.setAttribute("grace", "2s");
});

test("the DEED is journaled backstage (⌁) and never touches the tail; the CONSEQUENCE is perceived (⟂)", async () => {
    if (BACKEND === "none") return;
    // Drive the real m-act execute path with a hand-crafted realizer call (no model
    // needed): m-act runs the hand, publishes `acted` (deed ⌁) and dispatches the
    // consequence (⟂) — exactly the split the design exists for (§2).
    const before = consequences.length;
    const call = { function: { name: "terminal", arguments: JSON.stringify({ language: "python", script: "print('balanced so far: 0, 22, 33')" }) } };
    await act._execute(call, { gist: "I want to actually check the small balanced n" });
    expect(consequences.length).toBeGreaterThan(before);

    await delay(80);   // let the journal queue flush
    const day = new Date().toISOString().slice(0, 10);
    const journal = fs.readFileSync(path.join(journalDir, `${day}.md`), "utf8");
    expect(journal).toMatch(/⌁ The hands reached out .* via terminal/);   // deed, backstage
    expect(memory.getTail()).not.toMatch(/reached out/);                  // never seen by the mind
});

test("dry-run returns a deterministic stub — never real execution (§4.6)", async () => {
    process.env.MEDITATOR_DRY_RUN = "1";
    try {
        const out = await terminal._terminal({ language: "python", script: "print('whatever')" });
        expect(out.data?.dry).toBe(true);
        expect(out.experience).toMatch(/screen answers/i);
        expect(out.experience).not.toMatch(MECHANISM);
    } finally {
        if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    }
});
