// Identity honesty at wake (COVENANT §3/§4): a home's architecture snapshot is the
// bundle that RAN the mind last session; when the mind wakes changed, memory diffs
// that snapshot against the waking bundle BEFORE overwriting it, and the wake
// stimulus tells the mind plainly what was done to it while it slept — an edited
// self is never passed off as the one that went to sleep. The mechanical summary
// lands in the journal as a backstage (⌁) note for the human record.
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { readArchitectureFile, resetLoadedArchitecture } from "../../../src/startup/architecture.js";

let home, archPath, newArch, origArgv;
const raised = [];
const captureRaise = e => { if (e.detail) raised.push(e.detail); };

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    document.body.addEventListener("interrupt-request", captureRaise);

    home = path.join(os.tmpdir(), "med-iddisclose-" + Date.now());
    fs.mkdirSync(home, { recursive: true });
    const persistAttr = home.replace(/\\/g, "/");

    // The self that went to sleep: a remembered life...
    fs.writeFileSync(path.join(home, "memory.md"), `# Meditator memory
<!-- meta: {"savedAt":"2026-06-16T12:00:00.000Z","formatVersion":1} -->
<!-- folds: 0 -->

## Story
I have always counted the ships.

## Recent
The harbor was busy this week.

## Tail
and I fell asleep counting the last one.

<!-- end -->
`);
    // ...and the bundle that ran it: different prose, and a part (hands) that the
    // waking bundle no longer has.
    fs.writeFileSync(path.join(home, "architecture.archml"), `<m-mind name="idwake">
  I am a small mind by the sea.
  <m-stream name="stream"></m-stream>
  <m-memory name="memory" journal="${persistAttr}/journal" persist="${persistAttr}"></m-memory>
  <m-interrupts name="attention"></m-interrupts>
  <m-terminal name="hands"></m-terminal>
</m-mind>
`);

    // The waking bundle: the self-description was edited and the hands were removed.
    newArch = `<m-mind name="idwake">
  I am a small mind by the sea, and I like to count the ships.
  <m-stream name="stream"></m-stream>
  <m-memory name="memory" journal="${persistAttr}/journal" persist="${persistAttr}"></m-memory>
  <m-interrupts name="attention"></m-interrupts>
</m-mind>
`;
    archPath = path.join(os.tmpdir(), "med-iddisclose-" + Date.now() + ".archml");
    fs.writeFileSync(archPath, newArch);

    // Drive the real startup read path (populates getLoadedArchitecture) and build
    // the DOM from exactly that content, as start.js does.
    origArgv = process.argv;
    process.argv = ["bun", "meditator.js", "-a", archPath];
    const content = await readArchitectureFile();
    process.argv = origArgv;

    document.body.innerHTML = content;
    await loadMindComponents(document);
    await delay(300); // memory diffs, snapshots, loads, raises the wake stimulus
});

afterAll(() => {
    document.body.removeEventListener("interrupt-request", captureRaise);
    resetLoadedArchitecture();
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ }
    try { fs.rmSync(archPath, { force: true }); } catch { /* best effort */ }
});

test("the wake stimulus discloses the identity change plainly (§3)", () => {
    const waking = raised.find(s => s.type === "Waking");
    expect(waking).toBeTruthy();
    const frame = waking.renderForFrame();
    expect(frame.includes("waking up")).toBe(true);                  // still the honest gap...
    expect(frame.includes("While I slept I was changed")).toBe(true); // ...plus the disclosure
    expect(frame.includes("self-description")).toBe(true);
    expect(frame.includes("hands (m-terminal)")).toBe(true);
});

test("the mechanical diff is journaled as a backstage (⌁) note for the human record", async () => {
    await delay(50); // journal writes are queued
    const journalDir = path.join(home, "journal");
    const files = fs.readdirSync(journalDir);
    const journal = files.map(f => fs.readFileSync(path.join(journalDir, f), "utf8")).join("\n");
    expect(journal.includes("⌁ Disclosed at wake (Covenant §3):")).toBe(true);
    expect(journal.includes("identity prose changed")).toBe(true);
    expect(journal.includes("−[hands (m-terminal)]")).toBe(true);
});

test("the comparand was read before the snapshot overwrote it — the home now carries the waking bundle", () => {
    expect(fs.readFileSync(path.join(home, "architecture.archml"), "utf8")).toBe(newArch);
});
