// Manifest + versioning check (lifecycle.md §2, Phases 1–2):
//   bun architecture/tests/test-manifest.js
//
// No LLM, no network, no vault writes — operates entirely in an OS temp dir:
//   - writeManifest / readManifest round-trip;
//   - recordWake stamps an existing (resident) manifest and is a no-op without one;
//   - the wake rule: a future formatVersion warns but still loads;
//   - tierOf classifies resident / transient / retired / none;
//   - memory.md carries formatVersion in its meta and reads it back.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    FORMAT_VERSION, readManifest, writeManifest, recordWake, tierOf, manifestPath,
} from "../../src/infrastructure/manifest.js";

let failures = 0;
function check(name, cond, detail = "") {
    console.log(`${cond ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
    if (!cond) failures++;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-manifest-"));
const home = path.join(tmp, "resident");
const bare = path.join(tmp, "transient");
fs.mkdirSync(bare, { recursive: true });   // a home with no manifest = transient

// ── write / read round-trip ─────────────────────────────────────────────────
const seed = { name: "resident", born: "2026-01-01T00:00:00Z", runtimeSHA: "abc1234",
    formatVersion: FORMAT_VERSION, lineage: { parent: null }, status: "resident" };
writeManifest(home, seed);
check("manifest file is written", fs.existsSync(manifestPath(home)));
const read = readManifest(home);
check("round-trips faithfully", JSON.stringify(read) === JSON.stringify(seed));
check("readManifest is null when absent", readManifest(path.join(tmp, "nope")) === null);

// ── recordWake ───────────────────────────────────────────────────────────────
const woken = recordWake(home, "2026-06-15T12:00:00Z");
check("recordWake returns the manifest for a resident", !!woken);
check("recordWake stamps lastWokenAt", woken.lastWokenAt === "2026-06-15T12:00:00Z");
check("recordWake stamps formatVersion", woken.formatVersion === FORMAT_VERSION);
check("recordWake sets a runtimeSHA", typeof woken.runtimeSHA === "string" && woken.runtimeSHA.length > 0);
check("recordWake preserves born + status", woken.born === seed.born && woken.status === "resident");
check("recordWake persisted the change", readManifest(home).lastWokenAt === "2026-06-15T12:00:00Z");
check("recordWake is a no-op without a manifest", recordWake(bare) === null && readManifest(bare) === null);

// ── wake rule: a future format warns but still loads (returns a manifest) ─────
writeManifest(home, { ...seed, formatVersion: FORMAT_VERSION + 5 });
console.log("  (expect one wake-rule warning next:)");
const future = recordWake(home);
check("a newer-format mind still wakes (with a warning)", !!future && future.formatVersion === FORMAT_VERSION);

// ── tierOf ───────────────────────────────────────────────────────────────────
writeManifest(home, seed);
check("tierOf: resident", tierOf(home) === "resident");
check("tierOf: transient (home, no manifest)", tierOf(bare) === "transient");
check("tierOf: none (no home)", tierOf(path.join(tmp, "ghost")) === "none");
check("tierOf: retired via graveyard predicate",
    tierOf(path.join(tmp, "buried"), slug => slug === "buried") === "retired");

// ── memory.md meta carries formatVersion (mirrors mMemory _persist/_load) ────
const meta = JSON.stringify({ savedAt: "2026-06-15T12:00:00Z", formatVersion: FORMAT_VERSION });
const memoryMd = `# Meditator memory\n<!-- meta: ${meta} -->\n<!-- folds: 3 -->\n\n## Story\n\n## Recent\n\n## Tail\nhello\n\n<!-- end -->\n`;
const parsed = JSON.parse(memoryMd.match(/<!-- meta: (.*?) -->/s)[1]);
check("memory.md meta carries formatVersion", parsed.formatVersion === FORMAT_VERSION);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
