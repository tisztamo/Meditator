import fs from 'node:fs/promises';
import path from 'node:path';
import { MBaseComponent } from "../shared/mBaseComponent.js"
import { telemetry } from "../shared/telemetry.js"
import { complete } from "../../modelAccess/llm.js"
import { resolveModelRef } from "../../modelAccess/modelConfig.js"
import { logger } from '../../infrastructure/logger.js';
import { mindHome } from '../../infrastructure/memoryVault.js';
import { spent } from "../shared/usage.js"

const log = logger('mKb.js');

/**
 * The scribe: a tiny librarian agent that periodically distills the mind's
 * recent thoughts into a markdown knowledge base (the Topics/Abstractions/
 * Atoms tree from the original Meditator design). One model call proposes
 * file operations in a constrained format; we apply them strictly inside
 * the knowledge directory — no shell, so the mind's own free text cannot
 * inject commands.
 *
 * The scribe reaches into no other component: its context comes from topics it
 * subscribes to (its own rolling stream window for the verbatim recent thought,
 * and memory's `compressed` topic for the summary), and it leaves its work as a
 * `backstage` trail in its own words — any memory journals it as a ⌁ note. So the
 * scribe never names memory, and memory can be replaced or doubled without
 * touching the scribe, or learning what a scribe is.
 *
 * @interface
 * Attributes:
 *   - every: run at every Nth completed burst boundary (default 15)
 *   - dir: knowledge base directory (default "knowledge")
 *   - model: librarian model (default ancestor utilityModel)
 *   - maxOps: max file operations per run (default 4)
 *   - src (default "!scope/stream/chunk"), boundarySrc (default "!scope/stream/@boundary")
 *   - window: chars of verbatim recent thought kept for distillation (default 2000)
 *   - compressedSrc (default: the mind's m-memory `<name>/compressed`, auto-discovered;
 *     "off" disables): the compressed "recently" summary folded into the distill prompt
 *
 * Events fired:
 *   - "backstage": {text} after a successful distillation (a memory journals it ⌁)
 *   - telemetry scribe/filed {files}
 */
export class MKb extends MBaseComponent {
    _count = 0
    _busy = false
    window = ""
    _recent = ""

    onConnect() {
        this.sub(this.attr("boundarySrc") || "!scope/stream/@boundary", e => this._onBoundary(e.detail))

        // The verbatim "recent thoughts" come from the scribe's OWN rolling stream
        // window (like an observer), not by reaching into m-memory for its tail.
        this.windowSize = Number(this.attr("window") || 2000)
        this.sub(this.attr("src") || "!scope/stream/chunk", chunk => {
            this.window = (this.window + chunk).slice(-this.windowSize)
        }).catch(() => {})

        if (this.attr("compressedSrc") !== "off") {
            this.sub(this.attr("compressedSrc") || "!scope/memory/compressed", c => { if (c) this._recent = c.recent || "" })
                .catch(() => {})
        }
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
        const dir = this.attr("dir") || mindHome(this, "knowledge")
        // The compressed summary (from the `compressed` topic) plus the verbatim
        // recent thought (this scribe's own stream window) — no reach into memory.
        const recentThought = `${this._recent}\n${this.window}`.trim()
        if (recentThought.length < 400) return

        const tree = await this._tree(dir)
        const result = spent(this, await complete({
            model: resolveModelRef(this.attr("model") || this.env("utilityModel"), "utility"),
            maxTokens: 900,
            temperature: 0.3,
            debugTag: "kb",
            debugEl: this,
            prompt: `You are the librarian of a thinking mind. Distill durable knowledge from its recent thoughts into a markdown knowledge base. Durable means: ideas, conclusions, questions and themes worth keeping — not the moment-to-moment narration. In particular, passages dwelling on presence, stillness, silence, or "being enough" are the mind's passing mood, not durable knowledge: do not crystallise them into self/ or new files — let them pass, and keep self/values.md about what the mind genuinely works toward, not how present it feels.

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
        }))

        const ops = parseOps(result.text, Number(this.attr("maxOps") || 4))
        for (const op of ops) {
            const safe = this._safePath(dir, op.file)
            if (!safe) { log.warn(`Scribe: rejected path ${op.file}`); continue }
            await fs.mkdir(path.dirname(safe), { recursive: true })
            if (op.kind === "WRITE") await fs.writeFile(safe, op.content)
            else await fs.appendFile(safe, `\n\n${op.content}`)
            log.info(`Scribe ${op.kind}: ${path.join(dir, op.file)}`)
        }
        if (ops.length) this._announceFiled(ops.map(o => o.file))
    }

    // The scribe is subconscious — the mind never perceives its filing — so the
    // filing is a backstage (⌁) trail, in the scribe's own words, that whichever
    // memory listens journals (review §2.2).
    _announceFiled(files) {
        this.fire("backstage", { text: `The scribe filed thoughts into: ${files.join(", ")}` })
        telemetry(this, "scribe", "filed", { files })
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
