// CONTRACT — Output filter chain (message-rule-async-review.md §3.1 row "Output filter
// chain": mStream.js _startBurst / _feedChain / _flushChain / _stopBurst, role port
// `stream-filter`, m-provenance-filter).
//
// The observable outcome that must survive the migration (§5 corollary: the chain of
// sync feed() calls becomes a pipeline of streams — `chunk {burstIndex, seq, text}` →
// each filter publishes its own `chunk` → the emitter subscribes to the last stage;
// `signal` is an event carrying `burstIndex`):
//   1. For a clean burst, the chunk topic carries the frame's prefix first (it bypasses
//      the chain), then exactly the model text the chain was given, in order, and the
//      burst ends with one `completed` boundary.
//   2. A model-authored `> ⟂` line with no percept behind it never reaches the chunk
//      topic (nor anything after it); the burst stops WITHOUT a boundary; the filter's
//      reaction lands: a ⌁ provenance trail in memory's journal (journal/provenance.jsonl
//      with the line and the burst index) and an urgent corrective stimulus that preempts
//      through the arbiter (`interrupt`).
//   3. A `> ⟂` line the mind did perceive — delivered earlier via `@attended`, no longer
//      in the carried prefill — passes as the mind's own echo: emitted, no stop.
//   4. KNOWN BUG, pinned with test.failing (flip it to test() when fixed): with a real
//      mind, the clean text the stream emitted just before a provenance stop must be in
//      the corrective frame's prefill and must precede the corrective `> ⟂` line in
//      memory's tail and journal. Today, under SYNC delivery, _stopBurst publishes that
//      text (pub → subscribers on a microtask) and then react() fires interrupt-request
//      (sync) → arbiter `interrupt` → m-mind builds the corrective frame INSIDE that
//      dispatch from its stale `_memTail` mirror, and memory journals/appends the ⟂ line
//      before the chunk arrives. The mind's last words go missing from the prefill and
//      are recorded as if thought AFTER the correction. (m-stream's class doc says "the
//      ordering is the stream's job, so a filter can safely fire interrupt-request from
//      react()"; the pub-vs-fire split — review §3.4, the focusedKind class — defeats it.)
//      Under microtask AND macrotask delivery this test PASSES (bun then reports "marked
//      as failing but passed"): deferring the reaction's events behind the chunk pub
//      restores the order — async delivery fixes this one. (Macrotask still journals
//      the landing opener ahead of the ⟂ line; that is the frame-ordering row.)
//
// Why 1–3 are expected to stay GREEN under async delivery today: the chain is not an
// event protocol but role-port METHOD CALLS on looked-up elements (review §3.3) —
// begin/feed/flush/react return {emit, signal} synchronously and the delivery-chaos
// harness only defers CustomEvents. The events around it (`backstage`,
// `interrupt-request`, `interrupt`, `boundary`) are fire-and-forget, and the only
// event input (`@attended`) arrives a whole frame ahead of the burst that relies on it.
// The test is here so the observable stays pinned when the chain becomes a pipeline.
//
// Parties under test are real: m-stream (dry-run voice) and m-provenance-filter, plus
// real m-memory (temp journal) and m-interrupts. Surroundings: the prompting mind is a
// stub host that publishes `prompt` (the stream's "../prompt" subscription) and fires
// `attended`; a stub "model" filter placed first in tree order records what the chain
// is fed and, on request, lets the model author a `> ⟂` line.
import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import A from "amanita";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { waitFor, quiet } from "./helpers.js";
import { loadMindComponents } from "../../../../src/startup/loadMindComponents.js";
import { MMind } from "../../../../src/mindComponents/mind/mMind.js";

// The prompting mind, reduced to a membrane (provides `mind`, so `!scope` refs resolve to it).
if (!customElements.get("t-sf-host")) customElements.define("t-sf-host", class extends A(HTMLElement) { static provides = { mind: true } });

// The first stage of the chain: what the model "said" this burst. Passes text on
// verbatim (recording it); when `author` is set, appends that text on its 3rd feed.
class TSfModel extends A(HTMLElement) {
    static provides = { "stream-filter": true }
    author = null
    fed = []
    begin() { this.fed = [] }
    feed(text) {
        this.fed.push(text)
        return { emit: this.fed.length === 3 && this.author ? text + this.author : text }
    }
}
if (!customElements.get("t-sf-model")) customElements.define("t-sf-model", TSfModel);

