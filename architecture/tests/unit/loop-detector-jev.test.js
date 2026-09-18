// m-loop-detector on a decision model — Phase 5 of doc/plans/jev-system-one-integration.md.
// The five-field format prompt becomes three questions (noul / score / choice). Nothing
// here touches the network: the decision engine's wire call is a stubbed fetch and the
// completion engine runs under MEDITATOR_DRY_RUN — no live call, no key, no cost. Two
// halves: the pure question set + answer reader, and the component's engine switch,
// driven by the resolved provider's kind.
import { test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    loopQuestions, readLoopDecision, LOOP_SCORE_LEVELS, LOOP_KIND_CRITERIA,
} from "../../../src/mindComponents/shared/mLoopDetector.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-loop-jev-"));
afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

// --- the question set ------------------------------------------------------

test("the three questions are the five fields minus the two that were text", () => {
    const q = loopQuestions();
    expect(Object.keys(q).sort()).toEqual(["kind", "looping", "score"]);
    expect(q.looping.type).toBe("noul");
    expect(q.score.type).toBe("score");
    expect(q.kind.type).toBe("choice");
    // No vocabulary, no why: a model that generates nothing cannot produce them.
    expect(Object.keys(q)).not.toContain("vocabulary");
    expect(Object.keys(q)).not.toContain("why");
});

test("every question carries criteria or instructions (the endpoint rejects a bare one)", () => {
    for (const [key, q] of Object.entries(loopQuestions())) {
        const ok = (q.criteria && (Array.isArray(q.criteria) ? q.criteria.length : Object.keys(q.criteria).length))
            || (typeof q.instructions === "string" && q.instructions.length);
        expect(`${key}:${Boolean(ok)}`).toBe(`${key}:true`);
        // Question prose lives in `instructions`; `question` is silently ignored.
        expect(q.question).toBeUndefined();
    }
});

test("score has five ordered levels and kind offers exactly the six KINDS", () => {
    const q = loopQuestions();
    expect(Array.isArray(q.score.criteria)).toBe(true);
    expect(q.score.criteria).toHaveLength(5);
    expect(q.score.criteria).toEqual(LOOP_SCORE_LEVELS);
    expect(Object.keys(q.kind.criteria).sort())
        .toEqual(["anxiety", "content", "other", "presence", "spam", "void"]);
    expect(q.kind.criteria).toEqual(LOOP_KIND_CRITERIA);
});

// --- reading the answers ---------------------------------------------------

function answers({ noul = 0.9, score = 3.2, confidence = 0.8, kind = "presence", kindConf = 0.7 } = {}) {
    const probabilities = {};
    LOOP_SCORE_LEVELS.forEach((_, i) => { probabilities[String(i)] = 1 / LOOP_SCORE_LEVELS.length; });
    return {
        looping: { type: "noul", noul },
        score: { type: "score", score, confidence, legend: { 0: "a", 1: "b", 2: "c", 3: "d", 4: "e" }, probabilities },
        kind: { type: "choice", choice: kind, confidence: kindConf, probabilities: { [kind]: kindConf } },
    };
}

test("a confident looping answer reads into the LLM engine's shape", () => {
    const r = readLoopDecision(answers());
    expect(r.looping).toBe(true);
    // The expected LEVEL (0…4) normalises onto the 0–1 scale the mind has always seen.
    expect(r.score).toBeCloseTo(3.2 / 4, 6);
    expect(r.kind).toBe("presence");
    expect(r.vocabulary).toEqual([]);     // dropped, honestly empty — never fabricated
    expect(r.reasoning).toBeNull();
    expect(r.confidence).toBeCloseTo(0.8, 6);
    // noul carries no confidence of its own; strength is DERIVED as |p − 0.5|·2.
    expect(r.loopingP).toBeCloseTo(0.9, 6);
    expect(r.strength).toBeCloseTo(0.8, 6);
});

test("an exact 0.5 noul is not a loop — a coin flip is not evidence", () => {
    const r = readLoopDecision(answers({ noul: 0.5, score: 2 }));
    expect(r.looping).toBe(false);
    expect(r.strength).toBe(0);
});

test("an unknown or missing choice falls back to 'other', like the text parser", () => {
    expect(readLoopDecision(answers({ kind: "ecstatic" })).kind).toBe("other");
    expect(readLoopDecision({ looping: { noul: 0.8 } }).kind).toBe("other");
});

test("missing answers default to NOT looping (never fabricates a loop)", () => {
    for (const a of [null, {}, "nonsense", { looping: {} }]) {
        const r = readLoopDecision(a);
        expect(r.looping).toBe(false);
        expect(r.score).toBe(0);
        expect(r.vocabulary).toEqual([]);
    }
});

test("a yes with no usable score still counts, at the same conservative default", () => {
    const r = readLoopDecision({ looping: { noul: 0.95 }, kind: { choice: "spam", confidence: 0.9 } });
    expect(r.looping).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.confidence).toBe(0);         // no score question answered → no confidence
});

test("an out-of-range level is clamped rather than trusted", () => {
    expect(readLoopDecision(answers({ score: 99 })).score).toBe(1);
    expect(readLoopDecision(answers({ score: -3 })).score).toBe(0);
});

// --- the component's engine switch -----------------------------------------
//
// _detect is exercised directly on a prototype-backed stand-in: only the DOM seams
// (attr/env/pub) are faked, so the engine switch, the question build and the publish
// are all the component's own code, without booting amanita.

