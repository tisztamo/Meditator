// Studio stream display — the flow-mode metered reveal, inline burst seam, and
// the flow/raw toggle. Drives the reveal pump with synthetic timestamps (rAF is
// stubbed out) so the cadence is deterministic.
import "./setup.js";
import { test, expect } from "bun:test";
import { delay } from "./setup.js";
import { StudioStream } from "../../../src/studio/ui/studioStream.js";
import "../../../src/studio/ui/studioStreamMode.js";   // registers studio-streammode (the header toggle)

// Run a body with an isolated localStorage so the toggle's persisted preference
// cannot leak into other tests (and is not read from a leaked one).
async function withIsolatedPrefs(fn) {
  const saved = globalThis.localStorage, store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
  try { await fn(); } finally { globalThis.localStorage = saved; }
}

// A focused studio-stream in FLOW mode, with the reveal loop's self-scheduling
// disabled (we pump by hand). The mode is owned by studio-streammode and arrives
// via setMode(); these reveal/raw/batch tests drive flow directly. (The default is
// "fold" — see the dedicated test and mkFold() below.)
function mk() {
    document.body.innerHTML = `<studio-stream></studio-stream>`;
    const el = document.querySelector("studio-stream");
    el._req = () => null;       // disable auto-scheduling; tests pump manually
    el.setMode("flow");
    return el;
}

// A focused studio-stream in the default FOLD mode.
function mkFold() {
    document.body.innerHTML = `<studio-stream></studio-stream>`;
    const el = document.querySelector("studio-stream");
    el._req = () => null;
    el.setMode("fold");         // no-op when already fold; explicit against pref leakage
    return el;
}

// Pump from t=0 in 250ms-capped steps until the buffer drains (or we give up).
function drain(el) {
    for (let t = 0; el.q.length && t < 60000; t += 250) el._pump(t);
}

test("defaults to fold mode", () => {
    document.body.innerHTML = `<studio-stream></studio-stream>`;
    const el = document.querySelector("studio-stream");
    expect(el.mode).toBe("fold");
});

test("flow mode reveals text gradually rather than dumping it", () => {
    const el = mk();
    el.tickMs = 1000;
    el.prime();
    el.onFragment({ kind: "thought", content: "A".repeat(300) });

    el._pump(0);            // first frame primes the clock, minimal reveal
    el._pump(120);          // ~120ms of an ~850ms window
    const shown = el.textContent.length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(300);   // NOT the whole burst at once
});

test("the burst boundary becomes an inline seam, ordered after its text", () => {
    const el = mk();
    el.tickMs = 1000;
    el.prime();
    el.onFragment({ kind: "thought", content: "A".repeat(100) });
    el.onEvent({ process: "stream", kind: "boundary", reason: "completed" });
    el.onFragment({ kind: "thought", content: "B".repeat(50) });

    // Early on, before 100 chars are revealed, the seam must not have appeared.
    el._pump(0); el._pump(60);
    expect(el.querySelector(".seam")).toBeNull();

    drain(el);
    expect(el.q.length).toBe(0);
    expect(el.querySelectorAll(".seam").length).toBe(1);     // one inline seam
    expect(el.querySelector(".bnd")).toBeNull();             // not a full divider
    expect(el.textContent).toBe("A".repeat(100) + "B".repeat(50));
});

test("mind/pace telemetry sets the reveal window", () => {
    const el = mk();
    el.onEvent({ process: "mind", kind: "pace", tickMs: 4321 });
    expect(el.tickMs).toBe(4321);
});

test("raw mode appends instantly and draws a full-width divider", () => {
    const el = mk();
    el.setMode("raw");                     // flow -> raw (as studio-streammode publishes)
    expect(el.mode).toBe("raw");

    el.prime();
    el.onFragment({ kind: "thought", content: "hello" });
    expect(el.textContent).toContain("hello");            // no pumping needed
    el.onEvent({ process: "stream", kind: "boundary", reason: "completed" });
    expect(el.querySelector(".bnd")).toBeTruthy();
    expect(el.querySelector(".bnd").textContent).toBe("burst");
});

test("switching out of flow flushes the buffer (nothing stranded)", () => {
    const el = mk();
    el.prime();
    el.onFragment({ kind: "thought", content: "Z".repeat(100) });
    expect(el.textContent.length).toBe(0);   // still buffered
    el.setMode("raw");                        // flush + switch to raw
    expect(el.textContent.length).toBe(100);
    expect(el.q.length).toBe(0);
});

test("renderBatch paints a backlog instantly and in order — no animation queued", () => {
    const el = mk();
    el.renderBatch([
        { k: "thought", t: "I was thinking " },
        { k: "stim", t: "a voice arrives" },
        { k: "speech", t: "out loud" },
        { k: "thought", t: "and then more" },
    ]);
    expect(el.q.length).toBe(0);                              // nothing left to animate
    expect(el._awaitingBatch).toBe(false);
    expect(el.querySelector(".say")).toBeTruthy();
    expect(el.querySelector(".stim")).toBeTruthy();
    // order preserved across kinds
    const text = el.textContent;
    expect(text.indexOf("thinking")).toBeLessThan(text.indexOf("a voice"));
    expect(text.indexOf("a voice")).toBeLessThan(text.indexOf("out loud"));
    expect(text.indexOf("out loud")).toBeLessThan(text.indexOf("and then more"));
});

