// decide() — the decision transport (doc/plans/jev-system-one-integration.md §1).
// A System-One model answers questions and generates nothing, so it cannot ride
// complete(). These tests stub fetch: no live call, no key, no cost. The stubbed
// payloads are the shapes the Phase-0 probe actually saw from jev-1.13.0.
import { test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "med-decide-"));
afterAll(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

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
  cloud-jev:
    roles:
      voice: voice
      utility: utility
      judge: jev
`;

// One module instance throughout: decide.js and llm.js resolve through the very
// modelConfig singleton loaded here, so a cache-busted copy would leave them
// looking at an unloaded config. loadModelConfig() re-reads argv on every call,
// so switching profile is just another load.
const config = await import("../../../src/modelAccess/modelConfig.js");
const llm = await import("../../../src/modelAccess/llm.js");
const decide = await import("../../../src/modelAccess/decide.js");

async function load(yamlText = YAML, { profile = null } = {}) {
    const yamlPath = path.join(tmp, `models-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`);
    fs.writeFileSync(yamlPath, yamlText);
    const savedArgv = process.argv;
    process.argv = ["bun", "meditator.js", ...(profile ? ["--model-profile", profile] : []), "--models-config", yamlPath];
    try {
        await config.loadModelConfig();
    } finally {
        process.argv = savedArgv;
    }
    return { config, llm, decide };
}

const realFetch = globalThis.fetch;
const savedDryRun = process.env.MEDITATOR_DRY_RUN;

beforeEach(() => { delete process.env.MEDITATOR_DRY_RUN; });
afterEach(() => {
    globalThis.fetch = realFetch;
    if (savedDryRun === undefined) delete process.env.MEDITATOR_DRY_RUN;
    else process.env.MEDITATOR_DRY_RUN = savedDryRun;
});

// The live envelope, as observed: answers keyed by question, usage in input/output tokens.
function stubFetch(responses) {
    const calls = [];
    const queue = Array.isArray(responses) ? [...responses] : [responses];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        const next = queue.length > 1 ? queue.shift() : queue[0];
        return {
            ok: next.status === 200,
            status: next.status,
            json: async () => next.body,
            text: async () => (typeof next.body === "string" ? next.body : JSON.stringify(next.body)),
        };
    };
    return calls;
}

const VERDICT_PAYLOAD = {
    model: "jev-1.13.0",
    answers: {
        verdict: { type: "choice", choice: "match", confidence: 0.98, probabilities: { match: 0.99, mismatch: 0.01, insufficient: 0 } },
    },
    usage: { input_tokens: 637, output_tokens: 79 },
};

// --- pure helpers ----------------------------------------------------------

test("verdictChoice carries the judge's three glosses as criteria", async () => {
    const { decide } = await load();
    const { VERDICT_GLOSSES } = await import("../../../src/infrastructure/judgeCompare.js");
    const q = decide.verdictChoice();
    expect(q.type).toBe("choice");
    // `instructions`, not `question`: the endpoint ignores unknown keys silently.
    expect(typeof q.instructions).toBe("string");
    expect(Object.keys(q.criteria).sort()).toEqual(["insufficient", "match", "mismatch"]);
    expect(q.criteria.match).toBe(VERDICT_GLOSSES.match);
    expect(q.criteria.mismatch).toBe(VERDICT_GLOSSES.mismatch);
    expect(q.criteria.insufficient).toBe(VERDICT_GLOSSES.insufficient);
});

test("readChoice reads value, confidence and probabilities; junk reads as no evidence", async () => {
    const { decide } = await load();
    expect(decide.readChoice(VERDICT_PAYLOAD.answers.verdict)).toEqual({
        value: "match",
        confidence: 0.98,
        probabilities: { match: 0.99, mismatch: 0.01, insufficient: 0 },
    });
    // A noul answer has no `choice` and no `confidence` at all.
    expect(decide.readChoice({ type: "noul", noul: 0.83 })).toEqual({ value: null, confidence: 0, probabilities: {} });
    expect(decide.readChoice(null)).toEqual({ value: null, confidence: 0, probabilities: {} });
    expect(decide.readChoice("nonsense")).toEqual({ value: null, confidence: 0, probabilities: {} });
    // Out-of-range confidence is clamped rather than trusted.
    expect(decide.readChoice({ choice: "x", confidence: 5 }).confidence).toBe(1);
});

// --- kind routing ----------------------------------------------------------

test("a provider with kind: decision resolves as such; the others default to completion", async () => {
    const { config } = await load();
    expect(config.resolveModelRef("jev").kind).toBe("decision");
    expect(config.resolveModelRef(null, "utility").kind).toBe("completion");
});

test("complete() refuses a decision provider and decide() refuses a completion one", async () => {
    const { llm, decide } = await load();
    await expect(llm.complete({ model: "jev", prompt: "hello" })).rejects.toThrow(/decide\(\)/);
    await expect(decide.decide({ model: "utility", state: "x", questions: { q: { type: "noul", instructions: "y" } } }))
        .rejects.toThrow(/complete\(\)/);
});

test("loadModelConfig pre-flight fails on a role bound to the wrong kind", async () => {
    // The voice must generate text; a decision provider cannot.
    const badYaml = YAML.replace("      voice: voice\n      utility: utility\n      judge: jev",
                                 "      voice: jev\n      utility: utility\n      judge: judge");
    let thrown;
    try {
        await load(badYaml, { profile: "cloud-jev" });
    } catch (e) {
        thrown = e;
    }
    expect(thrown).toBeTruthy();
    expect(thrown.message).toMatch(/role "voice"/);
    expect(thrown.message).toMatch(/kind is "decision"/);
});

test("the judge role MAY hold a decision provider — that is the point of Phase 3", async () => {
    const { config } = await load(YAML, { profile: "cloud-jev" });
    expect(config.resolveModelRef(null, "judge")).toMatchObject({ provider: "typesafe", model: "jev-latest", kind: "decision" });
});

// --- the call --------------------------------------------------------------

test("decide() posts the documented body and returns answers, usage and latency", async () => {
    const { decide, llm } = await load(YAML, { profile: "cloud-jev" });
    const calls = stubFetch({ status: 200, body: VERDICT_PAYLOAD });
    const before = llm.getUsageTotals();

    const result = await decide.decide({
        state: { expected: "a list", perceived: "a list came back" },
        questions: { verdict: decide.verdictChoice() },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(calls[0].init.headers.Authorization).toBe("Bearer ts-test");
    expect(calls[0].body.model).toBe("jev-latest");
    expect(calls[0].body.state).toEqual({ expected: "a list", perceived: "a list came back" });
    expect(Object.keys(calls[0].body.questions)).toEqual(["verdict"]);

    expect(decide.readChoice(result.answers.verdict).value).toBe("match");
    expect(result.model).toBe("jev-1.13.0");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    // Usage lands in the one economy, priced at the published input rate; output is free.
    expect(result.usage.prompt_tokens).toBe(637);
    const after = llm.getUsageTotals();
    expect(after.promptTokens - before.promptTokens).toBe(637);
    expect(after.cost - before.cost).toBeCloseTo(637 * decide.DECISION_INPUT_PRICE_PER_TOKEN, 12);
});

test("decide() needs at least one question", async () => {
    const { decide } = await load(YAML, { profile: "cloud-jev" });
    await expect(decide.decide({ model: "jev", state: "x", questions: {} })).rejects.toThrow(/at least one question/);
});

test("a client error soft-fails to null rather than throwing", async () => {
    const { decide } = await load(YAML, { profile: "cloud-jev" });
    stubFetch({ status: 422, body: { detail: "Noul question must have criteria or instructions: q" } });
    const result = await decide.decide({ state: "x", questions: { q: { type: "noul", instructions: "y" } } });
    expect(result).toBeNull();
});

test("a network failure soft-fails to null", async () => {
    const { decide } = await load(YAML, { profile: "cloud-jev" });
    globalThis.fetch = async () => { throw new Error("ECONNRESET"); };
    const result = await decide.decide({ state: "x", questions: { q: { type: "noul", instructions: "y" } } });
    expect(result).toBeNull();
});

test("429 inside a compare deadline is never retried, and arms the shared backoff", async () => {
    const { decide } = await load(YAML, { profile: "cloud-jev" });
    const calls = stubFetch({ status: 429, body: { detail: "rate limited" } });
    const result = await decide.decide({
        state: "x",
        questions: { q: { type: "noul", instructions: "y" } },
        deadline: Date.now() + 2000,
    });
    expect(result).toBeNull();
    expect(calls).toHaveLength(1);           // one attempt, no retry inside the deadline
    expect(decide.getDecideBackoff().streak).toBe(1);

    // And the next call inside the cooldown does not even reach the wire.
    const again = await decide.decide({ state: "x", questions: { q: { type: "noul", instructions: "y" } } });
    expect(again).toBeNull();
    expect(calls).toHaveLength(1);
    decide.resetDecideBackoff();
});

test("529 with no deadline retries once, and a success clears the backoff", async () => {
    const { decide } = await load(YAML, { profile: "cloud-jev" });
    decide.resetDecideBackoff();
    const calls = stubFetch([
        { status: 529, body: { detail: "overloaded" } },
        { status: 200, body: VERDICT_PAYLOAD },
    ]);
    const result = await decide.decide({ state: "x", questions: { verdict: decide.verdictChoice() } });
    expect(calls).toHaveLength(2);
    expect(result).not.toBeNull();
    expect(decide.getDecideBackoff().streak).toBe(0);
});

test("an already-passed deadline or an aborted signal short-circuits without a call", async () => {
    const { decide } = await load(YAML, { profile: "cloud-jev" });
    decide.resetDecideBackoff();
    const calls = stubFetch({ status: 200, body: VERDICT_PAYLOAD });
    const q = { q: { type: "noul", instructions: "y" } };

    expect(await decide.decide({ state: "x", questions: q, deadline: Date.now() - 1 })).toBeNull();
    const controller = new AbortController();
    controller.abort();
    expect(await decide.decide({ state: "x", questions: q, signal: controller.signal })).toBeNull();
    expect(calls).toHaveLength(0);
});

// --- dry run ---------------------------------------------------------------

test("dry run answers uniformly, offline, in the live answer shape", async () => {
    const { decide } = await load(YAML, { profile: "cloud-jev" });
    process.env.MEDITATOR_DRY_RUN = "1";
    globalThis.fetch = async () => { throw new Error("dry run must not touch the network"); };

    const result = await decide.decide({
        state: "anything",
        questions: {
            verdict: decide.verdictChoice(),
            has_result: { type: "noul", instructions: "it carries a result" },
            depth: { type: "score", criteria: ["nothing", "a hint", "a clear answer"] },
        },
    });

    expect(result.answers.has_result).toEqual({ type: "noul", noul: 0.5 });
    const verdict = decide.readChoice(result.answers.verdict);
    expect(verdict.confidence).toBe(0);
    expect(Object.values(verdict.probabilities)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    // score: expected level is the midpoint, legend and probabilities keyed by index.
    expect(result.answers.depth.score).toBe(1);
    expect(result.answers.depth.legend).toEqual({ 0: "nothing", 1: "a hint", 2: "a clear answer" });
    expect(result.answers.depth.probabilities).toEqual({ 0: 1 / 3, 1: 1 / 3, 2: 1 / 3 });
    expect(result.usage.cost).toBe(0);
});
