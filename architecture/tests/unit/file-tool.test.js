// The file tools' shared spine (fileTool.js): the security-critical CONTAINMENT check
// that keeps <m-read-file> / <m-write-file> / <m-edit> inside their workspace root
// (agent-loop.md §8). Pure, so it is exhaustively tested without a DOM or a filesystem —
// path traversal, absolute-path escape, the prefix-sibling trap, and the "path required"
// guards. This is the one place the escape check lives, so it is the one place to prove it.
import { test, expect } from "bun:test";
import path from "node:path";
import { resolveWithin, toolRoot } from "../../../src/mindComponents/shared/fileTool.js";

const ROOT = path.resolve("/work/ws");

// ── resolveWithin: the paths that stay inside are allowed ──────────────────────

test("a plain relative path resolves under the root", () => {
    expect(resolveWithin(ROOT, "src/index.js")).toEqual({ abs: path.join(ROOT, "src/index.js") });
});

test("internal .. that stays inside is normalized and allowed", () => {
    expect(resolveWithin(ROOT, "a/../b.txt")).toEqual({ abs: path.join(ROOT, "b.txt") });
});

test("the root itself (\".\") is allowed", () => {
    expect(resolveWithin(ROOT, ".")).toEqual({ abs: ROOT });
});

test("a filename that merely starts with dots is not a traversal", () => {
    expect(resolveWithin(ROOT, "..evil")).toEqual({ abs: path.join(ROOT, "..evil") });
});

// ── resolveWithin: the paths that escape are refused, never thrown ─────────────

test("a ../ traversal is refused", () => {
    const { abs, error } = resolveWithin(ROOT, "../secret");
    expect(abs).toBeUndefined();
    expect(error).toMatch(/outside the workspace/);
});

test("a deep ../../ traversal is refused", () => {
    expect(resolveWithin(ROOT, "../../etc/passwd").error).toMatch(/outside/);
});

test("an absolute path escapes the root and is refused", () => {
    // path.resolve(root, "/etc/passwd") === "/etc/passwd" — the absolute path wins.
    expect(resolveWithin(ROOT, "/etc/passwd").error).toMatch(/outside/);
});

test("a sibling directory sharing the root's prefix is refused (the +sep guard)", () => {
    // "/work/ws2/x" must NOT be accepted just because it starts with "/work/ws".
    expect(resolveWithin(ROOT, "../ws2/x").error).toMatch(/outside/);
});

// ── resolveWithin: the "no path" guards ────────────────────────────────────────

test("an empty / whitespace / non-string path is a clean error, not a throw", () => {
    expect(resolveWithin(ROOT, "").error).toMatch(/path is required/);
    expect(resolveWithin(ROOT, "   ").error).toMatch(/path is required/);
    expect(resolveWithin(ROOT, null).error).toMatch(/path is required/);
    expect(resolveWithin(ROOT, undefined).error).toMatch(/path is required/);
    expect(resolveWithin(ROOT, 42).error).toMatch(/path is required/);
});

// ── toolRoot: an explicit root attribute is honored and absolutized ────────────

test("toolRoot honors an explicit root= attribute (absolutized)", () => {
    const el = { attr: name => (name === "root" ? "/tmp/agent-ws" : null) };
    expect(toolRoot(el)).toBe(path.resolve("/tmp/agent-ws"));
});

test("toolRoot resolves a relative root against cwd", () => {
    const el = { attr: name => (name === "root" ? "rel/dir" : null) };
    expect(toolRoot(el)).toBe(path.resolve("rel/dir"));
});

// ── toolRoot: the root="mind" sentinel points at the enclosing MIND's workspace ──

// A tool inside an <m-agent> would default to the AGENT's home; root="mind" instead
// resolves to the ENCLOSING MIND's workspace (the shared desk the senses write to),
// whatever this run is named. The mind is found by role (review §2.6), so the mock is
// a parent chain whose root carries the reflected provides="mind", as a live one does.
function toolElInMind(mindName) {
    const attrs = { name: mindName, provides: "mind" };
    const mind = {
        nodeType: 1, localName: "x-self", parentElement: null,
        hasAttribute: n => n in attrs, getAttribute: n => attrs[n] ?? null,
    };
    const agent = {
        nodeType: 1, localName: "x-worker", parentElement: mind,
        hasAttribute: n => n === "provides", getAttribute: n => (n === "provides" ? "agent hands" : null),
    };
    return {
        nodeType: 1, localName: "m-file", parentElement: agent,
        hasAttribute: () => false, getAttribute: () => null,
        attr: name => (name === "root" ? "mind" : null),
    };
}

test("toolRoot root=\"mind\" resolves to the enclosing mind's workspace", () => {
    expect(toolRoot(toolElInMind("stereotic-lab-jev-3"))).toBe(path.resolve("memory/stereotic-lab-jev-3/workspace"));
});

test("toolRoot root=\"mind\" tracks the run's name (no hardcoding)", () => {
    expect(toolRoot(toolElInMind("stereotic-lab-jev"))).toBe(path.resolve("memory/stereotic-lab-jev/workspace"));
});