test("renderBatch replays a speaking transition so following thought is thinned", () => {
    const el = mk();
    el.renderBatch([{ k: "speaking", on: true }, { k: "thought", t: "quiet now" }]);
    expect(el.speaking).toBe(true);
    expect(el.querySelector("p.thinned")).toBeTruthy();
});

test("renderBatch renders an image from a served URL and counts its weight", () => {
    const el = mk();
    el.renderBatch([{ k: "image", src: "/studio/image/42", prompt: "a lantern" }]);
    const img = el.querySelector(".image-card img");
    expect(img && img.getAttribute("src")).toBe("/studio/image/42");
    expect(el.chars).toBeGreaterThan(1000);                  // image weight, not just the prompt
});

test("a hidden tab appends instantly instead of growing the reveal queue", () => {
    const el = mk();
    el.setHidden(true);
    el.onFragment({ kind: "thought", content: "Y".repeat(80) });
    expect(el.q.length).toBe(0);                             // not buffered behind a throttled rAF
    expect(el.textContent.length).toBe(80);                  // shown at once
    el.setHidden(false);
    el.onFragment({ kind: "thought", content: "Z".repeat(20) });
    expect(el.q.length).toBe(1);                             // visible again → metered reveal resumes
});

test("projection events are ignored while awaiting the backfill batch", () => {
    const el = mk();
    el._awaitingBatch = true;                                 // as set by focusReset / replayResume
    el.onEvent({ process: "attention", kind: "urgent", reason: "stale snapshot" });
    expect(el.querySelector(".stim")).toBeNull();            // not rendered into the stream
    expect(el.q.length).toBe(0);
});

// ---------------------------------------------------------------- fold mode

test("fold mode gathers thought into one live fold (opening + tail), not paragraphs", () => {
    const el = mkFold();
    el.prime();
    el.onFragment({ kind: "thought", content: "I keep returning to the balanced numbers. Their divisors arrange about them." });
    const fold = el.querySelector(".fold.live");
    expect(fold).toBeTruthy();
    expect(fold.querySelector(".begin").textContent).toContain("balanced numbers");
    expect(fold.querySelector(".ghost").textContent.length).toBeGreaterThan(0);   // live tail
    expect(el.querySelector("p")).toBeNull();                // no flowing paragraphs
    expect(el.querySelector(".seam")).toBeNull();
});

test("a burst boundary bumps the live fold's count, drawing no divider", () => {
    const el = mkFold();
    el.prime();
    el.onFragment({ kind: "thought", content: "first burst of thought here" });
    el.onEvent({ process: "stream", kind: "boundary", reason: "completed" });
    el.onFragment({ kind: "thought", content: " second burst continues the run" });
    expect(el.querySelector(".bnd")).toBeNull();
    expect(el.querySelector(".fold.live .status").textContent).toContain("1 burst");
    expect(el.querySelectorAll(".fold").length).toBe(1);     // still one block
});

test("speech closes the live fold and renders a full say card", () => {
    const el = mkFold();
    el.prime();
    el.onFragment({ kind: "thought", content: "a stretch of private thinking before speaking" });
    expect(el.querySelector(".fold.live")).toBeTruthy();
    el.onFragment({ kind: "speech", content: "out loud now" });
    expect(el.querySelector(".fold.live")).toBeNull();       // settled
    expect(el.querySelector(".fold")).toBeTruthy();          // a closed fold remains
    expect(el.querySelector(".say").textContent).toContain("out loud now");
});

test("a stimulus closes the live fold and stays a full marker", () => {
    const el = mkFold();
    el.prime();
    el.onFragment({ kind: "thought", content: "thinking that gets interrupted" });
    el.onEvent({ process: "attention", kind: "urgent", reason: "a voice arrives" });
    expect(el.querySelector(".fold.live")).toBeNull();
    expect(el.querySelector(".stim")).toBeTruthy();
});

test("a long run closes with begin AND end; a short run with begin only", () => {
    const el = mkFold();
    el.prime();
    const long = "I keep returning to the balanced numbers and the looseness in my definition. " +
        "Pairing each small divisor with its partner reflects them about the square root, not the number itself. " +
        "So the symmetry I imagined was wrong, and what I want is a statement about their sum instead.";
    el.onFragment({ kind: "thought", content: long });
    el.onEvent({ process: "attention", kind: "urgent", reason: "stop" });   // closes the fold
    let folds = el.querySelectorAll(".fold");
    const longFold = folds[folds.length - 1];
    expect(longFold.querySelector(".begin")).toBeTruthy();
    expect(longFold.querySelector(".end")).toBeTruthy();                    // long → keeps the end

    el.onFragment({ kind: "thought", content: "a brief afterthought." });
    el.onEvent({ process: "attention", kind: "urgent", reason: "again" });
    folds = el.querySelectorAll(".fold");
    const shortFold = folds[folds.length - 1];
    expect(shortFold.querySelector(".begin")).toBeTruthy();
    expect(shortFold.querySelector(".end")).toBeNull();                     // short → begin only
});

