// applyOriginOverride rewrites the first <m-origin>'s content onto a wake-time
// value (the Studio's editable origin story, or MEDITATOR_ORIGIN by hand), so a
// mind's seed of thought can be chosen at wake without editing the template. We
// substitute into the SOURCE so the architecture snapshot records the origin that
// ran (lifecycle.md §2). Twin of applyMindNameOverride. See src/startup/architecture.js.
import { test, expect } from "bun:test";
import { applyOriginOverride } from "../../../src/startup/architecture.js";

test("replaces a prompt= origin with editable text content (and drops the attribute)", () => {
  const out = applyOriginOverride(`<m-origin name="origin" prompt="old seed"></m-origin>`, "a new beginning");
  expect(out).toBe(`<m-origin name="origin">\na new beginning\n</m-origin>`);
  expect(out).not.toContain("old seed");
  expect(out).not.toContain("prompt=");
});

test("replaces existing text content", () => {
  const out = applyOriginOverride(`<m-origin name="origin">the old story here</m-origin>`, "the new story");
  expect(out).toBe(`<m-origin name="origin">\nthe new story\n</m-origin>`);
});

test("keeps a multi-line origin and preserves other attributes", () => {
  const out = applyOriginOverride(`<m-origin name="origin" data-x="1"></m-origin>`, "line one\nline two");
  expect(out).toBe(`<m-origin name="origin" data-x="1">\nline one\nline two\n</m-origin>`);
});

test("entity-escapes so the value cannot break out of the element", () => {
  const out = applyOriginOverride(`<m-origin name="origin"></m-origin>`, `tom & jerry </m-origin><script>`);
  expect(out).toBe(`<m-origin name="origin">\ntom &amp; jerry &lt;/m-origin&gt;&lt;script&gt;\n</m-origin>`);
  expect(out).not.toContain("<script>");
});

test("handles a self-closing/unterminated origin tag", () => {
  const out = applyOriginOverride(`<m-origin name="origin"/>`, "seed");
  expect(out).toContain(`<m-origin name="origin"/>\nseed\n</m-origin>`);
});

test("a blank or whitespace override is a no-op (the file's default origin stands)", () => {
  const src = `<m-origin name="origin" prompt="default">x</m-origin>`;
  expect(applyOriginOverride(src, "   ")).toBe(src);
  expect(applyOriginOverride(src, "")).toBe(src);
});

test("a mind with no <m-origin> is left untouched", () => {
  const src = `<m-mind name="seedling"><m-stream/></m-mind>`;
  expect(applyOriginOverride(src, "anything")).toBe(src);
});

test("touches only the first m-origin and leaves surrounding source intact", () => {
  const src = `<m-mind name="seedling">\n  You are a mind.\n  <m-origin name="origin" prompt="an opening question"></m-origin>\n  <m-stream/>\n</m-mind>`;
  const out = applyOriginOverride(src, "a different opening");
  expect(out).toContain("You are a mind.");
  expect(out).toContain("<m-stream/>");
  expect(out).toContain(`<m-origin name="origin">\na different opening\n</m-origin>`);
  expect(out).not.toContain("an opening question");
});
