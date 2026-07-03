// M2 of doc/improvements/component-hierarchy.md: a waking mind snapshots the CUSTOM
// components it ran with into home/components/, so a home is a re-executable bundle
// (architecture.archml + components/). Here a bundle-only <m-badge> lives in a components/
// dir beside a temp .archml; we drive the real startup read + load path and assert the
// component lands in the home. The re-execution closure (the home's components/ IS the
// bundle layer on re-run) and the self-copy skip are covered by the resolver's precedence
// and the isInsideHome guard; this test locks the snapshot itself.
import { test, expect, beforeAll, afterAll } from "bun:test";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { buildComponentResolver, getLoadedComponentSources } from "../../../src/config/componentResolver.js";
import { readArchitectureFile, resetLoadedArchitecture } from "../../../src/startup/architecture.js";

let bundleRoot, home, archPath, badgeSrc, origArgv;

beforeAll(async () => {
    // A bundle: <archml> + components/mBadge.js beside it. The home is a SEPARATE dir
    // (persist=), so we can assert the component was COPIED into it.
    bundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "med-compsnap-bundle-"));
    home = fs.mkdtempSync(path.join(os.tmpdir(), "med-compsnap-home-"));
    fs.mkdirSync(path.join(bundleRoot, "components"), { recursive: true });
    badgeSrc = "export class MBadge extends HTMLElement {}\n";
    fs.writeFileSync(path.join(bundleRoot, "components", "mBadge.js"), badgeSrc);

    const persistAttr = home.replace(/\\/g, "/");
    const archContent = `<m-mind name="compsnap">
  <m-stream name="stream"></m-stream>
  <m-memory name="memory" journal="off" persist="${persistAttr}"></m-memory>
  <m-interrupts name="attention"></m-interrupts>
  <m-badge name="badge"></m-badge>
</m-mind>
`;
    archPath = path.join(bundleRoot, "thing.archml");
    fs.writeFileSync(archPath, archContent);

    origArgv = process.argv;
    process.argv = ["bun", "meditator.js", "-a", archPath];
    const content = await readArchitectureFile();
    process.argv = origArgv;

    // In production nothing is registered when start.js sets innerHTML (fresh process), so
    // every component resolves in Phase 1 before any m-memory wakes in Phase 2, and
    // getLoadedComponentSources() is fully populated at snapshot time. In the shared-registry
    // test harness a prior file may already have registered m-memory — it would then upgrade
    // (and snapshot) the instant we set innerHTML, before m-badge is resolved. Resolving the
    // bundle tag up front reproduces the Phase-1-before-any-wake ordering deterministically.
    buildComponentResolver({ archmlPath: archPath }).resolve("m-badge");

    document.body.innerHTML = content;
    await loadMindComponents(document);
    await delay(200); // memory wakes and snapshots
});

afterAll(() => {
    resetLoadedArchitecture();
    for (const d of [bundleRoot, home]) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
    }
});

test("the bundle-only <m-badge> resolved from the bundle layer", () => {
    const sources = getLoadedComponentSources();
    const badge = sources.find((s) => s.tag === "m-badge");
    expect(badge).toBeTruthy();
    expect(badge.layer).toBe("bundle");
});

test("a waking mind snapshots its custom components into home/components/, byte-for-byte", () => {
    const snap = path.join(home, "components", "mBadge.js");
    expect(fs.existsSync(snap)).toBe(true);
    expect(fs.readFileSync(snap, "utf8")).toBe(badgeSrc);
    // architecture.archml is still snapshotted alongside — the home is a full bundle.
    expect(fs.existsSync(path.join(home, "architecture.archml"))).toBe(true);
});
