// The consolidation internals of m-memory (doc/architecture/compression-fidelity.md
// §1–§4): the never-truncating length loop and the fold prompt. Both are pure of
// the mind and of model wiring, so the accept/tighten/fallback policy and the
// "budget is a percentage of the memory, not the total" rule are testable without
// a model.
import { test, expect } from "bun:test";
import { compressToFit, buildCompressionPrompt, nearestToTarget, forgetOldestToFit } from "../../../src/mindComponents/mMemory.js";

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

test("when every pass overshoots, the budget is enforced in code (forget oldest to fit)", async () => {
    const big = "m".repeat(8000);
    const { generate, calls } = fakeGenerator([4000, 3000, 1300, 1250]); // all > 1200 ceiling, each shorter
    const out = await compressToFit({ established: big, fresh: "x", targetChars: 1000, generate, maxPasses: 4 });
    expect(calls.length).toBe(4);                 // the model still gets every chance to tighten
    expect(out.length).toBeLessThanOrEqual(1000); // …but the result is bounded to budget, not left at 1250
});

test("an echoing model (re-drive makes no headway) stops early and code bounds the result", async () => {
    // Three paragraphs, oldest-first; the model returns it verbatim every pass (echo),
    // well over the 1200 ceiling. This is exactly the local utility model's behaviour.
    const echo = "Oldest paragraph, long gone.\n\n" + "Middle thoughts about nothing.\n\n"
        + "X".repeat(1300) + ". Newest thread I am holding.";
    const { generate, calls } = fakeGenerator([echo, echo, echo, echo]);
    const out = await compressToFit({ established: echo, fresh: "x", targetChars: 1000, generate, maxPasses: 4 });
    expect(calls.length).toBe(2);                 // pass 1 (fold) + one tighten that echoed → stop
    expect(out.length).toBeLessThanOrEqual(1000); // forgotten down to budget
    expect(out).toContain("Newest");              // the newest material is kept
    expect(out).not.toContain("Oldest");          // the oldest is forgotten
});

// --- forgetOldestToFit: the code-level forgetting itself --------------------

test("forgetOldestToFit keeps text already within budget untouched", () => {
    expect(forgetOldestToFit("short", 100)).toBe("short");
});

test("forgetOldestToFit drops oldest paragraphs, keeping the newest whole", () => {
    const text = "A".repeat(500) + "\n\n" + "B".repeat(500) + "\n\n" + "C".repeat(500);
    const out = forgetOldestToFit(text, 1100); // must drop the oldest (A) block
    expect(out.length).toBeLessThanOrEqual(1100);
    expect(out).not.toContain("A");
    expect(out).toContain("B");
    expect(out).toContain("C"); // newest survives
});

test("forgetOldestToFit drops oldest sentences when one paragraph is over budget", () => {
    const text = "First old sentence here. Second sentence. Third newest sentence stays.";
    const out = forgetOldestToFit(text, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out).toContain("newest");
    expect(out).not.toContain("First old");
});

test("forgetOldestToFit falls back to a word-edge cut for one long unbroken run, keeping the tail", () => {
    const out = forgetOldestToFit("alpha beta gamma delta epsilon zeta", 14);
    expect(out.length).toBeLessThanOrEqual(14);
    expect(out).not.toContain("alpha");   // oldest dropped
    expect(out.startsWith(" ")).toBe(false); // clean word edge
});

test("an empty first response throws so the caller keeps the raw block", async () => {
    const big = "m".repeat(5000);
    const { generate } = fakeGenerator([""]);
    await expect(compressToFit({ established: big, fresh: "x", targetChars: 1000, generate }))
        .rejects.toThrow(/empty text/);
});

test("an empty later response falls back to the best prior attempt, then bounds it to budget", async () => {
    const big = "m".repeat(5000);
    const { generate } = fakeGenerator([2000, ""]); // long, then the model returns nothing
    const out = await compressToFit({ established: big, fresh: "x", targetChars: 1000, generate });
    // Falls back to the 2000-char prior attempt rather than the empty one — then forgets
    // it down to the budget (the bound always applies; nothing oversized is persisted).
    expect(out.length).toBeLessThanOrEqual(1000);
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

// --- the contract licenses FORGETTING (regression guard for the bloat bug) ----
// A fixed-size buffer fed an unbounded stream of durable content can only be held
// to budget if old material may be released to make room. Instructing the model to
// keep every conclusion makes the buffer ratchet up every fold (the bloat bug). The
// memory is lossy by design (COVENANT §3); the vault's git history is the durable
// record. These guard against a silent revert to lossless retention.

test("the fold prompt licenses forgetting old material to fit, and no longer commands unconditional retention", () => {
    const prompt = buildCompressionPrompt({
        tier: "older", memory: "m".repeat(40000), incoming: "n".repeat(9000), targetChars: 7200,
    });
    // It must permit releasing old material…
    expect(prompt).toContain("release the oldest and least-important");
    expect(prompt).toContain("let older material go to stay within it");
    // …and must NOT order the model to keep every existing conclusion (the old bug).
    expect(prompt).not.toContain("Keep the conclusions, decisions, and open questions the memory already holds");
});

test("the tighten prompt makes room by forgetting rather than only re-wording", () => {
    const prompt = buildCompressionPrompt({ tier: "older", memory: "m".repeat(20000), incoming: "", targetChars: 7200 });
    expect(prompt).toContain("release the oldest, most settled, least-important detail");
    // The lossless trap that caused the bloat: a shorter version "without losing substance".
    expect(prompt).not.toContain("without losing substance");
});
