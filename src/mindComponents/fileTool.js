// fileTool.js — the small shared spine of the workspace file tools (agent-loop.md §8:
// <m-read-file> / <m-write-file> / <m-edit>). Each of those is a self-contained ~40-line
// leaf that registers via the bubbling `capability` event with ZERO change to m-agent /
// m-reason — but they all resolve a workspace root and refuse paths that escape it, and
// that CONTAINMENT check is security-critical, so it lives in ONE audited place rather
// than being copy-pasted (and drifting) across three files.

import path from "node:path"
import { mindHome } from "../infrastructure/memoryVault.js"

/**
 * The workspace ROOT a file tool operates within. An explicit `root="…"` attribute lets
 * an author point a tool at a project directory; otherwise it defaults to the entity's
 * own workspace home under the vault (memory/<agent>/workspace) — the safe, contained
 * default, and the SAME root m-terminal uses, so the file tools and the terminal see one
 * shared desk. Resolved once, at connect.
 */
export function toolRoot(el) {
    return path.resolve(el.attr("root") || mindHome(el, "workspace"))
}

/**
 * CONTAINMENT (agent-loop.md §8): resolve `rel` against `root` and refuse if it escapes.
 * Returns { abs } on success or { error } (a short reason string) — it NEVER throws, so
 * a traversal attempt (`../../etc/passwd`), an absolute path, or a missing path becomes a
 * clean error observation the model reads and works around, not a crash.
 *
 * The check is at the path-string level (path.resolve normalizes `.`/`..` and absolute
 * paths); it does not chase symlinks, so the root itself must be trusted — and it is: the
 * agent's own workspace home, not arbitrary user input.
 */
export function resolveWithin(root, rel) {
    if (typeof rel !== "string" || !rel.trim()) return { error: "a path is required" }
    const abs = path.resolve(root, rel)
    if (abs !== root && !abs.startsWith(root + path.sep)) {
        return { error: `"${rel}" is outside the workspace` }
    }
    return { abs }
}
