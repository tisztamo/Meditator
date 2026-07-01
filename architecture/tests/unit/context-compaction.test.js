// <m-context>'s compaction internals (mContext.js), pure of the DOM and of model wiring —
// so the split-point SAFETY (never orphan a tool response from its assistant, agent-loop.md
// §12), the sizing, the rendering, and the prompt shape are proven on their own.
import { test, expect } from "bun:test";
import { transcriptSize, planCompaction, renderForSummary, buildBriefPrompt } from "../../../src/mindComponents/mContext.js";

// A little transcript builder: u=user, a=assistant(+optional tool_calls), t=tool.
const u = (content) => ({ role: "user", content });
const a = (content, ...names) => ({ role: "assistant", content, ...(names.length ? { tool_calls: names.map((n, i) => ({ id: `c${i}`, type: "function", function: { name: n, arguments: "{}" } })) } : {}) });
const t = (content) => ({ role: "tool", tool_call_id: "c0", content });

// ── transcriptSize ────────────────────────────────────────────────────────────

test("transcriptSize counts message content plus tool-call names and arguments", () => {
    const messages = [u("hello"), a("", "terminal")];   // 5 + 0 + "terminal"(8) + "{}"(2)
    expect(transcriptSize(messages)).toBe(5 + 8 + 2);
});

test("transcriptSize is 0 for an empty / nullish transcript", () => {
    expect(transcriptSize([])).toBe(0);
    expect(transcriptSize(null)).toBe(0);
});

// ── planCompaction: the split point is always provider-safe ─────────────────────

test("nothing to fold when there are too few messages", () => {
    expect(planCompaction([u("a"), a("b")], 8)).toBeNull();
});

test("folds the oldest, keeping the last keepRecent verbatim", () => {
    const messages = [u("task"), a("t1", "terminal"), t("o1"), a("t2", "terminal"), t("o2"), a("done")];
    // keepRecent=2 → cut = 6-2 = 4; messages[4] is a `tool` (o2), so it advances to 5 (assistant "done").
    const plan = planCompaction(messages, 2);
    expect(plan).toEqual({ summarizeCount: 5 });
    // The kept suffix starts on a NON-tool message — no orphaned tool response.
    expect(messages[plan.summarizeCount].role).not.toBe("tool");
});

test("the cut never lands between an assistant and the tool messages answering it", () => {
    // keepRecent=3 → raw cut = 3, which is a `tool` (o2); it must advance past it to 4.
    const messages = [u("task"), a("t1", "terminal"), t("o1"), t("o2"), a("t3", "terminal"), t("o3")];
    const plan = planCompaction(messages, 3);
    expect(messages[plan.summarizeCount].role).not.toBe("tool");
});

test("null when advancing past tools would leave nothing to keep", () => {
    // Everything after the head is one long open tool group → no clean kept suffix.
    const messages = [u("task"), a("t", "x"), t("o1"), t("o2"), t("o3")];
    expect(planCompaction(messages, 1)).toBeNull();
});

// ── renderForSummary ────────────────────────────────────────────────────────────

test("renderForSummary labels each role and expands tool calls", () => {
    const text = renderForSummary([u("do it"), a("thinking", "terminal"), t("output here")]);
    expect(text).toContain("USER: do it");
    expect(text).toContain("ASSISTANT: thinking");
    expect(text).toContain("ASSISTANT called terminal(");
    expect(text).toContain("OBSERVATION: output here");
});

test("renderForSummary caps a long observation so a raw dump can't bloat the prompt", () => {
    const big = "x".repeat(10000);
    const text = renderForSummary([t(big)], 100);
    expect(text.length).toBeLessThan(300);
    expect(text).toContain("more chars)");
});

// ── buildBriefPrompt: the two shapes compressToFit drives ───────────────────────

test("the initial prompt states the budget and carries the transcript", () => {
    const p = buildBriefPrompt({ text: "USER: hi", targetChars: 500 });
    expect(p).toContain("AT MOST 500 characters");
    expect(p).toContain("<transcript>");
    expect(p).toMatch(/condense/i);   // so the offline dry-run stub recognizes it as a summary
});

test("the re-drive prompt tightens the model's own over-long draft", () => {
    const draft = "y".repeat(1200);
    const p = buildBriefPrompt({ draft, targetChars: 500 });
    expect(p).toContain("<summary>");
    expect(p).toMatch(/over the limit of 500/);
});
