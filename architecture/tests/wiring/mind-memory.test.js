// The producer side of the mind↔memory decoupling: memory PUSHES its content and
// the wake stimulus instead of the mind pulling them. Memory publishes `tail`
// (on load and every change) and `compressed` (on load), raises the wake stimulus
// onto the attention spine as a bubbling interrupt-request, and journals the
// stimuli the mind fires as `attended`. With these, the mind never reaches in.
//
// m-mind is stubbed here, as in every wiring test (the real one starts a thinking
// loop). The real mind's consuming side — mirroring these topics into the frame —
// is exercised end-to-end by the smoke test (`bun run test:smoke`).
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, stream, memory, persistDir, tailSeen, compressedSeen;
const raised = [];
const captureRaise = e => { if (e.detail) raised.push(e.detail); };

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }

    // Capture raised stimuli at the document root, attached BEFORE the components
    // exist. The wake stimulus bubbles up here regardless of when the arbiter
    // upgrades — so the test asserts memory *raises* it, free of arbiter-attach
    // timing (the arbiter catching bubbling requests is covered by nested-attention).
    document.body.addEventListener("interrupt-request", captureRaise);

    persistDir = path.join(os.tmpdir(), "med-mind-test-" + Date.now());
    fs.mkdirSync(persistDir, { recursive: true });
    fs.writeFileSync(path.join(persistDir, "memory.md"), `# Meditator memory
<!-- meta: {"savedAt":"2026-06-16T12:00:00.000Z","formatVersion":1} -->
<!-- folds: 0 -->

## Story
Long ago I wondered about lighthouses.

## Recent
Lately I have been thinking about slow attention.

## Tail
and the harbor was very quiet that evening.

<!-- end -->
`);

    // persist goes straight into the attribute (forward-slashed so it is a legal
    // template literal, and still a valid path for Node fs on Windows). Setting it
    // after innerHTML would race: when the components are already registered (the
    // full suite), innerHTML upgrades m-memory synchronously and _load runs before
    // a later setAttribute could land.
    const persistAttr = persistDir.replace(/\\/g, "/");
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" journal="off" persist="${persistAttr}"></m-memory>
        <m-interrupts name="attention"></m-interrupts>
      </m-mind>
    `;

    await loadMindComponents(document);
    await delay(300); // memory loads, publishes its content, raises the wake stimulus

    mind = document.querySelector("m-mind");
    stream = mind.querySelector('[name="stream"]');
    memory = mind.querySelector('[name="memory"]');

    // Late subscribers still see the loaded values — topics are retained behaviour-values.
    tailSeen = null; compressedSeen = null;
    await mind.sub("memory/tail", v => { tailSeen = v; });
    await mind.sub("memory/compressed", v => { compressedSeen = v; });
    await delay(10);
});

afterAll(() => {
    document.body.removeEventListener("interrupt-request", captureRaise);
    try { fs.rmSync(persistDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("memory publishes its loaded tail and summaries as topics", () => {
    expect(tailSeen.includes("harbor was very quiet")).toBe(true);
    expect(compressedSeen.recent.includes("slow attention")).toBe(true);
    expect(compressedSeen.story.includes("lighthouses")).toBe(true);
});

test("the tail topic tracks every change as the stream flows", async () => {
    stream.pub("chunk", " The lamp turned once more.");
    await delay(10);
    expect(memory.getTail().includes("lamp turned once more")).toBe(true);
    expect(tailSeen.includes("lamp turned once more")).toBe(true); // the published topic followed
});

test("waking is raised onto the attention spine, not parked for a pull", () => {
    const waking = raised.find(s => s.type === "Waking");
    expect(waking).toBeTruthy();
    expect(waking.renderForFrame().includes("waking up")).toBe(true);
});

test("the mind's `attended` stimuli are journaled by memory via subscription", async () => {
    // attended is journaled via note() (perceived ⟂), which writes to the journal, not
    // the verbatim tail; spy on note() to confirm the wire routes each line into memory.
    const notes = [];
    const origNote = memory.note.bind(memory);
    memory.note = (text, opts) => { notes.push(text); return origNote(text, opts); };
    mind.fire("attended", ["A bell rang somewhere in the fog."]);
    await delay(10);
    memory.note = origNote;
    expect(notes.some(line => line.includes("bell rang"))).toBe(true);
});
