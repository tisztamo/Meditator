// snapshot-at-wake: a waking mind writes the architecture that ran it into its own
// home (architecture.archml), so a home is always a re-executable bundle and
// retire.mjs needs no --archml (lifecycle.md §2 — the twin of runtimeSHA). The
// source is captured by readArchitectureFile() at startup; here we drive that path
// with a temp -a file and assert the snapshot lands in the home, byte-for-byte.
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { readArchitectureFile, resetLoadedArchitecture } from "../../../src/startup/architecture.js";

let home, archPath, archContent, origArgv;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }

    home = path.join(os.tmpdir(), "med-archsnap-home-" + Date.now());
    fs.mkdirSync(home, { recursive: true });
    const persistAttr = home.replace(/\\/g, "/");

    // The architecture file whose bytes we expect to see snapshotted verbatim.
    archContent = `<m-mind name="archsnap">
  <m-stream name="stream"></m-stream>
  <m-memory name="memory" journal="off" persist="${persistAttr}"></m-memory>
  <m-interrupts name="attention"></m-interrupts>
</m-mind>
`;
    archPath = path.join(os.tmpdir(), "med-archsnap-" + Date.now() + ".archml");
    fs.writeFileSync(archPath, archContent);

    // Drive the real startup read path so getLoadedArchitecture() is populated, then
    // build the DOM from exactly that content — as start.js does.
    origArgv = process.argv;
    process.argv = ["bun", "meditator.js", "-a", archPath];
    const content = await readArchitectureFile();
    process.argv = origArgv;

    document.body.innerHTML = content;
    await loadMindComponents(document);
    await delay(200); // memory wakes and snapshots
});

afterAll(() => {
    resetLoadedArchitecture(); // do not leak the loaded source into other test files
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ }
    try { fs.rmSync(archPath, { force: true }); } catch { /* best effort */ }
});

test("a waking mind snapshots the running architecture into its home, byte-for-byte", () => {
    const snap = path.join(home, "architecture.archml");
    expect(fs.existsSync(snap)).toBe(true);
    expect(fs.readFileSync(snap, "utf8")).toBe(archContent);
});

test("a built-in-only mind creates no components/ dir in its home (M2 no-op)", () => {
    // Every tag here is a built-in, so getLoadedComponentSources() is empty and the
    // component snapshot must be a clean no-op — no spurious home/components/.
    expect(fs.existsSync(path.join(home, "components"))).toBe(false);
});
