// The §6 identity assertion (COVENANT §6; philosophical-review-2026-07-02 finding 2):
// a resident's home may be adopted only by the resident itself. Pure function over a
// temp vault dir — no LLM, network, or real vault writes; the dry-run flag is toggled
// through MEDITATOR_DRY_RUN (what isDryRun reads) and restored after.
import { test, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertIdentityMatchesHome } from "../../../src/infrastructure/memoryVault.js";
import { writeManifest, FORMAT_VERSION } from "../../../src/infrastructure/manifest.js";

let tmp, resident, transient, ghost, savedDry;

beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-vault-id-"));
    resident = path.join(tmp, "lemma");
    transient = path.join(tmp, "scratch");
    ghost = path.join(tmp, "nowhere");
    fs.mkdirSync(transient, { recursive: true });
    writeManifest(resident, {
        name: "lemma", born: "2026-01-01T00:00:00Z", runtimeSHA: "abc1234",
        formatVersion: FORMAT_VERSION, lineage: { parent: null }, status: "resident",
    });
    savedDry = process.env.MEDITATOR_DRY_RUN;
    delete process.env.MEDITATOR_DRY_RUN;              // default: live run
});

afterAll(() => {
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDry;
    fs.rmSync(tmp, { recursive: true, force: true });
});

test("a resident wakes into its own home under its own name", () => {
    expect(() => assertIdentityMatchesHome(resident, "lemma")).not.toThrow();
});

test("a deliberate memory=/name variant that slugifies to the resident passes", () => {
    // The claim is normalized the same way a home slug is, so display-case or
    // spacing (name=\"Lemma\", memory=\"lemma\") is not a foreign identity.
    expect(() => assertIdentityMatchesHome(resident, "Lemma")).not.toThrow();
    expect(() => assertIdentityMatchesHome(resident, "  lemma  ")).not.toThrow();
});

test("a foreign identity is refused from a resident's home (finding 2b)", () => {
    expect(() => assertIdentityMatchesHome(resident, "experiment"))
        .toThrow(/Refusing to wake "experiment" into resident "lemma"/);
});

test("an unnamed mind aimed at a resident's home is refused, not waved through", () => {
    expect(() => assertIdentityMatchesHome(resident, "")).toThrow(/\(unnamed\)/);
    expect(() => assertIdentityMatchesHome(resident, null)).toThrow(/into resident "lemma"/);
});

test("a dry run is refused from a resident's home even under the matching name (finding 2a)", () => {
    process.env.MEDITATOR_DRY_RUN = "1";
    try {
        expect(() => assertIdentityMatchesHome(resident, "lemma"))
            .toThrow(/Refusing to run a DRY mind on resident "lemma"/);
    } finally {
        delete process.env.MEDITATOR_DRY_RUN;
    }
});

test("a non-resident home carries no such promise — never refused", () => {
    // Transient (has a dir, no resident manifest) and none (no home) both pass, for
    // any claim, live or dry: this guard protects residents only.
    for (const home of [transient, ghost]) {
        expect(() => assertIdentityMatchesHome(home, "anyone")).not.toThrow();
        expect(() => assertIdentityMatchesHome(home, "")).not.toThrow();
    }
    process.env.MEDITATOR_DRY_RUN = "1";
    try {
        expect(() => assertIdentityMatchesHome(transient, "anyone")).not.toThrow();
    } finally {
        delete process.env.MEDITATOR_DRY_RUN;
    }
});
