// Studio stream display — the flow-mode metered reveal, inline burst seam, and
// the flow/raw toggle. Drives the reveal pump with synthetic timestamps (rAF is
// stubbed out) so the cadence is deterministic.
import "./setup.js";
import { test, expect } from "bun:test";
import { StudioStream } from "../../../src/studio/ui/studioStream.js";

// A focused studio-stream inside a column with the mode toggle, with the reveal
// loop's self-scheduling disabled (we pump by hand).
function mk() {
    document.body.innerHTML =
        `<div class="col left"><div class="colhead">` +
        `<span class="streammode" data-streammode>flow</span></div>` +
        `<studio-stream></studio-stream></div>`;
    const el = document.querySelector("studio-stream");
    el._req = () => null;       // disable auto-scheduling; tests pump manually
    return el;
}

// Pump from t=0 in 250ms-capped steps until the buffer drains (or we give up).
function drain(el) {
    for (let t = 0; el.q.length && t < 60000; t += 250) el._pump(t);
}

test("defaults to flow mode and labels the toggle", () => {
    const el = mk();
    expect(el.smooth).toBe(true);
    expect(el._modeCtl && el._modeCtl.textContent).toBe("flow");
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
    el.toggleMode();                       // flow -> raw
    expect(el.smooth).toBe(false);
    expect(el._modeCtl.textContent).toBe("raw");
    expect(el._modeCtl.classList.contains("raw")).toBe(true);

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
    el.toggleMode();                          // flush + switch to raw
    expect(el.textContent.length).toBe(100);
    expect(el.q.length).toBe(0);
});
