// The consolidation internals of m-memory (doc/architecture/compression-fidelity.md
// §1–§4): the never-truncating length loop and the fold prompt. Both are pure of
// the mind and of model wiring, so the accept/tighten/fallback policy and the
// "budget is a percentage of the memory, not the total" rule are testable without
// a model.
import { test, expect } from "bun:test";
import { compressToFit, buildCompressionPrompt, nearestToTarget } from "../../../src/mindComponents/mMemory.js";

// A fake model: returns canned outputs of exact lengths, one per pass, and records
// every (prompt, maxTokens) it was driven with.
function fakeGenerator(lengthsOrTexts) {
    const calls = [];
    let i = 0;
    const generate = async (prompt, maxTokens) => {
        calls.push({ prompt, maxTokens });
        const next = lengthsOrTexts[Math.min(i, lengthsOrTexts.length - 1)];
        i += 1;
        return typeof next === "number" ? "x".repeat(next) : next;
    };
    return { generate, calls };
}

// --- nearestToTarget -------------------------------------------------------

test("nearestToTarget picks the attempt closest in length to the target", () => {
    const a = "a".repeat(900), b = "b".repeat(1300), c = "c".repeat(1050);
    expect(nearestToTarget([a, b, c], 1000)).toBe(c);
});

// --- the length loop -------------------------------------------------------

test("an attempt already within the budget is kept without a model call", async () => {
    const { generate, calls } = fakeGenerator([9999]);
    const out = await compressToFit({ established: "short memory", fresh: "", targetChars: 1000, generate });
    expect(out).toBe("short memory");
    expect(calls.length).toBe(0); // combined is under budget → no compression
});

test("a first pass landing in the [0.8,1.2]·target band is accepted", async () => {
    const big = "m".repeat(5000); // forces a compression
    const { generate, calls } = fakeGenerator([1000]); // exactly on target
    const out = await compressToFit({ established: big, fresh: "new", targetChars: 1000, generate });
    expect(out.length).toBe(1000);
    expect(calls.length).toBe(1);
});

test("too-long output is re-driven to tighten, then accepted", async () => {
    const big = "m".repeat(5000);
    const { generate, calls } = fakeGenerator([2000, 1050]); // overshoot, then in band
    const out = await compressToFit({ established: big, fresh: "new thinking", targetChars: 1000, generate });
    expect(out.length).toBe(1050);
    expect(calls.length).toBe(2);
    // The tighten pass re-drives the PREVIOUS OUTPUT (now 2000 chars) with no fresh
    // material, as a "shorter version" — not the original input again.
    expect(calls[1].prompt).toContain("shorter version");
    expect(calls[1].prompt).toContain("2000 characters");
});

test("an over-compressed result never expands: it falls back to the previous, longer attempt", async () => {
    const big = "m".repeat(5000);
    const { generate } = fakeGenerator([2000, 400]); // overshoot, then under the floor
    const out = await compressToFit({ established: big, fresh: "x", targetChars: 1000, generate });
    expect(out.length).toBe(2000); // the longer prior attempt, not the 400 one
});

test("an over-compressed first pass (no prior) is kept as-is — still never expands", async () => {
    const big = "m".repeat(5000);
    const { generate, calls } = fakeGenerator([300]); // straight under the floor
    const out = await compressToFit({ established: big, fresh: "x", targetChars: 1000, generate });
    expect(out.length).toBe(300);
    expect(calls.length).toBe(1);
});

test("when every pass overshoots, the nearest-to-target attempt is returned (never truncated)", async () => {
    const big = "m".repeat(8000);
    const { generate, calls } = fakeGenerator([4000, 3000, 1300, 1250]); // all > 1200 ceiling
    const out = await compressToFit({ established: big, fresh: "x", targetChars: 1000, generate, maxPasses: 4 });
    expect(calls.length).toBe(4);
    expect(out.length).toBe(1250); // closest of the four to 1000
});

test("an empty first response throws so the caller keeps the raw block", async () => {
    const big = "m".repeat(5000);
    const { generate } = fakeGenerator([""]);
    await expect(compressToFit({ established: big, fresh: "x", targetChars: 1000, generate }))
        .rejects.toThrow(/empty text/);
});

test("an empty later response falls back to the best prior attempt", async () => {
    const big = "m".repeat(5000);
    const { generate } = fakeGenerator([2000, ""]); // long, then the model returns nothing
    const out = await compressToFit({ established: big, fresh: "x", targetChars: 1000, generate });
    expect(out.length).toBe(2000);
});

test("maxTokens is a generous guard sized off the input — never a tight cap", async () => {
    const established = "m".repeat(4000), fresh = "n".repeat(2000);
    const { generate, calls } = fakeGenerator([1000]);
    await compressToFit({ established, fresh, targetChars: 1000, generate });
    // guard = ceil((4000+2000)/2) + 512 = 3512 tokens — far above targetChars/3 (≈333),
    // so a correctly sized (or even input-length) output is never cut short.
    expect(calls[0].maxTokens).toBe(3512);
    expect(calls[0].maxTokens).toBeGreaterThan(Math.ceil(1000 / 3));
});

// --- the prompt: budget is a percentage of the MEMORY, not the total -------

test("fold prompt frames the budget against the memory, not memory+incoming", () => {
    // Memory 1000, incoming 9000, target 1000. The budget is 100% of the MEMORY
    // (1000/1000) — NOT 10% of the 10000-char total the model can see.
    const prompt = buildCompressionPrompt({
        tier: "older",
        memory: "m".repeat(1000),
        incoming: "n".repeat(9000),
        targetChars: 1000,
    });
    expect(prompt).toContain("about 100% of it");          // of the memory
    expect(prompt).not.toContain("10%");                    // not of the total
    expect(prompt).toContain("The memory-so-far is 1000 characters");
    expect(prompt).toContain("judge the size against the memory itself, not against everything above");
    expect(prompt).toContain("<new-thinking>");
    expect(prompt).toContain("Never invent anything");
});

test("fold budget rides above 100% when the memory is currently under target", () => {
    // Memory shrank to 800 last fold; target 1200 → grow toward 150% of the memory.
    const prompt = buildCompressionPrompt({
        tier: "recent",
        memory: "m".repeat(800),
        incoming: "n".repeat(3000),
        targetChars: 1200,
    });
    expect(prompt).toContain("about 150% of it");
});

test("the first-ever memory is written from the new thinking, budgeted against it", () => {
    const prompt = buildCompressionPrompt({ tier: "recent", memory: "", incoming: "n".repeat(2000), targetChars: 1000 });
    expect(prompt).toContain("first such memory");
    expect(prompt).not.toContain("<memory-so-far>");
    expect(prompt).toContain("the new thinking is 2000 characters");
    expect(prompt).toContain("about 50% of that");
});

test("a tighten pass (no fresh material) asks for a shorter version of the same memory", () => {
    const prompt = buildCompressionPrompt({ tier: "older", memory: "m".repeat(2000), incoming: "", targetChars: 1000 });
    expect(prompt).toContain("shorter version");
    expect(prompt).not.toContain("<new-thinking>");
    expect(prompt).toContain("currently 2000 characters");
    expect(prompt).toContain("about 50% of that");
});
