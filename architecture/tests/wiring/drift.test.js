// m-drift — the spontaneous change-of-direction, rewritten to OFFER a destination.
// When it fires it picks a thread to turn toward and NAMES it, so the mind can actually
// go there (the old content-free wander offered nothing and bounced straight back to the
// attractor). Arm A: a kept thread FARTHEST from the current tail (distance, not relevance —
// that is m-recall's job; this is the unprompted turn, not a loop break). Arm B (when nothing
// is far enough, or the notebook is empty): a fresh thread generated from randomness and
// chosen by context. Here we drive _drift() directly with a synthetic tail; the timer cadence
// and the m-interrupts admission are covered by the smoke run.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let drift, notesDir, raised;

// A SOL/whisper/stillness tail — the attractor the jev runs settle into.
const TAIL = "The SOL price whispers. Stillness. Quiet. I wait for the numbers. "
    + "The market is asleep, a whisper, not a shout. I do not force it. I just let it be.";
// A note soaked in that tail's vocabulary — too close to be a destination.
const CLOSE_NOTE = "SOL whispers in the stillness. Quiet. The market sleeps. A whisper, not a shout. "
    + "I wait for the numbers and do not force the quiet; I just let it be, again and again.";
// A real settled result — pure mathematics, no market/presence vocabulary, so it is FAR.
const FAR_NOTE = "For 3-digit numbers, n - r(n) = 99(a - c), so y squared is a multiple of 99, "
    + "which forces y to be a multiple of 11 and hence a = c; every 3-digit balanced number is therefore a palindrome.";
// A second FAR note — tidal bookkeeping, also no market/presence vocabulary.
const TIDAL_NOTE = "The harbour master keeps two ledgers, one for the water that came in and one for "
    + "the water that went out, and at the end of the day the two must agree to the last barrel.";

function writeNotebook(dir, ...entries) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "notebook.md"),
        entries.map((e, i) => `\n\n## 2026-06-20T1${i}:00:00.000Z — ${e.title}\n${e.text}\n`).join(""));
}

const savedDryRun = process.env.MEDITATOR_DRY_RUN;
beforeAll(async () => {
    // Arm B calls the model; run it offline through the dry stub (no key, no cost).
    process.env.MEDITATOR_DRY_RUN = "1";

    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    notesDir = path.join(os.tmpdir(), "med-drift-test-" + Date.now());
    fs.mkdirSync(notesDir, { recursive: true });

    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-drift name="drift" timeout="15m" sigma="4m" salience="0.55"
                 farThreshold="0.3" minNoteChars="80" candidates="5" cooldown="0ms"></m-drift>
      </m-mind>
    `;
    document.querySelector('[name="drift"]').setAttribute("dir", notesDir);
    document.querySelector('[name="drift"]').setAttribute("kb", "off");

    await loadMindComponents(document);
    await delay(60);

    drift = document.querySelector('[name="drift"]');
    raised = [];
    drift.parentElement.addEventListener("interrupt-request", e => raised.push(e.detail));
});

afterAll(() => {
    if (savedDryRun === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDryRun;
    try { fs.rmSync(notesDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

function reset(dir, kb = "off", tail = TAIL) {
    raised.length = 0;
    drift._lastKey = null;
    drift._memTail = tail;
    drift.setAttribute("dir", dir);
    drift.setAttribute("kb", kb);
}

test("arm A: a far kept thread is picked by distance and NAMED (the mind can go there)", async () => {
    const dir = path.join(os.tmpdir(), "med-drift-far-" + Date.now());
    writeNotebook(dir, { title: "the market", text: CLOSE_NOTE }, { title: "balanced result", text: FAR_NOTE });
    reset(dir);

    await drift._drift();

    expect(raised.length).toBe(1);
    const r = raised[0];
    // The FAR thread comes back — NOT the on-topic market note it is already thinking about.
    expect(r.reason).toMatch(/3-digit balanced number/);
    expect(r.reason).not.toMatch(/SOL|whisper|stillness|quiet/i);
    // First-person, self-caused framing; no mechanism leaks (the One Rule).
    expect(r.reason).toMatch(/My attention turns, on its own/i);
    expect(r.reason.toLowerCase()).not.toMatch(/notebook|\.md|\bfile\b|append|vocabulary|arm|threshold|overlap/);
    expect(r.type).toBe("Drift");
    expect(r.salience).toBeCloseTo(0.55);
    // It does NOT clear the tail — this is a turn, not a loop break.
    expect(r.clearsTail).toBe(false);

    fs.rmSync(dir, { recursive: true, force: true });
});

test("arm A declines when every note is too close, and arm B offers a FRESH thread instead", async () => {
    const dir = path.join(os.tmpdir(), "med-drift-close-" + Date.now());
    // Only on-topic notes — nothing far enough to drift to.
    writeNotebook(dir, { title: "the market", text: CLOSE_NOTE });
    reset(dir);

    await drift._drift();

    expect(raised.length).toBe(1);
    const r = raised[0];
    // Arm B's fresh thread: the dry chooser names the second generated fragment, verbatim.
    expect(r.reason).toMatch(/knot the river unties/i);
    expect(r.reason).toMatch(/My mind turns, on its own, toward a thread I have not been carrying/i);
    // It is NOT the on-topic market note (arm A correctly declined it).
    expect(r.reason).not.toMatch(/SOL|whisper|stillness/i);
    expect(r.type).toBe("Drift");

    fs.rmSync(dir, { recursive: true, force: true });
});

test("an empty notebook runs arm B (there is nothing set down to be far from)", async () => {
    const emptyDir = path.join(os.tmpdir(), "med-drift-empty-" + Date.now());
    reset(emptyDir);

    await drift._drift();

    expect(raised.length).toBe(1);
    expect(raised[0].reason).toMatch(/My mind turns, on its own, toward a thread I have not been carrying/i);
    expect(raised[0].reason).toMatch(/knot the river unties/i);
});

test("arm A does not repeat the last thread it drifted to", async () => {
    const dir = path.join(os.tmpdir(), "med-drift-dedup-" + Date.now());
    // Two FAR notes. The fresher (later stamp) wins the first pick on the recency tiebreak;
    // the next drift must avoid it and take the other.
    writeNotebook(dir, { title: "balanced result", text: FAR_NOTE }, { title: "tidal bookkeeping", text: TIDAL_NOTE });
    reset(dir);

    await drift._drift();
    const first = raised[0].reason;
    // The fresher (tidal) note wins the first pick — its TEXT, not title, is what is named.
    expect(first).toMatch(/harbour master keeps two ledgers/i);

    // Force the dedup: the tidal note's stamp is the later entry (T2).
    drift._lastKey = "2026-06-20T11:00:00.000Z";
    await drift._drift();
    expect(raised.length).toBe(2);
    // The second drift must take the OTHER far note, not repeat the tidal one.
    expect(raised[1].reason).toMatch(/3-digit balanced number/i);
    expect(raised[1].reason).not.toMatch(/harbour master/i);

    fs.rmSync(dir, { recursive: true, force: true });
});
