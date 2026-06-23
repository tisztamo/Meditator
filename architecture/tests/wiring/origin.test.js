// The ORIGIN seed — separating the seed of the SELF (the <m-mind> identity / system
// prompt) from the seed of the THOUGHT (the one matter a mind is first set upon).
//
// Two halves, wired the decoupled way (decoupling.md): m-origin is a PRODUCER that
// publishes its content on `prompt`; m-mind is the CONSUMER that mirrors it through
// an overridable ref and, at birth, raises it once as an Origin stimulus.
//
//   - Producer: built with the real components (m-mind stubbed as in every wiring
//     test) — assert <m-origin> publishes its text so the mind can subscribe, never
//     a querySelector reach-in.
//   - Consumer: m-mind's _seedIfFresh decision, exercised directly on a fake mind —
//     no thinking loop, no model. It is what turns the mirrored origin into the
//     first thought, and only for a freshly-born mind.
import { test, expect, beforeAll } from "bun:test";
import A from "amanita";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { MMind } from "../../../src/mindComponents/mMind.js";

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
});

// ----------------------------------------------------------------- producer

test("m-origin publishes its text content on `prompt`, for the mind to subscribe", async () => {
    document.body.innerHTML = `
      <m-mind name="t1">
        <m-origin name="origin">For a positive integer n, are there infinitely many balanced integers?</m-origin>
      </m-mind>
    `;
    await loadMindComponents(document);
    await delay(50);

    const mind = document.querySelector("m-mind");
    let seen = null;
    // From the mind, a child's topic is addressed <childName>/<topic> — the same
    // shape the real m-mind mirrors via its `..m-mind/<name>/prompt` ref.
    await mind.sub("origin/prompt", v => { seen = v; });
    await delay(10);

    expect(typeof seen).toBe("string");
    expect(seen.includes("balanced integers")).toBe(true);
});

test("a `prompt=\"…\"` attribute overrides the text content", async () => {
    document.body.innerHTML = `
      <m-mind name="t2">
        <m-origin name="origin" prompt="the stated problem">ignored body</m-origin>
      </m-mind>
    `;
    await loadMindComponents(document);
    await delay(50);

    const mind = document.querySelector("m-mind");
    let seen = null;
    await mind.sub("origin/prompt", v => { seen = v; });
    await delay(10);

    expect(seen).toBe("the stated problem");
});

// ----------------------------------------------------------------- consumer

/** A minimal stand-in for a connected m-mind: just the fields _seedIfFresh reads,
 *  plus a fire() that records what it raises (Amanita's fire dispatches a CustomEvent
 *  whose detail is the payload). No DOM, no loop, no model. */
function fakeMind(over = {}) {
    const raised = [];
    return {
        _seeded: false,
        _memTail: "", _memRecent: "", _memStory: "",
        _originText: "",
        fire(name, detail) { const e = new CustomEvent(name, { detail, bubbles: true }); raised.push(e); return e; },
        _raised: raised,
        ...over,
    };
}

test("a freshly-born mind raises its origin once, as an Origin stimulus", () => {
    const m = fakeMind({ _originText: "Are there infinitely many balanced integers?" });
    MMind.prototype._seedIfFresh.call(m);

    expect(m._raised.length).toBe(1);
    const rec = m._raised[0].detail;
    expect(rec.type).toBe("Origin");
    expect(rec.source).toBe("Internal");
    expect(rec.salience).toBe(1);
    expect(rec.reason.includes("balanced integers")).toBe(true);
});

test("a mind that woke up remembering is never re-seeded", () => {
    // Any loaded memory tier means the origin already lives in memory (kept or
    // faded) — re-injecting it would deny the mind its own forgetting.
    for (const memory of [{ _memTail: "…last words" }, { _memRecent: "…lately" }, { _memStory: "…long ago" }]) {
        const m = fakeMind({ _originText: "the problem", ...memory });
        MMind.prototype._seedIfFresh.call(m);
        expect(m._raised.length).toBe(0);
    }
});

test("seeding fires at most once even if called again", () => {
    const m = fakeMind({ _originText: "the problem" });
    MMind.prototype._seedIfFresh.call(m);
    MMind.prototype._seedIfFresh.call(m);
    expect(m._raised.length).toBe(1);
});

test("a mind with no origin seeds nothing", () => {
    const m = fakeMind({ _originText: "" });
    MMind.prototype._seedIfFresh.call(m);
    expect(m._raised.length).toBe(0);
});
