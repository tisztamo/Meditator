// CONTRACT — Frame ordering (message-rule-async-review.md §3.1 row "Frame ordering":
// mMind.js assembleFrame / _assembleClearFrame → `attended`, `bridge`, `clear-tail`
// events → mMemory.js _onAttended / @bridge (_pendingBridge) / _onClearTail, racing the
// stream's `chunk` topic).
//
// The observable outcome that must survive the migration (§5, M5 "order is carried, not
// assumed": the frame's events and the burst's chunks correlate by a frameId/burstIndex
// instead of by dispatch order):
//   1. A perceived stimulus is journaled (⟂) BEFORE the landing opener that re-anchors
//      the voice, and memory's durable tail has exactly the frame's shape — the `> ⟂`
//      block, then the opener — so the next prefill, the journal and this frame read as
//      one text.
//   2. A utility-model bridge rides the tail but is journaled as a `↪` provenance line,
//      exactly once, never as the mind's own prose.
//   3. After a loop break (`clear-tail`), the frame built next continues from the fresh
//      seed plus what the clear burst said — never from the stale looped tail, and with
//      none of the clear burst's words lost to the reseed.
//
// Why it breaks under async delivery: assembleFrame fires `attended` (and `bridge`)
// and then publishes `prompt`; the stream emits the frame's `prefix` (bridge + opener)
// as a chunk the moment it receives the prompt. Memory journals/appends the stimulus in
// its `attended` listener and marks the pending bridge in its `bridge` listener, which
// today run INSIDE fire() — before the prefix chunk exists. Deferred, the prefix chunk
// can land first: the opener is journaled ahead of the ⟂ line, the bridge is flushed as
// plain prose before its ↪ mark is set, and the tail diverges from the prefill. The
// clear-tail reseed is protected today only by latency (the model's first token comes
// after a timer; the clear frame has no prefix).
//
// Real MMind (subclass tag — the suite registers <m-mind> as a stub), m-stream (dry
// run), m-memory (temp journal), m-interrupts, m-clear-mind. Surroundings: a stimulus
// source and a loop-detector that only publishes `loop`.
import { test, expect, afterEach } from "bun:test";
import A from "amanita";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { waitFor, quiet } from "./helpers.js";
import { loadMindComponents } from "../../../../src/startup/loadMindComponents.js";
import { MMind } from "../../../../src/mindComponents/mind/mMind.js";
import { InterruptRecord } from "../../../../src/infrastructure/interruptRecord.js";

class TFrameMind extends MMind {}
if (!customElements.get("t-frame-mind")) customElements.define("t-frame-mind", TFrameMind);
// A sense in the world: raises one stimulus onto the attention spine, as any source does.
if (!customElements.get("t-frame-source")) customElements.define("t-frame-source", class extends A(HTMLElement) {});
// A loop detector reduced to its published signal (the real one needs a model call).
if (!customElements.get("t-frame-loop")) customElements.define("t-frame-loop", class extends A(HTMLElement) {});

const today = () => new Date().toISOString().slice(0, 10);
const count = (hay, needle) => hay.split(needle).length - 1;

let dir = null, savedDry, mind = null;

async function mount(attrs = "", inner = "") {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "med-frame-contract-"));
    document.body.innerHTML = `
      <t-frame-mind name="framer" pace="300ms" paceSigma="0" ${attrs}
                    imagePerceptSrc="off" embodimentSrc="off" paceFactorSrc="off">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="${dir}/home" journal="${dir}/journal"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <t-frame-source name="world"></t-frame-source>
        ${inner}
      </t-frame-mind>`;
    await loadMindComponents(document);
    mind = document.querySelector("t-frame-mind");
    const stream = mind.querySelector("m-stream");
    const memory = mind.querySelector("m-memory");
    const obs = { prompts: [], chunks: [], tails: [], boundaries: [] };
    mind.on("prompt", p => obs.prompts.push({ at: Date.now(), p }));   // the frames the mind publishes
    stream.on("chunk", t => obs.chunks.push(t));                         // what the voice emits
    memory.on("tail", t => obs.tails.push(t));                           // memory's durable tail
    stream.addEventListener("boundary", () => obs.boundaries.push(Date.now()));
    return { mind, obs };
}

const journal = () => {
    const f = path.join(dir, "journal", `${today()}.md`);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
};

function raise(reason) {
    mind.querySelector("t-frame-source").fire("interrupt-request", new InterruptRecord({
        source: "External", type: "Sense-world", reason, salience: 0.9, urgent: true,
    }));
}

/** The first frame matching `pred`, and the time it was published. */
const frameWhere = (obs, pred) => obs.prompts.find(({ p }) => p && pred(p));

