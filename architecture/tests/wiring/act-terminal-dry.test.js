// The terminal hand through the WHOLE m-act loop, fully offline (terminal.md §4.6):
// a reach → the dry realizer picks `terminal` → the hand returns its deterministic
// stub (NO real process is ever spawned) → the DEED is journaled backstage (⌁) and the
// CONSEQUENCE re-enters as a plain "screen" sensation with no mechanism. This exercises
// the dry seedling/lemma path and the llm.js dry tool-call branch. Modeled on act-look.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { resetBackendProbe } from "../../../src/infrastructure/sandbox.js";

let mind, stream, memory, act, terminal, journalDir, savedDry, savedBackend;
const consequences = [];

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    savedBackend = process.env.MEDITATOR_SANDBOX_BACKEND;
    process.env.MEDITATOR_DRY_RUN = "1";                 // decide + realize + execute, all offline
    process.env.MEDITATOR_SANDBOX_BACKEND = "none";      // belt-and-suspenders: never touch a real sandbox
    resetBackendProbe();

    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    journalDir = path.join(os.tmpdir(), "med-termdry-" + Date.now());

    // terminal-only menu so the dry realizer (which prefers `look` when present) reaches
    // for the terminal hand.
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-act name="hands" every="1" threshold="0.6" cooldown="0s" intentCooldown="1s">
          <m-terminal name="terminal"></m-terminal>
        </m-act>
      </m-mind>
    `;
    document.querySelector('[name="memory"]').setAttribute("journal", journalDir);

    await loadMindComponents(document);
    await delay(160);

    mind = document.querySelector("m-mind");
    stream = mind.querySelector("m-stream");
    memory = mind.querySelector('[name="memory"]');
    act = mind.querySelector('[name="hands"]');
    terminal = mind.querySelector('[name="terminal"]');

    mind.addEventListener("interrupt-request", e => {
        const r = e && e.detail;
        if (r && String(r.type || "").startsWith("Sense-terminal")) consequences.push(r);
    });
});

afterAll(() => {
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    if (savedBackend === undefined) delete process.env.MEDITATOR_SANDBOX_BACKEND; else process.env.MEDITATOR_SANDBOX_BACKEND = savedBackend;
    resetBackendProbe();
    try { fs.rmSync(journalDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("the terminal hand registers even with no backend, BECAUSE we are dry (§4.6)", () => {
    expect(act._capabilities.map(c => c.name)).toContain("terminal");
    expect(act._capabilities.find(c => c.name === "terminal").readonly).toBe(false);
});

test("a computational reach becomes a deed and a perceived 'screen' — never a tool result", async () => {
    stream.pub("chunk",
        "I keep circling whether there are infinitely many balanced n, and I realize I have been "
        + "doing this entirely by hand — squaring numbers in my head, checking a case, losing track. "
        + "I would settle so much faster if I could just actually try it: count the balanced n below "
        + "some bound and look at what the list actually is, instead of guessing at the pattern. ");
    await delay(10);

    for (let i = 0; i < 10 && consequences.length === 0; i++) {
        await act.onBoundary({ reason: "completed" });
        await delay(10);
    }

    expect(consequences.length).toBeGreaterThan(0);
    const c = consequences[0];
    expect(c.source).toBe("External");
    expect(c.type).toBe("Sense-terminal");
    expect(c.reason).toMatch(/screen/i);
    // One-Rule invariant: an experience of a screen, never a mechanism.
    expect(c.reason.toLowerCase()).not.toMatch(/\bstdout\b|exit code|\bsubprocess\b|tool_call|\bschema\b|\bargument\b/);
    expect(c.reason.toLowerCase()).toMatch(/\bi\b/);     // self-caused efference copy
});

test("the deed is journaled backstage (⌁) and never touches the verbatim tail", async () => {
    await delay(60);
    const day = new Date().toISOString().slice(0, 10);
    const journal = fs.readFileSync(path.join(journalDir, `${day}.md`), "utf8");
    expect(journal).toMatch(/⌁ The hands reached out .* via terminal/);
    expect(memory.getTail()).not.toMatch(/reached out/);
});
