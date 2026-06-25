// The BREAK seam of loop handling (loop-detection-redesign.md §break): the mind announces a
// loop cut as a transient `clear-tail` event carrying the fresh seed, and m-memory — which
// OWNS the tail — reseeds it, drops the overflow (so the loop spam is never fed to the
// compressor), journals the cut as the mind's own felt act (the One Rule), and re-publishes
// `tail` so everyone downstream updates through the channel that already exists. No method is
// called in either direction. m-mind is stubbed here (as in every wiring test); the mind's
// enacting side — composing the seed and seeding the prefill — is exercised by the smoke run.
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, memory, persistDir, tailSeen;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    persistDir = path.join(os.tmpdir(), "med-cleartail-test-" + Date.now());
    fs.mkdirSync(persistDir, { recursive: true });
    fs.writeFileSync(path.join(persistDir, "memory.md"), `# Meditator memory
<!-- meta: {"savedAt":"2026-06-16T12:00:00.000Z","formatVersion":1} -->
<!-- folds: 0 -->

## Story
Long ago I wondered about balanced numbers.

## Recent
Lately I have been circling the 3-digit case.

## Tail
and it is enough, and it is enough, and it is enough, and it is enough.

<!-- end -->
`);
    const persistAttr = persistDir.replace(/\\/g, "/");
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" journal="off" persist="${persistAttr}"></m-memory>
        <m-interrupts name="attention"></m-interrupts>
      </m-mind>
    `;
    await loadMindComponents(document);
    await delay(300);

    mind = document.querySelector("m-mind");
    memory = mind.querySelector('[name="memory"]');

    tailSeen = null;
    await mind.sub("memory/tail", v => { tailSeen = v; });
    await delay(10);
});

afterAll(() => {
    try { fs.rmSync(persistDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

const SEED = "I realize I have been going over the same ground; I set it down, let my mind clear, and come back to it fresh. I turn back to something I set down before, about the 3-digit case: “…”";

test("a clear-tail event reseeds the verbatim tail to the breaker's seed", async () => {
    expect(memory.getTail()).toMatch(/it is enough, and it is enough/);   // the loop, before the cut
    mind.fire("clear-tail", { seed: SEED, kind: "presence" });
    await delay(10);
    expect(memory.getTail()).toBe(SEED);
    expect(memory.getTail()).not.toMatch(/it is enough, and it is enough/);   // the loop tail is gone
});

test("the cut re-publishes the tail topic so the frame mirror updates", async () => {
    expect(tailSeen).toBe(SEED);
});

test("the cut drops the compressor overflow so loop spam is never consolidated", async () => {
    // Pile loop spam past the verbatim tail budget so it overflows toward the next
    // consolidation (default tailLength 1500, so push well over it)...
    memory._onChunk(" and it is enough".repeat(120));
    expect(memory._overflow.length).toBeGreaterThan(0);
    mind.fire("clear-tail", { seed: SEED, kind: "presence" });
    await delay(10);
    expect(memory._overflow).toBe("");          // overflow wiped — the loop is not fed forward
    expect(memory.getTail()).toBe(SEED);
});

test("the cut is journaled as the mind's own felt act — never as a mechanism (One Rule)", async () => {
    const notes = [];
    const orig = memory.note.bind(memory);
    memory.note = (text, opts) => { notes.push(text); return orig(text, opts); };
    mind.fire("clear-tail", { seed: SEED, kind: "void" });
    await delay(10);
    memory.note = orig;
    expect(notes.length).toBe(1);
    expect(notes[0]).toMatch(/I let my mind go quiet/i);
    expect(notes[0].toLowerCase()).not.toMatch(/tail|cleared|loop|buffer|mechanism/);
});

test("a clear-tail with an empty seed is ignored (never blanks the tail)", async () => {
    mind.fire("clear-tail", { seed: SEED, kind: "presence" });
    await delay(10);
    mind.fire("clear-tail", { seed: "   ", kind: "presence" });
    await delay(10);
    expect(memory.getTail()).toBe(SEED);   // unchanged by the empty seed
});