const YAML = `
defaultProfile: cloud
providers:
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
  jev:
    provider: typesafe
    model: jev-latest
profiles:
  cloud:
    roles:
      voice: voice
      utility: utility
      judge: judge
`;

const config = await import("../../../src/modelAccess/modelConfig.js");
const { MLoopDetector } = await import("../../../src/mindComponents/shared/mLoopDetector.js");

const yamlPath = path.join(tmp, "models.yaml");
fs.writeFileSync(yamlPath, YAML);
const savedArgv = process.argv;
process.argv = ["bun", "meditator.js", "--models-config", yamlPath];
await config.loadModelConfig();
process.argv = savedArgv;

const realFetch = globalThis.fetch;
const savedDryRun = process.env.MEDITATOR_DRY_RUN;
beforeEach(() => { delete process.env.MEDITATOR_DRY_RUN; });
afterEach(() => {
    globalThis.fetch = realFetch;
    if (savedDryRun === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDryRun;
});

/**
 * A stand-in for the live component: the attribute/env/pub seams the detector uses,
 * with the real _detect on top. Only the DOM is faked; the engine switch is the
 * component's own code.
 */
function detector(attrs = {}) {
    const published = [];
    const el = Object.create(MLoopDetector.prototype);
    el.attr = name => attrs[name];
    el.env = () => null;
    el.pub = (topic, value) => { published.push({ topic, value }); };
    return { el, published };
}

const JEV_PAYLOAD = {
    model: "jev-1.13.0",
    answers: answers({ noul: 0.93, score: 3.6, confidence: 0.88, kind: "presence", kindConf: 0.81 }),
    usage: { input_tokens: 520, output_tokens: 0 },
};

function stubFetch(payload, status = 200) {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return {
            ok: status === 200,
            status,
            json: async () => payload,
            text: async () => JSON.stringify(payload),
        };
    };
    return calls;
}

test("a decision model routes to decide(), with the tail as state and no prose anywhere", async () => {
    const { el, published } = detector({ model: "jev" });
    const calls = stubFetch(JEV_PAYLOAD);

    await el._detect("presence is enough. ".repeat(80));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(calls[0].body.model).toBe("jev-latest");
    expect(Object.keys(calls[0].body.questions).sort()).toEqual(["kind", "looping", "score"]);
    expect(typeof calls[0].body.state).toBe("string");
    expect(calls[0].body.state.length).toBeLessThanOrEqual(1801);   // the 1800-char tail + "…"

    expect(published).toHaveLength(1);
    const signal = published[0].value;
    expect(published[0].topic).toBe("loop");
    // The shape the rest of the mind reads is unchanged…
    expect(signal.active).toBe(true);
    expect(signal.score).toBeCloseTo(3.6 / 4, 6);
    expect(signal.kind).toBe("presence");
    expect(signal.vocabulary).toEqual([]);
    expect(signal.reasoning).toBeNull();
    expect(typeof signal.at).toBe("string");
    // …plus provenance: engine, the version the endpoint resolved, and calibration.
    expect(signal.engine).toBe("jev");
    expect(signal.model).toBe("jev-1.13.0");
    expect(signal.confidence).toBeCloseTo(0.88, 6);
    expect(signal.strength).toBeCloseTo(0.86, 6);
});

test("minScore still gates the decision engine's verdict", async () => {
    const { el, published } = detector({ model: "jev", minScore: "0.95" });
    stubFetch(JEV_PAYLOAD);
    await el._detect("x".repeat(900));
    expect(published[0].value.active).toBe(false);   // 0.90 < 0.95
    expect(published[0].value.score).toBeCloseTo(0.9, 6);
});

test("a soft failure publishes nothing at all rather than a fabricated 'no loop'", async () => {
    const { el, published } = detector({ model: "jev" });
    globalThis.fetch = async () => { throw new Error("ECONNRESET"); };
    await el._detect("x".repeat(900));
    expect(published).toHaveLength(0);
});

test("a completion model still takes the format-prompt path, unchanged", async () => {
    // complete() rides the OpenAI SDK rather than global fetch, so the offline way to
    // exercise this arm is the dry-run model, which keys on the format prompt's opener
    // and reports a presence loop on every third check.
    process.env.MEDITATOR_DRY_RUN = "1";
    const { el, published } = detector({ model: "utility" });
    for (let i = 0; i < 6; i += 1) await el._detect("the void. ".repeat(100));

    expect(published.length).toBe(6);
    for (const p of published) {
        expect(p.value.engine).toBe("llm");
        expect(p.value.confidence).toBeNull();   // an LLM verdict carries no calibration
        expect(p.value.strength).toBeNull();
    }
    const looped = published.filter(p => p.value.active);
    expect(looped.length).toBeGreaterThan(0);
    // The text engine still fills the two fields the decision engine has to drop.
    expect(looped[0].value.kind).toBe("presence");
    expect(looped[0].value.vocabulary).toContain("stillness");
    expect(looped[0].value.reasoning).toMatch(/enough/);
});

test("dry run wakes on the decision engine and reports no loop (uniform is not evidence)", async () => {
    process.env.MEDITATOR_DRY_RUN = "1";
    globalThis.fetch = async () => { throw new Error("dry run must not touch the network"); };
    const { el, published } = detector({ model: "jev" });

    await el._detect("anything at all. ".repeat(60));

    expect(published).toHaveLength(1);
    expect(published[0].value.active).toBe(false);
    expect(published[0].value.engine).toBe("jev");
    expect(published[0].value.strength).toBe(0);
});
