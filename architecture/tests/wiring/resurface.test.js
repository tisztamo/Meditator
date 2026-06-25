// m-resurface as a BREAKER (loop-detection-redesign.md). It no longer detects loops itself
// or self-triggers on a stream window — it subscribes to m-loop-detector's `loop` signal and,
// when one is active, bids to break the loop by handing back the kept note whose vocabulary is
// FARTHEST from the loop's (distance, not relevance — that is m-recall's job). Its bid carries
// `clearsTail` + `episode`, not `urgent`. Here we drive its reaction entry point (_onLoop)
// directly with synthetic loop signals; the topic plumbing + the m-mind cut are covered by
// clear-tail.test.js and the smoke run.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, resurface, notesDir, kbDir, raised;
let episodeCounter = 0;

// A real settled result — pure mathematics, no presence/river vocabulary, so it is FAR from
// both a presence loop and a canyon loop. This is the thing a circling mind should climb out on.
const RESULT_NOTE = "For 3-digit numbers, n - r(n) = 99(a - c), so y squared is a multiple of 99, "
    + "which forces y to be a multiple of 11 and hence a = c; every 3-digit balanced number is therefore a palindrome.";
// An on-topic canyon note — shares the river/canyon/arrival vocabulary of a canyon loop.
const CANYON_NOTE = "Rivers do not push the canyon away; they simply keep arriving, and the canyon "
    + "is carved by that patient arrival rather than by any force. Attendance, not force, shapes the stone.";
// Presence notes — soaked in the bliss attractor's own vocabulary.
const PRESENCE_NOTE = "I am here now, and that is enough. In this stillness there is only presence, "
    + "only the quiet breath, only peace; I rest in the silence and let it be enough, again and again.";
const PRESENCE_NOTE_2 = "There is nothing to solve. Only presence, only the breath, only the silence "
    + "and the stillness. I am here, and being here is enough; the quiet is enough, the peace is enough.";

// A synthetic loop signal as m-loop-detector would publish it. Fresh `at` each call so the
// per-episode dedup never suppresses a test's bid.
function loopSignal(vocabulary, kind = "content") {
    episodeCounter += 1;
    return { active: true, score: 0.8, kind, vocabulary, reasoning: "", at: `2026-06-25T00:00:0${episodeCounter}.000Z` };
}