test("fold-mode renderBatch gathers a backlog into folds + full landmarks", () => {
    const el = mkFold();
    el.renderBatch([
        { k: "thought", t: "I was thinking about divisors " },
        { k: "boundary", reason: "completed" },
        { k: "thought", t: "and then about their sum" },
        { k: "speech", t: "six and twenty-eight" },
        { k: "thought", t: "now a fresh run begins" },
    ]);
    expect(el.q.length).toBe(0);
    expect(el._awaitingBatch).toBe(false);
    expect(el.querySelector(".say")).toBeTruthy();
    expect(el.querySelectorAll(".fold").length).toBe(2);     // one closed run + the trailing live run
    expect(el.querySelector(".fold.live")).toBeTruthy();
    expect(el.liveRun).toBeTruthy();                         // live tail continues after replay
});

// ----------------------------------------- mode is a view: switching re-renders data
// (Each part re-renders from its own data when the mode topic changes — settled parts
//  and the in-flight run alike. The await lets the parts' ../mode subscriptions settle:
//  in the browser they are long-registered by the time anyone clicks the toggle, so the
//  repaint is synchronous; here content + switch happen in one tick, so we let the
//  subscriptions register — Amanita then replays the current mode to each.)

test("switching mode re-renders the in-flight run in the new mode (not settled)", async () => {
    const el = mkFold();
    el.prime();
    el.onFragment({ kind: "thought", content: "an open run of thought that keeps going" });
    const run = el.liveRun;
    expect(el.querySelector(".fold.live")).toBeTruthy();     // fold face
    el.setMode("raw");
    await delay(15);
    expect(el.querySelector(".fold")).toBeNull();            // re-rendered, not folded
    expect(el.querySelector("p")).toBeTruthy();              // now a raw paragraph
    expect(el.querySelector(".caret")).toBeTruthy();         // STILL live — not sealed
    expect(el.liveRun).toBe(run);                            // same run element, just repainted
    expect(el.textContent).toContain("open run of thought");
});

test("switching mode re-renders already-settled content, not just new content", async () => {
    const el = mkFold();
    el.renderBatch([
        { k: "thought", t: "first I considered the divisors" },
        { k: "boundary", reason: "completed" },
        { k: "thought", t: "and how they pair around the root" },
        { k: "speech", t: "out loud" },                       // seals the run into a closed fold
        { k: "thought", t: "then I moved on to their sum" },
    ]);
    expect(el.querySelectorAll(".fold").length).toBe(2);     // settled fold + live fold
    expect(el.querySelector(".say")).toBeTruthy();

    el.setMode("raw");                                        // a settled fold must re-render too
    await delay(15);
    expect(el.querySelector(".fold")).toBeNull();            // EVERY run repainted as raw
    expect(el.querySelectorAll("p").length).toBeGreaterThan(0);
    expect(el.querySelector(".bnd")).toBeTruthy();            // the boundary is now a divider
    expect(el.querySelector(".say")).toBeTruthy();           // the landmark is unchanged
    expect(el.textContent).toContain("first I considered");  // nothing lost

    el.setMode("flow");                                       // …and again, to flow
    await delay(15);
    expect(el.querySelector(".fold")).toBeNull();
    expect(el.querySelector(".seam")).toBeTruthy();          // boundary now an inline seam
    expect(el.querySelector(".bnd")).toBeNull();
});

test("end to end: the header toggle re-renders the live run through the mesh", async () => {
    await withIsolatedPrefs(async () => {
        // The real column wiring: the toggle publishes /streammode/mode; the stream
        // subscribes, re-publishes `mode`, and its parts react via `../mode`.
        document.body.innerHTML =
            `<div><studio-streammode name="streammode" class="streammode fold">fold</studio-streammode>` +
            `<studio-stream></studio-stream></div>`;
        const stream = document.querySelector("studio-stream");
        stream._req = () => null;
        await delay(20);                                      // /streammode/mode sub resolves → stream is "fold"
        expect(stream.mode).toBe("fold");

        stream.onFragment({ kind: "thought", content: "a thought arriving live through the mesh" });
        expect(stream.querySelector(".fold.live")).toBeTruthy();   // default fold face
        await delay(20);                                      // the run's ../mode sub registers

        document.querySelector("studio-streammode").click();  // fold → flow, all through pub/sub
        await delay(20);
        expect(stream.mode).toBe("flow");
        expect(stream.querySelector(".fold")).toBeNull();     // re-rendered to flow — no reach-in
        expect(stream.querySelector("p")).toBeTruthy();
        expect(stream.textContent).toContain("a thought arriving");
    });
});
