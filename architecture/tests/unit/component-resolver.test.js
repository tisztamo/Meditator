// The component resolver (src/config/componentResolver.js): layered override rules and
// loud failure on an ambiguous collision. See doc/improvements/component-hierarchy.md §4.
//
// These tests drive buildComponentResolver directly with a temp `components/` dir standing
// in for a bundle beside an .archml. The built-in layer still scans the real
// src/mindComponents, so bundle-over-built-in shadowing is exercised against real tags.
import { test, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildComponentResolver,
  getLoadedComponentSources,
  getBundleComponentsDir,
  kebabToCamel,
} from "../../../src/config/componentResolver.js";

let tmp, archmlPath, componentsDir;

const stub = (className) => `export class ${className} extends HTMLElement {}\n`;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-resolver-"));
  archmlPath = path.join(tmp, "thing.archml");
  fs.writeFileSync(archmlPath, `<m-mind name="x"></m-mind>`);
  componentsDir = path.join(tmp, "components");
  fs.mkdirSync(componentsDir, { recursive: true });

  // A bundle component that OVERRIDES a real built-in (src/mindComponents/shared/mNote.js).
  fs.writeFileSync(path.join(componentsDir, "mNote.js"), stub("MNote"));
  // A brand-new bundle-only component, nested — proves recursive scan of the bundle.
  fs.mkdirSync(path.join(componentsDir, "widgets"), { recursive: true });
  fs.writeFileSync(path.join(componentsDir, "widgets", "mWidget.js"), stub("MWidget"));
  // A DUPLICATE within the bundle layer (two subdirs) — must be ambiguous *only when
  // <m-dup> is actually requested*, not at build time.
  fs.mkdirSync(path.join(componentsDir, "a"), { recursive: true });
  fs.mkdirSync(path.join(componentsDir, "b"), { recursive: true });
  fs.writeFileSync(path.join(componentsDir, "a", "mDup.js"), stub("MDup"));
  fs.writeFileSync(path.join(componentsDir, "b", "mDup.js"), stub("MDup"));
});

afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("kebabToCamel maps m-stream → mStream", () => {
  expect(kebabToCamel("m-stream")).toBe("mStream");
  expect(kebabToCamel("m-read-file")).toBe("mReadFile");
});

test("building a resolver never throws, even with an ambiguous file present (lazy check)", () => {
  expect(() => buildComponentResolver({ archmlPath })).not.toThrow();
});

test("a built-in-only tag resolves to the built-in layer", () => {
  const r = buildComponentResolver({ archmlPath });
  const hit = r.resolve("m-stream");
  expect(hit).toBeTruthy();
  expect(hit.layer).toBe("built-in");
  expect(hit.path).toContain(path.join("src", "mindComponents"));
});

test("a bundle component OVERRIDES the built-in of the same tag (higher layer wins)", () => {
  const r = buildComponentResolver({ archmlPath });
  const hit = r.resolve("m-note");
  expect(hit.layer).toBe("bundle");
  expect(hit.path).toBe(path.join(componentsDir, "mNote.js"));
});

test("a nested bundle-only component resolves (recursive scan)", () => {
  const r = buildComponentResolver({ archmlPath });
  const hit = r.resolve("m-widget");
  expect(hit.layer).toBe("bundle");
  expect(hit.path).toBe(path.join(componentsDir, "widgets", "mWidget.js"));
});

test("an unknown tag resolves to null (caller decides skipload vs fatal)", () => {
  const r = buildComponentResolver({ archmlPath });
  expect(r.resolve("m-nonexistent-xyzzy")).toBeNull();
});

test("two definitions at equal precedence throw an ambiguity error naming both paths", () => {
  const r = buildComponentResolver({ archmlPath });
  let err = null;
  try { r.resolve("m-dup"); } catch (e) { err = e; }
  expect(err).toBeTruthy();
  expect(err.message).toContain("Ambiguous component <m-dup>");
  expect(err.message).toContain(path.join("a", "mDup.js"));
  expect(err.message).toContain(path.join("b", "mDup.js"));
});

test("loadedSources reports only the non-built-in winners (what a home must snapshot)", () => {
  const r = buildComponentResolver({ archmlPath });
  r.resolve("m-stream");   // built-in — excluded
  r.resolve("m-note");     // bundle    — included
  r.resolve("m-widget");   // bundle    — included
  const sources = getLoadedComponentSources();
  const tags = sources.map((s) => s.tag).sort();
  expect(tags).toEqual(["m-note", "m-widget"]);
  expect(sources.every((s) => s.layer !== "built-in")).toBe(true);
  expect(getBundleComponentsDir()).toBe(componentsDir);
});

test("the bundle layer beats MIND_COMPONENTS_PATH (env) — re-executability", () => {
  // env supplies a project-wide library that ALSO defines m-note; the bundle beside the
  // archml must still win (a re-run home resolves its own frozen components, not the library).
  const envDir = fs.mkdtempSync(path.join(os.tmpdir(), "med-resolver-env-"));
  fs.writeFileSync(path.join(envDir, "mNote.js"), stub("MNote"));      // collides with bundle
  fs.writeFileSync(path.join(envDir, "mGadget.js"), stub("MGadget"));  // env-only
  const saved = process.env.MIND_COMPONENTS_PATH;
  process.env.MIND_COMPONENTS_PATH = envDir;
  try {
    const r = buildComponentResolver({ archmlPath });
    expect(r.resolve("m-note").layer).toBe("bundle");   // bundle wins over env
    expect(r.resolve("m-gadget").layer).toBe("env");     // env still resolves below the bundle
  } finally {
    if (saved === undefined) delete process.env.MIND_COMPONENTS_PATH;
    else process.env.MIND_COMPONENTS_PATH = saved;
    fs.rmSync(envDir, { recursive: true, force: true });
  }
});

test("with no architecture path there is no bundle layer (unit-test / direct-DOM case)", () => {
  const r = buildComponentResolver({});
  expect(getBundleComponentsDir()).toBeNull();
  // m-note now falls through to the built-in (nothing overrides it).
  expect(r.resolve("m-note").layer).toBe("built-in");
});
