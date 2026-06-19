// Studio stream display — the flow-mode metered reveal, inline burst seam, and
// the flow/raw toggle. Drives the reveal pump with synthetic timestamps (rAF is
// stubbed out) so the cadence is deterministic.
import "./setup.js";
import { test, expect } from "bun:test";
import { StudioStream } from "../../../src/studio/ui/studioStream.js";

// A focused studio-stream, with the reveal loop's self-scheduling disabled (we
// pump by hand). The flow/raw mode is now owned by studio-streammode and arrives
// via setMode(); tests drive that directly.
function mk() {
    document.body.innerHTML = `<studio-stream></studio-stream>`;
    const el = document.querySelector("studio-stream");
    el._req = () => null;       // disable auto-scheduling; tests pump manually
    return el;
}

// Pump from t=0 in 250ms-capped steps until the buffer drains (or we give up).
function drain(el) {
    for (let t = 0; el.q.length && t < 60000; t += 250) el._pump(t);
}

test("defaults to flow mode", () => {
    const el = mk();
    expect(el.smooth).toBe(true);
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
    el.setMode(false);                     // flow -> raw (as studio-streammode publishes)
    expect(el.smooth).toBe(false);

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
    el.setMode(false);                        // flush + switch to raw
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
