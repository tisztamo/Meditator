// STREAM OUTPUT FILTER CHAIN (role `stream-filter`) + the generic BACKSTAGE channel.
//
// m-stream runs the model's text through every `stream-filter` part inside it (tree
// order) BEFORE emission, asking each stage by name with a `filter` request
// (shared/streamFilters.js). A filter can pass, rewrite or hold text back; a `signal`
// stops the burst — the stream aborts and supersedes FIRST (no boundary) and only then
// fires `filter-stopped`, on which the filter reacts. The mechanism's own `prefix`
// bypasses the chain.
//
// m-memory's `@backstage` channel journals any component's mechanism trail as a ⌁ note
// (+ a typed journal/<kind>.jsonl line), so a new mechanism needs no handler in memory.
//
// The chain's composition is tested with a fake `ask` over plain objects, and ONE
// uniquely-named test element (never a redefinition of a real tag — the wiring suite
// shares one DOM) serves the real, dry-run burst.
import "./setup.js";
import { test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { delay } from "./setup.js";
import { waitFor } from "./contracts/helpers.js";
import A from "amanita";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { MStreamFilter, FilterChain, chainStages, feedChain, flushChain } from "../../../src/mindComponents/shared/streamFilters.js";

let mind, stream, memory, probe, savedDry;
const notes = [];
const chunks = [];
const boundaries = [];

// A test filter element: upper-cases what it passes; stops the burst on its `stopAt`-th feed.
class TShoutFilter extends MStreamFilter {
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
          <t-shout-filter name="shout"></t-shout-filter>
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

// A fake `ask` over plain objects {feed?, flush?}, keyed by stage name.
const askOf = filters => async (stage, op, text) => {
    const f = filters[stage];
    const r = op === "feed" ? f.feed?.(text) : f.flush?.();
    return r ? { emit: r.emit ?? "", signal: r.signal || null } : (op === "feed" ? { emit: text, signal: null } : { emit: "", signal: null });
};

test("the stream names its filters by role, in tree order", () => {
    expect(chainStages(stream)).toEqual(["shout"]);
});

test("no filters is a pass-through", async () => {
    expect(await feedChain([], "hello", askOf({}))).toEqual({ emit: "hello", signal: null });
    expect(await flushChain([], askOf({}))).toEqual({ emit: "", signal: null });
});

test("filters run in order, each seeing what the one above it passed", async () => {
    const ask = askOf({ a: { feed: t => ({ emit: t + "a" }) }, b: { feed: t => ({ emit: t + "b" }) } });
    expect((await feedChain(["a", "b"], "x", ask)).emit).toBe("xab");
    expect((await feedChain(["b", "a"], "x", ask)).emit).toBe("xba");
});

test("a stop still runs the text passed before it through the filters below", async () => {
    const ask = askOf({
        stop: { feed: () => ({ emit: "before ", signal: { s: 1 } }) },
        shout: { feed: t => ({ emit: t.toUpperCase() }) },
    });
    const r = await feedChain(["stop", "shout"], "before BAD after", ask);
    expect(r.emit).toBe("BEFORE ");
    expect(r.signal).toEqual({ s: 1 });
    expect(r.by).toBe("stop");
});

test("flush releases held text through the filters below before flushing them", async () => {
    let held = "";
    const ask = askOf({
        holder: { feed: t => { held += t; return { emit: "" } }, flush: () => ({ emit: held }) },
        shout: { feed: t => ({ emit: t.toUpperCase() }) },
    });
    await feedChain(["holder", "shout"], "late line", ask);
    expect((await flushChain(["holder", "shout"], ask)).emit).toBe("LATE LINE");
});

test("a broken filter degrades to no filter, never kills the burst", async () => {
    const saved = probe.feed;
    probe.feed = () => { throw new Error("boom") };
    try {
        const chain = await FilterChain.open(stream, { burstIndex: 99 });
        expect(await chain.feed("safe")).toEqual({ emit: "safe", signal: null });
    } finally { probe.feed = saved; }
});

test("a filter silent past the deadline is dropped for the burst; its text passes", async () => {
    const saved = probe.feed;
    probe.feed = () => new Promise(() => {});
    try {
        const chain = await FilterChain.open(stream, { burstIndex: 98 }, { deadline: 50 });
        expect(await chain.feed("first")).toEqual({ emit: "first", signal: null });
        expect(chain.live).toEqual([]);
        expect(await chain.feed("second")).toEqual({ emit: "second", signal: null });
    } finally { probe.feed = saved; }
});

test("a real burst: model text runs through the chain, the prefix bypasses it", async () => {
    await stream._startBurst({ instruction: "think", prefix: "prefix-as-is " }, stream._generation);
    const text = chunks.join("");
    expect(text.startsWith("prefix-as-is ")).toBe(true);
    const model = text.slice("prefix-as-is ".length);
    expect(model.length).toBeGreaterThan(0);
    expect(model).toBe(model.toUpperCase());
    expect(probe.began?.prefix).toBe("prefix-as-is ");
    expect(await waitFor(() => boundaries.at(-1)?.reason, 3000)).toBe("completed");
});

test("a signal stops the burst first (no boundary), then the filter reacts", async () => {
    probe.stopAt = 3;
    await stream._startBurst({ instruction: "think" }, stream._generation);
    expect(await waitFor(() => probe.reacted, 3000)).toBeTruthy();
    expect(boundaries.length).toBe(0);               // superseded: nothing reschedules off it
    expect(probe.reacted?.signal).toEqual({ why: "enough" });
    expect(probe.reacted?.info.burstIndex).toBe(stream.burstIndex);
    expect(probe.stateAtReact).toBe("idle");         // the stream had already stopped
    expect(stream._current).toBeNull();
    expect(chunks.join("").length).toBeGreaterThan(0); // the two passed feeds were emitted
});

test("backstage: any component's trail becomes a ⌁ note in memory", async () => {
    probe.fire("backstage", { text: "a mechanism did a thing", kind: "probe", record: { n: 1 } });
    await waitFor(() => notes.length > 0);
    expect(notes).toEqual([{ text: "a mechanism did a thing", perceived: false }]);
});

test("backstage: a record-only trail leaves no note", async () => {
    probe.fire("backstage", { kind: "probe", record: { n: 2 } });
    await delay(30);
    expect(notes.length).toBe(0);
});
