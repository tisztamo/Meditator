// Gap #5 of philosophical-review-2026-07-02, "the persist race is only half-fixed" —
// three closures, all against COVENANT §2 ("persisted and committed before the process
// ends"). Unique tmp names (already landed) stop a mid-write crash corrupting the single
// copy, but did not by themselves:
//   1. SERIALIZE the writes. Overlapping persists now run through one queue (as
//      m-context already does), so they apply in issue order and a stale write never
//      wins the rename after a fresher one.
//   2. AWAIT an in-flight consolidation at finalize(), so the last compressed self is
//      what reaches disk — not the state from just before the fold landed.
//   3. Make the FINAL write LOUD. A routine boundary write may fail and be retried next
//      boundary; the sleep write is the resident's last self, so its failure is logged
//      at error and rethrown, never swallowed at log.warn.
import { test, expect, beforeAll, afterEach } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let seq = 0;
const homes = [];

// A fresh mind whose home lives in tmpdir — outside the vault, so it is neither
// `_vaulted` nor a resident: it loads/writes memory.md but never commits, exactly the
// path we want to exercise without touching git. Returns its home and m-memory element.
async function freshMemory(seed) {
    const home = path.join(os.tmpdir(), `med-persist-${Date.now()}-${++seq}`);
    fs.mkdirSync(home, { recursive: true });
    homes.push(home);
    if (seed) fs.writeFileSync(path.join(home, "memory.md"), seed);
    const p = home.replace(/\\/g, "/");
    document.body.innerHTML = `
      <m-mind name="p${seq}">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" journal="${p}/journal" persist="${p}"></m-memory>
        <m-interrupts name="attention"></m-interrupts>
      </m-mind>
    `;
    await loadMindComponents(document);
    await delay(50); // memory connects and loads
    return { home, memory: document.querySelector("m-memory") };
}

const readMd = (home) => fs.readFileSync(path.join(home, "memory.md"), "utf8");

beforeAll(() => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
});

afterEach(() => {
    document.body.innerHTML = "";
    for (const h of homes.splice(0)) { try { fs.rmSync(h, { recursive: true, force: true }); } catch { /* best effort */ } }
});

test("overlapping writes are SERIALIZED — a slow write still completes before the next starts", async () => {
    const { memory } = await freshMemory();
    const order = [];
    const orig = memory._writeMemory.bind(memory);
    let id = 0;
    memory._writeMemory = async (critical) => {
        const mine = ++id;
        if (mine === 1) await delay(60); // the first write is slow to reach disk...
        order.push(mine);                // ...but the queue must not let the second overtake it
        return orig(critical);
    };
    // Issue two persists back-to-back, exactly as a boundary + a clear-tail (or a
    // multi-mind fan-out) would. Without the queue the fast second write lands first
    // (order [2, 1]) and a stale first write could then win the rename.
    const a = memory._persist();
    const b = memory._persist();
    await Promise.all([a, b]);
    expect(order).toEqual([1, 2]);
});

test("finalize() awaits an IN-FLIGHT consolidation, so the last compressed self reaches disk (§2)", async () => {
    const { home, memory } = await freshMemory();
    memory.recent = "the summary from before the fold";
    // Sleep arrives while a consolidation is still running; it is about to replace
    // `recent`. finalize() must wait for it before the final write, or the freshly
    // folded self is computed and then thrown away unpersisted.
    let folded = false;
    memory._consolidating = (async () => {
        await delay(40);
        memory.recent = "the freshly folded self";
        folded = true;
    })();

    await memory.finalize("sleep");

    expect(folded).toBe(true);                                     // finalize waited for the fold
    const md = readMd(home);
    expect(md.includes("the freshly folded self")).toBe(true);    // ...and persisted its result
    expect(md.includes("the summary from before the fold")).toBe(false);
    // and a clean sleep still stamps the crash-honesty marker true
    const meta = JSON.parse(md.match(/<!-- meta: (.*?) -->/s)[1]);
    expect(meta.endedCleanly).toBe(true);
});

test("a failed FINAL write at sleep is LOUD and rethrown, where a boundary write only warns (§2)", async () => {
    const { home, memory } = await freshMemory();
    // Break every write: point persist at a path whose parent is a FILE, so mkdir throws
    // ENOTDIR. The journal (a separate dir) stays writable, as it would in a real disk fault.
    const blocker = path.join(home, "blocker");
    fs.writeFileSync(blocker, "x");
    memory._persistDir = () => path.join(blocker, "sub");

    // A routine boundary write swallows the failure and resolves — the next boundary
    // retries, and a transient hiccup never breaks the rhythm.
    await memory._persist(); // does not throw

    // The FINAL write is the resident's last self: its failure must not be silent.
    await expect(memory._persist({ critical: true })).rejects.toThrow();

    // ...and finalize() propagates it, so the sleep ritual cannot report a clean save
    // that did not happen.
    await expect(memory.finalize("sleep")).rejects.toThrow();
});

test("a boundary write is best-effort (one attempt); the FINAL write retries once before giving up", async () => {
    const { memory } = await freshMemory();
    let calls = 0;
    memory._atomicWrite = async () => { calls++; throw new Error("disk full"); };

    calls = 0;
    await memory._persist();          // boundary: swallowed, single attempt (next boundary retries)
    expect(calls).toBe(1);

    calls = 0;
    await expect(memory._persist({ critical: true })).rejects.toThrow("disk full");
    expect(calls).toBe(2);            // final: one retry before the loud rethrow
});

test("after a failed critical write the queue stays alive — a later write still runs", async () => {
    const { home, memory } = await freshMemory();
    const good = memory._persistDir();
    const blocker = path.join(home, "blocker");
    fs.writeFileSync(blocker, "x");

    // One critical write fails on a broken dir...
    memory._persistDir = () => path.join(blocker, "sub");
    memory.tail = "written while the disk was faulty";
    await expect(memory._persist({ critical: true })).rejects.toThrow();

    // ...the fault clears, and the next write lands normally (the chain was not poisoned).
    memory._persistDir = () => good;
    memory.tail = "written after the disk recovered";
    await memory._persist();
    expect(readMd(home).includes("written after the disk recovered")).toBe(true);
});
