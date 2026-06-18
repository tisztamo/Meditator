// The efferent seam end to end (efference.md): the mind reaches → a realizer maps
// the reach to the wired `look` hand via tool-calls under the hood → the hand runs →
// the DEED is journaled BACKSTAGE (⌁) and never touches the tail, while the
// CONSEQUENCE re-enters as a plain External sensation with NO mention of any
// mechanism. Driven in dry-run so the whole loop runs offline and deterministically.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, stream, memory, arbiter, act, look, journalDir, savedDry;
const consequences = [];

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";   // exercise decide + realize offline

    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    journalDir = path.join(os.tmpdir(), "med-act-test-" + Date.now());

    // No model/utilityModel attrs on the mind: with none set, model resolution falls
    // back to defaults and dry-run never touches a provider — and the decide/realize
    // calls stay fully offline.
    document.body.innerHTML = `
      <m-mind name="t">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-act name="hands" every="1" threshold="0.6" cooldown="0s" intentCooldown="1s">
          <m-look name="look" latitude="47.4979" longitude="19.0402"
                  newsUrl="https://example.com/feed.xml"></m-look>
        </m-act>
      </m-mind>
    `;
    document.querySelector('[name="memory"]').setAttribute("journal", journalDir);

    await loadMindComponents(document);
    await delay(160);   // let m-look retry-register with its parent m-act

    mind = document.querySelector("m-mind");
    stream = mind.querySelector("m-stream");
    memory = mind.querySelector('[name="memory"]');
    arbiter = mind.querySelector('[name="attention"]');
    act = mind.querySelector('[name="hands"]');
    look = mind.querySelector('[name="look"]');

    // Capture every consequence the hands send back into the afferent bus.
    mind.addEventListener("interrupt-request", e => {
        const r = e && e.detail;
        if (r && String(r.type || "").startsWith("Sense-")) consequences.push(r);
    });
});

afterAll(() => {
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDry;
    try { fs.rmSync(journalDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("the look hand registered itself with m-act (the closed menu)", () => {
    expect(act._capabilities.map(c => c.name)).toContain("look");
    expect(act._capabilities[0].readonly).toBe(true);
});

test("the hand contributes a felt line to the mind's body schema (embodiment)", () => {
    // m-act assembles each hand's first-person `felt` into an `embodiment` it publishes;
    // the mind weaves it into its identity so it knows what it can reach (no tool menu).
    expect(act.embodiment).toMatch(/you can reach toward it/);
    expect(act.embodiment.toLowerCase()).not.toMatch(/\btool\b|function|schema|argument|subject/);
});

test("a reach becomes a deed and a perceived consequence — never a tool result", async () => {
    // Give the observer enough recent thought to judge a reach from (m-act needs a
    // window of at least 200 chars before it will consider a reach at all).
    stream.pub("chunk",
        "I keep wondering what the day is doing outside — whether the light has shifted, "
        + "whether it has turned toward evening yet while I have been in here thinking. "
        + "There is something about not knowing the hour that unsettles me; the room gives "
        + "no clue, and I find the not-knowing has become its own small itch I would like to "
        + "scratch by simply looking out at the actual sky for once. ");
    await delay(10);

    // Drive boundaries until the dry decide accepts a reach and the loop completes.
    // (The dry decide alternates NONE/reach, so a couple of turns suffice.)
    for (let i = 0; i < 10 && consequences.length === 0; i++) {
        await act.onBoundary({ reason: "completed" });
        await delay(10);
    }

    // A consequence came back, and it is a plain External sensation.
    expect(consequences.length).toBeGreaterThan(0);
    const c = consequences[0];
    expect(c.source).toBe("External");
    expect(c.urgent).toBe(false);
    expect((c.reason || "").length).toBeGreaterThan(20);

    // INVARIANT (§5.2): the consequence is an experience, never a result — no JSON, no
    // "the tool returned", no schema/mechanism leaking into the mind's prose. (Natural
    // verbs like "look"/"turn"/"see" are fine — that is the self-caused efference copy,
    // not mechanism.)
    expect(c.reason.toLowerCase()).not.toMatch(/\btool\b|tool_call|capability|function call|"subject"|\bschema\b|\bargument/);
    // INVARIANT (§Efference copy): the consequence is SELF-CAUSED, not spontaneous —
    // the mind feels it turned toward the world, so it can learn it acted.
    expect(c.reason.toLowerCase()).toMatch(/\bi\b/);

    // INVARIANT (§5.4): the arbiter receives it like any other stimulus, so it would
    // be journaled perceived (⟂) via the ordinary `attended` path.
    const pending = arbiter.takePending();
    expect(pending.some(p => p.source === "External")).toBe(true);
});

test("the deed is journaled backstage (⌁) and never touches the verbatim tail", async () => {
    await delay(60);   // let the journal queue flush
    const day = new Date().toISOString().slice(0, 10);
    const journal = fs.readFileSync(path.join(journalDir, `${day}.md`), "utf8");

    // INVARIANT (§5.3): the deed is recorded for us as a backstage (⌁) note…
    expect(journal).toMatch(/⌁ The hands reached out .* via look/);

    // …and the mind never saw it reach: the deed is not in the verbatim tail.
    expect(memory.getTail()).not.toMatch(/reached out/);
});