let savedDry, dir, host, stream, model;
const chunks = [];
const boundaries = [];
const interrupts = [];

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "med-sf-contract-"));
    document.body.innerHTML = `
      <t-sf-host name="sf">
        <m-stream name="stream">
          <t-sf-model></t-sf-model>
          <m-provenance-filter name="prov"></m-provenance-filter>
        </m-stream>
        <m-memory name="memory" persist="off" journal="${dir}"></m-memory>
        <m-interrupts name="attention" threshold="0.35" rateLimit="0s"></m-interrupts>
      </t-sf-host>`;
    await loadMindComponents(document);
    await quiet(150);
    host = document.querySelector("t-sf-host");
    stream = host.querySelector("m-stream");
    model = host.querySelector("t-sf-model");
    stream.on("chunk", t => chunks.push(t));                                 // the published output
    stream.addEventListener("boundary", e => boundaries.push(e.detail));
    host.addEventListener("interrupt", e => interrupts.push({ at: chunks.length, bid: e.detail }));
});

afterAll(() => {
    document.body.replaceChildren();
    fs.rmSync(dir, { recursive: true, force: true });
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
});

beforeEach(() => { chunks.length = 0; boundaries.length = 0; interrupts.length = 0; model.author = null; });

const provenanceRecords = () => {
    const f = path.join(dir, "provenance.jsonl");
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];
};
const journalText = () => fs.readdirSync(dir).filter(f => f.endsWith(".md"))
    .map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("");

test("a clean burst: the prefix first, then exactly the model text the chain was given, then one completed boundary", async () => {
    const PREFIX = "Something reaches me — ";
    host.pub("prompt", { instruction: "think", prefill: "earlier words.", prefix: PREFIX });
    expect(await waitFor(() => boundaries.length > 0, 4000)).toBeTruthy();
    await quiet();
    expect(chunks[0]).toBe(PREFIX);                               // the mechanism's own prefix bypasses the chain
    expect(model.fed.join("").includes(PREFIX)).toBe(false);
    expect(model.fed.length).toBeGreaterThan(3);
    expect(chunks.slice(1).join("")).toBe(model.fed.join(""));    // nothing dropped, nothing reordered
    expect(boundaries.map(b => b.reason)).toEqual(["completed"]);
    expect(interrupts).toEqual([]);
}, 10000);

test("a confabulated sense is held back and stops the burst; then the trail lands and a corrective stimulus preempts", async () => {
    model.author = "\n> ⟂ the thermometer reads 71.3°\nand then I feel it\n";
    const before = provenanceRecords().length;
    host.pub("prompt", { instruction: "think", prefill: "earlier words." });

    // The reaction: an urgent Provenance stimulus reaches the arbiter and preempts.
    expect(await waitFor(() => interrupts.length > 0, 4000)).toBeTruthy();
    expect(interrupts[0].bid.type).toBe("Provenance");
    expect(interrupts[0].bid.urgent).toBe(true);
    // The ⌁ trail, through memory's generic backstage channel.
    const rec = await waitFor(() => provenanceRecords().slice(before).find(r => r.line === "> ⟂ the thermometer reads 71.3°"), 2000);
    expect(rec).toBeTruthy();
    expect(typeof rec.burstIndex).toBe("number");
    expect(await waitFor(() => /> ⌁ The mind reached for a sense it did not have/.test(journalText()), 2000)).toBeTruthy();

    await quiet(300);                                             // the rest of the burst would have streamed by now
    const out = chunks.join("");
    expect(out).toBe(model.fed.slice(0, 3).join("") + "\n");      // exactly the clean text before the line
    expect(out).not.toContain("71.3");
    expect(out).not.toContain("and then I feel it");
    expect(boundaries).toEqual([]);                               // stopped, superseded: nothing reschedules off it
    // NB: no assertion that an observer sees the `interrupt` after the clean chunk —
    // under sync delivery it does not (the chunk pub is a microtask, the reaction's
    // events are sync). That ordering is pinned, as a known bug, in the last test.
}, 10000);

