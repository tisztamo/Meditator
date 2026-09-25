// The reach explanation (efference.md, the un-post-trained model's "say it out
// loud"): the mind's identity prompt tells it, in a few high-level sentences of
// INFORMATION (not instructions), how its hands work — that a genuine pull in the
// thinking is what triggers them, that it never sees the acting, and that the world
// answers as a plain "> ⟂" sensation. It is woven in only when the mind actually has
// hands (the body schema is non-empty), and it names no hand, no mechanism, no
// threshold — the felt lines stay the per-hand affordances; this is the faculty-level
// "how reaching works" that no single hand advertises.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, notesDir;

beforeAll(async () => {
    notesDir = path.join(os.tmpdir(), "med-reach-test-" + Date.now());

    // No pre-definition of m-mind: loadMindComponents must upgrade it to the real
    // MMind class (whose _identity() assembles the prompt), not a bare element.
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-act name="hands" every="1">
          <m-note name="note"></m-note>
          <m-recall name="recall"></m-recall>
        </m-act>
      </m-mind>
    `;
    document.querySelector('[name="note"]').setAttribute("dir", notesDir);
    document.querySelector('[name="recall"]').setAttribute("dir", notesDir);

    await loadMindComponents(document);
    await delay(160);   // let both hands retry-register with their parent m-act

    mind = document.querySelector("m-mind");
});

afterAll(() => {
    try { fs.rmSync(notesDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("a mind with hands is told how reaching works, as information", () => {
    const identity = mind._identity();
    // The faculty-level explanation is present…
    expect(identity).toMatch(/How your hands work/i);
    // …and it says the three true things: the pull triggers, the acting is unseen,
    // the answer arrives as a sensation the mind does not read.
    expect(identity).toMatch(/genuine pull/i);
    expect(identity).toMatch(/never see them work/i);
    expect(identity).toMatch(/plain sensation/i);
    expect(identity).toMatch(/You do not read a result/i);
    // It comes AFTER the body schema (the per-hand affordances), so the mind first
    // learns what it can reach and then how reaching works.
    const bodyAt = identity.search(/how you meet the world/i);
    const reachAt = identity.search(/How your hands work/i);
    expect(bodyAt).toBeGreaterThanOrEqual(0);
    expect(reachAt).toBeGreaterThan(bodyAt);
});

test("the reach explanation names no hand, no mechanism, no threshold", () => {
    const identity = mind._identity();
    // Cut the explanation out of the identity and check its own vocabulary.
    const reach = identity.slice(identity.search(/How your hands work/i));
    expect(reach.toLowerCase()).not.toMatch(/\bnote\b|\brecall\b|\bterminal\b|\blook\b|\borient\b|\bsearch\b/);
    expect(reach.toLowerCase()).not.toMatch(/\btool\b|\bfunction\b|\bcall\b|\bschema\b|\bargument\b|\bthreshold\b|\bcooldown\b/);
});

test("a handless mind is never told it can reach", () => {
    // A fresh MMind with no m-act: the body schema stays empty → no reach explanation.
    // Build it off-document so it never connects, and set the mirror directly.
    const bare = document.createElement("m-mind");
    bare.setAttribute("name", "bare");
    bare._embodiment = "";
    const identity = bare._identity();
    expect(identity).not.toMatch(/How your hands work/i);
    expect(identity).not.toMatch(/genuine pull/i);
});