function writeNotebook(dir, ...entries) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "notebook.md"),
        entries.map((e, i) => `\n\n## 2026-06-20T1${i}:00:00.000Z — ${e.title}\n${e.text}\n`).join(""));
}

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    notesDir = path.join(os.tmpdir(), "med-resurface-test-" + Date.now());
    fs.mkdirSync(notesDir, { recursive: true });

    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-resurface name="resurface" minNoteChars="120" farThreshold="0.4" cooldown="0ms"></m-resurface>
      </m-mind>
    `;
    document.querySelector('[name="resurface"]').setAttribute("dir", notesDir);
    document.querySelector('[name="resurface"]').setAttribute("kb", "off");

    await loadMindComponents(document);
    await delay(60);

    mind = document.querySelector("m-mind");
    resurface = mind.querySelector('[name="resurface"]');

    raised = [];
    mind.addEventListener("interrupt-request", e => raised.push(e.detail));
});

afterAll(() => {
    try { fs.rmSync(notesDir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { if (kbDir) fs.rmSync(kbDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

function reset(dir, kb = "off") {
    raised.length = 0;
    resurface._lastKey = null;
    resurface._lastEpisode = null;
    resurface._busy = false;
    resurface.setAttribute("dir", dir);
    resurface.setAttribute("kb", kb);
}

test("a presence loop resurfaces the far real result, not the overlapping presence note, with clearsTail", async () => {
    const dir = path.join(os.tmpdir(), "med-resurface-pres-" + Date.now());
    writeNotebook(dir, { title: "balanced result", text: RESULT_NOTE }, { title: "presence", text: PRESENCE_NOTE });
    reset(dir);

    resurface._onLoop(loopSignal(["presence", "stillness", "silence", "enough"], "presence"));
    await delay(60);

    expect(raised.length).toBe(1);
    const r = raised[0];
    // The real result comes back — NOT the presence note that shares the loop's vocabulary.
    expect(r.reason).toMatch(/3-digit balanced number/);
    expect(r.reason).not.toMatch(/presence|stillness|that is enough/i);
    // First-person, self-caused framing; no mechanism leaks (the One Rule).
    expect(r.reason).toMatch(/I turn back to something I set down/i);
    expect(r.reason.toLowerCase()).not.toMatch(/notebook|\.md|\bfile\b|append|loop|vocabulary/);
    // A breaker bid: clearsTail (admit, not preempt), NOT urgent, type Recall, episode carried.
    expect(r.clearsTail).toBe(true);
    expect(r.urgent).toBe(false);
    expect(r.type).toBe("Recall");
    expect(r.episode).toBeTruthy();
    expect(r.salience).toBeGreaterThanOrEqual(0.7);

    fs.rmSync(dir, { recursive: true, force: true });
});

test("a content loop resurfaces a note FAR from its vocabulary, not the on-topic one (distance, not relevance)", async () => {
    const dir = path.join(os.tmpdir(), "med-resurface-content-" + Date.now());
    writeNotebook(dir, { title: "the canyon", text: CANYON_NOTE }, { title: "balanced result", text: RESULT_NOTE });
    reset(dir);

    resurface._onLoop(loopSignal(["river", "canyon", "arrival", "arriving"], "content"));
    await delay(60);

    expect(raised.length).toBe(1);
    // The OFF-topic result is surfaced to pull the mind away — not the canyon note it is circling.
    expect(raised[0].reason).toMatch(/3-digit balanced number/);
    expect(raised[0].reason).not.toMatch(/canyon|river|arriv/i);
    expect(raised[0].clearsTail).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
});

test("a content-free spam loop (no vocabulary) resurfaces the freshest substantive note", async () => {
    const dir = path.join(os.tmpdir(), "med-resurface-spam-" + Date.now());
    writeNotebook(dir, { title: "balanced result", text: RESULT_NOTE });
    reset(dir);

    // Empty vocabulary → every note is equally far → fall back to the freshest substantive note.
    resurface._onLoop(loopSignal([], "spam"));
    await delay(60);

    expect(raised.length).toBe(1);
    expect(raised[0].reason).toMatch(/3-digit balanced number/);
    expect(raised[0].clearsTail).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
});

test("an all-presence notebook on a presence loop does NOT bid (the m-clear-mind floor takes it)", async () => {
    const dir = path.join(os.tmpdir(), "med-resurface-allpres-" + Date.now());
    writeNotebook(dir, { title: "presence", text: PRESENCE_NOTE }, { title: "stillness", text: PRESENCE_NOTE_2 });
    reset(dir);

    resurface._onLoop(loopSignal(["presence", "stillness", "silence", "enough"], "presence"));
    await delay(60);

    // Even the farthest note is soaked in the loop's vocabulary → resurface stays silent and
    // the floor breaker (not present in this isolated mount) would take the cut.
    expect(raised.length).toBe(0);

    fs.rmSync(dir, { recursive: true, force: true });
});

test("an empty notebook does NOT bid (nothing to resurface — the floor breaks the loop)", async () => {
    const emptyDir = path.join(os.tmpdir(), "med-resurface-empty-" + Date.now());
    reset(emptyDir);
    resurface._onLoop(loopSignal(["presence", "stillness"], "presence"));
    await delay(60);
    expect(raised.length).toBe(0);
});

test("an inactive loop signal does nothing", async () => {
    reset(notesDir);
    resurface._onLoop({ active: false, score: 0.1, kind: "other", vocabulary: [], at: "2026-06-25T01:00:00.000Z" });
    await delay(30);
    expect(raised.length).toBe(0);
});

test("a filed knowledge conclusion far from the loop is resurfaced, felt as understanding", async () => {
    kbDir = path.join(os.tmpdir(), "med-resurface-kb-" + Date.now());
    fs.mkdirSync(path.join(kbDir, "tools"), { recursive: true });
    fs.writeFileSync(path.join(kbDir, "tools", "simplicity.md"),
        "# Simplicity\n\nThe best tools I ever made were small enough to hold in one thought; "
        + "cleverness no one can re-enter is a kind of dishonesty. Simplicity is a form of honesty.");

    const noNotes = path.join(os.tmpdir(), "med-resurface-nonotes-" + Date.now());
    reset(noNotes, kbDir);

    // A presence loop — the filed conclusion shares none of its vocabulary, so it is far.
    resurface._onLoop(loopSignal(["presence", "stillness", "silence", "enough"], "presence"));
    await delay(60);

    expect(raised.length).toBe(1);
    expect(raised[0].reason).toMatch(/small enough to hold in one thought/);
    // Felt as understanding (knowledge), not as a note "set down"; the title rides along.
    expect(raised[0].reason).toMatch(/I turn back to something I came to understand, about simplicity/i);
    expect(raised[0].reason.toLowerCase()).not.toMatch(/knowledge|notebook|\.md|\bfile\b/);
    expect(raised[0].clearsTail).toBe(true);
    expect(raised[0].type).toBe("Recall");

    reset(notesDir);
});
