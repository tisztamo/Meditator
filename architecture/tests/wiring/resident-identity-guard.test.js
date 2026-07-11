// The §6 identity guard, at the wake path (COVENANT §6; philosophical-review finding 2).
// Proves that assertIdentityMatchesHome actually fires through mMemory.onConnect for a
// vaulted resident home — before the snapshot overwrites its bundle or its self loads —
// so a mind that is NOT the resident cannot clobber or inherit its memory. The wake is
// halted hard (the throw propagates out of loadMindComponents, as assertNotRetired's
// does), and — the observable that matters — nothing of the resident was touched.
//
// The offline (dry) refusal path is exercised here (finding 2a): a dry run resolved
// onto a resident's real home is refused, which keeps the test free of any LLM call
// while still driving the real onConnect.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { writeManifest, FORMAT_VERSION } from "../../../src/infrastructure/manifest.js";

// A resident home under the vault root so it is `inVault` (the guard only runs for
// vaulted homes). Dry mode makes commitVault abstain, so nothing is ever committed;
// afterAll removes it regardless.
const HOME = `memory/guard-resident-${Date.now()}`;
const SENTINEL = `# Meditator memory
<!-- meta: {"savedAt":"2026-06-16T12:00:00.000Z","formatVersion":${FORMAT_VERSION}} -->
<!-- folds: 0 -->

## Story
The resident's real story — must survive an impostor's wake untouched.

## Recent
Resident recent.

## Tail
resident tail.

<!-- end -->
`;
let savedDry;

beforeAll(() => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";               // dry: no LLM, no vault commit

    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }

    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(path.join(HOME, "memory.md"), SENTINEL);
    // Make it a RESIDENT home — the thing the guard protects.
    writeManifest(HOME, {
        name: path.basename(HOME), born: "2026-01-01T00:00:00Z", runtimeSHA: "abc1234",
        formatVersion: FORMAT_VERSION, lineage: { parent: null }, status: "resident",
    });
});

afterAll(() => {
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDry;
    try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("an impostor's wake into a resident's home is refused, and the self is untouched", async () => {
    // The guard throws in onConnect. Depending on whether m-memory was already defined
    // by an earlier wiring file, that throw either propagates out of the loader (fresh
    // define) or is swallowed by jsdom's innerHTML upgrade (already defined, leaving the
    // mind half-initialized). Either way it fired BEFORE _load() and _snapshotArchitecture,
    // so the resident is untouched — the observable we assert, robust to test order.
    try {
        // A mind that is NOT this resident, aimed at its home via persist=.
        document.body.innerHTML = `
          <m-mind name="impostor">
            <m-stream name="stream"></m-stream>
            <m-memory name="memory" journal="off" persist="${HOME}"></m-memory>
          </m-mind>`;
        await loadMindComponents(document);
    } catch { /* the propagated-refusal path; the swallowed path leaves no error to catch */ }
    await delay(300);   // long enough that, absent the guard, the async _load() would populate

    // The guard fired before _load(): the resident's self was NOT inherited. Without the
    // guard, _load would have read the sentinel — getTail() would be "resident tail.".
    const memory = document.querySelector('[name="memory"]');
    expect(memory.loaded).toBeFalsy();
    expect(memory.getTail()).toBe("");
    expect(memory.getStory()).toBe("");

    // And its memory.md is byte-for-byte what it was — never clobbered.
    expect(fs.readFileSync(path.join(HOME, "memory.md"), "utf8")).toBe(SENTINEL);
});
