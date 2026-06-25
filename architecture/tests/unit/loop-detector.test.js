// m-loop-detector's reply parser — pure, no DOM or network. The detector makes one
// utility-model call and parses its reply with regex (the codebase convention); the parser
// must default to NOT looping whenever the signal is unclear, so a garbled reply never
// fabricates a loop.
import { test, expect } from "bun:test";
import { parseLoopReply } from "../../../src/mindComponents/mLoopDetector.js";

test("a well-formed looping reply parses fully", () => {
    const p = parseLoopReply(
        "LOOPING: yes\nSCORE: 0.82\nKIND: presence\nVOCABULARY: presence, stillness, enough, now\nWHY: It restates that being here is enough.");
    expect(p.looping).toBe(true);
    expect(p.score).toBeCloseTo(0.82, 5);
    expect(p.kind).toBe("presence");
    expect(p.vocabulary).toEqual(["presence", "stillness", "enough", "now"]);
    expect(p.reasoning).toMatch(/being here is enough/);
});

test("a 'no' reply parses as not looping, with no vocabulary", () => {
    const p = parseLoopReply("LOOPING: no\nSCORE: 0.1\nKIND: other\nVOCABULARY:\nWHY: The thought is moving.");
    expect(p.looping).toBe(false);
    expect(p.score).toBeCloseTo(0.1, 5);
    expect(p.vocabulary).toEqual([]);
});

test("an unknown KIND falls back to 'other'", () => {
    const p = parseLoopReply("LOOPING: yes\nSCORE: 0.7\nKIND: ecstatic\nVOCABULARY: a, b");
    expect(p.kind).toBe("other");
});

test("garbage defaults to not looping (never fabricates a loop)", () => {
    const p = parseLoopReply("Noted.");
    expect(p.looping).toBe(false);
    expect(p.score).toBe(0);
    expect(p.vocabulary).toEqual([]);
});

test("vocabulary is lowercased, trimmed, de-noised, and capped at 6", () => {
    const p = parseLoopReply("LOOPING: yes\nSCORE: 0.6\nKIND: void\nVOCABULARY: Void, DISSOLVE , none, a,b,c,d,e,f");
    expect(p.vocabulary).toEqual(["void", "dissolve", "a", "b", "c", "d"]);  // 'none' dropped, capped at 6
});

test("a looping reply with no score still counts (defaulted), staying conservative when absent", () => {
    const p = parseLoopReply("LOOPING: yes\nKIND: spam\nVOCABULARY: 1, 1, 1");
    expect(p.looping).toBe(true);
    expect(p.score).toBeGreaterThan(0);   // a sensible default, not NaN
    expect(p.kind).toBe("spam");
});
