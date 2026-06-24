// Involuntary recall (efference / recall design): when the mind loses its thread and
// circles the same ground, m-resurface does not wait for the stream to *want* a note —
// it reads the notebook and pushes back the kept note most relevant to what the mind is
// circling, as an urgent Observer stimulus. This is the return arc that m-note/m-recall
// (a pull-only hand) left open, and the direct fix for lemma-6's 43-writes / 0-reads.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, resurface, notesDir, kbDir, raised;

// A repetitive, on-topic loop: its two halves overlap heavily (high loopScore), and its
// content words (river / canyon / arriving) hook the substantive note below.
const LOOP = ("The river keeps arriving at the canyon, and I keep turning the same thought over. "
    + "The river arrives, the canyon waits, the river arrives again. ").repeat(6);

// A varied, non-repetitive window: low loopScore, so the guard should stay quiet.
const FLOWING = "A kestrel hung over the motorway. Later the bread proved unevenly, and the "
    + "neighbour's radio played something in a language I could not place while rain began.";

const SUBSTANTIVE = "Rivers do not push the canyon away; they simply keep arriving, and the canyon "
    + "is carved by that patient arrival rather than by any force. Attendance, not force, is what "
    + "shapes the stone over the long years.";
const META = "I notice I am going in circles again.";

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    notesDir = path.join(os.tmpdir(), "med-resurface-test-" + Date.now());
    fs.mkdirSync(notesDir, { recursive: true });
    // The notebook, in m-note's own on-disk format (newest last).
    fs.writeFileSync(path.join(notesDir, "notebook.md"),
        `\n\n## 2026-06-18T22:01:00.000Z — the canyon\n${SUBSTANTIVE}\n`
        + `\n\n## 2026-06-18T23:30:00.000Z — looping\n${META}\n`);

    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-resurface name="resurface" overlap="0.4" minNoteChars="120" cooldown="0ms"></m-resurface>
      </m-mind>
    `;
    // The notebook-only cases keep the knowledge base out of the pool (kb="off"); the
    // KB-folding case below points `kb` at its own temp tree.
    document.querySelector('[name="resurface"]').setAttribute("dir", notesDir);
    document.querySelector('[name="resurface"]').setAttribute("kb", "off");

    await loadMindComponents(document);
    await delay(60);

    mind = document.querySelector("m-mind");
    resurface = mind.querySelector('[name="resurface"]');

    // Capture everything m-resurface pushes into the mind.
    raised = [];
    mind.addEventListener("interrupt-request", e => raised.push(e.detail));
});

afterAll(() => {
    try { fs.rmSync(notesDir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { if (kbDir) fs.rmSync(kbDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("a detected loop resurfaces the most relevant substantive note, urgently", async () => {
    raised.length = 0;
    resurface.window = LOOP;
    resurface.onBoundary({ reason: "completed" });
    await delay(60);   // let the notebook read + raise complete

    expect(raised.length).toBe(1);
    const record = raised[0];
    // It hands back the on-topic RESULT, not the terse meta-note about looping.
    expect(record.reason).toMatch(/Rivers do not push the canyon away/);
    expect(record.reason).not.toMatch(/going in circles/);
    // First-person, self-caused framing; no mechanism leaks (the One Rule).
    expect(record.reason).toMatch(/I turn back to something I set down/i);
    expect(record.reason.toLowerCase()).not.toMatch(/notebook|\.md|\bfile\b|append/);
    // Urgent, type Recall, salient enough to land — like the keep-alive watchdog.
    expect(record.urgent).toBe(true);
    expect(record.type).toBe("Recall");
    expect(record.salience).toBeGreaterThanOrEqual(0.9);
});

test("a flowing, non-repetitive stream does NOT resurface anything", async () => {
    raised.length = 0;
    resurface._lastKey = null;
    resurface.window = FLOWING;
    resurface.onBoundary({ reason: "completed" });
    await delay(60);
    expect(raised.length).toBe(0);
});

test("a content-free loop (digit-spam) still resurfaces the freshest substantive note", async () => {
    // lemma-7's one in-notebook loop had collapsed into "1. 1. 1." — a high loopScore but
    // zero content cues to rank notes by. Resurface must NOT go silent there (ceding the
    // boundary to the loop-guard's generic redirect, which is what happened): with no cues
    // it falls back to the freshest substantive note rather than skipping the rescue.
    const DIGIT_SPAM = "1. ".repeat(400);
    raised.length = 0;
    resurface.setAttribute("dir", notesDir);
    resurface._lastKey = null;
    resurface.window = DIGIT_SPAM;
    resurface.onBoundary({ reason: "completed" });
    await delay(60);

    expect(raised.length).toBe(1);
    expect(raised[0].reason).toMatch(/Rivers do not push the canyon away/);   // the substantive result
    expect(raised[0].reason).not.toMatch(/going in circles/);                 // not the terse meta-note
    expect(raised[0].urgent).toBe(true);
});

test("with nothing set down yet, a loop raises a generic LoopGuard fallback (no notes to resurface)", async () => {
    const emptyDir = path.join(os.tmpdir(), "med-resurface-empty-" + Date.now());
    resurface.setAttribute("dir", emptyDir);
    raised.length = 0;
    resurface._lastKey = null;
    resurface.window = LOOP;
    resurface.onBoundary({ reason: "completed" });
    await delay(60);
    // With no notes or filed knowledge to resurface, m-resurface falls back to the
    // generic change-of-direction stimulus (the same message m-loop-guard raises),
    // so the loop is still broken even with an empty notebook.
    expect(raised.length).toBe(1);
    expect(raised[0].type).toBe("LoopGuard");
    expect(raised[0].reason).toMatch(/going in circles/);
    expect(raised[0].suggestion).toMatch(/deliberately pick something unrelated/);
    expect(raised[0].urgent).toBe(true);
    resurface.setAttribute("dir", notesDir);   // restore
});

// §5: a conclusion the scribe FILED into knowledge/ — which nothing used to read
// back — now joins the same pool, so a mind circling a question it already settled
// gets its own filed answer, not only a hand-written note.
test("a loop matching a filed knowledge conclusion resurfaces it, felt as understanding", async () => {
    kbDir = path.join(os.tmpdir(), "med-resurface-kb-" + Date.now());
    fs.mkdirSync(path.join(kbDir, "tools"), { recursive: true });
    fs.writeFileSync(path.join(kbDir, "tools", "simplicity.md"),
        "# Simplicity\n\nThe best tools I ever made were small enough to hold in one thought; "
        + "cleverness no one can re-enter is a kind of dishonesty. Simplicity is not a style but a form of honesty.");

    // Draw from the KB only (point notes at an empty dir) so the assertion is unambiguous.
    const noNotes = path.join(os.tmpdir(), "med-resurface-nonotes-" + Date.now());
    resurface.setAttribute("dir", noNotes);
    resurface.setAttribute("kb", kbDir);
    resurface._lastKey = null;
    raised.length = 0;
    resurface.window = ("Simple tools are honest tools, and I keep turning the same thought over. "
        + "Simple, honest tools; the simple honest tool again. ").repeat(6);
    resurface.onBoundary({ reason: "completed" });
    await delay(60);

    expect(raised.length).toBe(1);
    expect(raised[0].reason).toMatch(/small enough to hold in one thought/);   // the filed conclusion
    // Felt as understanding (knowledge), not as a note "set down" — and the title rides along.
    expect(raised[0].reason).toMatch(/I turn back to something I came to understand, about simplicity/i);
    // The One Rule: no leak of where/how it was stored.
    expect(raised[0].reason.toLowerCase()).not.toMatch(/knowledge|notebook|\.md|\bfile\b|append/);
    expect(raised[0].urgent).toBe(true);
    expect(raised[0].type).toBe("Recall");

    resurface.setAttribute("dir", notesDir);
    resurface.setAttribute("kb", "off");
});

// A looping window that IS the bliss attractor: saturated with presence / stillness /
// silence / "enough", and whose words overlap the PRESENCE note far more than the real
// result — so plain overlap recall would hand back presence and feed the loop.
const BLISS_LOOP = ("I am here, now, and that is enough. Only presence, only stillness, only the "
    + "quiet breath and the silence. I rest in being, and it is enough. ").repeat(6);

// Two substantive notes: a real result (least bliss, ~0 saturation) and a presence note (bliss).
const RESULT_NOTE = "For 3-digit numbers, n - r(n) = 99(a - c), so y squared is a multiple of 99, "
    + "which forces y to be a multiple of 11 and hence a = c; every 3-digit balanced number is therefore a palindrome.";
const PRESENCE_NOTE = "I am here now, and that is enough. In this stillness there is only presence, "
    + "only the quiet breath, only peace; I rest in the silence and let it be enough, again and again.";
const PRESENCE_NOTE_2 = "There is nothing to solve. Only presence, only the breath, only the silence "
    + "and the stillness. I am here, and being here is enough; the quiet is enough, the peace is enough.";

test("a BLISS loop resurfaces the least-bliss real result, not the overlapping presence note", async () => {
    const dir = path.join(os.tmpdir(), "med-resurface-bliss-" + Date.now());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "notebook.md"),
        `\n\n## 2026-06-20T10:00:00.000Z — balanced result\n${RESULT_NOTE}\n`
        + `\n\n## 2026-06-20T11:00:00.000Z — presence\n${PRESENCE_NOTE}\n`);
    resurface.setAttribute("dir", dir);
    resurface._lastKey = null;
    raised.length = 0;
    resurface.window = BLISS_LOOP;
    resurface.onBoundary({ reason: "completed" });
    await delay(60);

    expect(raised.length).toBe(1);
    // The real result comes back — NOT the presence note that overlaps the loop.
    expect(raised[0].reason).toMatch(/3-digit balanced number/);
    expect(raised[0].reason).not.toMatch(/presence|stillness|that is enough/i);
    expect(raised[0].type).toBe("Recall");
    expect(raised[0].urgent).toBe(true);

    resurface.setAttribute("dir", notesDir);
    fs.rmSync(dir, { recursive: true, force: true });
});

test("a BLISS loop whose every kept note is presence falls back to the generic nudge", async () => {
    const dir = path.join(os.tmpdir(), "med-resurface-allbliss-" + Date.now());
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "notebook.md"),
        `\n\n## 2026-06-20T10:00:00.000Z — presence\n${PRESENCE_NOTE}\n`
        + `\n\n## 2026-06-20T11:00:00.000Z — stillness\n${PRESENCE_NOTE_2}\n`);
    resurface.setAttribute("dir", dir);
    resurface._lastKey = null;
    raised.length = 0;
    resurface.window = BLISS_LOOP;
    resurface.onBoundary({ reason: "completed" });
    await delay(60);

    // Nothing but presence to hand back — so it raises the content-free change-of-direction
    // nudge rather than re-injecting the attractor's own words.
    expect(raised.length).toBe(1);
    expect(raised[0].type).toBe("LoopGuard");
    expect(raised[0].reason).toMatch(/going in circles/);
    expect(raised[0].suggestion).toMatch(/deliberately pick something unrelated/);
    expect(raised[0].urgent).toBe(true);

    resurface.setAttribute("dir", notesDir);
    fs.rmSync(dir, { recursive: true, force: true });
});