afterEach(async () => {
    if (mind) mind._sleeping = true;        // teardown only: stop the thinking loop before removal
    document.body.replaceChildren();
    await quiet(60);
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = null; mind = null;
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
});

test("a perceived stimulus is journaled before the opener, and the durable tail keeps the frame's shape", async () => {
    const { obs } = await mount();
    expect(await waitFor(() => obs.chunks.length > 3, 4000)).toBeTruthy();

    const REASON = "a bell rings twice somewhere below the window";
    raise(REASON);
    const hit = await waitFor(() => frameWhere(obs, p => p.kind === "redirect" && (p.prefill || "").includes(REASON)), 3000);
    expect(hit).toBeTruthy();
    const frame = hit.p;
    const block = frame.prefill.slice(frame.prefill.lastIndexOf("> ⟂"));   // "> ⟂ …\n\n<opener>"
    const line = block.split("\n")[0];
    const opener = (frame.prefix || "").trim();
    expect(opener.length).toBeGreaterThan(0);
    expect(block.endsWith(frame.prefix)).toBe(true);

    // The redirect burst ends (its boundary flushes the journal)…
    expect(await waitFor(() => obs.boundaries.some(t => t > hit.at), 4000)).toBeTruthy();
    const j = await waitFor(() => journal().includes(line) && journal().includes(opener) && journal(), 2000);
    expect(j).toBeTruthy();
    // …the ⟂ line precedes the opener, and appears once.
    const at = j.indexOf(line);
    expect(count(j, line)).toBe(1);
    expect(j.indexOf(opener)).toBeGreaterThan(at);

    // The durable tail read exactly what the frame said: the event block, then the opener.
    expect(await waitFor(() => obs.tails.some(t => t.includes(block)), 1000)).toBeTruthy();
}, 15000);

test("a utility-model bridge is journaled once, as a ↪ provenance line, never as the mind's prose", async () => {
    const { obs } = await mount(`bridge="true"`);
    expect(await waitFor(() => obs.chunks.length > 3, 4000)).toBeTruthy();

    const REASON = "a door closes somewhere in the house";
    raise(REASON);
    const hit = await waitFor(() => frameWhere(obs, p => p.kind === "redirect" && (p.prefill || "").includes(REASON)), 3000);
    expect(hit).toBeTruthy();
    // The prefix is "<bridge> <opener>"; the opener is one of the landing phrases.
    const prefix = hit.p.prefix || "";
    const bridge = prefix.slice(0, prefix.search(/\.\s/) + 1).trim();   // the bridge sentence(s) end the first ". "
    expect(bridge.length).toBeGreaterThan(10);

    expect(await waitFor(() => obs.boundaries.some(t => t > hit.at), 4000)).toBeTruthy();
    const j = await waitFor(() => journal().includes(bridge) && journal(), 2000);
    expect(j).toBeTruthy();
    await quiet(100);
    const final = journal();
    expect(count(final, bridge)).toBe(1);                     // exactly once…
    expect(final).toContain(`↪ ${bridge}`);                   // …and it is the ↪ line
    // It still rides the tail, so the model continues from it.
    expect(obs.tails.some(t => t.includes(bridge))).toBe(true);
}, 15000);

test("the frame after a loop break continues from the fresh seed — never the stale tail, no clear-burst words lost", async () => {
    const { obs } = await mount("", `
        <t-frame-loop name="loop-detector"></t-frame-loop>
        <m-clear-mind name="clear-mind"></m-clear-mind>`);
    expect(await waitFor(() => obs.chunks.length > 3, 4000)).toBeTruthy();
    const stale = obs.chunks.slice(0, 4).join("").trim();          // words from before the cut
    expect(stale.length).toBeGreaterThan(5);

    mind.querySelector("t-frame-loop").pub("loop", { active: true, at: Date.now(), kind: "presence", score: 0.8 });
    const clear = await waitFor(() => frameWhere(obs, p => p.kind === "clear"), 4000);
    expect(clear).toBeTruthy();
    const seed = clear.p.prefill;
    expect(seed.length).toBeGreaterThan(10);

    // The next ordinary frame, built after the clear burst's boundary.
    const next = await waitFor(() => obs.prompts.find(({ at, p }) => at > clear.at && p && p.kind !== "clear"), 5000);
    expect(next).toBeTruthy();
    const prefill = next.p.prefill || "";
    expect(prefill.startsWith(seed)).toBe(true);                  // continues from the seed…
    expect(prefill.includes(stale)).toBe(false);                  // …not from the looped tail
    // …and keeps what the clear burst actually said (no chunk swallowed by the reseed).
    const clearBurst = prefill.slice(seed.length).trim();
    expect(clearBurst.length).toBeGreaterThan(40);
}, 15000);
