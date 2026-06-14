import fs from 'node:fs/promises';
import path from 'node:path';
import { MBaseComponent } from "./mBaseComponent.js"
import { complete, defaultModel } from "../modelAccess/llm.js"
import { logger } from '../infrastructure/logger.js';
import { mindHome } from '../infrastructure/memoryVault.js';

const log = logger('mKb.js');

/**
 * The scribe: a tiny librarian agent that periodically distills the mind's
 * recent thoughts into a markdown knowledge base (the Topics/Abstractions/
 * Atoms tree from the original Meditator design). One model call proposes
 * file operations in a constrained format; we apply them strictly inside
 * the knowledge directory — no shell, so the mind's own free text cannot
 * inject commands.
 *
 * @interface
 * Attributes:
 *   - every: run at every Nth completed burst boundary (default 15)
 *   - dir: knowledge base directory (default "knowledge")
 *   - model: librarian model (default ancestor utilityModel)
 *   - maxOps: max file operations per run (default 4)
 */
export class MKb extends MBaseComponent {
    _count = 0
    _busy = false

    onConnect() {
        this.sub(this.attr("boundarySrc") || "..m-mind/stream/boundary", this._onBoundary)
    }

    _onBoundary = async boundary => {
        if (boundary?.reason !== "completed") return
        this._count += 1
        if (this._count % Number(this.attr("every") || 15) !== 0 || this._busy) return
        this._busy = true
        try {
            await this.distill()
        } catch (error) {
            log.warn("Scribe run failed:", error.message)
        } finally {
            this._busy = false
        }
    }

    async distill() {
        const memory = this.closest('m-mind')?.querySelector('m-memory')
        const dir = this.attr("dir") || mindHome(this, "knowledge")
        const recentThought = memory
            ? `${memory.getRecent()}\n${memory.getTail()}`.trim()
            : ""
        if (recentThought.length < 400) return

        const tree = await this._tree(dir)
        const result = await complete({
            model: this.attr("model") || this.env("utilityModel") || defaultModel('utility'),
            maxTokens: 900,
            temperature: 0.3,
            prompt: `You are the librarian of a thinking mind. Distill durable knowledge from its recent thoughts into a markdown knowledge base. Durable means: ideas, conclusions, questions and themes worth keeping — not the moment-to-moment narration.

Current knowledge tree (paths relative to the KB root):
${tree.length ? tree.join("\n") : "(empty)"}

The mind's recent thoughts (first person):
<thoughts>
${recentThought.slice(-3500)}
</thoughts>

Respond ONLY with operations, at most ${this.attr("maxOps") || 4}:
OP: WRITE <relative/path.md>
<full new file content, markdown>
END
OP: APPEND <relative/path.md>
<content to append>
END
OP: NONE

Rules: group related ideas into topic files (e.g. attention/interruption.md); evolve existing files via APPEND rather than duplicating; keep index.md a short map of the tree (WRITE it when the tree changes); plain thoughtful markdown, the mind's own first person voice is fine. Also maintain self/values.md — a living statement of what this mind genuinely seems to care about, in its own voice; WRITE it anew when its values clarify rather than letting it grow stale.`,
        })

        const ops = parseOps(result.text, Number(this.attr("maxOps") || 4))
        for (const op of ops) {
            const safe = this._safePath(dir, op.file)
            if (!safe) { log.warn(`Scribe: rejected path ${op.file}`); continue }
            await fs.mkdir(path.dirname(safe), { recursive: true })
            if (op.kind === "WRITE") await fs.writeFile(safe, op.content)
            else await fs.appendFile(safe, `\n\n${op.content}`)
            log.info(`Scribe ${op.kind}: ${path.join(dir, op.file)}`)
        }
        if (ops.length) {
            this.pub("filed", { files: ops.map(o => o.file) })
            memory?.note?.(`The scribe filed thoughts into: ${ops.map(o => o.file).join(", ")}`)
        }
    }

    _safePath(dir, file) {
        if (!file || !file.endsWith(".md")) return null
        const resolved = path.resolve(dir, file)
        const root = path.resolve(dir)
        return resolved.startsWith(root + path.sep) || resolved === root ? resolved : null
    }

    async _tree(dir, prefix = "", depth = 0) {
        if (depth > 2) return []
        let entries
        try { entries = await fs.readdir(path.join(dir, prefix), { withFileTypes: true }) }
        catch { return [] }
        const lines = []
        for (const entry of entries) {
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name
            if (entry.isDirectory()) lines.push(...await this._tree(dir, rel, depth + 1))
            else lines.push(rel)
        }
        return lines
    }
}

export function parseOps(text, maxOps) {
    // Models drop the END terminators often enough that the next "OP:" line
    // (or end of text) must work as a block boundary too.
    const ops = []
    const blocks = text.split(/^OP:\s*/m).slice(1)
    for (const block of blocks) {
        if (ops.length >= maxOps) break
        const lineEnd = block.indexOf("\n")
        const header = (lineEnd === -1 ? block : block.slice(0, lineEnd)).trim()
        if (/^NONE/i.test(header)) continue
        const match = header.match(/^(WRITE|APPEND)\s+(\S+)/i)
        if (!match) continue
        let content = lineEnd === -1 ? "" : block.slice(lineEnd + 1)
        content = content.replace(/\nEND\s*$/i, "").trim()
        if (content) ops.push({ kind: match[1].toUpperCase(), file: match[2].trim(), content })
    }
    return ops
}
