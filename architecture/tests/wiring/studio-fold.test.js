// The thought-fold widget (src/studio/ui/studioFold.js): the verbatim text helpers
// and the Fold's live → closed lifecycle. A fold invents nothing — begin/end are
// sliced from the run's own words — so these assert the slicing and the settle.
import "./setup.js";
import { test, expect } from "bun:test";
import { Fold, firstChunk, lastChunk, lastWords, wordCount, fmtDur } from "../../../src/studio/ui/studioFold.js";

test("firstChunk takes the opening sentence; lastChunk the closing one", () => {
  const t = "I keep returning to the balanced numbers. The looseness bothers me. So 6 is the smallest.";
  expect(firstChunk(t)).toBe("I keep returning to the balanced numbers.");
  expect(lastChunk(t)).toBe("So 6 is the smallest.");
});

test("firstChunk word-bounds a long, sentence-less head with an ellipsis", () => {
  const t = "x".repeat(40) + " " + "y".repeat(200);   // no terminator, >150
  const head = firstChunk(t);
  expect(head.endsWith("…")).toBe(true);
  expect(head.length).toBeLessThan(120);
});

test("lastWords returns the trailing n words; wordCount counts; fmtDur formats", () => {
  expect(lastWords("one two three four five", 2)).toBe("four five");
  expect(wordCount("  a  b   c ")).toBe(3);
  expect(wordCount("")).toBe(0);
  expect(fmtDur(8000)).toBe("8s");
  expect(fmtDur(161000)).toBe("2m 41s");
});

test("a live fold shows its opening and a ghosting tail, and counts bursts", () => {
  let now = 0;
  const f = new Fold(() => now);
  f.append("I keep returning to the balanced numbers and what they really are. ");
  f.bump();
  f.append("Their divisors sum back to themselves.");
  expect(f.el.classList.contains("live")).toBe(true);
  expect(f.el.querySelector(".begin").textContent).toContain("balanced numbers");
  expect(f.el.querySelector(".ghost").textContent.length).toBeGreaterThan(0);
  expect(f.el.querySelector(".status").textContent).toContain("1 burst");
});

test("closing a short run keeps begin only; a long run keeps begin + end + meta", () => {
  let now = 0;
  const short = new Fold(() => now);
  short.append("A brief thought.");
  short.close();
  expect(short.el.classList.contains("live")).toBe(false);
  expect(short.el.querySelector(".begin")).toBeTruthy();
  expect(short.el.querySelector(".end")).toBeNull();

  now = 0;
  const long = new Fold(() => now);
  long.bump(); long.bump();
  long.append(
    "I keep returning to the balanced numbers and the looseness in my old definition. " +
    "Pairing each small divisor with its partner reflects them about the square root, not the number. " +
    "So what I actually want is a statement about their sum."
  );
  now = 161000;     // 2m 41s elapsed
  long.close();
  expect(long.el.querySelector(".end")).toBeTruthy();
  const meta = long.el.querySelector(".meta").textContent;
  expect(meta).toContain("2 bursts");
  expect(meta).toContain("2m 41s");
  expect(Number(long.el.dataset.w)).toBeGreaterThan(0);   // char weight for prune
});

test("a closed fold opens and closes its full transcript on click", () => {
  const f = new Fold(() => 0);
  f.append("The whole run is kept behind the fold for reading on demand.");
  f.close();
  expect(f.el.classList.contains("open")).toBe(false);
  f.el.querySelector(".glyph").dispatchEvent(new Event("click", { bubbles: true }));
  expect(f.el.classList.contains("open")).toBe(true);
  expect(f.el.querySelector(".full").textContent).toContain("whole run");
  f.el.querySelector(".begin").dispatchEvent(new Event("click", { bubbles: true }));
  expect(f.el.classList.contains("open")).toBe(false);
});
