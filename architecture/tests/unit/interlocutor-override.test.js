// Naming a mind's companion at wake without editing the file: applyInterlocutorOverride
// sets the first <m-mind>'s interlocutor="…" attribute to a wake-time value (the
// Studio's editable companion field, or MEDITATOR_INTERLOCUTOR by hand). The name
// folds into BOTH the identity prose ({{interlocutor}}) and the framing of an
// incoming voice. We substitute into the SOURCE so the architecture snapshot records
// the companion that ran (lifecycle.md §2). See src/startup/architecture.js.
import { test, expect } from "bun:test";
import { applyInterlocutorOverride } from "../../../src/startup/architecture.js";

test("rewrites an existing interlocutor attribute", () => {
  const out = applyInterlocutorOverride(`<m-mind name="lemma" interlocutor="Kris"><m-stream/></m-mind>`, "Anna");
  expect(out).toBe(`<m-mind name="lemma" interlocutor="Anna"><m-stream/></m-mind>`);
});

test("inserts an interlocutor when the tag has none", () => {
  const out = applyInterlocutorOverride(`<m-mind name="lemma"></m-mind>`, "Anna");
  expect(out).toBe(`<m-mind interlocutor="Anna" name="lemma"></m-mind>`);
});

test("handles a multi-line opening tag and leaves the body untouched", () => {
  const src = `<m-mind name="lemma"\n        interlocutor="Kris"\n        pace="12s">\n  talk it over with {{interlocutor}}.\n  <m-stream name="stream"></m-stream>\n</m-mind>\n`;
  const out = applyInterlocutorOverride(src, "Anna");
  expect(out).toContain(`interlocutor="Anna"`);
  expect(out).not.toContain(`interlocutor="Kris"`);
  expect(out).toContain("talk it over with {{interlocutor}}.");   // the prose placeholder is left for the mind to fill
});

test("ignores a <m-mind> mentioned inside a comment and rewrites the real tag", () => {
  const src = `<!-- cloned from <m-mind name="seedling" interlocutor="Bob"> -->\n<m-mind name="lemma" interlocutor="Kris"><m-stream/></m-mind>`;
  const out = applyInterlocutorOverride(src, "Anna");
  expect(out).toContain(`<m-mind name="lemma" interlocutor="Anna"><m-stream/></m-mind>`);
  expect(out).toContain(`<!-- cloned from <m-mind name="seedling" interlocutor="Bob"> -->`); // comment untouched
});

test("sanitizes quotes/brackets so the value can't break the attribute", () => {
  const out = applyInterlocutorOverride(`<m-mind interlocutor="x"></m-mind>`, `evil" onload="<b>`);
  expect(out).toBe(`<m-mind interlocutor="evil onload=b"></m-mind>`);
});

test("a blank or whitespace override is a no-op", () => {
  const src = `<m-mind interlocutor="Kris"></m-mind>`;
  expect(applyInterlocutorOverride(src, "   ")).toBe(src);
  expect(applyInterlocutorOverride(src, "")).toBe(src);
});

test("content with no m-mind passes through unchanged", () => {
  const src = `<div>not an architecture</div>`;
  expect(applyInterlocutorOverride(src, "Anna")).toBe(src);
});
