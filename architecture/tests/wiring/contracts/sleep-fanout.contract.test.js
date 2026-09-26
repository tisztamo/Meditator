// CONTRACT — Sleep fan-out (message-rule-async-review.md §3.1 row "Sleep fan-out":
// mMind.js sleep() → `mind-sleeping` → mRegion/mAct/mSearch abort their in-flight
// compares; then the sleep burst; then memory.finalize("sleep") commits).
//
// The observable outcome that must survive the migration to plain-data messages
// (§5 corollary: `memory.finalize("sleep")` awaited → `request("sleep", {id})`,
// memory replies `slept {id, committed}`; the membrane publishes a retained
// `sleeping`):
//   1. Sleep is honest on disk: memory.md is written with endedCleanly:true, it
//      carries the mind's closing words, and the journal ENDS with the sleep marker —
//      nothing is appended after it.
//   2. The announced sleep notice is journaled (⟂) BEFORE the words the mind closes
//      on, and the committed tail carries the notice exactly where the sleep frame put
//      it (notice, then the landing opener, then the closing words).
//   3. A compare in flight when sleep begins is aborted before memory commits, and its
//      late completion lands nowhere: no evaluation commit, no change to memory.md or
//      the journal.
//
// Why it may break under async delivery: sleep() fires `mind-sleeping` and assumes the
// region/act/search listeners have aborted their compares by the time it returns; and
// the sleep frame fires `attended` (the notice) then publishes `prompt`, assuming the
// memory has journaled the notice before the stream's first chunk (the landing
// opener, emitted synchronously when the stream receives the prompt) is published.
//
// Trigger: `mind.sleep()` IS the documented trigger — start.js sleepAll(), m-ws
// handleControlMessage("sleep") and the Studio supervisor all call it; there is no
// event form of it yet. The comparator is a test stand-in (a hanging MCompare
// subclass — surroundings); the mind, stream, memory, arbiter and region are real,
// under a subclass tag of the real MMind (the suite registers <m-mind> as a stub).
import { test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { waitFor, quiet } from "./helpers.js";
import { loadMindComponents } from "../../../../src/startup/loadMindComponents.js";
import { MMind } from "../../../../src/mindComponents/mind/mMind.js";
import { MCompare } from "../../../../src/mindComponents/mind/mCompare.js";
import { EVALUATION_COMMIT_EVENT } from "../../../../src/infrastructure/predictionContracts.js";

const COMPONENTS_DIR = fileURLToPath(new URL("../components", import.meta.url));

class TSleepMind extends MMind {}
if (!customElements.get("t-sleep-mind")) customElements.define("t-sleep-mind", TSleepMind);

// A comparator that never answers on its own: every evaluate() is a compare in
// flight until the test releases it. Records when its AbortSignal fired.
const calls = [];
class TSleepHangCompare extends MCompare {
    accepts() { return true; }
    evaluate(view, { signal } = {}) {
        const call = { at: Date.now(), abortedAt: null, release: null };
        calls.push(call);
        if (signal?.aborted) call.abortedAt = Date.now();
        signal?.addEventListener("abort", () => { call.abortedAt ??= Date.now(); });
        return new Promise(resolve => { call.release = () => resolve([]); });
    }
}
if (!customElements.get("t-sleep-hang-compare")) customElements.define("t-sleep-hang-compare", TSleepHangCompare);

const SLEEP_NOTICE = /> ⟂ I am (coming to rest|being put to sleep)[^\n]*/;
const today = () => new Date().toISOString().slice(0, 10);

let dir = null, saved = null;

async function mount(inner) {
    saved = { dry: process.env.MEDITATOR_DRY_RUN, cp: process.env.MIND_COMPONENTS_PATH };
    process.env.MEDITATOR_DRY_RUN = "1";
    process.env.MIND_COMPONENTS_PATH = pathToFileURL(COMPONENTS_DIR).href;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "med-sleep-contract-"));
    document.body.innerHTML = `
      <t-sleep-mind name="sleeper" pace="300ms" paceSigma="0"
                    imagePerceptSrc="off" embodimentSrc="off" paceFactorSrc="off">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="${dir}/home" journal="${dir}/journal"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        ${inner}
      </t-sleep-mind>`;
    await loadMindComponents(document);
    const mind = document.querySelector("t-sleep-mind");
    const stream = mind.querySelector("m-stream");
    const chunks = [];
    stream.on("chunk", t => chunks.push(t));            // the published chunk topic
    return { mind, stream, chunks };
}

