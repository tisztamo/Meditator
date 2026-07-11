// Bridge provenance (philosophical-review-2026-07-02 finding 7, ui-journal-honesty C1).
// A redirect burst opens with a BRIDGE — a transition sentence written by the UTILITY model,
// not the mind's own voice. It must ride the verbatim tail (the model continues from it) but
// the human-facing journal must not pass it off as spontaneous inner monologue. m-mind fires a
// transient `@bridge` event; m-memory marks it pending and _flushJournal peels it off the front
// of the next flushed block as a `↪` provenance line while leaving the tail untouched. This
// exercises the memory-side seam directly (no utility-model call); the m-mind fire is glue
// covered by the smoke/live runs.
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, memory, journalDir;

const today = () => new Date().toISOString().slice(0, 10);
const journalText = async () => {
    await memory._journalQueue;
    const file = path.join(journalDir, `${today()}.md`);
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
};

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    journalDir = path.join(os.tmpdir(), "med-bridge-journal-" + Date.now());
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="${journalDir.replace(/\\/g, "/")}"></m-memory>
        <m-interrupts name="attention"></m-interrupts>
      </m-mind>
    `;
    await loadMindComponents(document);
    await delay(200);
    mind = document.querySelector("m-mind");
    memory = mind.querySelector('[name="memory"]');
});

afterAll(() => {
    try { fs.rmSync(journalDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

const BRIDGE = "Hold on — something just reached me and I turn toward it.";

const count = (hay, needle) => hay.split(needle).length - 1;

test("the bridge is journaled as a ↪ provenance line, never as inner monologue", async () => {
    const before = await journalText();
    // Production order: m-mind fires @bridge, THEN the stream emits the opening `prefix`
    // chunk (bridge + opener), then the model's continuation.
    mind.fire("bridge", { text: BRIDGE });
    await delay(10);
    memory._onChunk(`${BRIDGE} And so, turning it over, I keep thinking.`);
    memory._flushJournal();
    const added = (await journalText()).slice(before.length);
    // The bridge appears exactly once, on a ↪ line — not folded into the prose stream.
    expect(added).toMatch(/\n↪ Hold on — something just reached me and I turn toward it\.\n/);
    expect(count(added, BRIDGE)).toBe(1);                        // exactly one occurrence (the ↪ line)
    expect(added).toMatch(/And so, turning it over, I keep thinking\./);   // the mind's own words remain as prose
});

test("the bridge still rides the verbatim tail (the model continues from it)", () => {
    // The tail is model-facing and must contain the bridge as continuous text.
    expect(memory.getTail()).toContain(BRIDGE);
});

test("a pending bridge is consumed once — a later plain flush is untouched", async () => {
    const before = await journalText();
    mind.fire("bridge", { text: BRIDGE });
    await delay(10);
    memory._onChunk(`${BRIDGE} first continuation.`);
    memory._flushJournal();                       // consumes the pending bridge
    memory._onChunk(`${BRIDGE} a later mention, genuinely the mind's own words.`);
    memory._flushJournal();                       // no pending bridge now
    const added = (await journalText()).slice(before.length);
    // Two occurrences of the text this test added: the first flush's ↪ line, and the
    // second flush's ordinary prose (not peeled).
    expect(count(added, BRIDGE)).toBe(2);
    // …but only ONE of them is a ↪ provenance line.
    expect(count(added, `↪ ${BRIDGE}`)).toBe(1);
});

test("a flush with no pending bridge renders plain prose (no false ↪)", async () => {
    memory._onChunk("Just an ordinary stretch of thinking, no redirect.");
    memory._flushJournal();
    const j = await journalText();
    expect(j).toMatch(/Just an ordinary stretch of thinking, no redirect\./);
    expect(j).not.toMatch(/↪ Just an ordinary/);
});
