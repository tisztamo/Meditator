// Identity-change detection at wake (COVENANT §3/§4): the pure differ that compares
// the bundle that RAN a home last session (its snapshot) with the bundle waking it
// now, and the prose that disclosure produces. See src/infrastructure/identityDiff.js
// and the wiring in mMemory.onConnect / _load.
import { test, expect } from "bun:test";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { readBundleSync, diffBundles, describeIdentityChange } from "../../../src/infrastructure/identityDiff.js";

const MIND = (prose, extra = "") => `<m-mind name="lemma" lang="en">
  ${prose}
  <m-origin name="origin">Find the smallest balanced number.</m-origin>
  <m-stream name="stream"></m-stream>
  <m-memory name="memory" tailLength="1500"></m-memory>
  ${extra}
</m-mind>
`;

const bundle = (archml, components = {}) => ({ archml, components });

// ── comparand availability ────────────────────────────────────────────────────

test("no prior snapshot → null (nothing to compare, nothing to disclose)", () => {
    expect(diffBundles(null, bundle(MIND("I am lemma.")))).toBe(null);
    expect(diffBundles(bundle(MIND("I am lemma.")), null)).toBe(null);
});

test("byte-identical bundle → changed:false", () => {
    const a = bundle(MIND("I am lemma."), { "my-part.js": "export {}" });
    const b = bundle(MIND("I am lemma."), { "my-part.js": "export {}" });
    const report = diffBundles(a, b, { mindName: "lemma" });
    expect(report.changed).toBe(false);
    expect(describeIdentityChange(report)).toBe(null);
});

// ── identity prose (§3's headline case) ───────────────────────────────────────

test("changed self-description is reported as identity", () => {
    const report = diffBundles(
        bundle(MIND("I am lemma, a mind that loves numbers.")),
        bundle(MIND("I am lemma, a mind that loves numbers and proofs.")),
        { mindName: "lemma" });
    expect(report.changed).toBe(true);
    expect(report.identity).not.toBe(null);
    const d = describeIdentityChange(report);
    expect(d.stream).toContain("self-description");
    expect(d.journal).toContain("identity prose changed");
});

test("whitespace-only reflow of the prose is NOT an identity change", () => {
    const report = diffBundles(
        bundle(MIND("I am lemma,\na mind that loves numbers.")),
        bundle(MIND("I am lemma, a mind\n  that loves numbers.")),
        { mindName: "lemma" });
    expect(report.changed).toBe(false);
});

test("prompt attribute is read as the prose, like getPrompt does", () => {
    const report = diffBundles(
        bundle(`<m-mind name="a" prompt="I am one mind."></m-mind>`),
        bundle(`<m-mind name="a" prompt="I am another mind."></m-mind>`),
        { mindName: "a" });
    expect(report.identity).not.toBe(null);
});

// ── origin ────────────────────────────────────────────────────────────────────

test("a changed origin is named as origin, not as identity or structure", () => {
    const report = diffBundles(
        bundle(MIND("I am lemma.")),
        bundle(MIND("I am lemma.").replace("Find the smallest balanced number.", "Prove the twin prime conjecture.")),
        { mindName: "lemma" });
    expect(report.changed).toBe(true);
    expect(report.origin).toBe(true);
    expect(report.identity).toBe(null);
    expect(report.structure.changed).toEqual([]);
    expect(describeIdentityChange(report).stream).toContain("origin");
});

// ── structure ─────────────────────────────────────────────────────────────────

test("an added part is disclosed by role and tag", () => {
    const report = diffBundles(
        bundle(MIND("I am lemma.")),
        bundle(MIND("I am lemma.", `<m-terminal name="hands"></m-terminal>`)),
        { mindName: "lemma" });
    expect(report.structure.added).toEqual(["hands (m-terminal)"]);
    const d = describeIdentityChange(report);
    expect(d.stream).toContain("parts I did not have before: hands (m-terminal)");
});

