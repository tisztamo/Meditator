// PROVENANCE FILTER WIRING (no LLM, no global mock, no custom-element redefinition).
//
// <m-provenance-filter> is a pure addition: a `stream-filter` mounted inside <m-stream>.
// Nothing in the mind, the stream or memory knows it exists. It builds its allowed set
// from `@attended` (the lines each frame perceived) and the burst's carried prefill; a
// model-authored `> ⟂` line matching neither is a confabulated sense: held back and a
// signal that stops the burst. Its react() then (1) leaves a ⌁ trail through memory's
// generic `backstage` channel and (2) raises the corrective sense as a REAL urgent
// stimulus through the arbiter, so the mind perceives it and continues FROM it.
//
// We drive the stream's chain + stop directly (a fake burst/context) so the test needs no
// LLM. The REAL m-stream / m-memory / m-interrupts / m-provenance-filter are registered by
// loadMindComponents; m-mind is the suite's shared bare stub (no auto-start).
import "./setup.js";
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { delay } from "./setup.js";
import A from "amanita";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, stream, memory, filter;
const notes = [];
let interruptDetail = null;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }

    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream">
          <m-provenance-filter name="prov"></m-provenance-filter>
        </m-stream>
        <m-memory name="memory" persist="off" journal="off"></m-memory>
        <m-interrupts name="attention" threshold="0.35" rateLimit="15s"></m-interrupts>
      </m-mind>
    `;
    await loadMindComponents(document);
    await delay(150);
    mind = document.querySelector("m-mind");
    stream = mind.querySelector('[name="stream"]');
    memory = mind.querySelector('[name="memory"]');
    filter = mind.querySelector('[name="prov"]');

    memory.note = (text, opts = {}) => { notes.push({ text, perceived: opts.perceived !== false }); };
    mind.addEventListener("interrupt", e => { interruptDetail = e.detail; });
});

beforeEach(() => { notes.length = 0; interruptDetail = null; });

// One burst through the stream's real chain, as _startBurst runs it.
function burst(text, { prefill = "" } = {}) {
    const filters = stream._filters();
    for (const f of filters) stream._callFilter(f, "begin", { burstIndex: 1, prefill });
    const fed = stream._feedChain(filters, text);
    return fed.signal ? fed : (r => ({ ...r, emit: fed.emit + r.emit }))(stream._flushChain(filters));
}

test("the filter is found as the stream's stream-filter", () => {
    expect(stream._filters()).toEqual([filter]);
});

test("a confabulated `> ⟂` line is held back and stops the burst", () => {
    const r = burst("the air is warm\n> ⟂ 71.3°\nand I feel it\n");
    expect(r.emit).toBe("the air is warm\n");
    expect(r.signal).toEqual({ kind: "provenance", line: "> ⟂ 71.3°" });
    expect(r.by).toBe(filter);
});

test("a line the mind just perceived (via @attended) passes", () => {
    // The frame's `attended {lines, requestId}` request to memory; the filter only listens.
    mind.fire("attended", { lines: ["a door closes"], requestId: "rq-test-1" });
    const r = burst("I heard\n> ⟂ a door closes\nit was far\n");
    expect(r.signal).toBeNull();
    expect(r.emit).toContain("> ⟂ a door closes");
});

test("a `> ⟂` line already in the carried prefill passes", () => {
    const r = burst("> ⟂ rain on glass\n", { prefill: "earlier\n\n> ⟂ rain on glass\n\n" });
    expect(r.signal).toBeNull();
});

test("the stop raises the corrective as a real urgent stimulus and leaves a ⌁ trail", () => {
    const fake = { aborted: false, abort() { this.aborted = true; } };
    const context = { superseded: false, burst: fake };
    stream._stopBurst(context, filter, { kind: "provenance", line: "> ⟂ 71.3°" }, { burstIndex: 1, burstChars: 10 });
    // Stopped first: superseded (no boundary) and aborted.
    expect(context.superseded).toBe(true);
    expect(fake.aborted).toBe(true);
    // The corrective reached the mind through the arbiter.
    expect(interruptDetail?.type).toBe("Provenance");
    expect(interruptDetail?.reason).toContain("You do not need to come up with a sense");
    // The mechanism's trail went through memory's generic backstage channel.
    const backstage = notes.filter(n => !n.perceived);
    expect(backstage.length).toBe(1);
    expect(backstage[0].text).toContain("> ⟂ 71.3°");
    expect(backstage[0].text).toMatch(/no percept behind it/i);
});
