import A from "amanita"
import fs from "node:fs/promises"
import path from "node:path"
import { MBaseComponent } from "../shared/mBaseComponent.js"
import { toolRoot, resolveWithin } from "../shared/fileTool.js"

/**
 * <m-write-file> — an agent tool that creates or overwrites a UTF-8 text file in the
 * workspace, creating parent directories as needed (agent-loop.md §8). The
 * world-changing sibling of <m-read-file>: same ~40-line leaf shape, same containment,
 * same one-line wiring — this one is `readonly: false`, the governance flag a norm would
 * gate on (§11).
 *
 * @interface
 * Attributes:
 *   - name: the tool-call function name (default "write_file")
 *   - root: the directory the tool may write within (default: the agent's workspace home)
 */
export class MWriteFile extends MBaseComponent {
    onConnect() {
        this._root = toolRoot(this)
        this.offerCapability({
            name: this.attr("name") || "write_file",
            description: "Create or overwrite a UTF-8 text file in the workspace (parent directories are created "
                + "as needed). Writes the full contents you provide. Paths are relative to the workspace root.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "path relative to the workspace root" },
                    content: { type: "string", description: "the full file contents to write" },
                },
                required: ["path", "content"],
            },
            readonly: false,   // WORLD-CHANGING — the governance flag a norm gates on (§11)
            execute: args => this._write(args),
        })
    }

    async _write({ path: rel, content = "" }) {
        const { abs, error } = resolveWithin(this._root, rel)
        if (error) return { observation: `refused: ${error}`, isError: true }
        try {
            await fs.mkdir(path.dirname(abs), { recursive: true })
            await fs.writeFile(abs, String(content))
            const bytes = Buffer.byteLength(String(content))
            return { observation: `wrote ${bytes} byte(s) to "${rel}"`, data: { path: rel, bytes } }
        } catch (error) {
            return { observation: `could not write "${rel}": ${error.message}`, isError: true }
        }
    }
}

A.define("m-write-file", MWriteFile)
