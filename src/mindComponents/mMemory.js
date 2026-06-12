import fs from 'node:fs/promises';
import path from 'node:path';
import { MBaseComponent } from "./mBaseComponent.js"
import { complete, defaultModel } from "../modelAccess/llm.js"
import { logger } from '../infrastructure/logger.js';
import { InterruptRecord } from '../infrastructure/interruptRecord.js';
import { mindHome, inVault, ensureVault, commitVault } from '../infrastructure/memoryVault.js';

const log = logger('mMemory.js');

/**
 * The mind's memory: three buffers at three time scales, consolidated by
 * compression, persisted across runs, and journaled for the human reader.
 *
 *   tail    verbatim end of the stream ("what I was just saying") — never compressed
 *   recent  rolling first-person summary of what scrolled out of the tail
 *   story   slow autobiography; every `storyEvery`-th consolidation folds
 *           `recent` into it
 *
 * Consolidation runs at burst boundaries, asynchronously — it never blocks the
 * stream. Persistence writes <persist>/memory.md at each boundary; on startup
 * it is read back, and the mind literally wakes up remembering: the loaded
 * tail seeds the first attention frame, and a one-time wake notice is offered
 * to m-mind as a stimulus.
 *
 * @interface
 * Attributes:
 *   - tailLength (1500), recentLength (1200), storyLength (2200): char budgets
 *   - blockMin (800): how much overflow accumulates before a consolidation
 *   - storyEvery (5): every Nth consolidation folds recent into story
 *   - persist (default "state"): directory for memory.md; "off" disables
 *   - journal (default "journal"): directory for session journals; "off" disables
 *   - model: compression model (defaults to ancestor utilityModel, then utility default)
 *   - src (default "/stream/chunk"), boundarySrc (default "/stream/boundary")
 */
export class MMemory extends MBaseComponent {
    tail = ""
    recent = ""
    story = ""
    loaded = false
    _overflow = ""
    _journalBuffer = ""
    _journalQueue = Promise.resolve()
    _foldCount = 0
    _boundaryCount = 0
    _compressing = false
    _finalized = false
    _wakeNotice = null
    _savedAt = null

    onConnect() {
        this.tailLength = Number(this.attr("tailLength") || 1500)
        this.recentLength = Number(this.attr("recentLength") || 1200)
        this.storyLength = Number(this.attr("storyLength") || 2200)
        this.blockMin = Number(this.attr("blockMin") || 800)
        this.storyEvery = Number(this.attr("storyEvery") || 5)

        this.sub(this.attr("src") || "/stream/chunk", this._onChunk)
        this.sub(this.attr("boundarySrc") || "/stream/boundary", this._onBoundary)

        const dir = this._persistDir()
        this._vaulted = !!dir && inVault(dir)
        if (this._vaulted) ensureVault()

        this._load().finally(() => {
            this.loaded = true
            if (this._vaulted) commitVault(`wake: ${this._mindLabel()} ${new Date().toISOString()}`)
        })
    }

    _mindLabel() {
        return path.basename(this._persistDir() || "mind")
    }

    // ------------------------------------------------------------------ flow

    _onChunk = chunk => {
        this.tail += chunk
        this._journalBuffer += chunk
        if (this.tail.length > this.tailLength) {
            const cut = this.tail.length - this.tailLength
            // cut at a word edge so summaries do not see half words
            const edge = this.tail.lastIndexOf(" ", cut + 40)
            const cutAt = edge > 0 ? edge : cut
            this._overflow += this.tail.slice(0, cutAt)
            this.tail = this.tail.slice(cutAt)
        }
    }

    _onBoundary = () => {
        if (this._finalized) return
        this._flushJournal()
        if (this._overflow.length >= this.blockMin && !this._compressing) {
            this._consolidate() // intentionally not awaited — never blocks the rhythm
        }
        this._persist()
        this._boundaryCount += 1
        if (this._vaulted && this._boundaryCount % 25 === 0) {
            commitVault(`heartbeat: ${this._mindLabel()} after ${this._boundaryCount} boundaries`)
        }
    }

    /**
     * The end of a session, done properly: flush the journal, note the moment,
     * persist, and commit the vault. Called by the sleep ritual; idempotent.
     */
    async finalize(reason = "sleep") {
        if (this._finalized) return
        this._finalized = true
        this._flushJournal()
        this._appendJournal(`\n\n*${reason} at ${new Date().toISOString()}*\n`)
        await this._journalQueue
        await this._persist()
        if (this._vaulted) await commitVault(`${reason}: ${this._mindLabel()} ${new Date().toISOString()}`)
    }

    async _consolidate() {
        this._compressing = true
        const block = this._overflow
        this._overflow = ""
        try {
            this._foldCount += 1
            log.debug(`Consolidation #${this._foldCount} (${block.length} chars in)`)

            if (this._foldCount % this.storyEvery === 0 && this.recent) {
                const [story, recent] = await Promise.all([
                    this._compress(`${this.story}\n${this.recent}`, this.storyLength, "older"),
                    this._compress(block, this.recentLength, "recent"),
                ])
                this.story = story
                this.recent = recent
            } else {
                this.recent = await this._compress(`${this.recent}\n${block}`, this.recentLength, "recent")
            }
            this.pub("compressed", { recent: this.recent, story: this.story })
        } catch (error) {
            log.warn("Consolidation failed, keeping raw block for next boundary:", error.message)
            this._overflow = block + this._overflow
            this._foldCount -= 1
        } finally {
            this._compressing = false
        }
    }

