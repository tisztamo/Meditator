// The pure text helpers behind the stream's thought-run rendering
// (src/studio/ui/studioRunText.js): a fold invents nothing — begin/end are sliced
// verbatim from the run's own words — so these assert the slicing and formatting.
// (The fold's DOM lifecycle is now the studio-thought-run component; see
// studio-thought-run.test.js.)
import "./setup.js";
import { test, expect } from "bun:test";
import { firstChunk, lastChunk, lastWords, wordCount, fmtDur } from "../../../src/studio/ui/studioRunText.js";

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
