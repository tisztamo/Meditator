// Disentangling a transient mind's name from its file: applyMindNameOverride
// rewrites the first <m-mind>'s name onto a wake-time value (the Studio's
// semi-automatic naming, or MEDITATOR_MIND_NAME by hand), so a fresh tuning run
// never means editing the template. We substitute into the SOURCE so the home
// derives correctly AND the architecture snapshot records the name that ran
// (lifecycle.md §2). See src/startup/architecture.js.
import { test, expect } from "bun:test";
import { applyMindNameOverride } from "../../../src/startup/architecture.js";

test("rewrites an existing name attribute", () => {
  const out = applyMindNameOverride(`<m-mind name="seedling"><m-stream/></m-mind>`, "seedling-8");
  expect(out).toBe(`<m-mind name="seedling-8"><m-stream/></m-mind>`);
});

test("inserts a name when the tag has none", () => {
  const out = applyMindNameOverride(`<m-mind stage="experimental"></m-mind>`, "seedling-8");
  expect(out).toBe(`<m-mind name="seedling-8" stage="experimental"></m-mind>`);
});

test("drops an explicit memory= so the override drives the home", () => {
  const out = applyMindNameOverride(`<m-mind name="x" memory="pinned"></m-mind>`, "seedling-8");
  expect(out).toBe(`<m-mind name="seedling-8"></m-mind>`);
});

test("handles a multi-line opening tag and leaves the body untouched", () => {
  const src = `<!-- a comment with name="decoy" -->\n<m-mind name="seedling"\n        stage="experimental"\n        pace="10s">\n  You are a mind.\n  <m-stream name="stream"></m-stream>\n</m-mind>\n`;
  const out = applyMindNameOverride(src, "seedling-8");
  expect(out).toContain(`name="seedling-8"`);
  expect(out).not.toContain(`name="seedling"\n`);
  expect(out).toContain("You are a mind.");
  expect(out).toContain(`<!-- a comment with name="decoy" -->`); // only the m-mind tag is touched
});

test("sanitizes quotes/brackets so the value can't break the attribute", () => {
  const out = applyMindNameOverride(`<m-mind name="x"></m-mind>`, `evil" onload="<b>`);
  expect(out).toBe(`<m-mind name="evil onload=b"></m-mind>`);
});

test("a blank or whitespace override is a no-op", () => {
  const src = `<m-mind name="seedling"></m-mind>`;
  expect(applyMindNameOverride(src, "   ")).toBe(src);
  expect(applyMindNameOverride(src, "")).toBe(src);
});

test("content with no m-mind passes through unchanged", () => {
  const src = `<div>not an architecture</div>`;
  expect(applyMindNameOverride(src, "seedling-8")).toBe(src);
});
