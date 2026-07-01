import A from "amanita"
import fs from "node:fs/promises"
import { MBaseComponent } from "./mBaseComponent.js"
import { toolRoot, resolveWithin } from "./fileTool.js"

/**
 * <m-edit> — an agent tool that edits a text file by EXACT string replacement
 * (agent-loop.md §8). The surgical counterpart to <m-write-file>: instead of rewriting a
 * whole file, the model supplies the exact `old` text and its `new` replacement. `old`
 * must match EXACTLY ONCE (so an ambiguous edit is refused rather than silently applied
 * to the wrong place) unless `replace_all` is set. Same leaf shape, same containment,
 * `readonly: false`.
 *
 * @interface
 * Attributes:
 *   - name: the tool-call function name (default "edit")
 *   - root: the directory the tool may edit within (default: the agent's workspace home)
 */
export class MEdit extends MBaseComponent {
    onConnect() {
        this._root = toolRoot(this)
        this.offerCapability({
            name: this.attr("name") || "edit",
            description: "Edit a text file in the workspace by exact string replacement. `old` must appear EXACTLY "
                + "once (include enough surrounding context to be unique) unless replace_all is true. Use it for "
                + "small, surgical changes; use write_file to create or fully rewrite a file.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "path relative to the workspace root" },
                    old: { type: "string", description: "the exact text to find (with enough context to be unique)" },
                    new: { type: "string", description: "the text to replace it with" },
                    replace_all: { type: "boolean", description: "replace every occurrence instead of requiring a unique match (default false)" },
                },
                required: ["path", "old", "new"],
            },
            readonly: false,   // WORLD-CHANGING
            execute: args => this._edit(args),
        })
    }

    async _edit({ path: rel, old, new: replacement, replace_all = false }) {
        const { abs, error } = resolveWithin(this._root, rel)
        if (error) return { observation: `refused: ${error}`, isError: true }
        if (!old) return { observation: `refused: "old" is empty — nothing to find`, isError: true }
        if (old === replacement) return { observation: `refused: "old" and "new" are identical — nothing to change`, isError: true }

        let text
        try {
            text = await fs.readFile(abs, "utf8")
        } catch (error) {
            return { observation: `could not read "${rel}" to edit it: ${error.message}`, isError: true }
        }

        const count = countOccurrences(text, old)
        if (count === 0) return { observation: `no match: the "old" text does not appear in "${rel}"`, isError: true }
        if (count > 1 && !replace_all) {
            return { observation: `"old" appears ${count} times in "${rel}" — add surrounding context to make it unique, or set replace_all`, isError: true }
        }

        const updated = replace_all ? text.split(old).join(replacement) : text.replace(old, replacement)
        try {
            await fs.writeFile(abs, updated)
        } catch (error) {
            return { observation: `could not write "${rel}": ${error.message}`, isError: true }
        }
        const n = replace_all ? count : 1
        return { observation: `edited "${rel}" (${n} replacement${n === 1 ? "" : "s"})`, data: { path: rel, replacements: n } }
    }
}

/** Count non-overlapping occurrences of `needle` in `haystack`. Empty needle → 0
 *  (guarded so indexOf("", …) can't spin), so an empty `old` is refused upstream. */
function countOccurrences(haystack, needle) {
    if (!needle) return 0
    let count = 0, i = 0
    while ((i = haystack.indexOf(needle, i)) !== -1) { count++; i += needle.length }
    return count
}

A.define("m-edit", MEdit)
