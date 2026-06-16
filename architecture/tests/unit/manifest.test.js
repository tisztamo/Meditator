// Manifest lifecycle — temp dir only, no LLM, network, or vault writes.
import { test, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    FORMAT_VERSION, readManifest, writeManifest, recordWake, tierOf, manifestPath,
} from "../../../src/infrastructure/manifest.js";

let tmp, home, bare;

beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-manifest-"));
    home = path.join(tmp, "resident");
    bare = path.join(tmp, "transient");
    fs.mkdirSync(bare, { recursive: true });
});

afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
});

const seed = {
    name: "resident",
    born: "2026-01-01T00:00:00Z",
    runtimeSHA: "abc1234",
    formatVersion: FORMAT_VERSION,
    lineage: { parent: null },
    status: "resident",
};

test("writeManifest / readManifest round-trip", () => {
    writeManifest(home, seed);
    expect(fs.existsSync(manifestPath(home))).toBe(true);
    expect(readManifest(home)).toEqual(seed);
    expect(readManifest(path.join(tmp, "nope"))).toBeNull();
});

test("recordWake stamps and persists a resident manifest", () => {
    writeManifest(home, seed);
    const woken = recordWake(home, "2026-06-15T12:00:00Z");
    expect(woken).toBeTruthy();
    expect(woken.lastWokenAt).toBe("2026-06-15T12:00:00Z");
    expect(woken.formatVersion).toBe(FORMAT_VERSION);
    expect(typeof woken.runtimeSHA).toBe("string");
    expect(woken.runtimeSHA.length).toBeGreaterThan(0);
    expect(woken.born).toBe(seed.born);
    expect(woken.status).toBe("resident");
    expect(readManifest(home).lastWokenAt).toBe("2026-06-15T12:00:00Z");
});

test("recordWake is a no-op without a manifest", () => {
    expect(recordWake(bare)).toBeNull();
    expect(readManifest(bare)).toBeNull();
});

test("a newer formatVersion still wakes (with warning)", () => {
    writeManifest(home, { ...seed, formatVersion: FORMAT_VERSION + 5 });
    const future = recordWake(home);
    expect(future).toBeTruthy();
    expect(future.formatVersion).toBe(FORMAT_VERSION);
});

test("tierOf classifies resident, transient, retired, and none", () => {
    writeManifest(home, seed);
    expect(tierOf(home)).toBe("resident");
    expect(tierOf(bare)).toBe("transient");
    expect(tierOf(path.join(tmp, "ghost"))).toBe("none");
    expect(tierOf(path.join(tmp, "buried"), slug => slug === "buried")).toBe("retired");
});

test("memory.md meta carries formatVersion", () => {
    const meta = JSON.stringify({ savedAt: "2026-06-15T12:00:00Z", formatVersion: FORMAT_VERSION });
    const memoryMd = `# Meditator memory\n<!-- meta: ${meta} -->\n<!-- folds: 3 -->\n\n## Story\n\n## Recent\n\n## Tail\nhello\n\n<!-- end -->\n`;
    const parsed = JSON.parse(memoryMd.match(/<!-- meta: (.*?) -->/s)[1]);
    expect(parsed.formatVersion).toBe(FORMAT_VERSION);
});
