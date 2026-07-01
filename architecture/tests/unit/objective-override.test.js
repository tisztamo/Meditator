// The agent wake-time overrides (agent-loop.md §5): applyObjectiveOverride is the
// twin of applyOriginOverride — it rewrites the first <m-objective>'s content onto a
// wake-time task (MEDITATOR_OBJECTIVE), so a coder/service template's task is chosen
// at wake without editing the file. applyAgentNameOverride is the twin of
// applyMindNameOverride. Both substitute into the SOURCE so the home + snapshot
// record what actually ran. See src/startup/architecture.js.
import { test, expect } from "bun:test";
import { applyObjectiveOverride, applyAgentNameOverride } from "../../../src/startup/architecture.js";

// ── applyObjectiveOverride ────────────────────────────────────────────────────

test("replaces a prompt= objective with editable text content (and drops the attribute)", () => {
  const out = applyObjectiveOverride(`<m-objective name="objective" prompt="old task"></m-objective>`, "a new task");
  expect(out).toBe(`<m-objective name="objective">\na new task\n</m-objective>`);
  expect(out).not.toContain("old task");
  expect(out).not.toContain("prompt=");
});

test("replaces existing text content", () => {
  const out = applyObjectiveOverride(`<m-objective name="objective">the old task here</m-objective>`, "the new task");
  expect(out).toBe(`<m-objective name="objective">\nthe new task\n</m-objective>`);
});

test("keeps a multi-line objective and preserves other attributes", () => {
  const out = applyObjectiveOverride(`<m-objective name="objective" data-x="1"></m-objective>`, "line one\nline two");
  expect(out).toBe(`<m-objective name="objective" data-x="1">\nline one\nline two\n</m-objective>`);
});

test("entity-escapes so the value cannot break out of the element", () => {
  const out = applyObjectiveOverride(`<m-objective name="objective"></m-objective>`, `a & b </m-objective><script>`);
  expect(out).toBe(`<m-objective name="objective">\na &amp; b &lt;/m-objective&gt;&lt;script&gt;\n</m-objective>`);
  expect(out).not.toContain("<script>");
});

test("a blank or whitespace override is a no-op (the file's default objective stands)", () => {
  const src = `<m-objective name="objective" prompt="default">x</m-objective>`;
  expect(applyObjectiveOverride(src, "   ")).toBe(src);
  expect(applyObjectiveOverride(src, "")).toBe(src);
});

test("an agent with no <m-objective> is left untouched", () => {
  const src = `<m-agent name="coder"><m-reason/></m-agent>`;
  expect(applyObjectiveOverride(src, "anything")).toBe(src);
});

test("ignores an <m-objective> mentioned inside a comment and rewrites the real one", () => {
  const src = `<!-- the task lives in <m-objective>, held apart from the charter -->\n<m-agent name="coder">\n  You are a coding agent.\n  <m-objective name="objective">the real task</m-objective>\n</m-agent>`;
  const out = applyObjectiveOverride(src, "a chosen task");
  expect(out).toContain(`<m-objective name="objective">\na chosen task\n</m-objective>`);
  expect(out).not.toContain("the real task");
  expect(out).toContain("<!-- the task lives in <m-objective>, held apart from the charter -->");
  expect(out).toContain("You are a coding agent.");
});

// ── applyAgentNameOverride ────────────────────────────────────────────────────

test("agent name override rewrites an existing name= and drops memory=", () => {
  const out = applyAgentNameOverride(`<m-agent name="coder" memory="old">`, "coder-8");
  expect(out).toBe(`<m-agent name="coder-8">`);
  expect(out).not.toContain("memory=");
});

test("agent name override inserts a name when none is present", () => {
  const out = applyAgentNameOverride(`<m-agent maxSteps="40">`, "coder-8");
  expect(out).toBe(`<m-agent name="coder-8" maxSteps="40">`);
});

test("a blank agent-name override is a no-op, and no <m-agent> is untouched", () => {
  expect(applyAgentNameOverride(`<m-agent name="coder">`, "  ")).toBe(`<m-agent name="coder">`);
  expect(applyAgentNameOverride(`<m-mind name="lemma">`, "x")).toBe(`<m-mind name="lemma">`);
});
