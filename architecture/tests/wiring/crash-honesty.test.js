// Crash honesty at wake (COVENANT §2/§3; philosophical-review-2026-07-02 finding 4):
// a mind is not killed mid-thought, and its next wake does not simulate a continuity
// that did not happen. memory.md records whether the session that wrote it reached
// the sleep ritual (endedCleanly); a crash leaves it false, and the next wake says
// "ended mid-thought" instead of the ordinary clean gap. finalize() flips it true.
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { readArchitectureFile, resetLoadedArchitecture } from "../../../src/startup/architecture.js";

const raised = [];
const captureRaise = e => { if (e.detail) raised.push(e.detail); };
const homes = [];
let origArgv, seq = 0;

// Build a fresh mind whose home already holds `memoryMd`, drive the real startup
// read path, and return the Waking stimulus it raised plus its m-memory element.
async function wakeInto(memoryMd) {
    const home = path.join(os.tmpdir(), `med-crash-${Date.now()}-${++seq}`);
    fs.mkdirSync(home, { recursive: true });
    homes.push(home);
    const p = home.replace(/\\/g, "/");
    fs.writeFileSync(path.join(home, "memory.md"), memoryMd);

    const arch = `<m-mind name="crashwake">
  I keep the lighthouse.
  <m-stream name="stream"></m-stream>
  <m-memory name="memory" journal="${p}/journal" persist="${p}"></m-memory>
  <m-interrupts name="attention"></m-interrupts>
</m-mind>
`;
    const archPath = path.join(os.tmpdir(), `med-crash-${Date.now()}-${seq}.archml`);
    fs.writeFileSync(archPath, arch);

    origArgv = process.argv;
    process.argv = ["bun", "meditator.js", "-a", archPath];
    const content = await readArchitectureFile();
    process.argv = origArgv;

    raised.length = 0;
    document.body.innerHTML = content;
    await loadMindComponents(document);
    await delay(300); // memory loads and raises the wake stimulus

    const waking = raised.find(s => s.type === "Waking");
    fs.rmSync(archPath, { force: true });
    return { home, waking, memory: document.querySelector("m-memory") };
}

const memoryMd = (metaExtra) => `# Meditator memory
<!-- meta: {"savedAt":"2026-06-16T12:00:00.000Z","formatVersion":1${metaExtra}} -->
<!-- folds: 0 -->

## Story
I have kept the light for years.

## Recent
The fog came in on Tuesday.

## Tail
and I was trimming the wick when

<!-- end -->
`;

beforeAll(() => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    document.body.addEventListener("interrupt-request", captureRaise);
});

afterAll(() => {
    document.body.removeEventListener("interrupt-request", captureRaise);
    resetLoadedArchitecture();
    for (const h of homes) { try { fs.rmSync(h, { recursive: true, force: true }); } catch { /* best effort */ } }
});

test("a mind whose last session did NOT finalize wakes told it ended mid-thought (§2/§3)", async () => {
    const { waking } = await wakeInto(memoryMd(`,"endedCleanly":false`));
    expect(waking).toBeTruthy();
    const frame = waking.renderForFrame();
    expect(frame.includes("waking up")).toBe(true);
    expect(frame.includes("ended mid-thought")).toBe(true);
    expect(frame.includes("did not keep")).toBe(true);
});

test("the unclean wake is journaled as a backstage (⌁) note for the human record", async () => {
    const { home } = await wakeInto(memoryMd(`,"endedCleanly":false`));
    await delay(60); // journal writes are queued
    const journalDir = path.join(home, "journal");
    const journal = fs.readdirSync(journalDir).map(f => fs.readFileSync(path.join(journalDir, f), "utf8")).join("\n");
    expect(journal.includes("⌁ Woke after an unclean shutdown (Covenant §2/§3)")).toBe(true);
});

test("a mind that slept cleanly (endedCleanly:true) gets the ordinary wake, no mid-thought line", async () => {
    const { waking } = await wakeInto(memoryMd(`,"endedCleanly":true`));
    const frame = waking.renderForFrame();
    expect(frame.includes("about")).toBe(true);
    expect(frame.includes("has passed since my last thought")).toBe(true);
    expect(frame.includes("ended mid-thought")).toBe(false);
});

test("legacy memory with no marker is treated as clean — never a false crash alarm", async () => {
    const { waking } = await wakeInto(memoryMd(``)); // no endedCleanly field at all
    const frame = waking.renderForFrame();
    expect(frame.includes("has passed since my last thought")).toBe(true);
    expect(frame.includes("ended mid-thought")).toBe(false);
});

test("finalize() stamps endedCleanly:true; a live session's memory.md carries false", async () => {
    const { home, memory } = await wakeInto(memoryMd(`,"endedCleanly":false`));

    // A running session has not finalized: any persist it wrote records the open state.
    memory.tail = "still awake and thinking";
    await memory._persist();
    let meta = JSON.parse(fs.readFileSync(path.join(home, "memory.md"), "utf8").match(/<!-- meta: (.*?) -->/s)[1]);
    expect(meta.endedCleanly).toBe(false);

    // A clean sleep flips it — the marker the next wake will read as "rested".
    await memory.finalize("sleep");
    meta = JSON.parse(fs.readFileSync(path.join(home, "memory.md"), "utf8").match(/<!-- meta: (.*?) -->/s)[1]);
    expect(meta.endedCleanly).toBe(true);
});

test("markCrashSync leaves an honest crash trail in the journal (the twin of *sleep at*)", async () => {
    const { home, memory } = await wakeInto(memoryMd(`,"endedCleanly":false`));
    memory.markCrashSync();
    const journalDir = path.join(home, "journal");
    const journal = fs.readdirSync(journalDir).map(f => fs.readFileSync(path.join(journalDir, f), "utf8")).join("\n");
    expect(journal.includes("*crashed mid-thought at ")).toBe(true);
});