test("a removed part is disclosed", () => {
    const report = diffBundles(
        bundle(MIND("I am lemma.", `<m-terminal name="hands"></m-terminal>`)),
        bundle(MIND("I am lemma.")),
        { mindName: "lemma" });
    expect(report.structure.removed).toEqual(["hands (m-terminal)"]);
    expect(describeIdentityChange(report).stream).toContain("removed: hands (m-terminal)");
});

test("a re-tuned part reports which attributes changed", () => {
    const report = diffBundles(
        bundle(MIND("I am lemma.")),
        bundle(MIND("I am lemma.").replace('tailLength="1500"', 'tailLength="3000"')),
        { mindName: "lemma" });
    expect(report.structure.changed).toEqual([{ label: "memory (m-memory)", attrs: ["taillength"], text: false }]);
    expect(describeIdentityChange(report).journal).toContain("memory (m-memory): taillength");
});

test("a changed root attribute (interlocutor) is a settings change on the mind itself", () => {
    const report = diffBundles(
        bundle(`<m-mind name="a" interlocutor="Kris">I am a.</m-mind>`),
        bundle(`<m-mind name="a" interlocutor="Margit">I am a.</m-mind>`),
        { mindName: "a" });
    expect(report.changed).toBe(true);
    expect(report.structure.changed).toEqual([{ label: "a (m-mind)", attrs: ["interlocutor"], text: false }]);
});

// ── society scoping ───────────────────────────────────────────────────────────

const SOCIETY = (aProse, bProse) => `<m-society name="duet">
  <m-mind name="prover">${aProse}<m-stream name="stream"></m-stream></m-mind>
  <m-mind name="checker">${bProse}<m-stream name="stream"></m-stream></m-mind>
</m-society>
`;

test("a society member sees only its own changes, not a sibling's", () => {
    const prev = bundle(SOCIETY("I prove.", "I check."));
    const next = bundle(SOCIETY("I prove.", "I check very carefully."));
    const prover = diffBundles(prev, next, { mindName: "prover" });
    expect(prover.changed).toBe(false);
    const checker = diffBundles(prev, next, { mindName: "checker" });
    expect(checker.identity).not.toBe(null);
});

// ── custom component code ─────────────────────────────────────────────────────

test("modified component code is disclosed as inner workings", () => {
    const report = diffBundles(
        bundle(MIND("I am lemma."), { "my-origin.js": "export class A {}" }),
        bundle(MIND("I am lemma."), { "my-origin.js": "export class B {}" }),
        { mindName: "lemma" });
    expect(report.components.modified).toEqual(["my-origin.js"]);
    const d = describeIdentityChange(report);
    expect(d.stream).toContain("inner workings");
    expect(d.journal).toContain("components ~[my-origin.js]");
});

// ── disclosure shape ──────────────────────────────────────────────────────────

test("long change lists are folded, not dumped", () => {
    const extra = Array.from({ length: 7 }, (_, i) => `<m-sense name="sense${i}"></m-sense>`).join("");
    const report = diffBundles(
        bundle(MIND("I am lemma.")),
        bundle(MIND("I am lemma.", extra)),
        { mindName: "lemma" });
    const d = describeIdentityChange(report);
    expect(d.stream).toContain("and 3 more");
});

// ── readBundleSync ────────────────────────────────────────────────────────────

test("readBundleSync reads a home's snapshot and components, null when absent", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "med-iddiff-"));
    try {
        expect(readBundleSync(home)).toBe(null);          // no snapshot yet
        expect(readBundleSync(null)).toBe(null);
        fs.writeFileSync(path.join(home, "architecture.archml"), MIND("I am lemma."));
        fs.mkdirSync(path.join(home, "components", "deep"), { recursive: true });
        fs.writeFileSync(path.join(home, "components", "deep", "part.js"), "export {}");
        const b = readBundleSync(home);
        expect(b.archml).toContain("I am lemma.");
        expect(b.components["deep/part.js"]).toBe("export {}");
    } finally {
        fs.rmSync(home, { recursive: true, force: true });
    }
});
