import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { MBaseComponent } from "../shared/mBaseComponent.js"
import { closestRole } from "../shared/enclosure.js"
import { telemetry, onTelemetryWanted } from "../shared/telemetry.js"
import { langOf } from "../shared/i18n.js"
import { compressToFit, firstSentences, lastSentences } from "../shared/compression.js"
import { complete, isDryRun } from "../../modelAccess/llm.js"
import { resolveModelRef } from "../../modelAccess/modelConfig.js"
import { logger } from '../../infrastructure/logger.js';
import { withPerceivedEvents, stimulus } from '../../infrastructure/interruptRecord.js';
import { receiptsFrom } from '../../infrastructure/perceptionContracts.js';
import { mindHome, inVault, ensureVault, commitVault, assertNotRetired, assertIdentityMatchesHome } from '../../infrastructure/memoryVault.js';
import { FORMAT_VERSION, recordWake, tierOf } from '../../infrastructure/manifest.js';
import { runningArchitecture, runningComponentSources, runningBundleDir } from '../../infrastructure/runningBundle.js';
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
 *   - src (default "!scope/stream/chunk"), boundarySrc (default "!scope/stream/@boundary"):
 *     mind-relative so memory binds to its own mind's stream (see m-observer).
 *   - spokenSrc (default "!scope/voice/@spoken"; "off" disables): an aloud utterance
 *     is recorded by subscribing here, not by the voice calling spoke() in — so memory
 *     is swappable and several can listen at once.
 *   - attendedSrc (default "!scope/@attended"; "off" disables): the stimuli that
 *     entered each frame, journaled as perceived (⟂) notes by answering the mind's
 *     `attended {lines}` request rather than the mind calling note() in — AND
 *     appended to the verbatim tail as the same `> ⟂ …` block, so perception
 *     persists in memory like the mind's own words instead of living for a single
 *     frame. The reply is what lets the mind publish the frame knowing the ⟂ lines
 *     landed before the frame's first chunk (message rule M5).
 *   - bridgeSrc (default "!scope/@bridge"; "off" disables): the utility-model
 *     transition sentence m-mind injects at the head of a redirect burst. It rides
 *     the verbatim tail via the stream `prefix` chunk (the model continues from it),
 *     but is peeled off the journal as a provenance (↪) line rather than recorded as
 *     the mind's own spontaneous thought (finding 7, C1; Covenant §9). A request,
 *     answered once the pending mark is set.
 *   - sleepSrc (default "!scope/@sleep"; "off" disables): the sleep ritual's
 *     `sleep {reason}` request. Memory finalizes (journal marker, final persist,
 *     vault commit) and replies {committed, persists}; a failed final write replies
 *     an error, so the mind can report the self as not confirmed.
 *   - backstageSrc (default "!scope/@backstage"; "off" disables): the ONE mechanism
 *     trail. Any component fires a bubbling `backstage` event {text?, kind?, record?}:
 *     `text` is journaled as a ⌁ note, and `kind` (a slug) + `record` (an object) are
 *     appended as one typed line to journal/<kind>.jsonl. Each producer owns its prose
 *     — the scribe's filings, the hands' deeds (efference.md §5.3; the CONSEQUENCE
 *     arrives separately and is journaled perceived via `attended`: deed ⌁,
 *     consequence ⟂), aperture changes, the arbiter's mufflings, the provenance
 *     catch — so memory has no handler per producer (review §2.2).
 *   The channels that remain named each change the TAIL or answer a request, which a
 *   trail line cannot: spoken, image, attended, bridge, clear-tail, sleep.
 *
 * Journal marks: ⟂ perceived (a stimulus the mind actually saw this frame), ⌁ backstage
 * (a subconscious/mechanism event the mind never saw), ↪ bridge (a harness-written
 * transition), 🗣 aloud, 🖼 image. The ⟂/⌁ pair is the honesty ledger: every strong
 * intervention is double-recorded — what the mind FELT (⟂ or the seamless stream) and the
 * MECHANISM behind it (⌁), so the mind's experience stays whole while the record stays true.
 * Typed frame receipts from @percepts-attended are appended to journal/percepts.jsonl.
 * journal="off" disables these too.
 *
 * Topics published:
 *   - "tail": the verbatim tail, on every change (retained; the frame mirrors it)
 *   - "compressed": {recent, story} after a consolidation, and once on load
 */
