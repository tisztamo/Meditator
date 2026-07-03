// The built-in component tree (src/mindComponents/**) is scanned RECURSIVELY by the
// resolver, so its folder layout (mind/ agent/ shared/) is free organisation — BUT that
// only stays safe while it is a single FLAT namespace: no two files may share a basename,
// or a requested tag would resolve ambiguously (a fatal error) inside the built-in layer.
// This test locks that invariant, guarding future moves/additions and the M3 reorg.
import { test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUILTIN = fileURLToPath(new URL("../../../src/mindComponents", import.meta.url));

const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, acc);
    else if (e.name.endsWith(".js")) acc.push(fp);
  }
  return acc;
};

test("no two built-in component files share a basename (flat namespace)", () => {
  const byBase = new Map();
  for (const fp of walk(BUILTIN)) {
    const base = path.basename(fp);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(path.relative(BUILTIN, fp));
  }
  const dupes = [...byBase.entries()].filter(([, paths]) => paths.length > 1);
  expect(dupes).toEqual([]);
});

test("built-ins live under subdirectories, not loose at the top level", () => {
  const top = fs.readdirSync(BUILTIN, { withFileTypes: true });
  const looseJs = top.filter((e) => e.isFile() && e.name.endsWith(".js")).map((e) => e.name);
  expect(looseJs).toEqual([]);
  expect(top.some((e) => e.isDirectory())).toBe(true);
});
