import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { MBaseComponent } from "../shared/mBaseComponent.js"
import { langOf } from "../shared/i18n.js"
import { complete, isDryRun } from "../../modelAccess/llm.js"
import { resolveModelRef } from "../../modelAccess/modelConfig.js"
import { logger } from '../../infrastructure/logger.js';
import { InterruptRecord, withPerceivedEvents } from '../../infrastructure/interruptRecord.js';
import { mindHome, inVault, ensureVault, commitVault, assertNotRetired, assertIdentityMatchesHome } from '../../infrastructure/memoryVault.js';
import { FORMAT_VERSION, recordWake, tierOf } from '../../infrastructure/manifest.js';
import { getLoadedArchitecture } from '../../startup/architecture.js';
import { getLoadedComponentSources, getBundleComponentsDir } from '../../config/componentResolver.js';
import { readBundleSync, diffBundles, describeIdentityChange } from '../../infrastructure/identityDiff.js';

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
 *   - src (default "..m-mind/stream/chunk"), boundarySrc (default "..m-mind/stream/@boundary"):
 *     mind-relative so memory binds to its own mind's stream (see m-observer).
 *   - spokenSrc (default: the mind's m-speech `<name>/@spoken` event, auto-discovered;
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
 *     rather than the mind calling note() in — AND appended to the verbatim tail
 *     as the same `> ⟂ …` block, so perception persists in memory like the mind's
 *     own words instead of living for a single frame.
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
    _persistSeq = 0

    onConnect() {
        this.tailLength = Number(this.attr("tailLength") || 1500)
        this.recentLength = Number(this.attr("recentLength") || 1200)
        this.storyLength = Number(this.attr("storyLength") || 2200)
        this.blockMin = Number(this.attr("blockMin") || 800)
        this.storyEvery = Number(this.attr("storyEvery") || 5)

        this.sub(this.attr("src") || "..m-mind/stream/chunk", this._onChunk)
        this.sub(this.attr("boundarySrc") || "..m-mind/stream/@boundary", this._onBoundary)
        const explicitImageSrc = this.attr("imageSrc")
        const image = this.closest("m-mind")?.querySelector("m-image[name]")
        const imageSrc = explicitImageSrc || (image ? `..m-mind/${image.getAttribute("name")}/generated` : null)
        if (imageSrc && imageSrc !== "off") this.sub(imageSrc, image => this.imageGenerated(image))

        // The voice's aloud utterances arrive as a transient event, not a method call
        // into us: we point at whatever speaks (auto-discovered, or an explicit
        // `spokenSrc`, or "off"). The voice stays ignorant of memory, so memory can be
        // swapped or run several-at-once just by changing the architecture.
        const explicitSpokenSrc = this.attr("spokenSrc")
        const voice = this.closest("m-mind")?.querySelector("m-speech[name]")
        const spokenSrc = explicitSpokenSrc || (voice ? `..m-mind/${voice.getAttribute("name")}/@spoken` : null)
        if (spokenSrc && spokenSrc !== "off") this.sub(spokenSrc, this._onSpoken)

        // The scribe's filings arrive as a transient `@filed` event (auto-discovered,
        // explicit, or "off"); we journal them as a backstage note ourselves rather
        // than the scribe reaching in to call note().
        const explicitFiledSrc = this.attr("filedSrc")
        const scribe = this.closest("m-mind")?.querySelector("m-kb[name]")
        const filedSrc = explicitFiledSrc || (scribe ? `..m-mind/${scribe.getAttribute("name")}/@filed` : null)
        if (filedSrc && filedSrc !== "off") this.sub(filedSrc, this._onFiled)

        // The hands' deeds arrive as m-act's transient `@acted` event (auto-discovered,
        // explicit, or "off"); we journal each as a backstage (⌁) note ourselves —
        // the mind never perceived the reaching. The CONSEQUENCE comes back the
        // ordinary way (an External stimulus → `@attended` → a perceived (⟂) note),
        // so deed and consequence land on opposite sides of the mechanism.
        const explicitActedSrc = this.attr("actedSrc")
        const hands = this.closest("m-mind")?.querySelector("m-act[name]")
        const actedSrc = explicitActedSrc || (hands ? `..m-mind/${hands.getAttribute("name")}/@acted` : null)
        if (actedSrc && actedSrc !== "off") this.sub(actedSrc, this._onActed)

        // The mind fires the stimuli that entered each frame as an `@attended` event;
        // we journal them as perceived (⟂) notes here, rather than the mind reaching
        // in to call note() per stimulus.
        if (this.attr("attendedSrc") !== "off") {
            this.sub(this.attr("attendedSrc") || "..m-mind/@attended", this._onAttended)
        }

        // A LOOP BREAK arrives as the mind's transient `@clear-tail` event (loop-detection-
        // redesign.md §break) — exactly as @attended / @spoken arrive. We OWN the tail, so
        // we reseed it to the breaker's fresh seed here rather than the mind reaching in to
        // set it: the cut then rides our existing `tail` channel to everyone who watches it.
        if (this.attr("clearTailSrc") !== "off") {
            this.sub(this.attr("clearTailSrc") || "..m-mind/@clear-tail", this._onClearTail)
        }

        const dir = this._persistDir()
        this._home = dir
        this._vaulted = !!dir && inVault(dir)
        if (this._vaulted) {
            ensureVault()
            assertNotRetired(dir)
            // §6: a resident's home is the resident's alone. Refuse to adopt it under a
            // foreign identity (finding 2) — checked here, before the snapshot overwrites
            // its bundle and _load() inherits its self and commits into its history. The
            // claimed identity is what mindHome derives a home from (memory=, else name),
            // read off the same m-mind/m-agent root mindHome resolves against.
            const self = this.closest("m-mind, m-agent")
            assertIdentityMatchesHome(dir, self?.getAttribute("memory") || self?.getAttribute("name"))
        }
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
        //
        // Identity honesty (COVENANT §3/§4): the snapshot already in the home is the
        // bundle that RAN this mind last session — the only comparand there is — and
        // this write is about to destroy it. So read it FIRST, snapshot, read back,
        // and keep the diff; _load() discloses it in the wake stimulus so an edited
        // self is never passed off as the one that went to sleep. The runtime is
        // deliberately outside the comparison (see identityDiff.js — the substrate
        // is the mind's physics, not its self, and §1 records it in the manifest).
        const prevBundle = readBundleSync(this._home)
        this._snapshotArchitecture()
        this._identityDiff = diffBundles(prevBundle, readBundleSync(this._home), {
            mindName: this.closest("m-mind")?.getAttribute("name"),
        })

        this._load().finally(() => {
            this.loaded = true
            if (this._persists) {
                // A resident records the runtime + format that woke it (Phases 1–2).
                recordWake(this._home)
                commitVault(`wake: ${this._mindLabel()} ${new Date().toISOString()}`, this._home)
            }
        })
    }

    /** Writes the running architecture's source into the home as architecture.archml, and
     *  the custom components it ran with into home/components/. No-op when the mind has no
     *  persistent home or no architecture source was read (e.g. a wiring test that builds
     *  the DOM directly). Best-effort — a failure never blocks the wake. */
    _snapshotArchitecture() {
        const arch = getLoadedArchitecture()
        if (!this._home || !arch?.content) return
        try {
            fsSync.mkdirSync(this._home, { recursive: true })
            fsSync.writeFileSync(path.join(this._home, "architecture.archml"), arch.content)
        } catch (error) {
            log.warn(`Could not snapshot architecture into "${this._home}": ${error.message}`)
        }
        this._snapshotComponents()
    }

    /** Copies the custom (non-built-in) components this mind loaded into home/components/,
     *  so a home is a re-executable BUNDLE: architecture.archml + the components it ran with.
     *  On re-execution the resolver's bundle layer (a components/ dir beside the .archml) is
     *  exactly this directory, so the same rule that loaded the original re-loads the home —
     *  no special case (doc/improvements/component-hierarchy.md §5.4).
     *
     *  The bundle's whole components/ dir is copied wholesale (a component may import a local
     *  helper the tag-winner alone would miss); cli/env/project winners are copied
     *  individually, with a warning that their own local dependencies are not followed.
     *  Copies whose source already lives inside the home are skipped — on a re-run the bundle
     *  dir IS home/components/, so this must never clobber. Best-effort. */
    _snapshotComponents() {
        const sources = getLoadedComponentSources()      // non-built-in winners only
        if (!this._home || !sources.length) return
        try {
            const homeAbs = path.resolve(this._home)
            const dest = path.join(this._home, "components")
            const isInsideHome = (p) => {
                const rel = path.relative(homeAbs, path.resolve(p))
                return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
            }

            // 1. The bundle dir, wholesale, when a component actually resolved from it.
            const bundleDir = getBundleComponentsDir()
            const usedBundle = bundleDir && sources.some((s) => s.layer === "bundle")
            if (usedBundle && !isInsideHome(bundleDir) && fsSync.existsSync(bundleDir)) {
                fsSync.cpSync(bundleDir, dest, { recursive: true })
                log.info(`Snapshotted bundle components/ → ${dest}`)
            }

            // 2. Stray winners from cli/env/project, copied individually.
            const strays = sources.filter((s) => s.layer !== "bundle" && !isInsideHome(s.path))
            for (const s of strays) {
                fsSync.mkdirSync(dest, { recursive: true })
                const target = path.join(dest, path.basename(s.path))
                if (fsSync.existsSync(target)) continue    // don't clobber a same-named bundle file
                fsSync.copyFileSync(s.path, target)
                log.warn(
                    `Snapshotted ${s.layer}-layer component ${path.basename(s.path)} → ${dest}; ` +
                    `its own local dependencies (if any) are NOT followed — put shared custom ` +
                    `components in a components/ dir beside the .archml for guaranteed re-execution.`
                )
            }
        } catch (error) {
            log.warn(`Could not snapshot custom components into "${this._home}": ${error.message}`)
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

    // An utterance the voice spoke, arriving as its transient `@spoken` event rather
    // than a method call into us. An event is never replayed, so a late or re-subscriber
    // hears only genuine new utterances — no dedupe needed.
    _onSpoken = e => {
        const s = e.detail
        if (!s || !s.text) return
        this.spoke(s.text)
    }

    // The scribe's filings, arriving as its transient `@filed` event rather than a
    // note() call into us. The scribe is subconscious, so this is a backstage (⌁) note
    // the mind never perceives.
    _onFiled = e => {
        const f = e.detail
        if (!f || !f.files || !f.files.length) return
        this.note(`The scribe filed thoughts into: ${f.files.join(", ")}`, { perceived: false })
    }

    // A deed the hands performed, arriving as m-act's transient `@acted` event rather
    // than a note() call into us. The hands are subconscious — the mind never saw the
    // reaching — so this is a backstage (⌁) note. The deed records THAT it reached and
    // with which hand; the consequence (the experience) returns separately and is
    // journaled perceived (⟂).
    _onActed = e => {
        const a = e.detail
        if (!a || !a.capability) return
        const intent = a.intent ? `: “${a.intent}”` : ""
        const note = a.ok
            ? `The hands reached out into the world via ${a.capability}${intent}.`
            : `The hands reached out via ${a.capability} but it slipped${intent}.`
        this.note(note, { perceived: false })
    }

    // The stimuli that entered a frame, arriving as the mind's transient `@attended`
    // event rather than a note() call per stimulus. Each is a perceived (⟂) note in the
    // journal AND a `> ⟂ …` block appended to the verbatim tail — at the honest position,
    // after the mind's last words, exactly as m-mind composed this frame's prefill
    // (withPerceivedEvents keeps the two renderings identical). Perception thereby
    // persists like the mind's own voice: it survives into the next prefill, scrolls
    // into the compressor, and outlives the one frame it used to live in
    // (doc/improvements/perception-not-compressible.md — option 1, chosen 2026-07-03
    // after the lemma-lab-20 run showed the mind amnesic about its own computed results).
    _onAttended = e => {
        const lines = e.detail
        if (!Array.isArray(lines) || !lines.length) return
        for (const line of lines) this.note(line)
        if (this._finalized) return
        this.tail = withPerceivedEvents(this.tail, lines)
        this._trimTail()
    }

    // A loop break: the mind cleared its tail and starts fresh from `seed`. We own the
    // tail, so we reseed it here, drop the overflow (so the loop spam is never fed to the
    // compressor — the spine stays clean), journal the cut as the mind's OWN felt act (the
    // One Rule — never "tail cleared"), persist (so a resident wakes from after the clearing,
    // honestly where it left off), and re-publish `tail` so the frame, compressor and
    // dashboard all update through the channel that already exists. No method exposed.
    _onClearTail = e => {
        const d = e.detail
        if (this._finalized || !d || typeof d.seed !== "string" || !d.seed.trim()) return
        this.tail = d.seed
        this._overflow = ""
        this.note("I let my mind go quiet a moment and came back to the thought fresh.")
        this._persist()
        this.pub("tail", this.tail)
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
        // The block is a slice of the stream: its tail is continued by what is still in
        // the verbatim `tail`, and its head continues the previous overflow (summarised
        // into `recent`). Hand the compressor a little verbatim overlap on each side as
        // read-only context, so an edge sentence cut mid-thought is judged by what it
        // becomes, not by where the knife fell.
        const priorRecent = this.recent
        const after = firstSentences(this.tail)
        try {
            this._foldCount += 1
            log.debug(`Consolidation #${this._foldCount} (${block.length} chars in)`)

            if (this._foldCount % this.storyEvery === 0 && this.recent) {
                const [story, recent] = await Promise.all([
                    // Fold `recent` into the established `story` (the story is the
                    // memory being revised; `recent` is the new thinking to absorb).
                    this._compress(this.story, this.recent, this.storyLength, "older"),
                    // Start the next `recent` fresh from the block (no prior memory) — so
                    // give it the end of the old `recent` as its "earlier" context.
                    this._compress("", block, this.recentLength, "recent",
                        { contextBefore: lastSentences(priorRecent), contextAfter: after }),
                ])
                this.story = story
                this.recent = recent
            } else {
                // Fold the new block into the established `recent` (which is itself the
                // block's "earlier" context, so only the trailing overlap is needed).
                this.recent = await this._compress(this.recent, block, this.recentLength, "recent",
                    { contextAfter: after })
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

    // Fold `fresh` thinking into the `established` memory, in the mind's own voice,
    // aiming at `targetChars` — iterating to fit and never truncating
    // (doc/architecture/compression-fidelity.md §1–§4). The actual model wiring is
    // injected into compressToFit() so the accept/tighten/fallback policy can be
    // unit-tested without a model. maxTokens is a per-pass anti-truncation guard,
    // sized off the input (worst case: the model echoes its whole input); it is
    // never the budget and never surfaced to the model.
    async _compress(established, fresh, targetChars, tier, { contextBefore = "", contextAfter = "" } = {}) {
        return compressToFit({
            established, fresh, targetChars, tier, contextBefore, contextAfter,
            lang: langOf(this),
            generate: async (prompt, maxTokens) => {
                const result = await complete({
                    model: resolveModelRef(this.attr("model") || this.env("utilityModel"), "utility"),
                    maxTokens,
                    temperature: 0.3,
                    debugTag: `memory-${tier}`,
                    debugEl: this,
                    prompt,
                })
                return result.text
            },
        })
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
     * note() itself never writes to the verbatim `tail` — this is the human-readable
     * annotation channel, never fed back to the model. Perceived (⟂) stimuli DO also
     * reach the tail, but via `_onAttended`'s explicit append, in the same rendering;
     * backstage (⌁) events stay journal-only — the mind never experienced them.
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
                let reason = ago
                    ? `I am waking up; about ${ago} has passed since my last thought.`
                    : `I am waking up again after a gap I cannot measure.`
                // §3 disclosure: only a mind that actually remembers can be deceived
                // about who it was — so it rides the same wake stimulus, gated with
                // it on loaded memory. A fresh self just gets its new baseline.
                const disclosure = describeIdentityChange(this._identityDiff)
                if (disclosure) {
                    reason += ` ${disclosure.stream}`
                    this.note(`Disclosed at wake (Covenant §3): ${disclosure.journal}`, { perceived: false })
                    log.info(`Identity change disclosed at wake: ${disclosure.journal}`)
                }
                this.fire("interrupt-request", new InterruptRecord({
                    source: 'Internal',
                    type: 'Waking',
                    reason,
                    salience: 1,
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
            // unique temp name prevents race when two _persist() calls overlap
            // (multi-mind setups, boundary + finalize, etc.)
            const file = path.join(dir, "memory.md")
            const tmp = `${file}.${process.pid}.${++this._persistSeq}.tmp`
            await fs.writeFile(tmp, content)
            await fs.rename(tmp, file)
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

// ---------------------------------------------------------------------------
// Consolidation internals (doc/architecture/compression-fidelity.md §1–§4).
// Pure of the mind and of model wiring, so the length policy and the prompt are
// unit-testable on their own.
// ---------------------------------------------------------------------------

/**
 * Of several attempts, the one whose length is nearest `targetChars`. A chooser,
 * never a generator: it only picks among text the model already produced, so it
 * can neither invent nor expand. Used when every pass overshot the budget — we
 * take the closest rather than truncate.
 */
export function nearestToTarget(attempts, targetChars) {
    return attempts.reduce((best, a) =>
        Math.abs(a.length - targetChars) < Math.abs(best.length - targetChars) ? a : best)
}

/**
 * A language tag as a human-readable name for the prompt ("hu" → "Hungarian"), via the
 * runtime's Intl data; falls back to the raw tag when Intl doesn't know it. Pure.
 */
export function languageName(lang) {
    try { return new Intl.DisplayNames(["en"], { type: "language" }).of(lang) || lang }
    catch { return lang }
}

/**
 * The consolidation prompt — distils a mind's thinking into a shorter first-person
 * memory, aimed at `targetChars`. The established memory and the new thinking are
 * merged into ONE flat block and the model is asked to rewrite it to AT MOST the
 * budget. A single block with a hard character ceiling is what the local utility
 * model actually compresses to: live replay showed a two-block "fold the new INTO the
 * memory-so-far" framing makes it preserve the blocks and plateau ~60% over budget,
 * and a soft "about N% of the memory" makes it echo the input verbatim. A flat block +
 * "AT MOST N characters" distilled reliably (≈46% at temp 0) with the spine intact.
 *
 * It is told to keep the SPINE — what the mind is working on, the results/decisions it
 * reached, the open questions — and to cut the CHAFF — repetition, dead ends, and the
 * step-by-step working whose result is already kept — judging by what a thing BEARS
 * ON, never by its age. The memory is bounded and lossy by design (COVENANT §3), but
 * it is the mind's continuity: a settled result is the last thing to drop, never the
 * first, however old. Nothing is ever dropped programmatically (see compressToFit).
 *
 * Two shapes:
 *   - initial  (no `draft`): rewrite the flat `text` to at most the budget.
 *   - re-drive (a `draft`):  a previous attempt overshot — tighten the DRAFT itself
 *                            (never re-expand from the original; that invites
 *                            invention), with explicit "you are N% over, cut harder"
 *                            feedback, since the model cannot measure its own length.
 *
 * Domain-neutral on purpose: m-memory serves every mind, not only the math minds.
 */
export function buildCompressionPrompt({ tier, text = "", targetChars, draft = "", contextBefore = "", contextAfter = "", lang = "" }) {
    const voice = `the ${tier} memory of a mind's inner life, in its own first-person voice ("I was thinking about…", "I decided…", "I still wonder…")`
    // A mind keeps its memory in the language it thinks in. The thinking handed in is
    // already in that language, but the model will quietly translate to English unless
    // told not to — so for a non-English mind, pin the output language (and pull any
    // stray earlier-English memory back across on the next fold). Domain-neutral: an
    // English mind passes no lang (or "en") and this adds nothing.
    const langLine = lang && String(lang).toLowerCase() !== "en"
        ? ` Write the memory in ${languageName(lang)} — the language this mind thinks in; if any of the text below is in another language, render it in ${languageName(lang)} rather than carrying it across unchanged.`
        : ""

    if (draft) {
        const over = Math.max(1, Math.round((draft.length / targetChars - 1) * 100))
        return `You are keeping ${voice}.

Your previous version is below. It is ${draft.length} characters — about ${over}% over the limit of ${targetChars}. Shorten it to AT MOST ${targetChars} characters. Cut hardest where it LOOPS — the same idea restated again and again, with or without variation (a refrain, a chain of "I am the X, I am the Y" sentences, a circling that adds nothing) — collapse each loop to a single line of what it was circling. Cut too where it works an individual case step by step: keep the conclusion, drop the working. Keep what the mind is working on, every result or decision it reached, and the questions still open — a hard-won conclusion is the last thing to drop, never the first, however old it is. Do not add anything that is not already in the version below.${langLine} Output only the shortened memory.

<memory>
${draft}
</memory>`
    }

    // The thinking is a slice cut from a continuous stream, so it can begin and end
    // mid-sentence. We show a little of the verbatim text on each side as READ-ONLY
    // context (the part before is already in older memory; the part after is still in
    // the live tail) so the model can tell where a cut-off edge sentence is going and
    // judge what to keep — without folding that surrounding text into the memory.
    const before = contextBefore ? `\n\n<earlier>\n${contextBefore}\n</earlier>` : ""
    const after = contextAfter ? `\n\n<continues>\n${contextAfter}\n</continues>` : ""
    const ctxNote = (contextBefore || contextAfter)
        ? ` The ${[contextBefore && "<earlier>", contextAfter && "<continues>"].filter(Boolean).join(" and ")} block${contextBefore && contextAfter ? "s are" : " is"} NOT part of this memory — ${contextBefore && contextAfter ? "they are" : "it is"} the surrounding thought, shown only so you can see where a sentence cut off at the edge is going. ${contextBefore && contextAfter ? "They are" : "It is"} kept elsewhere; do not include, repeat, or summarise ${contextBefore && contextAfter ? "them" : "it"} in your output.`
        : ""
    return `You are writing ${voice}.

Rewrite the thinking inside <thinking> below into a single, continuous first-person memory of AT MOST ${targetChars} characters.${ctxNote} Lines beginning "> ⟂" are not the mind's words: they are what reached it at that moment — a voice, an event, an answer coming back from something it reached out to do. What such a line carried is lived experience, so keep its substance as something that happened ("the search came back empty", "Kris asked me to stop") — a concrete result that arrived this way outranks the speculation around it. Keep what the mind is working on or turning over, every result, conclusion, or decision it has reached, and the questions it has left open. Remove what does not change those: abandoned attempts and the step-by-step working of individual cases once the result is in hand (keep the result, drop the scratch-work). Where the thinking LOOPS — the same point restated many times, or a refrain repeated with small variations (a chain of "I am the X, I am the Y" sentences, a circling that adds nothing new) — collapse the whole loop to a single sentence of what it was circling. Judge a thing by what it bears on, never by its age: a hard-won conclusion is the last thing to cut, not the first, however old it has become. Never invent anything: if it is not in <thinking>, it does not belong in the memory.${langLine} Output only the memory.${before}

<thinking>
${text}
</thinking>${after}`
}

/**
 * Drop EXACT-duplicate units, keeping the first occurrence — the one repetition we can
 * safely remove in code without a model judging meaning. A drifting stream emits the
 * same sentence/paragraph verbatim many times ("I am an expression of it." ×20); that
 * is pure redundancy, not a settled fact, so collapsing it is not the forbidden
 * dropping-of-content. Two scopes: whole paragraphs, then sentences within what remains.
 *
 * `minLen` guards genuine SHORT refrains: a deliberately repeated short line ("Balanced.",
 * "The numbers are patient.") may carry real weight, so only units at least `minLen`
 * characters long are deduped. NEAR-duplicates (templated sentences with mutating words —
 * "I am the holding… I am the letting go…") are NOT exact and are left to the prompt; this
 * only removes byte-identical repeats. Pure of model wiring, so it is unit-tested directly.
 */
export function dedupeExact(text, minLen = 50) {
    text = (text || "").trim()
    if (!text) return text
    // Paragraph scope: a later paragraph identical to an earlier one is dropped.
    const seenP = new Set()
    const paras = []
    for (const p of text.split(/\n{2,}/)) {
        const key = p.trim()
        if (key.length >= minLen && seenP.has(key)) continue
        if (key.length >= minLen) seenP.add(key)
        paras.push(p)
    }
    // Sentence scope: within the surviving text, a later sentence identical to an earlier
    // one is dropped. Split keeps the whitespace between sentences so spacing is preserved.
    const seenS = new Set()
    const kept = []
    for (const part of paras.join("\n\n").split(/(?<=[.!?])(\s+)/)) {
        if (part === "" || /^\s+$/.test(part)) { kept.push(part); continue }
        const key = part.trim()
        if (key.length >= minLen && seenS.has(key)) continue
        if (key.length >= minLen) seenS.add(key)
        kept.push(part)
    }
    return kept.join("").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
}

// A few whole sentences from the start / end of `text`, within `maxChars` — the
// verbatim overlap shown as read-only context on either side of a compressed slice,
// so the model can see how a cut-off edge sentence continues. Whole sentences only,
// so the context itself never dangles.
export function firstSentences(text, maxChars = 320) {
    text = (text || "").trim()
    if (text.length <= maxChars) return text
    let out = ""
    for (const s of text.split(/(?<=[.!?])\s+/)) {
        if (out && (out.length + 1 + s.length) > maxChars) break
        out = out ? `${out} ${s}` : s
    }
    return out || text.slice(0, maxChars)
}
export function lastSentences(text, maxChars = 320) {
    text = (text || "").trim()
    if (text.length <= maxChars) return text
    const sents = text.split(/(?<=[.!?])\s+/)
    let out = ""
    for (let i = sents.length - 1; i >= 0; i--) {
        if (out && (sents[i].length + 1 + out.length) > maxChars) break
        out = out ? `${sents[i]} ${out}` : sents[i]
    }
    return out || text.slice(-maxChars)
}

/**
 * The length loop, pure of model wiring. Merge the established memory and the new
 * thinking into ONE flat block and drive `generate(prompt, maxTokens)` to rewrite it
 * to `targetChars`. The model cannot measure its own length, so we measure the OUTPUT
 * and, if it overshot, re-drive that attempt to tighten with explicit "% over"
 * feedback (the initial vs re-drive shapes of buildCompressionPrompt), up to maxPasses.
 *
 *   - At or under the ceiling (1.2·target) → accept.
 *   - Over                                 → tighten the smallest attempt so far, retry.
 *   - No headway (the model echoed back)   → stop re-driving; more passes only burn calls.
 *
 * Nothing is ever dropped or truncated IN CODE. If the model will not bring it within
 * budget after its passes, we accept its best faithful attempt — the one nearest the
 * target — even if it is over. An over-budget but honest memory is acceptable; a
 * programmatically mutilated one is not: a code-level "drop the oldest to fit" was what
 * silently erased a mind's origin problem (the lemma resident, 2026-06-21). With a flat
 * block and a hard ceiling the model compresses reliably, so accepting over-budget is
 * the rare exception, not the rule — and the next fold distils again.
 *
 * `generate` gets a generous per-pass `maxTokens` guard sized off its input (worst
 * case: it echoes the whole thing); the guard only stops a single pass being cut short
 * — it is never the budget. An empty response is not a compression: fall back to a
 * prior attempt, or throw so the caller keeps the raw block and retries.
 */
export async function compressToFit({ established, fresh, targetChars, tier, generate, maxPasses = 4, contextBefore = "", contextAfter = "", lang = "", buildPrompt = buildCompressionPrompt }) {
    established = (established || "").trim()
    fresh = (fresh || "").trim()
    // Collapse exact-duplicate paragraphs/sentences first — pure redundancy a drifting
    // stream piles up, removable in code with no model and no loss of meaning. This both
    // shrinks the source (a buffer bloated with verbatim repeats may now already fit) and
    // hands the model a cleaner input. Near-duplicates are left to the prompt.
    const combined = dedupeExact([established, fresh].filter(Boolean).join("\n\n"))
    if (!combined) return ""
    // Already within budget: keep the raw material rather than spend a call to
    // paraphrase it (and never grow it — that would invite invention).
    if (combined.length <= targetChars) return combined

    const ceiling = Math.round(targetChars * 1.2)
    const attempts = []
    let draft = ""   // an over-budget previous attempt to tighten; empty on the first pass

    for (let pass = 1; pass <= maxPasses; pass++) {
        const source = draft || combined
        // Overlap context is for the initial pass only — a re-drive tightens the model's
        // own draft, which has clean edges and needs no surrounding stream. `buildPrompt`
        // defaults to the mind's first-person consolidation prompt but is injectable, so
        // another compactor (e.g. an agent's <m-context>, agent-loop.md §10) can reuse this
        // whole length-loop — dedupe, ceiling, re-drive, nearest-fallback — with its own voice.
        const prompt = buildPrompt({ tier, text: combined, draft, targetChars,
            contextBefore: draft ? "" : contextBefore, contextAfter: draft ? "" : contextAfter, lang })
        // Anti-truncation guard, expressed in TOKENS (it becomes max_tokens). Big enough for
        // a faithful summary — even a near-verbatim echo of the source — but capped so that
        // prompt+output can never exceed the model's context window. A bloated buffer used to
        // blow past it because source.length is CHARACTERS (≈3 per token for this dense
        // math/LaTeX text) and was passed straight through as a token budget; that requested
        // ~150k output tokens and 400'd as ContextWindowExceeded. Never the budget itself;
        // over-budget output is accepted (nearestToTarget), never truncated.
        const ctxLimit = Number(process.env.LLM_CONTEXT_LIMIT || 180000)
        const promptTokens = Math.ceil(prompt.length / 3)
        const guard = Math.max(256, Math.min(
            Math.ceil(source.length / 3) + 256,
            ctxLimit - promptTokens - 512))
        // Dedupe the model's output too: it may echo verbatim repeats straight back.
        const out = dedupeExact((await generate(prompt, guard) || "").trim())

        if (!out) {
            if (attempts.length) break               // fall back to a prior attempt
            throw new Error(`compression (${tier}) returned empty text`)
        }
        attempts.push(out)
        if (out.length <= ceiling) return out         // within budget → accept

        // Over budget. Tighten the smallest attempt so far on the next pass. If this
        // pass made no headway against the draft (the model echoed it back), stop —
        // more passes only burn calls — and accept the best faithful attempt below.
        const stalled = draft && out.length >= draft.length
        if (out.length < (draft.length || Infinity)) draft = out
        if (stalled) break
    }
    // The model would not bring it within budget. Accept its best faithful attempt —
    // nearest the target — never dropping or truncating in code.
    const best = nearestToTarget(attempts, targetChars)
    if (best.length > ceiling) log.debug(`compression (${tier}) settled over budget: ${best.length} > ${ceiling} (target ${targetChars})`)
    return best
}