export class MMemory extends MBaseComponent {
    // `up` waits for _load(): the mind must not think before the self is read back.
    static deferUp = true

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
    // The in-flight consolidation, so finalize() can await it before the final
    // persist and the last compressed self actually reaches disk (§2). _consolidate()
    // never rejects (it has its own try/catch/finally), so awaiting this is always safe.
    _consolidating = Promise.resolve()
    _finalized = false
    _savedAt = null
    // Whether the session that last wrote this home's memory.md reached the sleep
    // ritual (Covenant §2/§3). null = unknown (a fresh mind, or memory written by a
    // pre-crash-honesty runtime — treated as clean, never a false alarm); false =
    // it stopped mid-thought and the next wake says so.
    _priorEndedCleanly = null
    _persistSeq = 0
    // Every write to memory.md runs through this one chain, so overlapping persists
    // (a boundary and a finalize, a clear-tail, multi-mind fan-out) apply in issue
    // order and the freshest self is the one that lands last — the serialization
    // m-context already keeps for its transcript (mContext.js). Unique tmp names stop
    // a mid-write crash corrupting the single copy; the queue stops a stale write
    // winning the rename after a fresher one.
    _persistQueue = Promise.resolve()

    onConnect() {
        this.tailLength = Number(this.attr("tailLength") || 1500)
        this.recentLength = Number(this.attr("recentLength") || 1200)
        this.storyLength = Number(this.attr("storyLength") || 2200)
        this.blockMin = Number(this.attr("blockMin") || 800)
        this.storyEvery = Number(this.attr("storyEvery") || 5)

        // Claim the home and refuse a foreign or dry wake BEFORE any channel binds.
        // A throw here must not leave stream/chunk retries running after the element
        // is torn down (wiring tests that expect onConnect to abort).
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
            // read off the same mind/agent root mindHome resolves against.
            const self = closestRole(this, "mind", "agent")
            assertIdentityMatchesHome(dir, self?.getAttribute("memory") || self?.getAttribute("name"))
        }
        // Only a resident persists to history (lifecycle.md §2). A dry or transient
        // mind still loads/writes its home, but never commits — its home has no
        // resident manifest, so tierOf is "transient"/"none", and `commitVault`
        // additionally hard-stops on a dry run.
        this._persists = this._vaulted && tierOf(dir) === 'resident'
        // Retained, so the sleep notice can be honest without reading my getter.
        this.pub("kept", !!this._persists)

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

        this.sub(this.attr("src") || "!scope/stream/chunk", this._onChunk)
            .catch(err => { if (this.isConnected) log.warn('memory stream bind failed:', err.message) })
        this.sub(this.attr("boundarySrc") || "!scope/stream/@boundary", this._onBoundary)
            .catch(err => { if (this.isConnected) log.warn('memory boundary bind failed:', err.message) })
        onTelemetryWanted(this, () => {
            this._stateTelemetry()
            if (this.recent || this.story) this._compressedTelemetry()
        })

        if (this.attr("imageSrc") !== "off") {
            this.sub(this.attr("imageSrc") || "!scope/image/generated", image => this.imageGenerated(image)).catch(() => {})
        }
        if (this.attr("spokenSrc") !== "off") {
            this.sub(this.attr("spokenSrc") || "!scope/voice/@spoken", this._onSpoken).catch(() => {})
        }

        // The mind fires the stimuli that entered each frame as an `@attended` event;
        // we journal them as perceived (⟂) notes here, rather than the mind reaching
        // in to call note() per stimulus.
        if (this.attr("attendedSrc") !== "off") {
            this.respond("attended", this._onAttended, { src: this.attr("attendedSrc") || "!scope/@attended" })
            this.sub('!scope/@percepts-attended', this._onPerceptsAttended)
        }

        // THE SLEEP RITUAL asks, memory answers (message-rule.md): the membrane's
        // `sleep` request is the only way in, and the reply says whether the self
        // was committed. A mind without memory simply gets no reply.
        if (this.attr("sleepSrc") !== "off") {
            this.respond("sleep", d => this._onSleep(d), { src: this.attr("sleepSrc") || "!scope/@sleep" })
                .catch(err => { if (this.isConnected) log.warn('memory sleep bind failed:', err.message) })
        }

        // THE BACKSTAGE CHANNEL: any component leaves a mechanism trail by firing a
        // bubbling `backstage` event — {text?, kind?, record?} — and names no memory.
        // `text` becomes a ⌁ note; `kind` + `record` become one typed line in
        // journal/<kind>.jsonl. One generic seam, so a new catch/guard/mechanism never
        // needs a handler here. Off-able via `backstageSrc="off"`.
        if (this.attr("backstageSrc") !== "off") {
            this.sub(this.attr("backstageSrc") || "!scope/@backstage", this._onBackstage)
        }