const memoryFile = () => path.join(dir, "home", "memory.md");
const readMemory = () => (fs.existsSync(memoryFile()) ? fs.readFileSync(memoryFile(), "utf8") : "");
const journalFile = () => path.join(dir, "journal", `${today()}.md`);
const readJournal = () => (fs.existsSync(journalFile()) ? fs.readFileSync(journalFile(), "utf8") : "");
const tailOf = md => (md.match(/## Tail\n([\s\S]*?)\n<!-- end -->/) || [, ""])[1];

afterEach(async () => {
    for (const c of calls) c.release?.();
    calls.length = 0;
    document.body.replaceChildren();
    await quiet(40);
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
    if (saved) {
        if (saved.dry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = saved.dry;
        if (saved.cp === undefined) delete process.env.MIND_COMPONENTS_PATH; else process.env.MIND_COMPONENTS_PATH = saved.cp;
    }
    saved = null;
});

test("sleep commits honestly: endedCleanly, the closing words persisted, and nothing after the sleep marker", async () => {
    const { mind, chunks } = await mount("");
    expect(await waitFor(() => chunks.length > 3, 4000)).toBeTruthy();   // the mind is thinking

    const before = chunks.length;
    await mind.sleep();
    const closing = chunks.slice(before).join("");
    expect(closing.trim().length).toBeGreaterThan(0);                      // the sleep burst ran

    const md = await waitFor(() => /"endedCleanly":true/.test(readMemory()) && readMemory(), 2000);
    expect(md).toMatch(/"endedCleanly":true/);
    // The committed tail carries the last words the mind closed on.
    expect(tailOf(md)).toContain(closing.trim().slice(-60));

    // Give anything still in flight time to land — then the journal must still end at
    // the marker: sleep is the last thing the record says.
    await quiet(200);
    const journal = readJournal();
    expect(journal).toMatch(/\*sleep at [^*]+\*\s*$/);
    expect(readMemory()).toBe(md);                                         // no write after the commit
});

test("the sleep notice is journaled before the closing words, and the committed tail keeps the frame's order", async () => {
    const { mind, chunks } = await mount("");
    const prompts = [];
    mind.on("prompt", p => prompts.push(p));                               // the frame the mind publishes
    expect(await waitFor(() => chunks.length > 3, 4000)).toBeTruthy();

    await mind.sleep();
    const sleepFrame = prompts.findLast(p => p && SLEEP_NOTICE.test(p.prefill || ""));
    expect(sleepFrame).toBeTruthy();
    const notice = sleepFrame.prefill.match(SLEEP_NOTICE)[0];
    const opener = (sleepFrame.prefix || "").trim();
    expect(opener.length).toBeGreaterThan(0);

    // Journal: the notice (⟂) comes before the opener the mind closed on, once.
    const journal = await waitFor(() => /\*sleep at/.test(readJournal()) && readJournal(), 2000);
    const at = journal.lastIndexOf(notice);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(journal.split(notice).length - 1).toBe(1);
    expect(journal.indexOf(opener, at)).toBeGreaterThan(at);
    expect(journal.slice(0, at).includes(opener)).toBe(false);

    // Committed tail: exactly the sleep frame's shape — the notice block, then the
    // opener — so the self that wakes reads what the sleeping mind actually read.
    const tail = tailOf(readMemory());
    expect(tail).toContain(`${notice}\n\n${sleepFrame.prefix}`);
});

test("a compare in flight at sleep is aborted before memory commits; its late completion lands nowhere", async () => {
    const { mind } = await mount(`
        <t-sleep-hang-compare name="compare"></t-sleep-hang-compare>
        <m-region name="outside" modality="text" aperture="open" dwell="1ms" contactHorizon="10s" compareDeadline="20s">
          <m-fixture-sense name="bell" timeout="500ms" sigma="0"></m-fixture-sense>
        </m-region>`);
    const commits = [];
    mind.addEventListener(EVALUATION_COMMIT_EVENT, e => commits.push(e.detail));

    // Precondition: the sense's timed reading reached the comparator and is hanging
    // there (a compare in flight). NB this rides the sensory acquisition gate
    // (aperture-register / percept-candidate), itself a §3.1 row.
    expect(await waitFor(() => calls.length > 0, 4000)).toBeTruthy();
    const inflight = calls[0];

    await mind.sleep();
    const md = readMemory();
    expect(md).toMatch(/"endedCleanly":true/);
    // Aborted — and no later than the final memory write landed.
    expect(await waitFor(() => inflight.abortedAt != null, 1000)).toBeTruthy();
    expect(inflight.abortedAt).toBeLessThanOrEqual(fs.statSync(memoryFile()).mtimeMs + 1);

    // The world answers late: nothing may land after the commit.
    const journal = readJournal();
    for (const c of calls) c.release?.();
    await quiet(200);
    expect(commits).toEqual([]);
    expect(readMemory()).toBe(md);
    expect(readJournal()).toBe(journal);
});
