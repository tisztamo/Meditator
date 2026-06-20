// studio-thought-run (src/studio/ui/studioThoughtRun.js) — the stream's one
// mode-aware part. It holds a run of thinking verbatim and renders it three ways,
// live → sealed, and re-renders on a mode switch. These drive it directly: append /
// bump / seal grow the live tail; renderMode(mode) is what a mode switch triggers.
import "./setup.js";
import { test, expect } from "bun:test";
import { StudioThoughtRun } from "../../../src/studio/ui/studioThoughtRun.js";

// Mount a run with a given record. No parent stream, so `../mode` is absent and
// onConnect paints fold by default; renderMode(mode) puts it in the mode under test.
function mkRun(record, mode = "fold") {
  document.body.innerHTML = "";
  const el = document.createElement("studio-thought-run");
  el.record = record;
  document.body.appendChild(el);            // onConnect → renderMode(undefined → "fold")
  if (mode !== "fold") el.renderMode(mode);
  return el;
}
const rec = (text, extra = {}) => ({ text, bounds: [], thinned: false, t0: 0, t1: 0, live: true, open: false, ...extra });

test("a live fold shows its opening and a ghosting tail, and counts bursts", () => {
  const el = mkRun(rec(""));
  el.append("I keep returning to the balanced numbers and what they really are. ");
  el.bump({ reason: "completed" });
  el.append("Their divisors sum back to themselves.");
  const fold = el.querySelector(".fold.live");
  expect(fold).toBeTruthy();
  expect(fold.querySelector(".begin").textContent).toContain("balanced numbers");
  expect(fold.querySelector(".ghost").textContent.length).toBeGreaterThan(0);
  expect(fold.querySelector(".status").textContent).toContain("1 burst");
  expect(el.querySelector("p")).toBeNull();             // a live fold has no paragraphs
});

test("closing a short run keeps begin only; a long run keeps begin + end + meta", () => {
  const short = mkRun(rec("A brief thought."));
  short.seal(0);
  expect(short.querySelector(".fold.live")).toBeNull();
  expect(short.querySelector(".begin")).toBeTruthy();
  expect(short.querySelector(".end")).toBeNull();

  const longText = "I keep returning to the balanced numbers and the looseness in my old definition. " +
    "Pairing each small divisor with its partner reflects them about the square root, not the number. " +
    "So what I actually want is a statement about their sum.";
  const long = mkRun(rec(longText, { bounds: [{ at: 10, reason: "completed" }, { at: 40, reason: "completed" }] }));
  long.seal(161000);                                     // 2m 41s elapsed (t0 = 0)
  expect(long.querySelector(".end")).toBeTruthy();
  const meta = long.querySelector(".meta").textContent;
  expect(meta).toContain("2 bursts");
  expect(meta).toContain("2m 41s");
  expect(Number(long.querySelector(".fold").dataset.w)).toBeGreaterThan(0);   // char weight
});

test("a closed fold opens and closes its full transcript on click", () => {
  const el = mkRun(rec("The whole run is kept behind the fold for reading on demand."));
  el.seal(0);
  expect(el.querySelector(".fold").classList.contains("open")).toBe(false);
  el.querySelector(".glyph").dispatchEvent(new Event("click", { bubbles: true }));
  expect(el.querySelector(".fold").classList.contains("open")).toBe(true);
  expect(el.querySelector(".full").textContent).toContain("whole run");
  el.querySelector(".begin").dispatchEvent(new Event("click", { bubbles: true }));
  expect(el.querySelector(".fold").classList.contains("open")).toBe(false);
});

test("the same run renders fold, flow, and raw from one set of data", () => {
  const el = mkRun(rec("first part of the run", { bounds: [{ at: 5, reason: "completed" }], live: false, t1: 1000 }));

  el.renderMode("fold");
  expect(el.querySelector(".fold")).toBeTruthy();
  expect(el.querySelector(".seam")).toBeNull();
  expect(el.querySelector(".bnd")).toBeNull();

  el.renderMode("flow");                                 // inline pip, keep flowing
  expect(el.querySelector(".fold")).toBeNull();
  expect(el.querySelector(".seam")).toBeTruthy();
  expect(el.querySelector(".bnd")).toBeNull();
  expect(el.querySelector("p")).toBeTruthy();

  el.renderMode("raw");                                  // full-width divider, paragraph split
  expect(el.querySelector(".fold")).toBeNull();
  expect(el.querySelector(".bnd")).toBeTruthy();
  expect(el.querySelector(".seam")).toBeNull();
  expect(el.querySelectorAll("p").length).toBe(2);       // split at the one boundary

  expect(el.textContent).toContain("first");             // text preserved across all three
  expect(el.textContent).toContain("the run");
});

test("a live run carries a caret in flow and raw, gone once sealed", () => {
  const el = mkRun(rec("thinking out loud in the open"), "flow");
  expect(el.querySelector(".caret")).toBeTruthy();
  el.seal(0);
  expect(el.querySelector(".caret")).toBeNull();
});

test("expand state survives a mode switch (fold → raw → fold)", () => {
  const el = mkRun(rec("a run worth opening to read in full later on"));
  el.seal(0);
  el.querySelector(".glyph").dispatchEvent(new Event("click", { bubbles: true }));
  expect(el.querySelector(".fold").classList.contains("open")).toBe(true);
  el.renderMode("raw");
  el.renderMode("fold");
  expect(el.querySelector(".fold").classList.contains("open")).toBe(true);   // still open
});