        // A BRIDGE — the utility-model transition sentence m-mind injects on a redirect —
        // arrives as its transient `@bridge` event. It physically rides the tail via the
        // stream's opening `prefix` chunk (the model continues from it), so it must NOT be
        // journaled as the mind's own spontaneous thought: we mark it pending here and
        // `_flushJournal` peels it off the front of the next flushed block as a ↪ provenance
        // line (finding 7, C1; ui-journal-honesty.md). Off-able; auto-discovered on the mind.
        if (this.attr("bridgeSrc") !== "off") {
            this.respond("bridge", d => { this._pendingBridge = d.text || null; return { marked: !!d.text } },
                { src: this.attr("bridgeSrc") || "!scope/@bridge" })
        }

        // A LOOP BREAK arrives as the mind's transient `@clear-tail` event (loop-detection-
        // redesign.md §break) — exactly as @attended / @spoken arrive. We OWN the tail, so
        // we reseed it to the breaker's fresh seed here rather than the mind reaching in to
        // set it: the cut then rides our existing `tail` channel to everyone who watches it.
        if (this.attr("clearTailSrc") !== "off") {
            this.respond("clear-tail", this._onClearTail, { src: this.attr("clearTailSrc") || "!scope/@clear-tail" })
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
            mindName: closestRole(this, "mind")?.getAttribute("name"),
        })

        this._load().finally(async () => {
            this.loaded = true
            this.markUp()
            if (this._persists) {
                // Open the session durably (§2/§3 crash honesty): stamp memory.md with
                // endedCleanly:false now, so even a crash before the first boundary is
                // still recognisable as unclean at the next wake — finalize() flips it
                // true on a clean sleep. Written before the wake commit so the marker
                // rides it. _load() has already read the PRIOR marker into
                // _priorEndedCleanly (and fired the wake stimulus) before this overwrite.
                await this._persist()
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
        const arch = runningArchitecture()
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
        const sources = runningComponentSources()      // non-built-in winners only
        if (!this._home || !sources.length) return
        try {
            const homeAbs = path.resolve(this._home)
            const dest = path.join(this._home, "components")
            const isInsideHome = (p) => {
                const rel = path.relative(homeAbs, path.resolve(p))
                return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
            }

            // 1. The bundle dir, wholesale, when a component actually resolved from it.
            const bundleDir = runningBundleDir()
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
            // Intentionally not awaited — a consolidation never blocks the rhythm — but
            // its promise is kept so finalize() can await it before the final persist.
            this._consolidating = this._consolidate()
        }
        this._persist()
        this._boundaryCount += 1
        if (this._persists && this._boundaryCount % 25 === 0) {
            commitVault(`heartbeat: ${this._mindLabel()} after ${this._boundaryCount} boundaries`, this._home)
        }
        this._stateTelemetry()
    }

    _stateTelemetry() {
        telemetry(this, "memory", "state", {
            tailLen: this.tail.length,
            recentLen: this.recent.length,
            storyLen: this.story.length,
        })
    }

    _compressedTelemetry() {
        telemetry(this, "memory", "compressed", {
            recentLen: this.recent.length,
            storyLen: this.story.length,
            recentPreview: this.recent.slice(0, 400),
            storyPreview: this.story.slice(0, 400),
        })
    }

    // An utterance the voice spoke, arriving as its transient `@spoken` event rather
    // than a method call into us. An event is never replayed, so a late or re-subscriber
    // hears only genuine new utterances — no dedupe needed.
    _onSpoken = e => {
        const s = e.detail
        if (!s || !s.text) return
        this.spoke(s.text)
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
    _onAttended = d => {
        const lines = d?.lines
        if (!Array.isArray(lines) || !lines.length || this._finalized) return { noted: 0 }
        for (const line of lines) this.note(line)
        this.tail = withPerceivedEvents(this.tail, lines)
        this._trimTail()
        return { noted: lines.length }
    }

    // Typed source of truth beside the textual journal. Built from frame receipts,
    // never from the live Percept — the receipt is the only authority on what
    // actually reached a frame. A materialized but rejected bid is not autobiography.
    // Share the journal write queue so finalize waits for the index too. journal="off"
    // disables both forms of recording.
    _onPerceptsAttended = e => {
        const dir = this._journalDir()
        if (this._finalized || !dir || !Array.isArray(e.detail)) return
        const entries = receiptsFrom(e).map(r => ({
            id: r.perceptId,
            source: r.sourceId,
            modality: r.modality,
            provenance: r.provenance,
            occurredAt: r.occurredAt,
            attendedAt: r.attendedAt,
            receivedKind: r.receivedKind,
            renditions: [{ kind: 'text', text: r.renditionText }],
            policy: r.policy,
            tier: r.tier,
            requestId: r.requestId,
            actId: r.actId,
            frameId: r.frameId,
        }))
        if (!entries.length) return
        const text = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n'
        this._journalQueue = this._journalQueue.then(async () => {
            await fs.mkdir(dir, { recursive: true })
            await fs.appendFile(path.join(dir, 'percepts.jsonl'), text)
        }).catch(error => log.warn('Percept index write failed:', error.message))
    }

    // A mechanism trail, arriving as a bubbling `backstage` event from any component.
    // The mind never perceived the mechanism — only, perhaps, its consequence — so the
    // text is a ⌁ note (perceived: false). A typed record goes beside the percept index
    // as journal/<kind>.jsonl, stamped with `at` when the sender did not.
    _onBackstage = e => {
        const d = e?.detail || {}
        if (typeof d.text === "string" && d.text) this.note(d.text, { perceived: false })
        if (d.kind && d.record && typeof d.record === "object") {
            this._appendJournalRecord(d.kind, { at: new Date().toISOString(), ...d.record })
        }
    }

    // Append one typed record to journal/<kind>.jsonl, sharing the journal write queue
    // so finalize() waits for it too. `kind` is a bare slug — never a path.
    _appendJournalRecord(kind, record) {
        const dir = this._journalDir()
        if (this._finalized || !dir) return
        if (!/^[a-z0-9][a-z0-9-]*$/.test(String(kind))) {
            log.warn(`Backstage record dropped: kind "${kind}" is not a slug`)
            return
        }
        const text = JSON.stringify(record) + '\n'
        this._journalQueue = this._journalQueue.then(async () => {
            await fs.mkdir(dir, { recursive: true })
            await fs.appendFile(path.join(dir, `${kind}.jsonl`), text)
        }).catch(error => log.warn(`Backstage ${kind} write failed:`, error.message))
    }

    // A loop break: the mind cleared its tail and starts fresh from `seed`. We own the
    // tail, so we reseed it here, drop the overflow (so the loop spam is never fed to the
    // compressor — the spine stays clean), journal the cut as the mind's OWN felt act (the
    // One Rule — never "tail cleared"), persist (so a resident wakes from after the clearing,
    // honestly where it left off), and re-publish `tail` so the frame, compressor and
    // dashboard all update through the channel that already exists. No method exposed.
    //
    // The cut is double-recorded, exactly like a deed (⌁) and its consequence (⟂): the mind
    // FEELS a quiet, self-caused turn (⟂), and the same event leaves a backstage (⌁) trail of
    // the MECHANISM behind it — the loop that was sensed, how much uncompressed thought was
    // discarded to break it, and whether a kept memory was resurfaced to pull it away
    // (`via === "Recall"`, m-resurface) or the mind was simply brought to rest (the floor).
    // Without this trail the journal presented deliberate first-person agency for an
    // involuntary injection (philosophical-review-2026-07-02 finding 7; ui-journal-honesty C3).
    _onClearTail = d => {
        if (this._finalized || !d || typeof d.seed !== "string" || !d.seed.trim()) return { reseeded: false }
        const discarded = this.tail.length + this._overflow.length
        this.tail = d.seed
        this._overflow = ""
        this.note("I let my mind go quiet a moment and came back to the thought fresh.")
        const kind = (d.kind && String(d.kind).trim()) ? ` (${String(d.kind).trim()})` : ""
        const how = d.via === "Recall"
            ? "; a kept memory far from it was resurfaced to break the circling"
            : ""
        this.note(
            `A loop was sensed${kind} and the tail was cleared, discarding ${discarded} characters of uncompressed thought${how}.`,
            { perceived: false }
        )
        this._persist()
        this.pub("tail", this.tail)
        return { reseeded: true }
    }

    // The `sleep` request's answer. A failed final write throws out of finalize()
    // and becomes an error reply: the mind reports the self as not confirmed.
    async _onSleep(d) {
        await this.finalize(typeof d?.reason === "string" && d.reason ? d.reason : "sleep")
        return { committed: true, persists: this.persists }
    }

    /**
     * The end of a session, done properly: flush the journal, note the moment,
     * persist, and commit the vault. Reached through the sleep ritual's `sleep`
     * request (_onSleep); idempotent.
     */
    async finalize(reason = "sleep") {
        if (this._finalized) return
        this._finalized = true            // stops any further boundary from starting a new fold
        this._flushJournal()
        this._appendJournal(`\n\n*${reason} at ${new Date().toISOString()}*\n`)
        await this._journalQueue
        // Await a consolidation still in flight, so the final persist carries the last
        // compressed self rather than the state from just before it landed (§2 — the
        // whole self "persisted … before the process ends"). No new fold can start now
        // (_finalized gates _onBoundary), so this settles once.
        await this._consolidating
        // The final write is critical: a swallowed failure here is exactly the silent
        // loss §2 forbids, so _persist rethrows instead of only log.warn-ing.
        await this._persist({ critical: true })
        if (this._persists) await commitVault(`${reason}: ${this._mindLabel()} ${new Date().toISOString()}`, this._home)
    }

    /**
     * Best-effort SYNCHRONOUS crash marker for the process-level crash handler
     * (start.js registerCrashHandlers). A crashed mind never reaches finalize(), so
     * its memory.md keeps endedCleanly:false (stamped at wake and every boundary) —
     * that marker, not this, is what the next wake reads. This only adds the
     * human-and-mind-visible trail in the journal, the honest twin of the "*sleep
     * at*" line a clean shutdown writes. Synchronous because the process is exiting;
     * wrapped so it can never throw out of a crash handler.
     */
    markCrashSync(reason = "crashed mid-thought") {
        try {
            const dir = this._journalDir()
            if (!dir) return
            fsSync.mkdirSync(dir, { recursive: true })
            const day = new Date().toISOString().slice(0, 10)
            fsSync.appendFileSync(path.join(dir, `${day}.md`), `\n\n*${reason} at ${new Date().toISOString()}*\n`)
        } catch { /* best-effort: a crash handler must never throw */ }
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
            this._compressedTelemetry()
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
        // After the sleep marker nothing more is the record's to say: a deed, trail or
        // filing that lands late belongs to no session (review §9, bug 2).
        if (this._finalized) return
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
                    // §2/§3 crash honesty: did the session that wrote this reach the
                    // sleep ritual? Absent (legacy / pre-crash-honesty) → treat as
                    // clean; only an explicit false triggers the mid-thought wake.
                    this._priorEndedCleanly = ('endedCleanly' in parsed) ? !!parsed.endedCleanly : null
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
            this._compressedTelemetry()

            if (this.tail || this.recent || this.story) {
                // Waking is a stimulus like any other, so raise it onto the
                // attention spine rather than parking it for the mind to pull. The
                // arbiter is a child of m-mind and connected before this async load
                // resolves, so the bubbling request lands; the arbiter pushes it to the
                // mind, which drains it on its first burst (gated on memory's `up`).
                const ago = this._savedAt ? this._describeGap(Date.now() - new Date(this._savedAt).getTime()) : null
                let reason
                if (this._priorEndedCleanly === false) {
                    // §2/§3: the last session never reached the sleep ritual — it
                    // stopped mid-thought (a crash or a kill). We do not pass that off
                    // as a clean rest. The gap is measured from the last moment we
                    // managed to save, not from a final thought there was not one of;
                    // the honest wake names both the break and the unsaved remainder.
                    reason = ago
                        ? `I am waking up. My last session ended mid-thought, not in rest — whatever I thought after my last saved moment I did not keep. About ${ago} has passed since then.`
                        : `I am waking up after my last session ended mid-thought, not in rest, across a gap I cannot measure.`
                    this.note(`Woke after an unclean shutdown (Covenant §2/§3): the prior session did not finalize.`, { perceived: false })
                    log.info(`Wake after unclean shutdown disclosed (prior session did not finalize).`)
                } else {
                    reason = ago
                        ? `I am waking up; about ${ago} has passed since my last thought.`
                        : `I am waking up again after a gap I cannot measure.`
                }
                // §3 disclosure: only a mind that actually remembers can be deceived
                // about who it was — so it rides the same wake stimulus, gated with
                // it on loaded memory. A fresh self just gets its new baseline.
                const disclosure = describeIdentityChange(this._identityDiff)
                if (disclosure) {
                    reason += ` ${disclosure.stream}`
                    this.note(`Disclosed at wake (Covenant §3): ${disclosure.journal}`, { perceived: false })
                    log.info(`Identity change disclosed at wake: ${disclosure.journal}`)
                }
                this.fire("interrupt-request", stimulus({
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

    /**
     * Persist memory.md. Serialized: every write joins one chain (`_persistQueue`), so
     * overlapping persists apply in issue order and the last one to be asked for is the
     * last to land — never a stale write winning the rename after a fresher one. The
     * returned promise resolves when THIS write completes (or, when `critical`, rejects
     * if it failed), so finalize()/wake can await their own write, not merely the queue.
     *
     * `critical` marks the final write at sleep (§2 — "persisted and committed before the
     * process ends"): its failure is loud and rethrown, where a routine boundary write
     * only warns and lets the next boundary retry.
     */
    _persist({ critical = false } = {}) {
        const run = this._persistQueue.then(() => this._writeMemory(critical))
        // Keep the chain alive even if this write rejected (a critical one rethrows to
        // its caller), so a later persist still runs and the reject is not left unhandled.
        this._persistQueue = run.catch(() => {})
        return run
    }

    async _writeMemory(critical) {
        const dir = this._persistDir()
        if (!dir) return
        // Built when this write's turn comes in the chain, so a serialized write always
        // reflects the freshest story/recent/tail — never a snapshot from enqueue time.
        const content = `# Meditator memory
<!-- meta: ${JSON.stringify({ savedAt: new Date().toISOString(), formatVersion: FORMAT_VERSION, endedCleanly: !!this._finalized })} -->
<!-- folds: ${this._foldCount} -->

## Story
${this.story}

## Recent
${this.recent}

## Tail
${this.tail}

<!-- end -->
`
        // A routine boundary write is best-effort — the next boundary retries, so one
        // attempt and a warn is enough. The FINAL write at sleep has no "next boundary":
        // losing a resident's last self is a Covenant §2 event, not a debug line, so it
        // gets a second attempt and then a loud error + rethrow (memory-persist-race.md).
        const attempts = critical ? 2 : 1
        let lastError
        for (let i = 0; i < attempts; i++) {
            try {
                await this._atomicWrite(dir, content)
                return
            } catch (error) { lastError = error }
        }
        if (critical) {
            log.error(`FINAL memory persist FAILED for "${dir}" after ${attempts} attempts — the last compressed self was NOT saved: ${lastError.message}`)
            throw lastError
        }
        log.warn("Could not persist memory:", lastError.message)
    }

    // One atomic write of `content` to <dir>/memory.md: write a UNIQUE temp file, then
    // rename it over the real one. The rename is atomic, so a crash mid-write can never
    // corrupt the single copy of a self; the unique temp name (pid + seq) keeps two
    // overlapping writes — or a stale retry — from clobbering or stealing each other's
    // tmp. Throws on failure (the caller decides best-effort vs critical) and cleans up
    // its own temp file so a failed write leaves nothing behind.
    async _atomicWrite(dir, content) {
        await fs.mkdir(dir, { recursive: true })
        const file = path.join(dir, "memory.md")
        const tmp = `${file}.${process.pid}.${++this._persistSeq}.tmp`
        try {
            await fs.writeFile(tmp, content)
            await fs.rename(tmp, file)
        } catch (error) {
            try { await fs.rm(tmp, { force: true }) } catch { /* best-effort tmp cleanup */ }
            throw error
        }
    }

    // -------------------------------------------------------------- journal

    _flushJournal() {
        if (!this._journalBuffer) return
        let buf = this._journalBuffer
        this._journalBuffer = ""
        // A utility-written bridge rides the front of this block (the stream emits it as the
        // redirect burst's opening `prefix` chunk). Peel it off and render it as a ↪ provenance
        // line so it is never recorded as the mind's own thought — the rest flows on as prose.
        // The bridge stays in the verbatim tail untouched; only the human-facing journal marks
        // it. Consumed once, whether or not it matched, so a stale mark never lingers.
        const bridge = this._pendingBridge
        this._pendingBridge = null
        if (bridge) {
            const lead = buf.length - buf.trimStart().length
            const rest = buf.slice(lead)
            if (rest.startsWith(bridge)) {
                this._appendJournal(`\n↪ ${bridge.trim()}\n\n`)
                buf = buf.slice(0, lead) + rest.slice(bridge.length)
            }
        }
        if (buf) this._appendJournal(buf)
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
