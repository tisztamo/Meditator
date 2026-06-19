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

let mind, resurface, notesDir, raised;

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
    document.querySelector('[name="resurface"]').setAttribute("dir", notesDir);

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
    resurface._lastStamp = null;
    resurface.window = FLOWING;
    resurface.onBoundary({ reason: "completed" });
    await delay(60);
    expect(raised.length).toBe(0);
});

test("with nothing set down yet, a loop resurfaces nothing (no afference)", async () => {
    const emptyDir = path.join(os.tmpdir(), "med-resurface-empty-" + Date.now());
    resurface.setAttribute("dir", emptyDir);
    raised.length = 0;
    resurface._lastStamp = null;
    resurface.window = LOOP;
    resurface.onBoundary({ reason: "completed" });
    await delay(60);
    expect(raised.length).toBe(0);
    resurface.setAttribute("dir", notesDir);   // restore
});