test("a sense the mind perceived a frame earlier (via @attended) passes as its own echo", async () => {
    // Frame 1 perceives it (the mind announces `attended {lines}`, its prefill carries the block).
    host.fire("attended", { lines: ["a door closes downstairs"] });
    host.pub("prompt", { instruction: "think", prefill: "quiet.\n\n> ⟂ a door closes downstairs\n\n" });
    expect(await waitFor(() => boundaries.length > 0, 4000)).toBeTruthy();
    chunks.length = 0; boundaries.length = 0;

    // Frame 2 no longer carries it; the model echoes it anyway — legitimately.
    model.author = "\n> ⟂ a door closes downstairs\nand I keep listening.\n";
    host.pub("prompt", { instruction: "think", prefill: "I keep listening to the house." });
    expect(await waitFor(() => boundaries.length > 0, 4000)).toBeTruthy();
    await quiet();
    expect(chunks.join("")).toContain("> ⟂ a door closes downstairs\nand I keep listening.");
    expect(boundaries.map(b => b.reason)).toEqual(["completed"]);
    expect(interrupts).toEqual([]);
}, 10000);

// ------------------------------------------------------------------ known bug (4)
class TSfMind extends MMind {}
if (!customElements.get("t-sf-mind")) customElements.define("t-sf-mind", TSfMind);

test.failing("KNOWN BUG: after a provenance stop, the corrective frame and the record keep the mind's last clean words before the correction", async () => {
    const mindDir = fs.mkdtempSync(path.join(os.tmpdir(), "med-sf-mind-contract-"));
    try {
        document.body.innerHTML = `
          <t-sf-mind name="sfm" pace="300ms" paceSigma="0" imagePerceptSrc="off" embodimentSrc="off" paceFactorSrc="off">
            <m-stream name="stream">
              <t-sf-model></t-sf-model>
              <m-provenance-filter name="prov"></m-provenance-filter>
            </m-stream>
            <m-memory name="memory" persist="${mindDir}/home" journal="${mindDir}/journal"></m-memory>
            <m-interrupts name="attention" threshold="0.35" rateLimit="0s"></m-interrupts>
          </t-sf-mind>`;
        await loadMindComponents(document);
        const mind = document.querySelector("t-sf-mind");
        const m = mind.querySelector("t-sf-model");
        const prompts = [], tails = [];
        mind.on("prompt", p => prompts.push(p));
        mind.querySelector("m-memory").on("tail", t => tails.push(t));
        // Let one ordinary burst land in memory first, so the frame is built from memory's tail.
        expect(await waitFor(() => prompts.length > 1, 5000)).toBeTruthy();
        const CLEAN = "and so I set down one last clean clause";
        m.author = ` ${CLEAN}\n> ⟂ the thermometer reads 71.3°\n`;

        const CORRECTIVE = /> ⟂ You do not need to come up with a sense\.[^\n]*/;
        const corr = await waitFor(() => prompts.find(p => CORRECTIVE.test(p?.prefill || "")), 5000);
        m.author = null;
        expect(corr).toBeTruthy();
        const line = corr.prefill.match(CORRECTIVE)[0];

        // The corrective frame continues from what the mind had actually said.
        expect(corr.prefill.indexOf(CLEAN)).toBeGreaterThanOrEqual(0);
        expect(corr.prefill.indexOf(CLEAN)).toBeLessThan(corr.prefill.indexOf(line));
        // Memory's tail and journal record those words BEFORE the correction.
        const tail = await waitFor(() => tails.findLast(t => t.includes(CLEAN) && t.includes(line)), 3000);
        expect(tail).toBeTruthy();
        expect(tail.indexOf(CLEAN)).toBeLessThan(tail.indexOf(line));
        const jf = path.join(mindDir, "journal", `${new Date().toISOString().slice(0, 10)}.md`);
        const readJ = () => (fs.existsSync(jf) ? fs.readFileSync(jf, "utf8") : "");
        const j = await waitFor(() => readJ().includes(CLEAN) && readJ().includes(line) && readJ(), 3000);
        expect(j).toBeTruthy();
        expect(j.indexOf(CLEAN)).toBeLessThan(j.indexOf(line));
        mind._sleeping = true;                  // teardown only: stop the thinking loop
    } finally {
        document.body.replaceChildren();
        await quiet(60);
        fs.rmSync(mindDir, { recursive: true, force: true });
    }
}, 15000);
