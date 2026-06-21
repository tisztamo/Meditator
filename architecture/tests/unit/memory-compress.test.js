// The consolidation internals of m-memory (doc/architecture/compression-fidelity.md):
// the length loop and the flat-block distillation prompt. Both are pure of the mind
// and of model wiring, so the iterate-with-feedback / accept-best policy and the
// prompt shapes are testable without a model.
//
// Contract (2026-06-21 rewrite): the memory is compressed by DISTILLATION, never by
// programmatic dropping. The model is shown ONE flat block and asked to rewrite it to
// AT MOST the budget; if it overshoots, it is re-driven with explicit "% over" feedback;
// if it still will not fit, its best faithful attempt is accepted even if over budget.
// Nothing is ever truncated or evicted in code — a code-level "drop the oldest to fit"
// was what silently erased a mind's origin problem.
import { test, expect } from "bun:test";
import { compressToFit, buildCompressionPrompt, nearestToTarget, dedupeExact, firstSentences, lastSentences } from "../../../src/mindComponents/mMemory.js";

// A fake model: returns canned outputs of exact lengths (or exact texts), one per pass,
// and records every (prompt, maxTokens) it was driven with.
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

// --- dedupeExact: programmatic removal of exact repetition ------------------
// The one repetition we can drop in code without a model judging meaning. Long exact
// duplicates are pure redundancy a drifting stream piles up; short ones may be genuine.

test("dedupeExact drops a later paragraph identical to an earlier one, keeping the first", () => {
    const p = "I am an expression of it, and in this expression there is a profound sense of unity that fills me.";
    const out = dedupeExact([p, "A genuinely different middle paragraph about the numbers 2, 8, 65.", p].join("\n\n"));
    expect(out.split("expression of it").length - 1).toBe(1); // the duplicate paragraph is gone
    expect(out).toContain("2, 8, 65");                        // distinct content kept
});

test("dedupeExact drops a repeated long sentence within a paragraph", () => {
    const s = "The silence is full of the potential for the next thought to arrive in its own time.";
    const out = dedupeExact(`${s} Something distinct here about palindromes. ${s}`);
    expect(out.split("potential for the next thought").length - 1).toBe(1);
    expect(out).toContain("palindromes");
});

test("dedupeExact keeps SHORT exact repeats — they may be a genuine refrain", () => {
    const out = dedupeExact("Balanced. The number works. Balanced. The number works again here too now.", 50);
    expect(out.split("Balanced.").length - 1).toBe(2); // both short refrains survive
});

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

test("a buffer bloated with exact repeats is deduped under budget with no model call", async () => {
    // 8 verbatim copies of a long paragraph: ~3200 raw chars, but only ~400 distinct.
    const para = "I am an expression of it, and in this expression there is a profound sense of unity.";
    const bloated = Array(8).fill(para).join("\n\n");
    const { generate, calls } = fakeGenerator([9999]);
    const out = await compressToFit({ established: bloated, fresh: "", targetChars: 1000, generate });
    expect(out).toBe(para);        // collapsed to the single distinct paragraph…
    expect(calls.length).toBe(0);  // …in code, before any compression call
});

test("a first pass at or under the ceiling (1.2·target) is accepted", async () => {
    const big = "m".repeat(5000); // forces a compression
    const { generate, calls } = fakeGenerator([1150]); // within the 1200 ceiling
    const out = await compressToFit({ established: big, fresh: "new", targetChars: 1000, generate });
    expect(out.length).toBe(1150);
    expect(calls.length).toBe(1);
});

test("too-long output is re-driven to tighten, with explicit over-budget feedback, then accepted", async () => {
    const big = "m".repeat(5000);
    const { generate, calls } = fakeGenerator([2000, 1100]); // overshoot, then within ceiling
    const out = await compressToFit({ established: big, fresh: "new thinking", targetChars: 1000, generate });
    expect(out.length).toBe(1100);
    expect(calls.length).toBe(2);
    // The re-drive tightens the PREVIOUS OUTPUT (the 2000-char draft), not the original
    // input again — and tells the model how far over it is.
    expect(calls[1].prompt).toContain("over the limit of 1000");
    expect(calls[1].prompt).toContain("2000 characters");
    expect(calls[1].prompt).toContain("<memory>");
});

