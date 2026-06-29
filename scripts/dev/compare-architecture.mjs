// Dev tool: prove that an expanded (templated) architecture is structurally equivalent
// to a reference (flat) one — the "diff the resolved tree" check in
// doc/improvements/mind-templating.md §Implementation/4.
//
//   bun scripts/dev/compare-architecture.mjs <reference.archml> <seed.archml>
//   bun scripts/dev/compare-architecture.mjs --git <path>   # reference = git HEAD of <path>, seed = working tree
//
// Equivalence is canonical: tag + sorted attributes (control directives dropped) +
// significant (non-whitespace) text, recursively, in document order. Attribute-name
// case and insignificant whitespace are normalized (the HTML parser lowercases attr
// names anyway), exactly as both trees would be at runtime.
import "../../src/startup/jsdom.js";
import { readFile } from "fs/promises";
import { execSync } from "child_process";
import { expandArchitecture } from "../../src/startup/templating.js";
import { dirname, resolve } from "path";

const CONTROL = new Set(["extends", "drop", "fresh", "archetype"]);

const frag = (text) => { const t = document.createElement("template"); t.innerHTML = text; return t.content; };
const sig = (s) => s.replace(/\s+/g, " ").trim();

function canon(node, depth = 0) {
  const pad = "  ".repeat(depth);
  if (node.nodeType === 3) { const t = sig(node.textContent); return t ? `${pad}#text ${JSON.stringify(t)}` : null; }
  if (node.nodeType === 8) return null;            // comments are not part of the resolved tree
  if (node.nodeType !== 1) return null;
  const attrs = Array.from(node.attributes)
    .filter(a => !CONTROL.has(a.name.toLowerCase()))
    .map(a => [a.name.toLowerCase(), a.value])
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${k}=${JSON.stringify(sig(v))}`)
    .join(" ");
  const head = `${pad}<${node.tagName.toLowerCase()}${attrs ? " " + attrs : ""}>`;
  const kids = Array.from(node.childNodes).map(c => canon(c, depth + 1)).filter(Boolean);
  return [head, ...kids].join("\n");
}

const canonRoot = (text) =>
  Array.from(frag(text).childNodes).map(n => canon(n, 0)).filter(Boolean).join("\n");

const argv = process.argv.slice(2);
let refText, seedText, seedPath;
if (argv[0] === "--git") {
  seedPath = argv[1];
  refText = execSync(`git show HEAD:${seedPath}`, { encoding: "utf8" });
  seedText = await readFile(seedPath, "utf8");
} else {
  [, seedPath] = argv;
  refText = await readFile(argv[0], "utf8");
  seedText = await readFile(argv[1], "utf8");
}

const baseDir = dirname(seedPath);
const expanded = await expandArchitecture(seedText, { resolveImport: (s) => readFile(resolve(baseDir, s), "utf8") });

const a = canonRoot(refText);
const b = canonRoot(expanded);

if (a === b) {
  console.log(`✓ EQUIVALENT — expanded ${seedPath} matches the reference resolved tree (${a.split("\n").length} canonical lines).`);
  process.exit(0);
}

// List every divergence (line-aligned diff), so an intended single change is easy to confirm.
const la = a.split("\n"), lb = b.split("\n");
const max = Math.max(la.length, lb.length);
let diffs = 0;
for (let k = 0; k < max; k++) {
  if (la[k] !== lb[k]) {
    diffs++;
    console.error(`✗ line ${k + 1}`);
    console.error("   reference: " + (la[k] ?? "(end)"));
    console.error("   expanded:  " + (lb[k] ?? "(end)"));
  }
}
console.error(`\n${diffs} diverging canonical line(s) (reference ${la.length}, expanded ${lb.length}).`);
process.exit(1);
