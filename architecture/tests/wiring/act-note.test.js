// The world-changing hand and its read-back, end to end (efference.md §6c): the mind
// sets a thought down (m-note, readonly:false, guardrailed to one notebook in its own
// notes dir) and later comes upon it again (m-recall, read-only) — the reach → mark →
// meet-again loop that anchors a mind in an outside it can actually touch. Both hands'
// `felt` lines join into the body schema the mind carries in its identity.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, act, note, recall, notesDir;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    notesDir = path.join(os.tmpdir(), "med-note-test-" + Date.now());

    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-act name="hands" every="1">
          <m-note name="note"></m-note>
          <m-recall name="recall"></m-recall>
        </m-act>
      </m-mind>
    `;
    // Point both hands at the same temp notebook (a Windows path's backslashes can't
    // sit inside the template literal above).
    document.querySelector('[name="note"]').setAttribute("dir", notesDir);
    document.querySelector('[name="recall"]').setAttribute("dir", notesDir);

    await loadMindComponents(document);
    await delay(160);   // let both hands retry-register with their parent m-act

    mind = document.querySelector("m-mind");
    act = mind.querySelector('[name="hands"]');
    note = mind.querySelector('[name="note"]');
    recall = mind.querySelector('[name="recall"]');
});

afterAll(() => {
    try { fs.rmSync(notesDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("both hands registered; note is world-changing, recall is read-only", () => {
    const names = act._capabilities.map(c => c.name);
    expect(names).toContain("note");
    expect(names).toContain("recall");
    expect(act._capabilities.find(c => c.name === "note").readonly).toBe(false);   // WORLD-CHANGING
    expect(act._capabilities.find(c => c.name === "recall").readonly).toBe(true);
});

test("their felt lines join into the body schema, with no mechanism", () => {
    expect(act.embodiment).toMatch(/set it down where it will keep/i);           // m-note's felt
    expect(act.embodiment).toMatch(/turn back and find it/i);                    // m-recall's felt
    expect(act.embodiment.toLowerCase()).not.toMatch(/\btool\b|function|schema|argument|notebook/);
});

test("a note is set down (world-changing) and read back (closing the loop)", async () => {
    const out = await note._note({
        text: "Rivers do not push the canyon away; they just keep arriving.",
        title: "rivers",
    });
    // Self-caused experience (efference copy), and NO mechanism leaks into it.
    expect(out.experience).toMatch(/I set this down/i);
    expect(out.experience.toLowerCase()).not.toMatch(/\bfile\b|notebook|append|\bpath\b|\.md/);

    // The world actually changed: the notebook exists in the allow-listed dir.
    const notebook = fs.readFileSync(path.join(notesDir, "notebook.md"), "utf8");
    expect(notebook).toMatch(/Rivers do not push the canyon away/);
    expect(notebook).toMatch(/— rivers/);

    // …and the mind can come upon it again, as a self-caused encounter.
    const back = await recall._recall({ about: "rivers" });
    expect(back.experience).toMatch(/I find again something I set down/i);
    expect(back.experience).toMatch(/Rivers do not push the canyon away/);
    expect(back.data.title).toBe("rivers");
    // The return arc re-enters URGENT, so it bypasses the arbiter's rate-limit instead
    // of being dropped in a contended window (the lemma-7 defect); a deliberately-sought
    // note lands at a salience that survives a crowded queue.
    expect(back.urgent).toBe(true);
    expect(back.salience).toBe(0.8);
});

test("recall on an empty notebook fails (m-act would swallow it — no afference)", async () => {
    const emptyDir = path.join(os.tmpdir(), "med-note-empty-" + Date.now());
    recall.setAttribute("dir", emptyDir);
    await expect(recall._recall({})).rejects.toThrow(/nothing set down/);
    recall.setAttribute("dir", notesDir);   // restore for any later use
});