test("a terse-but-in-budget output is trusted as the model's faithful summary (no second-guessing)", async () => {
    // 300 << target but within the ceiling: we accept the model's own choice rather than
    // demand a longer one. The model is told to keep the spine; we do not override it.
    const big = "m".repeat(5000);
    const { generate, calls } = fakeGenerator([300]);
    const out = await compressToFit({ established: big, fresh: "x", targetChars: 1000, generate });
    expect(out.length).toBe(300);
    expect(calls.length).toBe(1);
});

test("when every pass overshoots, the best FAITHFUL attempt is accepted over budget — never dropped in code", async () => {
    const big = "m".repeat(8000);
    const { generate, calls } = fakeGenerator([4000, 3000, 1300, 1250]); // all > 1200 ceiling, each shorter
    const out = await compressToFit({ established: big, fresh: "x", targetChars: 1000, generate, maxPasses: 4 });
    expect(calls.length).toBe(4);    // the model gets every pass to tighten
    // The nearest-to-target attempt (1250) is kept WHOLE — over budget, but the model's
    // own faithful text. We do NOT truncate it down to 1000 in code.
    expect(out.length).toBe(1250);
});

test("an echoing model stops early and its text is accepted unchanged — nothing is evicted", async () => {
    // Three paragraphs, oldest-first; the model returns it verbatim every pass (echo),
    // over the 1200 ceiling. This is exactly the local utility model's behaviour.
    const echo = "Oldest paragraph: the question I am working on.\n\n"
        + "Middle thoughts.\n\n" + "X".repeat(1300) + ". Newest thread I am holding.";
    const { generate, calls } = fakeGenerator([echo, echo, echo, echo]);
    const out = await compressToFit({ established: echo, fresh: "x", targetChars: 1000, generate, maxPasses: 4 });
    expect(calls.length).toBe(2);                 // pass 1 + one re-drive that echoed → stop
    expect(out).toBe(echo);                        // accepted whole — over budget, but faithful
    expect(out).toContain("Oldest");               // the oldest (the spine) is NOT dropped
    expect(out).toContain("Newest");               // …and neither is the newest
});

test("an empty first response throws so the caller keeps the raw block", async () => {
    const big = "m".repeat(5000);
    const { generate } = fakeGenerator([""]);
    await expect(compressToFit({ established: big, fresh: "x", targetChars: 1000, generate }))
        .rejects.toThrow(/empty text/);
});

test("an empty later response falls back to the best prior attempt — never truncated", async () => {
    const big = "m".repeat(5000);
    const { generate } = fakeGenerator([2000, ""]); // long, then the model returns nothing
    const out = await compressToFit({ established: big, fresh: "x", targetChars: 1000, generate });
    // Keeps the 2000-char prior attempt whole rather than the empty one — over budget,
    // but a faithful summary; we never mutilate it in code.
    expect(out.length).toBe(2000);
});

test("maxTokens is a generous guard sized off the input — never a tight cap", async () => {
    const established = "m".repeat(4000), fresh = "n".repeat(2000);
    const { generate, calls } = fakeGenerator([1000]);
    await compressToFit({ established, fresh, targetChars: 1000, generate });
    // combined = 4000 + "\n\n" + 2000 = 6002; guard = 6002 + 512 = 6514 — far above
    // targetChars/3 (≈333), so a correctly sized (or even input-length) output is never cut short.
    expect(calls[0].maxTokens).toBe(6514);
    expect(calls[0].maxTokens).toBeGreaterThan(Math.ceil(1000 / 3));
});

// --- the prompt: a flat block with a hard character ceiling -----------------
// The model compresses reliably only when given ONE block and "AT MOST N characters"
// (a two-block "fold into the memory-so-far" makes it preserve the blocks and plateau
// over budget; a soft "about N%" makes it echo). Verified live against the local model.

test("the initial prompt presents one flat block with a hard character ceiling", () => {
    const prompt = buildCompressionPrompt({ tier: "recent", text: "x".repeat(2000), targetChars: 1000 });
    expect(prompt).toContain("AT MOST 1000 characters");
    expect(prompt).toContain("<thinking>");
    expect(prompt).toContain("Never invent anything");
    // No two-block fold framing, and no soft percentage.
    expect(prompt).not.toContain("<memory-so-far>");
    expect(prompt).not.toContain("<new-thinking>");
    expect(prompt).not.toContain("% of it");
});

