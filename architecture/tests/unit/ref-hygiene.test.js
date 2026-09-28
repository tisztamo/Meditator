// Ref hygiene (message-rule review §6.4, §2.10). A component's built-in refs must
// survive being wrapped: "../x" names whatever the component happens to sit in (wrap
// it in a region and it silently unwires), and "/x" names the first `x` in the
// document (in a society, every mind binds the same one). A built-in ref is written
// against the membrane instead — "!scope/…" or "!scope/@…".
//
// A relative or absolute ref is allowed only as the DEFAULT of an overridable
// `*Src` attribute (`this.attr("fooSrc") || "../foo"`), where the author can re-aim
// it, and in the one structural form that is wrap-invariant by construction:
// "../..[selector]/…" — up out of self, then closest by role.
//
// Scanned positions are the ones that bind: a `.sub(` argument, a `src:` option,
// and an auto-subscribed class field (`"../x" = e => …`). Each must BE a literal to
// match, so an overridable default (`this.attr("xSrc") || "../x"`) passes by shape.
// Comments are skipped.
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

const LITERAL = String.raw`(["'\x60])((?:\.\.\/|\/)[^"'\x60]*)\1`;
const POSITIONS = [
  new RegExp(String.raw`\.sub\(\s*` + LITERAL, "g"),
  new RegExp(String.raw`\bsrc:\s*` + LITERAL, "g"),
  new RegExp(String.raw`^\s*` + LITERAL + String.raw`\s*=(?!=)`, "g"),
];
const ROLE_CLOSEST = /^\.\.\/\.\.\[/;

function wrapUnsafeRefs(source) {
  const found = [];
  source.split("\n").forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
    for (const re of POSITIONS) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        const ref = m[2];
        if (ROLE_CLOSEST.test(ref)) continue;
        found.push({ line: i + 1, ref });
      }
    }
  });
  return found;
}

test("the scanner sees each binding position and spares the allowed forms", () => {
  const sample = [
    `this.sub("../prompt", cb)`,
    `this.respond("step", fn, { src: "/agent/@step" })`,
    `    "../@interrupt" = e => {}`,
    `this.sub(this.attr("promptSrc") || "../prompt", cb)`,
    `this.sub('../..[provides~="aperture"]/gateVersions', cb)`,
    `this.sub("!scope/prompt", cb)`,
    `// this.sub("../prompt", cb)`,
    ` * "../prompt": the frame`,
    `if (text === "/sleep") {`,
  ].join("\n");
  expect(wrapUnsafeRefs(sample).map(f => f.ref)).toEqual(["../prompt", "/agent/@step", "../@interrupt"]);
});

test("built-in components bind no parent-relative or absolute refs (§2.10)", () => {
  const offenders = [];
  for (const fp of walk(BUILTIN)) {
    for (const f of wrapUnsafeRefs(fs.readFileSync(fp, "utf8"))) {
      offenders.push(`${path.relative(BUILTIN, fp)}:${f.line} ${f.ref}`);
    }
  }
  expect(offenders).toEqual([]);
});