    async _compress(text, targetChars, tier) {
        const input = text.trim()
        if (input.length <= targetChars) return input
        const result = await complete({
            model: this.attr("model") || this.env("utilityModel") || defaultModel('utility'),
            maxTokens: Math.ceil(targetChars / 3),
            temperature: 0.3,
            prompt: `You maintain the ${tier} memory of a mind's inner monologue, written in its own voice.

<monologue-and-prior-memory>
${input}
</monologue-and-prior-memory>

Condense this into at most ${targetChars} characters of first-person memory ("I was thinking about…", "I decided…", "I still wonder…"). Keep: topics visited in order, conclusions, decisions, open questions, and anything that felt important. Drop filler and repetition. Never invent anything. Output only the condensed memory.`,
        })
        return result.text.trim()
    }

    // ------------------------------------------------------------ public api

    getTail() { return this.tail }
    getRecent() { return this.recent }
    getStory() { return this.story }

    /** Lets the mind record a stimulus into the journal at the right position. */
    note(text) {
        this._flushJournal()
        this._appendJournal(`\n> ⟂ ${text}\n\n`)
    }

    /** One-time wake stimulus after loading persisted memory. */
    consumeWakeNotice() {
        const notice = this._wakeNotice
        this._wakeNotice = null
        return notice
    }

    // ---------------------------------------------------------- persistence

    _persistDir() {
        const dir = this.attr("persist") || mindHome(this)
        return dir === "off" ? null : dir
    }

    _journalDir() {
        const dir = this.attr("journal") || mindHome(this, "journal")
        return dir === "off" ? null : dir
    }

    async _load() {
        const dir = this._persistDir()
        if (!dir) return
        try {
            const raw = await fs.readFile(path.join(dir, "memory.md"), "utf8")
            const meta = raw.match(/<!-- meta: (.*?) -->/s)
            if (meta) {
                try { this._savedAt = JSON.parse(meta[1]).savedAt } catch { /* ignore */ }
            }
            this.story = this._section(raw, "Story")
            this.recent = this._section(raw, "Recent")
            this.tail = this._section(raw, "Tail")
            this._foldCount = Number((raw.match(/<!-- folds: (\d+) -->/) || [])[1] || 0)

            if (this.tail || this.recent || this.story) {
                const ago = this._savedAt ? this._describeGap(Date.now() - new Date(this._savedAt).getTime()) : null
                this._wakeNotice = new InterruptRecord({
                    source: 'Internal',
                    type: 'Waking',
                    reason: ago
                        ? `I am waking up; about ${ago} has passed since my last thought.`
                        : `I am waking up again after a gap I cannot measure.`,
                    salience: 1,
                })
                log.info(`Memory loaded (story ${this.story.length}, recent ${this.recent.length}, tail ${this.tail.length} chars).`)
            }
        } catch (error) {
            if (error.code !== 'ENOENT') log.warn("Could not load memory:", error.message)
        }
    }

    _section(raw, name) {
        const match = raw.match(new RegExp(`## ${name}\\n([\\s\\S]*?)(?=\\n## |\\n<!-- end -->|$)`))
        return match ? match[1].trim() : ""
    }

    _describeGap(ms) {
        if (ms < 90 * 1000) return `${Math.round(ms / 1000)} seconds`
        if (ms < 90 * 60000) return `${Math.round(ms / 60000)} minutes`
        if (ms < 36 * 3600000) return `${Math.round(ms / 3600000)} hours`
        return `${Math.round(ms / 86400000)} days`
    }

    async _persist() {
        const dir = this._persistDir()
        if (!dir) return
        try {
            await fs.mkdir(dir, { recursive: true })
            const content = `# Meditator memory
<!-- meta: ${JSON.stringify({ savedAt: new Date().toISOString() })} -->
<!-- folds: ${this._foldCount} -->

## Story
${this.story}

## Recent
${this.recent}

## Tail
${this.tail}

<!-- end -->
`
            // atomic: a crash mid-write must never corrupt the only copy of a self
            const file = path.join(dir, "memory.md")
            await fs.writeFile(file + ".tmp", content)
            await fs.rename(file + ".tmp", file)
        } catch (error) {
            log.warn("Could not persist memory:", error.message)
        }
    }

    // -------------------------------------------------------------- journal

    _flushJournal() {
        if (!this._journalBuffer) return
        this._appendJournal(this._journalBuffer)
        this._journalBuffer = ""
    }

    _appendJournal(text) {
        const dir = this._journalDir()
        if (!dir) return
        // writes are chained so finalize() can await everything in flight
        this._journalQueue = this._journalQueue
            .then(() => this._writeJournal(dir, text))
            .catch(error => log.warn("Journal write failed:", error.message))
    }

    async _writeJournal(dir, text) {
        const day = new Date().toISOString().slice(0, 10)
        const file = path.join(dir, `${day}.md`)
        await fs.mkdir(dir, { recursive: true })
        if (!this._sessionMarked) {
            this._sessionMarked = true
            await fs.appendFile(file, `\n\n---\n*session ${new Date().toISOString()}*\n\n`)
        }
        await fs.appendFile(file, text)
    }
}