test("the initial prompt keeps the spine by relevance, not age — and never claims it resurfaces elsewhere", () => {
    const prompt = buildCompressionPrompt({ tier: "older", text: "m".repeat(40000), targetChars: 7200 });
    expect(prompt).toContain("the last thing to cut, not the first");
    expect(prompt).toContain("never by its age");
    // Collapses NEAR-duplicate looping prose (what exact-dedup can't catch).
    expect(prompt).toContain("LOOPS");
    expect(prompt).toContain("collapse the whole loop to a single sentence");
    // The inversion and the false promise must be gone.
    expect(prompt).not.toContain("release the oldest");
    expect(prompt).not.toContain("Forgetting the small and the settled");
    expect(prompt).not.toContain("comes back to you when you need it");
    expect(prompt).not.toContain("Keep the conclusions, decisions, and open questions the memory already holds");
});

// --- overlap context: the slice is cut from a stream, so show its edges' continuation -

test("firstSentences/lastSentences return whole sentences, bounded by the char cap", () => {
    const t = "One sentence here. Two follows it. Three is the last one of all.";
    expect(firstSentences(t, 40)).toBe("One sentence here. Two follows it."); // 2 whole sentences ≤ 40
    expect(lastSentences(t, 40)).toBe("Three is the last one of all.");       // last whole sentence
    // A single sentence longer than the cap is returned whole, not cut mid-word.
    const one = "A very long single sentence with no sentence breaks at all in it here.";
    expect(firstSentences(one, 10)).toBe(one);
});

test("the initial prompt embeds read-only overlap context, marked do-not-include", () => {
    const prompt = buildCompressionPrompt({
        tier: "recent", text: "the slice being compressed.", targetChars: 1000,
        contextBefore: "what came just before.", contextAfter: "and here is how it continues.",
    });
    expect(prompt).toContain("<earlier>");
    expect(prompt).toContain("what came just before.");
    expect(prompt).toContain("<continues>");
    expect(prompt).toContain("and here is how it continues.");
    expect(prompt).toContain("NOT part of this memory");        // marked as context only
    expect(prompt).toContain("do not include, repeat, or summarise");
    expect(prompt).toContain("<thinking>");                      // the real part to compress
});

test("with no context the initial prompt is unchanged — no empty overlap markers", () => {
    const prompt = buildCompressionPrompt({ tier: "recent", text: "x".repeat(2000), targetChars: 1000 });
    expect(prompt).not.toContain("<earlier>");
    expect(prompt).not.toContain("<continues>");
    expect(prompt).not.toContain("NOT part of this memory");
});

test("a re-drive ignores overlap context (it tightens the model's own clean-edged draft)", async () => {
    const big = "m".repeat(5000);
    const { generate, calls } = fakeGenerator([2000, 1100]); // overshoot → re-drive → accept
    await compressToFit({ established: big, fresh: "x", targetChars: 1000, generate,
        contextBefore: "BEFORE-CTX", contextAfter: "AFTER-CTX" });
    expect(calls[0].prompt).toContain("AFTER-CTX");   // initial pass carries context
    expect(calls[1].prompt).not.toContain("AFTER-CTX"); // the re-drive does not
});

test("the re-drive prompt tightens the over-budget DRAFT with explicit feedback, never re-expanding", () => {
    const draft = "d".repeat(2000);
    const prompt = buildCompressionPrompt({ tier: "recent", text: "the original, longer source", targetChars: 1000, draft });
    expect(prompt).toContain("AT MOST 1000 characters");
    expect(prompt).toContain("2000 characters");          // tells the model the draft's size…
    expect(prompt).toContain("over the limit of 1000");   // …and how far over it is
    expect(prompt).toContain("<memory>");
    expect(prompt).toContain("the last thing to drop, never the first");
    // It tightens the draft, it does not re-open the original (which would re-expand/invent).
    expect(prompt).not.toContain("<thinking>");
    expect(prompt).not.toContain("the original, longer source");
    expect(prompt).not.toContain("release the oldest");
});
