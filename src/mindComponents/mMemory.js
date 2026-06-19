import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { MBaseComponent } from "./mBaseComponent.js"
import { complete, isDryRun } from "../modelAccess/llm.js"
import { resolveModelRef } from "../modelAccess/modelConfig.js"
import { logger } from '../infrastructure/logger.js';
import { InterruptRecord } from '../infrastructure/interruptRecord.js';
import { mindHome, inVault, ensureVault, commitVault, assertNotRetired } from '../infrastructure/memoryVault.js';
import { FORMAT_VERSION, recordWake, tierOf } from '../infrastructure/manifest.js';
import { getLoadedArchitecture } from '../startup/architecture.js';

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
 * it is read back, and the mind literally wakes up remembering: the loaded tail
 * and summaries are published on the `tail`/`compressed` topics the frame reads,
 * and a one-time wake stimulus is raised onto the attention spine (a bubbling
 * `interrupt-request`) — memory pushes; nothing pulls from it.
 *
 * @interface
 * Attributes:
 *   - tailLength (1500), recentLength (1200), storyLength (2200): char budgets
 *   - blockMin (800): how much overflow accumulates before a consolidation
 *   - storyEvery (5): every Nth consolidation folds recent into story
 *   - persist (default "state"): directory for memory.md; "off" disables
 *   - journal (default "journal"): directory for session journals; "off" disables
 *   - model: compression model (defaults to ancestor utilityModel, then utility default)
 *   - src (default "..m-mind/stream/chunk"), boundarySrc (default "..m-mind/stream/boundary"):
 *     mind-relative so memory binds to its own mind's stream (see m-observer).
 *   - spokenSrc (default: the mind's m-speech `<name>/spoken` topic, auto-discovered;
 *     "off" disables): an aloud utterance is recorded by subscribing here, not by the
 *     voice calling spoke() in — so memory is swappable and several can listen at once.
 *   - filedSrc (default: the mind's m-kb `<name>/filed` topic, auto-discovered; "off"
 *     disables): the scribe's filings, journaled as a backstage note by subscribing
 *     here rather than the scribe calling note() in.
 *   - actedSrc (default: the mind's m-act `<name>/acted` topic, auto-discovered; "off"
 *     disables): a DEED the hands performed (efference.md §5.3), journaled as a
 *     backstage (⌁) note — the mind never saw it reach. Its CONSEQUENCE arrives
 *     separately as an External stimulus and is journaled perceived (⟂) via
 *     `attended`. Deed ⌁, consequence ⟂. Exactly mirrors `filedSrc` for the scribe.
 *   - attendedSrc (default "..m-mind/attended"; "off" disables): the stimuli that
 *     entered each frame, journaled as perceived (⟂) notes by subscribing here
 *     rather than the mind calling note() in.
 *
 * Topics published:
 *   - "tail": the verbatim tail, on every change (retained; the frame mirrors it)
 *   - "compressed": {recent, story} after a consolidation, and once on load
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
    _savedAt = null
    _lastSpokenAt = 0
    _lastFiled = null
    _lastActed = null
    _lastAttended = null

    onConnect() {
        this.tailLength = Number(this.attr("tailLength") || 1500)
        this.recentLength = Number(this.attr("recentLength") || 1200)
        this.storyLength = Number(this.attr("storyLength") || 2200)
        this.blockMin = Number(this.attr("blockMin") || 800)
        this.storyEvery = Number(this.attr("storyEvery") || 5)

        this.sub(this.attr("src") || "..m-mind/stream/chunk", this._onChunk)
        this.sub(this.attr("boundarySrc") || "..m-mind/stream/boundary", this._onBoundary)
        const explicitImageSrc = this.attr("imageSrc")
        const image = this.closest("m-mind")?.querySelector("m-image[name]")
        const imageSrc = explicitImageSrc || (image ? `..m-mind/${image.getAttribute("name")}/generated` : null)
        if (imageSrc && imageSrc !== "off") this.sub(imageSrc, image => this.imageGenerated(image), 12)

        // The voice's aloud utterances arrive as a topic, not a method call into
        // us: we point at whatever speaks (auto-discovered, or an explicit
        // `spokenSrc`, or "off"). The voice stays ignorant of memory, so memory
        // can be swapped or run several-at-once just by changing the architecture.
        const explicitSpokenSrc = this.attr("spokenSrc")
        const voice = this.closest("m-mind")?.querySelector("m-speech[name]")
        const spokenSrc = explicitSpokenSrc || (voice ? `..m-mind/${voice.getAttribute("name")}/spoken` : null)
        if (spokenSrc && spokenSrc !== "off") this.sub(spokenSrc, this._onSpoken, 12)

        // The scribe's filings arrive on its `filed` topic (auto-discovered,
        // explicit, or "off"); we journal them as a backstage note ourselves
        // rather than the scribe reaching in to call note().
        const explicitFiledSrc = this.attr("filedSrc")
        const scribe = this.closest("m-mind")?.querySelector("m-kb[name]")
        const filedSrc = explicitFiledSrc || (scribe ? `..m-mind/${scribe.getAttribute("name")}/filed` : null)
        if (filedSrc && filedSrc !== "off") this.sub(filedSrc, this._onFiled, 12)

        // The hands' deeds arrive on m-act's `acted` topic (auto-discovered,
        // explicit, or "off"); we journal each as a backstage (⌁) note ourselves —
        // the mind never perceived the reaching. The CONSEQUENCE comes back the
        // ordinary way (an External stimulus → `attended` → a perceived (⟂) note),
        // so deed and consequence land on opposite sides of the mechanism.
        const explicitActedSrc = this.attr("actedSrc")
        const hands = this.closest("m-mind")?.querySelector("m-act[name]")
        const actedSrc = explicitActedSrc || (hands ? `..m-mind/${hands.getAttribute("name")}/acted` : null)
        if (actedSrc && actedSrc !== "off") this.sub(actedSrc, this._onActed, 12)

        // The mind publishes the stimuli that entered each frame on `attended`; we
        // journal them as perceived (⟂) notes here, rather than the mind reaching
        // in to call note() per stimulus.
        if (this.attr("attendedSrc") !== "off") {
            this.sub(this.attr("attendedSrc") || "..m-mind/attended", this._onAttended, 12)
        }

        const dir = this._persistDir()
        this._home = dir
        this._vaulted = !!dir && inVault(dir)
        if (this._vaulted) { ensureVault(); assertNotRetired(dir) }
        // Only a resident persists to history (lifecycle.md §2). A dry or transient
        // mind still loads/writes its home, but never commits — its home has no
        // resident manifest, so tierOf is "transient"/"none", and `commitVault`
        // additionally hard-stops on a dry run.
        this._persists = this._vaulted && tierOf(dir) === 'resident'

        // Defense-in-depth: refuse to load existing memory for transient minds.
        // A transient re-woken into an existing home would load old memory without
        // committing new, creating an illusion of continuity. Only override via
        // MEDITATOR_FORCE_TRANSIENT=1 (testing exception).
        if (this._vaulted && tierOf(dir) === 'transient') {
            const memPath = path.join(dir, "memory.md")
            const hasMemory = fsSync.existsSync(memPath)
            if (hasMemory && !process.env.MEDITATOR_FORCE_TRANSIENT) {
                // A dry run's home is throwaway by construction: the covenant
                // auto-namespaces every dry mind `memory/dry-*` and never commits
                // it (lifecycle.md §2). Leftover memory.md from a previous dry run
                // is stale scratch, not a self to protect — so wipe the home and
                // wake fresh instead of refusing. Gated on BOTH the dry-run flag
                // and the `dry-` name so a resident's home is never cleared.
                if (isDryRun() && path.basename(dir).startsWith('dry-')) {
                    log.info(`Clearing stale dry-run memory at "${dir}" before waking fresh.`)
                    fsSync.rmSync(dir, { recursive: true, force: true })
                } else {
                    throw new Error(
                        `Refusing to wake transient mind into existing home "${dir}" with memory.md. ` +
                        `This creates an illusion of continuity — memory loads but is never committed. ` +
                        `To force for testing, set MEDITATOR_FORCE_TRANSIENT=1.`
                    )
                }
            }
        }

        // Snapshot the architecture that is waking this mind into its home, so the
        // home always carries the architecture that ran it (lifecycle.md §2 — the
        // twin of runtimeSHA). Written before the commit below so a resident's wake
        // commit includes it; for a transient it simply sits in the home, ready for
        // retire.mjs. Done here, not at retirement, because the architecture is a
        // fact known only while the mind runs.
        this._snapshotArchitecture()

        this._load().finally(() => {
            this.loaded = true
            if (this._persists) {
                // A resident records the runtime + format that woke it (Phases 1–2).
                recordWake(this._home)
                commitVault(`wake: ${this._mindLabel()} ${new Date().toISOString()}`, this._home)
            }
        })
    }

    /** Writes the running architecture's source into the home as architecture.archml.
     *  No-op when the mind has no persistent home or no architecture source was read
     *  (e.g. a wiring test that builds the DOM directly). Best-effort — a failure
     *  never blocks the wake. */
    _snapshotArchitecture() {
        const arch = getLoadedArchitecture()
        if (!this._home || !arch?.content) return
        try {
            fsSync.mkdirSync(this._home, { recursive: true })
            fsSync.writeFileSync(path.join(this._home, "architecture.archml"), arch.content)
        } catch (error) {
            log.warn(`Could not snapshot architecture into "${this._home}": ${error.message}`)
        }
    }

    _mindLabel() {
        return path.basename(this._persistDir() || "mind")
    }

    // ------------------------------------------------------------------ flow

    _onChunk = chunk => {
        this.tail += chunk
        this._journalBuffer += chunk
        this._trimTail()
    }

    // Keep the verbatim tail within budget, cutting at a word edge so summaries
    // do not see half words; the overflow accumulates toward the next block. Then
    // publish `tail` as a retained behaviour-value: this is the single choke point
    // for every tail change (chunk, aloud utterance, image), so subscribers — the
    // mind's frame assembly above all — mirror the freshest tail without reaching
    // in. Always published (even when no trim happened) so the mirror stays live.
    _trimTail() {
        if (this.tail.length > this.tailLength) {
            const cut = this.tail.length - this.tailLength
            const edge = this.tail.lastIndexOf(" ", cut + 40)
            const cutAt = edge > 0 ? edge : cut
            this._overflow += this.tail.slice(0, cutAt)
            this.tail = this.tail.slice(cutAt)
        }
        this.pub("tail", this.tail)
    }

    _onBoundary = () => {
        if (this._finalized) return
        this._flushJournal()
        if (this._overflow.length >= this.blockMin && !this._compressing) {
            this._consolidate() // intentionally not awaited — never blocks the rhythm
        }
        this._persist()
        this._boundaryCount += 1
        if (this._persists && this._boundaryCount % 25 === 0) {
            commitVault(`heartbeat: ${this._mindLabel()} after ${this._boundaryCount} boundaries`, this._home)
        }
    }

    // An utterance the voice spoke, arriving on its `spoken` topic rather than as
    // a method call into us. Dedupe on the timestamp so a retained-value replay —
    // Amanita replays a topic's last value to a late/re-subscriber (e.g. after a
    // reRender) — cannot record the same utterance twice.
    _onSpoken = s => {
        if (!s || !s.text || s.at === this._lastSpokenAt) return
        this._lastSpokenAt = s.at
        this.spoke(s.text)
    }

    // The scribe's filings, arriving on its `filed` topic rather than a note()
    // call into us. The scribe is subconscious, so this is a backstage (⌁) note
    // the mind never perceives. Dedupe on object identity so a retained-value
    // replay (e.g. after a reRender re-subscribe) cannot journal the same filing
    // twice — a genuine new filing is always a fresh object.
    _onFiled = f => {
        if (!f || !f.files || !f.files.length || f === this._lastFiled) return
        this._lastFiled = f
        this.note(`The scribe filed thoughts into: ${f.files.join(", ")}`, { perceived: false })
    }

    // A deed the hands performed, arriving on m-act's `acted` topic rather than a
    // note() call into us. The hands are subconscious — the mind never saw the
    // reaching — so this is a backstage (⌁) note. The deed records THAT it reached
    // and with which hand; the consequence (the experience) returns separately and is
    // journaled perceived (⟂). Dedupe on object identity against a retained-value
    // replay; a genuine new deed is always a fresh object.
    _onActed = a => {
        if (!a || !a.capability || a === this._lastActed) return
        this._lastActed = a
        const intent = a.intent ? `: “${a.intent}”` : ""
        const note = a.ok
            ? `The hands reached out into the world via ${a.capability}${intent}.`
            : `The hands reached out via ${a.capability} but it slipped${intent}.`
        this.note(note, { perceived: false })
    }

    // The stimuli that entered a frame, arriving on the mind's `attended` topic
    // rather than a note() call per stimulus. Each is a perceived (⟂) note. Dedupe
    // on object identity against a retained-value replay (the mind publishes a
    // fresh array per frame).
    _onAttended = lines => {
        if (!Array.isArray(lines) || !lines.length || lines === this._lastAttended) return
        this._lastAttended = lines
        for (const line of lines) this.note(line)
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
        if (this._persists) await commitVault(`${reason}: ${this._mindLabel()} ${new Date().toISOString()}`, this._home)
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
            model: resolveModelRef(this.attr("model") || this.env("utilityModel"), "utility"),
            maxTokens: Math.ceil(targetChars / 3),
            temperature: 0.3,
            debugTag: `memory-${tier}`,
            debugEl: this,
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

    /**
     * Records an event into the journal at the right temporal position. Two kinds,
     * distinguished by marker so a human reading the journal can tell them apart:
     *   - perceived (⟂): a stimulus that actually entered the attention frame the
     *     mind read this burst (a sense, a wander, an association, the wake/sleep
     *     notice) — the mind experienced it, and its reaction follows.
     *   - backstage (⌁): a subconscious/bookkeeping event the mind never sees, e.g.
     *     the scribe filing knowledge. Recorded for us, never part of the stream —
     *     the prose flows straight across it.
     * Neither writes to the verbatim `tail`; only `spoke()` does that. This is a
     * human-readable annotation only — the journal is never fed back to the model.
     */
    note(text, { perceived = true } = {}) {
        this._flushJournal()
        this._appendJournal(`\n> ${perceived ? "⟂" : "⌁"} ${text}\n\n`)
    }

    /**
     * True iff this is a resident — a mind whose memory is kept and committed
     * across runs (lifecycle.md §2). A dry/transient mind writes to disk but is
     * never committed and is laid in the scratch pen, so it will not wake again;
     * the sleep notice must be honest about that (Covenant §3, identity-honesty).
     */
    get persists() { return !!this._persists }

    /**
     * Records something the mind said ALOUD. Driven by the `spoken` subscription
     * (see onConnect / _onSpoken), not called by the voice directly. The utterance
     * enters the verbatim tail as a marked block — so the next thought continues
     * knowing what it just said — and is journaled distinctly from inner speech.
     */
    spoke(text) {
        if (this._finalized || !text) return
        this.tail += `\n(aloud) "${text}"\n`
        this._trimTail()
        this._flushJournal()
        this._appendJournal(`\n🗣 *${text}*\n\n`)
    }

    /**
     * Records an image the mind generated. The binary payload stays on the
     * published event for Studio; memory keeps the prompt/reference so the next
     * text-only thought knows what image now exists without swallowing base64.
     */
    imageGenerated(image) {
        if (this._finalized || !image) return
        const prompt = (image.prompt || image.originalPrompt || "").trim()
        if (!prompt) return
        const revised = image.revisedPrompt && image.revisedPrompt !== prompt
            ? ` revised as "${image.revisedPrompt}"`
            : ""
        const ref = image.url || (image.dataUrl ? "embedded image payload" : "no image payload")
        this.tail += `\n(image) Generated an image from prompt: "${prompt}"${revised}. Reference: ${ref}.\n`
        this._trimTail()
        this._flushJournal()
        const journalImage = image.url
            ? `\n![generated image](${image.url})\n`
            : (image.dataUrl ? `\n*Image payload available in Studio; omitted from journal to keep memory compact.*\n` : "")
        this._appendJournal(`\n🖼 *Generated image*: ${prompt}${revised}\n${journalImage}\n`)
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
                try {
                    const parsed = JSON.parse(meta[1])
                    this._savedAt = parsed.savedAt
                    // Wake rule (lifecycle.md §2): memory written by a NEWER format than
                    // this runtime understands may not be read faithfully. Absent =
                    // pre-versioning (treat as 1). Warn; never silently mangle a self.
                    const saved = Number(parsed.formatVersion || 1)
                    if (saved > FORMAT_VERSION) {
                        log.warn(`Memory was saved at formatVersion ${saved}, but this runtime reads ${FORMAT_VERSION}; loading anyway — some of the self may not survive the gap.`)
                    }
                } catch { /* ignore */ }
            }
            this.story = this._section(raw, "Story")
            this.recent = this._section(raw, "Recent")
            this.tail = this._section(raw, "Tail")
            this._foldCount = Number((raw.match(/<!-- folds: (\d+) -->/) || [])[1] || 0)

            // Make the loaded self visible on the topics the frame reads, so the
            // first burst wakes up remembering without anyone pulling from us.
            this.pub("tail", this.tail)
            this.pub("compressed", { recent: this.recent, story: this.story })

            if (this.tail || this.recent || this.story) {
                // Waking is a stimulus like any other, so raise it onto the
                // attention spine rather than parking it for the mind to pull. The
                // arbiter is a child of m-mind and connected before this async load
                // resolves, so the bubbling request lands; the mind drains it (with
                // takePending) on its first burst, which it gates on `loaded`.
                const ago = this._savedAt ? this._describeGap(Date.now() - new Date(this._savedAt).getTime()) : null
                this.dispatchEvent(new CustomEvent("interrupt-request", {
                    bubbles: true,
                    detail: new InterruptRecord({
                        source: 'Internal',
                        type: 'Waking',
                        reason: ago
                            ? `I am waking up; about ${ago} has passed since my last thought.`
                            : `I am waking up again after a gap I cannot measure.`,
                        salience: 1,
                    }),
                }))
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
<!-- meta: ${JSON.stringify({ savedAt: new Date().toISOString(), formatVersion: FORMAT_VERSION })} -->
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
