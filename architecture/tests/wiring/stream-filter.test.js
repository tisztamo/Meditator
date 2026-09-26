// STREAM OUTPUT FILTER CHAIN (role port `stream-filter`) + the generic BACKSTAGE channel.
//
// m-stream runs the model's text through every `stream-filter` provider inside it (tree
// order) BEFORE emission. A filter can pass, rewrite or hold text back; a `signal` stops the
// burst — the stream aborts and supersedes FIRST (no boundary) and only then calls the
// filter's react(). The mechanism's own `prefix` bypasses the chain.
//
// m-memory's `@backstage` channel journals any component's mechanism trail as a ⌁ note
// (+ a typed journal/<kind>.jsonl line), so a new mechanism needs no handler in memory.
//
// Test filters are plain objects for the chain logic, and ONE uniquely-named test element
// (never a redefinition of a real tag — the wiring suite shares one DOM) for the real,
// dry-run burst.
import "./setup.js";
import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { delay } from "./setup.js";
import A from "amanita";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, stream, memory, probe, savedDry;
const notes = [];
const chunks = [];
const boundaries = [];

// A test filter element: upper-cases what it passes; stops the burst on its `stopAt`-th feed.
class TShoutFilter extends A(HTMLElement) {
    static provides = { "stream-filter": true }
    stopAt = Infinity
    feeds = 0
    began = null
    reacted = null
    stateAtReact = null
    begin(ctx) { this.began = ctx; this.feeds = 0 }
    feed(text) {
        this.feeds += 1
        return this.feeds >= this.stopAt ? { emit: "", signal: { why: "enough" } } : { emit: text.toUpperCase() }
    }
    react(signal, info) { this.reacted = { signal, info }; this.stateAtReact = stream.streamState }
}

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";
    if (!customElements.get("m-mind")) customElements.define("m-mind", class extends A(HTMLElement) {});
    if (!customElements.get("t-shout-filter")) customElements.define("t-shout-filter", TShoutFilter);

    document.body.innerHTML = `
      <m-mind name="sf">
        <m-stream name="stream">
          <t-shout-filter></t-shout-filter>
        </m-stream>
        <m-memory name="memory" persist="off" journal="off"></m-memory>
      </m-mind>
    `;
    await loadMindComponents(document);
    await delay(150);
    mind = document.querySelector('m-mind[name="sf"]');
    stream = mind.querySelector('[name="stream"]');
    memory = mind.querySelector('[name="memory"]');
    probe = mind.querySelector("t-shout-filter");
    memory.note = (text, opts = {}) => { notes.push({ text, perceived: opts.perceived !== false }); };
    stream.sub("chunk", t => chunks.push(t));
    mind.addEventListener("boundary", e => boundaries.push(e.detail));
});

afterAll(() => {
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
});

beforeEach(() => { notes.length = 0; chunks.length = 0; boundaries.length = 0; probe.stopAt = Infinity; probe.reacted = null; });

test("the stream finds its filters by role, in tree order", () => {
    expect(stream._filters()).toEqual([probe]);
});

test("no filters is a pass-through", () => {
    expect(stream._feedChain([], "hello")).toEqual({ emit: "hello", signal: null });
    expect(stream._flushChain([])).toEqual({ emit: "", signal: null });
});

test("filters run in order, each seeing what the one above it passed", () => {
    const a = { feed: t => ({ emit: t + "a" }) };
    const b = { feed: t => ({ emit: t + "b" }) };
    expect(stream._feedChain([a, b], "x").emit).toBe("xab");
    expect(stream._feedChain([b, a], "x").emit).toBe("xba");
});

test("a stop still runs the text passed before it through the filters below", () => {
    const stop = { feed: t => ({ emit: "before ", signal: { s: 1 } }) };
    const shout = { feed: t => ({ emit: t.toUpperCase() }) };
    const r = stream._feedChain([stop, shout], "before BAD after");
    expect(r.emit).toBe("BEFORE ");
    expect(r.signal).toEqual({ s: 1 });
    expect(r.by).toBe(stop);
});

test("flush releases held text through the filters below before flushing them", () => {
    let held = "";
    const holder = { feed: t => { held += t; return { emit: "" } }, flush: () => ({ emit: held }) };
    const shout = { feed: t => ({ emit: t.toUpperCase() }) };
    stream._feedChain([holder, shout], "late line");
    expect(stream._flushChain([holder, shout]).emit).toBe("LATE LINE");
});

test("a broken filter degrades to no filter, never kills the burst", () => {
    const broken = { feed: () => { throw new Error("boom") } };
    const nothing = { feed: () => undefined };
    expect(stream._feedChain([broken, nothing], "safe").emit).toBe("safe");
});

test("a real burst: model text runs through the chain, the prefix bypasses it", async () => {
    await stream._startBurst({ instruction: "think", prefix: "prefix-as-is " }, stream._generation);
    const text = chunks.join("");
    expect(text.startsWith("prefix-as-is ")).toBe(true);
    const model = text.slice("prefix-as-is ".length);
    expect(model.length).toBeGreaterThan(0);
    expect(model).toBe(model.toUpperCase());
    expect(probe.began?.prefix).toBe("prefix-as-is ");
    expect(boundaries.at(-1)?.reason).toBe("completed");
});

test("a signal stops the burst first (no boundary), then the filter reacts", async () => {
    probe.stopAt = 3;
    await stream._startBurst({ instruction: "think" }, stream._generation);
    expect(boundaries.length).toBe(0);               // superseded: nothing reschedules off it
    expect(probe.reacted?.signal).toEqual({ why: "enough" });
    expect(probe.reacted?.info.burstIndex).toBe(stream.burstIndex);
    expect(probe.stateAtReact).toBe("idle");         // the stream had already stopped
    expect(stream._current).toBeNull();
    expect(chunks.join("").length).toBeGreaterThan(0); // the two passed feeds were emitted
});

test("backstage: any component's trail becomes a ⌁ note in memory", () => {
    probe.fire("backstage", { text: "a mechanism did a thing", kind: "probe", record: { n: 1 } });
    expect(notes).toEqual([{ text: "a mechanism did a thing", perceived: false }]);
});

test("backstage: a record-only trail leaves no note", () => {
    probe.fire("backstage", { kind: "probe", record: { n: 2 } });
    expect(notes.length).toBe(0);
});
