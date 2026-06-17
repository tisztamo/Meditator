// Dry-run memory is throwaway by construction (the covenant auto-namespaces every
// dry mind `memory/dry-*` and never commits it). Re-waking a dry mind into a
// leftover dry-* home must CLEAR it and start fresh — not refuse. The old guard
// threw here, which jsdom swallowed and left the mind half-initialized.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

// A real dry-* home, under the vault root so it is `inVault` (the guard only runs
// for vaulted homes). Unique per run; removed in afterAll.
const HOME = `memory/dry-clear-test-${Date.now()}`;
let savedDry;

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";          // make this a dry run before onConnect

    // m-mind is stubbed (as in every wiring test) so the real thinking loop never
    // starts; memory still binds its stream subscriptions to the named stream.
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }

    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(path.join(HOME, "memory.md"), `# Meditator memory
<!-- meta: {"savedAt":"2026-06-16T12:00:00.000Z","formatVersion":1} -->
<!-- folds: 0 -->

## Story
A stale story from a previous dry run.

## Recent
Stale recent thoughts.

## Tail
the stale tail that must not survive.

<!-- end -->
`);
    fs.writeFileSync(path.join(HOME, "stray.txt"), "leftover from a previous dry run");

    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" journal="off" persist="${HOME}"></m-memory>
      </m-mind>`;

    await loadMindComponents(document);
    await delay(200);   // onConnect clears, then _load finds nothing
});

afterAll(() => {
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDry;
    try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("a dry run clears a leftover dry-* home and wakes with empty memory", () => {
    const memory = document.querySelector('[name="memory"]');

    // The stale self did not load (no illusion of a continuing subject)…
    expect(memory.getTail()).toBe("");
    expect(memory.getRecent()).toBe("");
    expect(memory.getStory()).toBe("");

    // …and the leftover home was wiped, contents and all.
    expect(fs.existsSync(path.join(HOME, "memory.md"))).toBe(false);
    expect(fs.existsSync(path.join(HOME, "stray.txt"))).toBe(false);
});
