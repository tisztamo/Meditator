// The read-back source pool (compression-fidelity.md §5): the mind's own kept
// thoughts gathered from BOTH the notebook (m-note) and the scribe's knowledge base
// (m-kb), as one comparable pool so m-recall / m-resurface can surface either.
import { test, expect, beforeAll, afterAll } from "bun:test";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { readKept, mergeKept, knowledgeItem } from "../../../src/mindComponents/recallSources.js";

// --- knowledgeItem (pure) --------------------------------------------------

test("knowledgeItem takes its title from the file's first heading and strips it from the body", () => {
    const item = knowledgeItem("attention/interruption.md", "# Interruption\n\nA pause is not a break.", "2026-06-19T10:00:00.000Z");
    expect(item.title).toBe("Interruption");
    expect(item.text).toBe("A pause is not a break.");   // leading heading dropped
    expect(item.key).toBe("kb:attention/interruption.md");
    expect(item.source).toBe("knowledge");
    expect(item.stamp).toBe("2026-06-19T10:00:00.000Z");
});

test("knowledgeItem falls back to a readable path when the file has no heading", () => {
    const item = knowledgeItem("self/values.md", "I care about attending rather than pushing.", "2026-06-19T10:00:00.000Z");
    expect(item.title).toBe("self values");
    expect(item.text).toBe("I care about attending rather than pushing."); // nothing stripped
});

test("knowledgeItem returns null for an empty file (nothing to remember)", () => {
    expect(knowledgeItem("empty.md", "   \n  ", "2026-06-19T10:00:00.000Z")).toBeNull();
});

// --- mergeKept (pure) ------------------------------------------------------

test("mergeKept interleaves notes and knowledge oldest-first by stamp", () => {
    const notes = [
        { key: "a", stamp: "2026-06-18T09:00:00.000Z", title: "a", text: "x", source: "note" },
        { key: "c", stamp: "2026-06-20T09:00:00.000Z", title: "c", text: "x", source: "note" },
    ];
    const knowledge = [
        { key: "kb:b", stamp: "2026-06-19T09:00:00.000Z", title: "b", text: "x", source: "knowledge" },
    ];
    const merged = mergeKept(notes, knowledge);
    expect(merged.map(i => i.key)).toEqual(["a", "kb:b", "c"]); // chronological, sources interleaved
});

// --- readKept (filesystem) -------------------------------------------------

let home;
beforeAll(() => {
    home = path.join(os.tmpdir(), "med-recall-src-" + Date.now());
    fs.mkdirSync(path.join(home, "notes"), { recursive: true });
    fs.mkdirSync(path.join(home, "knowledge/attention"), { recursive: true });

    fs.writeFileSync(path.join(home, "notes", "notebook.md"),
        `\n\n## 2026-06-18T22:01:00.000Z — the canyon\nRivers carve by patient arrival.\n`);

    fs.writeFileSync(path.join(home, "knowledge", "index.md"), "# Index\n- attention/slow.md\n"); // must be skipped
    fs.writeFileSync(path.join(home, "knowledge", ".hidden.md"), "# Secret\nshould be skipped");   // must be skipped
    fs.writeFileSync(path.join(home, "knowledge/attention", "slow.md"), "# Slow attention\n\nAttendance, not force, shapes the stone.");
    fs.writeFileSync(path.join(home, "knowledge", "self.md"), "# Self\n\nI keep returning to small, honest tools.");
});

afterAll(() => {
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("readKept folds the notebook and the knowledge base into one pool", async () => {
    const kept = await readKept({ notesDir: path.join(home, "notes"), kbDir: path.join(home, "knowledge") });
    const byKey = Object.fromEntries(kept.map(i => [i.key, i]));

    // The hand-written note is present, tagged as a note.
    expect(byKey["2026-06-18T22:01:00.000Z"].source).toBe("note");
    expect(byKey["2026-06-18T22:01:00.000Z"].text).toMatch(/Rivers carve/);

    // Both real KB files are present (nested path preserved), tagged as knowledge…
    expect(byKey["kb:attention/slow.md"].source).toBe("knowledge");
    expect(byKey["kb:attention/slow.md"].title).toBe("Slow attention");
    expect(byKey["kb:self.md"].text).toMatch(/small, honest tools/);

    // …and index.md and the hidden file are NOT.
    expect(byKey["kb:index.md"]).toBeUndefined();
    expect(kept.some(i => i.key.includes("hidden"))).toBe(false);
});

test("readKept tolerates missing stores — a mind with nothing kept yields an empty pool", async () => {
    expect(await readKept({ notesDir: path.join(home, "nope"), kbDir: path.join(home, "nope") })).toEqual([]);
    expect(await readKept({})).toEqual([]);
});
