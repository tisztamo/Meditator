// m-act's pure helpers: the closed-menu schema validator and the per-intent dedup
// key. The decide stage reuses m-speech's tolerant parser (covered by
// speech-parse.test.js), so here we lock in only what is new to the hands.
import { test, expect } from "bun:test";
import { validateAgainstSchema, normalizeIntent } from "../../../src/mindComponents/mAct.js";

// The look hand's real schema (efference.md §3): an object with a required enum
// subject and an optional free-text "about".
const LOOK_SCHEMA = {
    type: "object",
    properties: {
        subject: { type: "string", enum: ["weather", "daylight", "news"] },
        about: { type: "string" },
    },
    required: ["subject"],
};

test("valid args pass", () => {
    expect(validateAgainstSchema({ subject: "weather", about: "the rain" }, LOOK_SCHEMA)).toBeNull();
    expect(validateAgainstSchema({ subject: "daylight" }, LOOK_SCHEMA)).toBeNull(); // optional absent is fine
});

test("a missing required key is rejected", () => {
    expect(validateAgainstSchema({ about: "something" }, LOOK_SCHEMA)).toMatch(/required "subject"/);
});

test("an out-of-enum value is rejected (the menu is closed)", () => {
    expect(validateAgainstSchema({ subject: "stockmarket" }, LOOK_SCHEMA)).toMatch(/not one of/);
});

test("a wrong primitive type is rejected", () => {
    expect(validateAgainstSchema({ subject: "weather", about: 42 }, LOOK_SCHEMA)).toMatch(/"about" must be a string/);
});

test("a non-object where an object is required is rejected", () => {
    expect(validateAgainstSchema("weather", LOOK_SCHEMA)).toMatch(/expected an object/);
    expect(validateAgainstSchema(null, LOOK_SCHEMA)).toMatch(/expected an object/);
    expect(validateAgainstSchema(["weather"], LOOK_SCHEMA)).toMatch(/expected an object/);
});

test("integer and boolean primitives are checked", () => {
    expect(validateAgainstSchema({ n: 3 }, { properties: { n: { type: "integer" } } })).toBeNull();
    expect(validateAgainstSchema({ n: 3.5 }, { properties: { n: { type: "integer" } } })).toMatch(/integer/);
    expect(validateAgainstSchema({ b: true }, { properties: { b: { type: "boolean" } } })).toBeNull();
    expect(validateAgainstSchema({ b: "yes" }, { properties: { b: { type: "boolean" } } })).toMatch(/boolean/);
});

// The dedup key (§6a): a standing wish must map to one key regardless of casing
// and punctuation, so it fires once, not every cadence.
test("normalizeIntent collapses casing and punctuation to one standing key", () => {
    const a = normalizeIntent("I wish I knew the weather!");
    const b = normalizeIntent("i wish i knew the weather");
    const c = normalizeIntent("I wish I knew the weather...");
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a).toBe("i wish i knew the weather");
});

test("normalizeIntent distinguishes genuinely different reaches", () => {
    expect(normalizeIntent("what is the weather")).not.toBe(normalizeIntent("what is the news"));
});

test("normalizeIntent is bounded and null-safe", () => {
    expect(normalizeIntent(null)).toBe("");
    expect(normalizeIntent(undefined)).toBe("");
    expect(normalizeIntent("x".repeat(500)).length).toBe(80);
});
