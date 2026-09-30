// Import hygiene (message-rule review §2.11). A component reaches another only by
// message, so its module must not import another component's module: a shared pure
// function lives in shared/ or infrastructure/, where either can import it without
// pulling in the other's class. The exception is a base class the importer extends
// (MBaseComponent, MObserver, MSense). A component must not import the loader either
// (startup/, config/component*.js); what the process loaded is recorded in
// infrastructure/runningBundle.js.
//
// A component module is a built-in file named like one (`mFoo.js`). Every built-in
// file is scanned, shared helpers included: a helper that imports a component drags
// the component in just the same. Comments are skipped.
import { test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../../../src", import.meta.url));
const BUILTIN = path.join(SRC, "mindComponents");

const BASE_CLASSES = new Set(["mBaseComponent.js", "mObserver.js", "mSense.js"]);

const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, acc);
    else if (e.name.endsWith(".js")) acc.push(fp);
  }
  return acc;
};

const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

const stripComments = source => source
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
  .replace(/^\s*\/\/.*$/gm, "");

function forbiddenImports(fromFile, source) {
  const found = [];
  for (const m of stripComments(source).matchAll(IMPORT)) {
    const spec = m[1] || m[2];
    if (!spec.startsWith(".")) continue;
    const target = path.resolve(path.dirname(fromFile), spec.endsWith(".js") ? spec : `${spec}.js`);
    const rel = path.relative(SRC, target);
    const name = path.basename(target);
    if (rel.startsWith("mindComponents") && /^m[A-Z]/.test(name) && !BASE_CLASSES.has(name)) {
      found.push(`component ${rel}`);
    } else if (rel.startsWith(`startup${path.sep}`) || /^config[\\/]component/.test(rel)) {
      found.push(`loader ${rel}`);
    }
  }
  return found;
}

test("the scanner sees component and loader imports and spares base classes", () => {
  const from = path.join(BUILTIN, "shared", "mLook.js");
  const sample = [
    `import A from "amanita"`,
    `import { MBaseComponent } from "./mBaseComponent.js"`,
    `import { MSense } from "../mind/mSense.js"`,
    `import { describeWeather } from "../mind/mWeather.js"`,
    `import {`,
    `    compressToFit,`,
    `} from "../mind/mMemory.js"`,
    `import { getLoadedArchitecture } from '../../startup/architecture.js';`,
    `import { getLoadedComponentSources } from '../../config/componentResolver.js';`,
    `import { parseTime } from '../../config/timeParser.js';`,
    `import { parseNotebook } from "./notebook.js"`,
    `// import { parseNotebook } from "./mNote.js"`,
  ].join("\n");
  expect(forbiddenImports(from, sample)).toEqual([
    "component mindComponents/mind/mWeather.js",
    "component mindComponents/mind/mMemory.js",
    "loader startup/architecture.js",
    "loader config/componentResolver.js",
  ]);
});

test("built-in modules import no other component and not the loader (§2.11)", () => {
  const offenders = [];
  for (const fp of walk(BUILTIN)) {
    for (const f of forbiddenImports(fp, fs.readFileSync(fp, "utf8"))) {
      offenders.push(`${path.relative(BUILTIN, fp)} → ${f}`);
    }
  }
  expect(offenders).toEqual([]);
});
