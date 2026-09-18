// m-judge's engine switch (doc/plans/jev-system-one-integration.md §1, Phase 3).
//
// Which engine grades the mind's evidence is derived from the resolved provider's
// `kind` and from nothing else: a completion provider is asked in prose, a
// `decision` provider is asked the same question as a question. Both return
// `{verdict, confidence}`, so nothing downstream can tell them apart — that is
// what these tests pin.
//
// No DOM: the component is exercised through its prototype against a minimal
// host, because the switch lives entirely in `_judge` and its two callees. The
// wiring of m-judge behind the comparator port is covered in
// architecture/tests/wiring/phase-3b-b2.test.js.
import { test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// mBaseComponent extends A(HTMLElement) at module scope. A bare stand-in is
// enough to import the class; nothing here constructs a custom element.
globalThis.HTMLElement ??= class HTMLElement {};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-judge-engine-"));
afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

const YAML = `
defaultProfile: local-voice
providers:
  local:
    baseURL: "http://localhost:1248"
    apiKey: "none"
  openrouter:
    baseURL: "https://openrouter.ai/api/v1"
    apiKey: "sk-test"
  typesafe:
    kind: decision
    baseURL: "https://api.typesafe.ai/v1"
    apiKey: "ts-test"
roles:
  voice:
    provider: openrouter
    model: cloud-voice
  utility:
    provider: openrouter
    model: cloud-utility
  judge:
    provider: openrouter
    model: cloud-judge
presets:
  gpu-local:
    provider: local
    model: ardincoder-1
  jev:
    provider: typesafe
    model: jev-latest
profiles:
  local-voice:
    roles:
      voice: gpu-local
      utility: utility
      judge: gpu-local
  local-voice-jev:
    roles:
      voice: gpu-local
      utility: utility
      judge: jev
`;

// One module instance throughout: mJudge.js resolves through the modelConfig
// singleton loaded here, so a cache-busted copy would look at an unloaded config.
const config = await import("../../../src/modelAccess/modelConfig.js");
const { MJudge } = await import("../../../src/mindComponents/mind/mJudge.js");
const { VERDICT_GLOSSES } = await import("../../../src/infrastructure/judgeCompare.js");

async function load({ profile }) {
    const yamlPath = path.join(tmp, `models-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`);
    fs.writeFileSync(yamlPath, YAML);
    const savedArgv = process.argv;
    process.argv = ["bun", "meditator.js", "--model-profile", profile, "--models-config", yamlPath];
    try {
        await config.loadModelConfig();
    } finally {
        process.argv = savedArgv;
    }
}

/** A host with just the surface `_judge` touches: attributes, ancestor env, and
 * the two transport seams, each recording what it was handed. */
function host({ attrs = {}, decide, complete } = {}) {
    const calls = { decide: [], complete: [] };
    const el = Object.create(MJudge.prototype);
    el.attr = name => attrs[name];
    el.env = () => undefined;
    el._decide = async opts => { calls.decide.push(opts); return decide ? decide(opts) : null; };
    el._complete = async opts => { calls.complete.push(opts); return complete ? complete(opts) : { text: "" }; };
    return { el, calls };
}

const ANSWER = {
    answers: {
        verdict: {
            type: "choice", choice: "mismatch", confidence: 0.94,
            probabilities: { match: 0.03, mismatch: 0.94, insufficient: 0.03 },
        },
    },
    usage: { prompt_tokens: 637, completion_tokens: 0, cost: 0.0000268 },
    latencyMs: 311,
    model: "jev-1.13.0",
};

const savedDryRun = process.env.MEDITATOR_DRY_RUN;
beforeEach(() => { delete process.env.MEDITATOR_DRY_RUN; });
afterEach(() => {
    if (savedDryRun === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDryRun;
});

test("a decision provider routes the judge through decide(), not complete()", async () => {
    await load({ profile: "local-voice-jev" });
    const { el, calls } = host({ attrs: { model: "judge" }, decide: () => ANSWER });

    const judged = await el._judge("the count comes back 8", "The screen comes back with: 12");

    expect(judged).toEqual({ verdict: "mismatch", confidence: 0.94 });
    expect(calls.complete).toHaveLength(0);
    expect(calls.decide).toHaveLength(1);

    // The Phase-2 winning question set: one `choice`, the judge's own glosses as
    // criteria, over the narrated {expected, perceived}.
    const sent = calls.decide[0];
    expect(sent.state).toEqual({
        expected: "the count comes back 8",
        perceived: "The screen comes back with: 12",
    });
    expect(Object.keys(sent.questions)).toEqual(["verdict"]);
    expect(sent.questions.verdict.type).toBe("choice");
    expect(sent.questions.verdict.criteria).toEqual({
        match: VERDICT_GLOSSES.match,
        mismatch: VERDICT_GLOSSES.mismatch,
        insufficient: VERDICT_GLOSSES.insufficient,
    });
});

test("the completion path is untouched under a profile whose judge is an LLM", async () => {
    await load({ profile: "local-voice" });
    const { el, calls } = host({
        attrs: { model: "judge" },
        complete: () => ({ text: "It printed the value asked for.\nVERDICT: MATCH CONFIDENCE: 0.9" }),
    });

    const judged = await el._judge("the count comes back 8", "The screen comes back with: 8");

    expect(judged).toEqual({ verdict: "match", confidence: 0.9 });
    expect(calls.decide).toHaveLength(0);
    expect(calls.complete).toHaveLength(1);
    expect(calls.complete[0].prompt).toContain("Expected:");
});

test("the deadline and abort signal are carried into the decision call", async () => {
    await load({ profile: "local-voice-jev" });
    const { el, calls } = host({ attrs: { model: "judge" }, decide: () => ANSWER });
    const controller = new AbortController();
    const deadline = Date.now() + 2000;

    await el._judge("x", "y", { deadline, signal: controller.signal });

    expect(calls.decide[0].deadline).toBe(deadline);
    expect(calls.decide[0].signal).toBe(controller.signal);
});

test("a soft failure reads insufficient at zero confidence", async () => {
    await load({ profile: "local-voice-jev" });
    const { el } = host({ attrs: { model: "judge" }, decide: () => null });

    expect(await el._judge("x", "y")).toEqual({ verdict: "insufficient", confidence: 0 });
    expect(el.lastJudgement).toMatchObject({ engine: "decision", softFail: true, verdict: "insufficient" });
});

test("an answer outside the three verdicts reads insufficient, and drops its confidence", async () => {
    await load({ profile: "local-voice-jev" });
    const { el } = host({
        attrs: { model: "judge" },
        decide: () => ({ ...ANSWER, answers: { verdict: { type: "choice", choice: "maybe", confidence: 0.99 } } }),
    });

    expect(await el._judge("x", "y")).toEqual({ verdict: "insufficient", confidence: 0 });
});

test("provenance names the engine and the version the endpoint pinned", async () => {
    await load({ profile: "local-voice-jev" });
    const { el } = host({ attrs: { model: "judge" }, decide: () => ANSWER });

    await el._judge("x", "y");

    expect(el.lastJudgement).toMatchObject({
        engine: "decision",
        model: "jev-1.13.0",   // not "jev-latest": another version is another measurement
        verdict: "mismatch",
        confidence: 0.94,
        latencyMs: 311,
    });
});

test("dry run still answers, so an architecture on this profile wakes offline", async () => {
    await load({ profile: "local-voice-jev" });
    process.env.MEDITATOR_DRY_RUN = "1";
    // The real decide(), no stub and no fetch: offline it returns a uniform
    // distribution over the three verdicts.
    const el = Object.create(MJudge.prototype);
    el.attr = name => (name === "model" ? "judge" : undefined);
    el.env = () => undefined;

    const judged = await el._judge("x", "y");

    expect(["match", "mismatch", "insufficient"]).toContain(judged.verdict);
    // Zero confidence is the honest offline strength, and it is what bidderPolicy
    // multiplies by — a dry verdict can never read as evidence.
    expect(judged.confidence).toBe(0);
});
