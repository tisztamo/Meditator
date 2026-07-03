import A from "amanita"
import fs from "node:fs/promises"
import { MBaseComponent } from "../shared/mBaseComponent.js"
import { toolRoot, resolveWithin } from "../shared/fileTool.js"

/**
 * <m-read-file> — an agent tool that reads a UTF-8 text file from the workspace,
 * returned with 1-indexed line numbers (agent-loop.md §8).
 *
 * THE EXTENSIBILITY PROOF. This is the whole "adding a tool" story in one screen: a new
 * capability is a ~40-line LEAF component, dropped into any agent with one line of archml
 * and ZERO change to m-agent / m-reason. The bubbling `capability` event does all the
 * wiring — identical to how a mind's hand registers with m-act — and the closed-menu
 * schema validation (toolSchema.js) is enforced by the kernel, not here.
 *
 * Read-only and contained to the workspace root (fileTool.js): a path that escapes the
 * root comes back as a clean error observation, never a crash and never a read outside
 * the sandbox.
 *
 * @interface
 * Attributes:
 *   - name: the tool-call function name (default "read_file")
 *   - root: the directory the tool may read within (default: the agent's workspace home,
 *     memory/<agent>/workspace — shared with m-terminal)
 */
export class MReadFile extends MBaseComponent {
    onConnect() {
        this._root = toolRoot(this)
        this.offerCapability({
            name: this.attr("name") || "read_file",
            description: "Read a UTF-8 text file from the workspace, returned with 1-indexed line numbers. "
                + "Paths are relative to the workspace root.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "path relative to the workspace root" },
                    maxBytes: { type: "integer", description: "cap on bytes read (default 65536)" },
                },
                required: ["path"],
            },
            readonly: true,
            execute: args => this._read(args),
        })
    }

    async _read({ path: rel, maxBytes = 65536 }) {
        const { abs, error } = resolveWithin(this._root, rel)
        if (error) return { observation: `refused: ${error}`, isError: true }
        const cap = Number.isInteger(maxBytes) && maxBytes > 0 ? maxBytes : 65536
        try {
            const buf = await fs.readFile(abs)
            const text = buf.subarray(0, cap).toString("utf8")
            const numbered = text.split("\n").map((l, i) => `${i + 1}\t${l}`).join("\n")
            const more = buf.length > cap ? `\n… (${buf.length - cap} more bytes)` : ""
            return { observation: numbered + more, data: { path: rel, bytes: buf.length } }
        } catch (error) {
            return { observation: `could not read "${rel}": ${error.message}`, isError: true }
        }
    }
}

A.define("m-read-file", MReadFile)
