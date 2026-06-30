// Disentangling a transient mind's name from its file: applyMindNameOverride
// rewrites the first <m-mind>'s name onto a wake-time value (the Studio's
// semi-automatic naming, or MEDITATOR_MIND_NAME by hand), so a fresh tuning run
// never means editing the template. We substitute into the SOURCE so the home
// derives correctly AND the architecture snapshot records the name that ran
// (lifecycle.md §2). See src/startup/architecture.js.
import { test, expect } from "bun:test";
import { applyMindNameOverride, applySocietyNameOverride } from "../../../src/startup/architecture.js";

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

test("ignores a <m-mind> mentioned inside a comment and rewrites the real tag", () => {
  const src = `<!-- built from <m-mind name="seedling"> with senses stripped -->\n<m-mind name="lemma"><m-stream/></m-mind>`;
  const out = applyMindNameOverride(src, "lemma-2");
  expect(out).toContain(`<m-mind name="lemma-2"><m-stream/></m-mind>`);
  expect(out).toContain(`<!-- built from <m-mind name="seedling"> with senses stripped -->`); // comment untouched
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

test("rewrites a root society name without renaming its public face", () => {
  const src = `<m-society name="hearth-society">
  <m-mind name="face"><m-ws name="ws"></m-ws></m-mind>
</m-society>`;
  const out = applySocietyNameOverride(src, "hearth-society-1");
  expect(out).toContain(`<m-society name="hearth-society-1">`);
  expect(out).toContain(`<m-mind name="face">`);
});

test("society name override drops an explicit memory= so the override drives the population home", () => {
  const out = applySocietyNameOverride(`<m-society name="x" memory="pinned"><m-mind name="face"></m-mind></m-society>`, "council-2");
  expect(out).toBe(`<m-society name="council-2"><m-mind name="face"></m-mind></m-society>`);
});

test("society name override ignores a society tag mentioned inside a comment", () => {
  const src = `<!-- old <m-society name="fake"> -->\n<m-society name="real"><m-mind name="face"></m-mind></m-society>`;
  const out = applySocietyNameOverride(src, "real-1");
  expect(out).toContain(`<!-- old <m-society name="fake"> -->`);
  expect(out).toContain(`<m-society name="real-1">`);
});
