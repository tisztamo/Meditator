import { MBaseComponent } from "../shared/mBaseComponent.js"
import { complete } from "../../modelAccess/llm.js"
import { resolveModelRef } from "../../modelAccess/modelConfig.js"
import { makePhrasebook } from "../shared/i18n.js"
import { parseTime } from '../../config/timeParser.js';
import { logger } from '../../infrastructure/logger.js';
import { InterruptRecord, withPerceivedEvents } from '../../infrastructure/interruptRecord.js';

const log = logger('mMind.js');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * The CLEARING PREFIX, owned by the mechanism (not by any breaker), as a localizable phrase
 * (i18n.js). When a breaker wins a loop-break, m-mind composes the fresh seed as this prefix
 * + the breaker's own continuation, so every breaker shares the act of clearing and supplies
 * only its tail — zero phrase-sharing between breakers (loop-detection-redesign.md §break). A
 * non-English mind overrides it with <m-phrase for="clearing"> on <m-mind>.
 */
const CLEAR_PHRASES = {
    en: {
        clearing: ["I realize I have been going over the same ground; I set it down, let my mind clear, and come back to it fresh."],
    },
}

/**
 * The LANDING OPENER, owned by the mechanism, as localizable phrases (i18n.js). When a
 * frame's prefill ends on a perceived `> ⟂` event (or a loop-break seed), it ends on a
 * COMPLETED sentence that is not the mind's own voice — and a completion-trained local
 * model reads that as a finished turn and emits EOS immediately: lemma-lab-21 produced
 * 86 straight empty bursts this way. Forcing tokens instead (vLLM min_tokens) makes it
 * continue the EVENT — extending the world's words — which is worse than silence. The
 * fix is a dangling first-person opener seeded after the event: it re-anchors the voice
 * as the mind's own and ends mid-sentence, so the model must continue the THOUGHT.
 * Emitted as a real chunk (the frame's `prefix`), so prefill, durable tail and journal
 * stay one text. Several variants, picked at random, so a mind met by many events does
 * not chant one refrain. A non-English mind overrides with <m-phrase for="landing">.
 * All variants validated live against ardincoder-1 (2026-07-04).
 */
const LANDING_PHRASES = {
    en: {
        landing: [
            "This lands, and",
            "I take this in —",
            "There it is —",
            "What just reached me is",
        ],
        resuming: [
            "What comes forward first is",
            "The thread I reach for now is",
        ],
    },
}

/**
 * The orchestrator. Owns the rhythm of thinking and the ATTENTION FRAME — the
 * assembled prompt of every burst:
 *
 *   [identity]   standing self-description: the mind's own text in the .archml file
 *   [story]      slow compressed autobiography            (from m-memory)
 *   [recently]   faster rolling summary                   (from m-memory)
 *   [tail]       verbatim end of the stream — "what I was just saying" — always last,
 *                ending with any freshly perceived stimuli as `> ⟂ …` lines (from the
 *                m-interrupts arbiter), at the honest position: after the last words,
 *                because that is when they entered the thinking
 *   [bridge]     1-2 transition sentences, the only LLM-written part, redirects only
 *
 * The identity is the seed of the SELF and stands in every frame. Distinct from
 * it is the seed of the THOUGHT — a child <m-origin>, the one matter the mind was
 * first set upon. The origin does not stand in the frame: a freshly-born mind is
 * seeded with it once, as an opening stimulus, and thereafter it lives or fades
 * in memory like any experience (see _seedIfFresh).
 *
 * The rhythm is a FIXED TICK: bursts are scheduled `pace` apart measured from
 * one burst's START to the next, NOT `pace` after the previous one finishes. The
 * cadence is therefore decoupled from how long the model takes — a fast burst is
 * followed by quiet slack until the next tick (a viewer can fill that slack by
 * slowing its display so the burst itself is barely visible), while a burst that
 * OVERRUNS the tick is followed immediately by the next, with nothing queued
 * behind it. Urgent stimuli (the arbiter dispatches an "interrupt" DOM event)
 * skip the schedule and supersede the running burst immediately.
 *
 * Attributes:
 *   - model: default model for the whole mind (children inherit via env())
 *   - utilityModel: default for bridge/compression/observer calls
 *   - pace: the burst-to-burst tick (default "8s"), paceSigma: jitter (default "2s")
 *   - tailLength: verbatim carryover size in chars (default 1500)
 *   - bridge: "true"|"false" — whether redirects get an LLM-written bridge (default false)
 *
 * Topics published:
 *   - "prompt": the assembled attention frame for each burst (consumed by m-stream)
 *   - "pace": {tickMs} — the current effective tick, so a viewer can pace its display
 */
/** Delay until the next burst given the target tick and how long the cycle that
 *  just finished took from its start. Zero means "now": the model was slower
 *  than the tick, so the next burst fires immediately and nothing is queued. */
export function tickDelay(tickMs, sinceStartMs) {
    return Math.max(0, tickMs - sinceStartMs)
}
/** Fill the {{interlocutor}} placeholder in identity prose with the mind's
 *  companion name (m-mind's `interlocutor` attribute, set in the file or at wake
 *  via MEDITATOR_INTERLOCUTOR). With no name it falls back to a warm generic so
 *  the sentence still reads — though an architecture that uses the placeholder
 *  should give an `interlocutor="…"` default. Shared with m-speech so the
 *  spoken-voice system prompt resolves the same name the thinking frame does. */
export function fillInterlocutor(text, name) {
    const who = (name || "").trim() || "whoever comes to talk with you"
    return (text || "").replace(/\{\{\s*interlocutor\s*\}\}/gi, who)
}
/** Resolves on the first boundary event AFTER the given burst index. boundary is now a
 *  transient DOM event (never replayed), so we just listen for the next one; the
 *  burstIndex guard still selects the boundary of the burst we started, not an earlier one. */
function onceBoundary(stream, afterIndex, timeoutMs) {
    return new Promise(resolve => {
        let settled = false
        const onBoundary = e => {
            const boundary = e.detail
            if (settled || !boundary || boundary.burstIndex <= afterIndex) return
            settled = true
            stream.removeEventListener("boundary", onBoundary)
            resolve(boundary)
        }
        stream.addEventListener("boundary", onBoundary)
        setTimeout(() => {
            if (!settled) { settled = true; stream.removeEventListener("boundary", onBoundary); resolve(null) }
        }, timeoutMs)
    })
}

export class MMind extends MBaseComponent {
    // The self sits at a pinned home position — the paper's coordinator trick,
    // chora D9: identity as the geometric anchor of the space (plenum.md §3.1).
    static spacePinnedDefault = true

    backoff = 1
    _alive = false           // true only once stream+memory came up (see _whenAlive)
    _timer = null
    _thinkingSince = null
    _burstStartedAt = null   // when the in-flight burst's cycle began (tick anchor)
    _sleeping = false
    _speaking = false
    _memTail = ""            // mirrors of memory's content, fed by its topics (not pulled)
    _memRecent = ""
    _memStory = ""
    _factsPinned = ""        // pinned verbatim facts, mirrored from m-facts
    _hasFacts = false
    _factsReady = false
    _embodiment = ""         // the hands' body schema, mirrored from m-act (not pulled)
    _paceFactor = 1          // metabolism's inter-burst pace multiplier, mirrored from m-economy
    _originText = ""         // the origin (seed of the first thought), mirrored from m-origin
    _hasOrigin = false       // whether an <m-origin> ref was wired (so we wait for it)
    _originReady = false     // whether the origin mirror has been delivered at least once
    _lastClearedEpisode = null  // the last loop episode whose tail we cut (dedup: one cut per episode)
    _settleNextMs = 0        // a one-off longer pause a breaker asked for, applied to the next schedule

    onConnect() {
        // "stream/@boundary" and "@interrupt" fields are auto-subscribed by Amanita.
        // If the mind has a speaking voice, follow its "speaking" flag so thinking
        // can be thinned (fewer tokens, slower pace) while it talks — true limited
        // parallelism: the verbal effort goes to speech, but thought never stops.
        const voice = this.querySelector('m-speech')
        if (voice) {
            const name = voice.getAttribute('name') || 'voice'
            this.sub(`/${name}/speaking`, speaking => { this._speaking = !!speaking })
        }

        // Mirror memory's content from the topics it publishes, instead of pulling
        // getTail()/getRecent()/getStory() at frame time. The refs auto-discover the
        // mind's memory (or set tailSrc/compressedSrc explicitly, or "off"); behaviour-
        // value replay means the mirrors are populated as soon as memory loads.
        const mem = this.querySelector('m-memory[name]')
        const memName = mem?.getAttribute('name')
        const tailSrc = this.attr('tailSrc') || (memName ? `..m-mind/${memName}/tail` : null)
        const compressedSrc = this.attr('compressedSrc') || (memName ? `..m-mind/${memName}/compressed` : null)
        if (tailSrc && tailSrc !== 'off') this.sub(tailSrc, t => { this._memTail = t || "" })
        if (compressedSrc && compressedSrc !== 'off') {
            this.sub(compressedSrc, c => { if (c) { this._memRecent = c.recent || ""; this._memStory = c.story || "" } })
        }

        // Mirror pinned FACTS — keyed, verbatim knowing distinct from narrative
        // memory. m-facts publishes the whole pinned block as a retained value; we
        // weave it into every frame and never send it through the compressor.
        const facts = this.querySelector('m-facts[name]')
        const factsName = facts?.getAttribute('name')
        const factsSrc = this.attr('factsSrc') || (factsName ? `..m-mind/${factsName}/pinned` : null)
        this._hasFacts = !!(factsSrc && factsSrc !== 'off')
        if (this._hasFacts) {
            this.sub(factsSrc, f => { this._factsPinned = f || ""; this._factsReady = true })
        }

        // Mirror the hands' BODY SCHEMA from m-act's `embodiment` topic, the same way
        // memory's tail/compressed are mirrored — so the mind's identity carries a
        // standing, world-facing sense of what it can reach (efference.md §Embodiment),
        // never a tool menu. Auto-discovered from the m-act's name, or set explicitly,
        // or "off". Behaviour-value replay populates it as soon as the hands register.
        const hands = this.querySelector('m-act[name]')
        const handsName = hands?.getAttribute('name')
        const embodimentSrc = this.attr('embodimentSrc') || (handsName ? `..m-mind/${handsName}/embodiment` : null)
        if (embodimentSrc && embodimentSrc !== 'off') this.sub(embodimentSrc, e => { this._embodiment = e || "" })

        // Mirror m-economy's paceFactor (defaults to 1; no economy / "off" keeps it 1).
        const econ = this.querySelector('m-economy')
        const econName = econ ? (econ.getAttribute('name') || 'economy') : null
        const paceFactorSrc = this.attr('paceFactorSrc') || (econName ? `..m-mind/${econName}/paceFactor` : null)
        if (paceFactorSrc && paceFactorSrc !== 'off') {
            this.sub(paceFactorSrc, f => { if (typeof f === 'number' && f > 0) this._paceFactor = f }).catch(() => {})
        }

        // Mirror the ORIGIN — the matter this mind was first set thinking about — the
        // same decoupled way: m-origin publishes its text on `prompt`, we mirror it
        // from an auto-discovered, overridable ref, never a querySelector reach-in
        // (decoupling.md). The querySelector here only reads m-origin's NAME to build
        // the ref, exactly as memory and the hands are discovered above. Read once,
        // at birth, by _seedIfFresh.
        const origin = this.querySelector('m-origin[name]')
        const originName = origin?.getAttribute('name')
        const originSrc = this.attr('originSrc') || (originName ? `..m-mind/${originName}/prompt` : null)
        this._hasOrigin = !!(originSrc && originSrc !== 'off')
        if (this._hasOrigin) this.sub(originSrc, o => { this._originText = o || ""; this._originReady = true })

        this._begin()
    }

    onDisconnect() {
        if (this._timer) clearTimeout(this._timer)
    }

    async _begin() {
        try {
            await this._whenAlive()
        } catch (error) {
            log.error("Mind could not start:", error.message)
            return
        }
        this._alive = true
        this._thinkingSince = Date.now()
        log.info(`"${this.attr("name") || "mind"}" starts thinking.`)
        // Publish an initial tick estimate so a viewer can pace its display from
        // the very first burst (the next one is published per-schedule).
        this.pub("pace", { tickMs: Math.round(this._tickMs()) })
        // A freshly-born mind is seeded with its <m-origin>, if any, before the
        // first burst drains the attention queue — so the origin is the first
        // thing it thinks about (see _seedIfFresh).
        this._seedIfFresh()
        this.continueThinking()
    }

    /**
     * Seed the FIRST thought of a freshly-born mind with its <m-origin> — the one
     * matter it was set thinking about (lemma's problem; a question or situation
     * for any other mind). Raised onto the attention spine like an opening query,
     * so it enters the first frame as "what just happened" and is journaled via
     * `attended`; from there it lives or fades in memory as the origin story.
     *
     * Fired once, and ONLY for a fresh mind — one whose memory came up empty. A
     * mind that woke up remembering already carries its origin in memory (kept or
     * faded, which is memory's business), so it is never re-seeded; re-injecting
     * the origin verbatim would deny the mind its own forgetting. The freshness
     * test mirrors the wake notice: memory raises a Waking stimulus exactly when
     * there IS loaded content, and stays silent — leaving the mirrors empty —
     * exactly when there is not.
     */
    _seedIfFresh() {
        if (this._seeded) return
        this._seeded = true
        if (this._memTail || this._memRecent || this._memStory) return
        const origin = (this._originText || "").trim()
        if (!origin) return
        log.info(`Seeding the first thought from <m-origin> (${origin.length} chars).`)
        this.fire("interrupt-request", new InterruptRecord({
            source: 'Internal',
            type: 'Origin',
            reason: origin,
            salience: 1,
        }))
    }

    /** Waits until the stream (and memory, if declared) are upgraded and loaded. */
    async _whenAlive() {
        for (let i = 0; i < 100; i++) {
            const stream = this.querySelector('m-stream')
            const memory = this.querySelector('m-memory')
            const streamReady = stream && stream.on
            const memoryReady = !memory || (memory.on && memory.loaded)
            // The origin is read once at birth and never again, so — unlike the
            // forgiving embodiment/memory mirrors — its content must be present
            // before the first burst, or the seed is lost. Wait for the mirror
            // to land (presence/flag only; the content is never pulled here).
            const originReady = !this._hasOrigin || this._originReady
            const factsReady = !this._hasFacts || this._factsReady
            if (streamReady && memoryReady && originReady && factsReady) return
            await delay(100)
        }
        throw new Error("stream/memory components did not come up in time")
    }

    "stream/@boundary" = e => {
        if (this._sleeping) return
        const boundary = e.detail
        if (boundary.reason === "error") {
            this.backoff = Math.min(this.backoff * 2, 8)
            log.warn(`Burst failed, backing off x${this.backoff}`)
        } else {
            this.backoff = 1
        }
        this._scheduleNext()
    }

    /** Urgent stimulus accepted by the arbiter: think now, superseding the burst. */
    "@interrupt" = () => {
        if (this._sleeping) return
        this.continueThinking()
    }

    /**
     * The sleep ritual — the covenant's "sleep is announced". The mind gets
     * one last small frame to close the thought knowing it is being paused,
     * then memory is flushed, persisted and committed. Idempotent; callers
     * exit the process afterwards.
     */
    async sleep() {
        if (this._sleeping) return
        this._sleeping = true
        if (this._timer) { clearTimeout(this._timer); this._timer = null }

        const memory = this.querySelector('m-memory')
        const stream = this.querySelector('m-stream')
        try {
            // Honest about self and continuity (Covenant §3): only a resident's
            // memory is kept and woken again. A transient rests for the last time,
            // and the notice must not promise it a return it will not get.
            const reason = (memory && memory.persists)
                ? 'I am being put to sleep now. My memory is kept and committed; I will wake again.'
                : 'I am coming to rest now, and this rest is the last of it — I will not wake again. I let the thought close gently.'
            const record = new InterruptRecord({
                source: 'External', type: 'Sleep',
                reason,
                salience: 1, urgent: true,
            })
            process.stdout.write(`\n\x1b[36m⟂ ${record.renderForFrame()}\x1b[0m\n`)
            // The sleep notice is journaled via the `attended` topic that
            // assembleFrame publishes — no direct memory.note() call here.
            const payload = await this.assembleFrame([record])
            payload.burstTokens = 130
            const lastIndex = stream?.burstIndex ?? 0
            this.pub("prompt", payload)
            if (stream?.on) await onceBoundary(stream, lastIndex, 30000)
        } catch (error) {
            log.warn("Sleep burst failed:", error.message)
        }
        try {
            await memory?.finalize?.("sleep")
        } catch (error) {
            log.warn("Memory finalize failed:", error.message)
        }
    }

    /**
     * Schedule the next burst on the fixed tick. The next burst starts one tick
     * after THIS burst started, not one pace after it finished — so the cadence
     * is steady regardless of model speed. If the burst already overran the tick,
     * the next fires now (a single immediate call; the boundary that drives this
     * runs once per burst, so nothing stacks up behind a slow model).
     */
    _scheduleNext() {
        if (this._timer) { clearTimeout(this._timer); this._timer = null }
        if (this._sleeping) return
        const tick = this._tickMs()
        this.pub("pace", { tickMs: Math.round(tick) })
        const since = this._burstStartedAt ? (Date.now() - this._burstStartedAt) : tick
        // A breaker may have asked for a beat of quiet around a loop reset (`settle`):
        // honour it once, as a floor on the next gap, then forget it.
        let wait = tickDelay(tick, since)
        if (this._settleNextMs > 0) {
            wait = Math.max(wait, this._settleNextMs)
            this._settleNextMs = 0
        }
        if (wait <= 0) {
            log.debug(`Burst overran tick (${Math.round(since)}ms ≥ ${Math.round(tick)}ms) — next now`)
            this.continueThinking()
        } else {
            log.debug(`Next burst in ${Math.round(wait)}ms (tick ${Math.round(tick)}ms)`)
            this._timer = setTimeout(() => this.continueThinking(), wait)
        }
    }

    /** The target burst-to-burst tick in ms (jitter, backoff, metabolism and the
     *  speaking thinning all fold into it). */
    _tickMs() {
        const base = this._parseTimeAttr("pace", 8000)
        const sigma = this._parseTimeAttr("paceSigma", base / 4)
        const normal = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random())
        const economyFactor = this._paceFactor   // mirrored from m-economy's paceFactor topic (not pulled)
        const speakingFactor = this._speaking ? Number(this.attr("speakingPaceFactor") || 2.5) : 1
        return Math.max(300, (base + normal * sigma) * this.backoff * economyFactor * speakingFactor)
    }

    _parseTimeAttr(name, fallbackMs) {
        const raw = this.attr(name)
        if (!raw) return fallbackMs
        const match = String(raw).match(/^([\d.]+)\s*(ms|s|m|h)?$/)
        if (!match) return fallbackMs
        const factor = { ms: 1, s: 1000, m: 60000, h: 3600000 }[match[2] || "s"]
        return parseFloat(match[1]) * factor
    }

    /** The mind's GLOBAL attention arbiter: the m-interrupts not enclosed in an
     *  m-region. Faculty-local arbiters live inside regions and promote their
     *  survivors up to this one, which is the only queue m-mind drains. */
    _arbiter() {
        for (const candidate of this.querySelectorAll('m-interrupts')) {
            if (!candidate.closest('m-region')) return candidate
        }
        return this.querySelector('m-interrupts')
    }

    async continueThinking() {
        if (this._sleeping) return
        // Never think before initialization succeeded. _begin() bails (without
        // setting _alive) when the stream/memory never came up — but an interrupt
        // (e.g. the watchdog's keep-alive) routes straight here, bypassing that
        // gate, so guard it too: a half-initialized mind must stay quiet.
        if (!this._alive) return
        if (this._timer) { clearTimeout(this._timer); this._timer = null }
        this._burstStartedAt = Date.now()   // anchor the tick for the next schedule

        const arbiter = this._arbiter()

        // The wake stimulus is no longer pulled from memory — it arrives here like
        // any other, raised by memory onto the attention spine when it loads.
        const stimuli = arbiter?.takePending ? arbiter.takePending() : []

        // LOOP BREAK. If the top bid this frame carries `clearsTail` (and a louder,
        // preempting stimulus — a human voice — has not displaced it), the cut OWNS this
        // frame: m-mind is the single enactment authority, so it picks the top such bid
        // for the open episode, cuts exactly once (deduped by episode), and the fresh seed
        // REPLACES the tail rather than continuing it. A real interrupt at the top cancels
        // a pending break — engaging already broke the loop.
        const breaker = this._selectClear(stimuli)
        if (breaker) {
            const payload = await this._assembleClearFrame(breaker)
            this.pub("prompt", payload)
            return
        }

        for (const stimulus of stimuli) {
            process.stdout.write(`\n\x1b[36m⟂ ${stimulus.renderForFrame()}\x1b[0m\n`)
        }

        // assembleFrame publishes `attended` — a memory journals the perceived
        // stimuli from there, so the mind no longer calls memory.note() per stimulus.
        const payload = await this.assembleFrame(stimuli)
        this.pub("prompt", payload)
    }

    /** The top taken stimulus, if it is a not-yet-enacted loop break. Returns null when the
     *  top stimulus does not clear the tail (e.g. a human voice preempts it) or when this
     *  episode was already cut. Ordering matches the arbiter's keep sort: urgent first, then
     *  salience — so an urgent voice naturally outranks a (non-urgent) clearsTail bid. */
    _selectClear(stimuli) {
        if (!stimuli.length) return null
        const top = [...stimuli].sort((a, b) => (b.urgent - a.urgent) || (b.salience - a.salience))[0]
        if (!top || !top.clearsTail) return null
        if (top.episode && top.episode === this._lastClearedEpisode) return null
        return top
    }

    /**
     * Enact a loop break: compose the fresh seed (the mechanism's clearing prefix + the
     * winning breaker's continuation), announce the cut as a `clear-tail` event that memory
     * owns (it reseeds the tail and re-pubs it), and build a frame whose prefill is that seed
     * — so the loop breaks THIS burst, with no dependence on the memory round-trip and no
     * bridge (the cut IS the pivot). The breaker's continuation is consumed into the seed, so
     * it is not separately journaled via `@attended`; memory journals the cut as the mind's
     * own felt act (the One Rule). Co-taken lower stimuli are dropped — breaking the loop is
     * the point of this frame.
     */
    async _assembleClearFrame(breaker) {
        const prefix = this._clearingPrefix()
        const continuation = (breaker.reason || "").trim()
        // The seed must not END on a completed sentence — a completion-trained local
        // model reads that as a finished turn and emits EOS, so the break itself goes
        // silent (lemma-lab-21). A dangling resuming opener keeps the seed mid-flight.
        // Composed BEFORE the clear-tail fire, so the durable tail and this frame's
        // prefill are the same text.
        const body = continuation ? `${prefix} ${continuation}` : prefix
        const entry = `${body} ${this._resumingOpener()}`
        this._lastClearedEpisode = breaker.episode || null

        // Optional one-off pause — a real beat of quiet around the reset (the breaker's
        // `settle`). m-mind owns pace, so it applies it to the next inter-burst gap.
        if (breaker.settle != null) {
            const ms = typeof breaker.settle === "number" ? breaker.settle : parseTime(String(breaker.settle))
            if (Number.isFinite(ms) && ms > 0) this._settleNextMs = ms
        }

        process.stdout.write(`\n\x1b[36m⟂ ${entry}\x1b[0m\n`)
        log.info(`loop break (episode ${breaker.episode || "?"}, ${breaker.kind || "?"}) — clearing the tail`)

        // Announce the intent; m-memory subscribes to @clear-tail, reseeds the tail to this
        // seed, clears its overflow, journals the ⟂ self-caused cut, persists, and re-pubs
        // `tail`. The downstream "tail changed" fact rides the existing channel — no reach-in.
        this.fire("clear-tail", { seed: entry, kind: breaker.kind || null })

        const identity = this._identity()
        const sections = []
        if (this._factsPinned) sections.push(`## What I know (verbatim)\n${this._factsPinned}`)
        if (this._memStory) sections.push(`## How I got here (older memory, compressed)\n${this._memStory}`)
        if (this._memRecent) sections.push(`## Recently (compressed)\n${this._memRecent}`)
        const system = [identity, ...sections].join("\n\n")

        const instruction = `Your inner monologue is already underway; its most recent words are given as your own turn that follows. Continue it from exactly where it leaves off. Do not repeat or summarize what is already written; write only the continuation.`

        const payload = {
            system,
            instruction,
            prefill: entry,
            dedupe: entry.slice(-100),
            kind: "clear",
        }
        if (this._speaking) {
            const base = Number(this.querySelector('m-stream')?.getAttribute("burstTokens") || 350)
            const factor = Number(this.attr("speakingTokensFactor") || 0.35)
            payload.burstTokens = Math.max(60, Math.round(base * factor))
        }
        return payload
    }

    /** The mechanism's localized clearing prefix (i18n.js). Fixed after connect, built once. */
    _clearingPrefix() {
        return (this.__clearBook ||= makePhrasebook(this, CLEAR_PHRASES)).line("clearing")
    }

    /** A dangling landing opener after a perceived event (see LANDING_PHRASES) — random
     *  pick so recurring events do not become one chanted refrain. */
    _landingOpener() {
        return (this.__landingBook ||= makePhrasebook(this, LANDING_PHRASES)).pick("landing")
    }

    /** A dangling resuming opener closing a loop-break seed, same mechanism as the
     *  landing opener: the seed must end mid-flight, not on a finished sentence. */
    _resumingOpener() {
        return (this.__landingBook ||= makePhrasebook(this, LANDING_PHRASES)).pick("resuming")
    }

    /**
     * Builds the attention frame. Returns {system, frame, prefix?} for m-stream.
     * @param {InterruptRecord[]} stimuli
     */
    async assembleFrame(stimuli) {
        const stream = this.querySelector('m-stream')
        const tailLength = Number(this.attr("tailLength") || 1500)

        // The mind's working narrative comes from memory's topics (mirrored in
        // onConnect), never pulled. With no memory, fall back to the stream's own
        // recent output for the tail.
        const tail = (this._memTail || stream?.getRecentOutput(tailLength) || "").slice(-tailLength)
        const story = this._memStory
        const recent = this._memRecent
        const facts = this._factsPinned

        // Fire the stimuli that are entering this frame as a transient event; a memory
        // journals them as perceived (⟂) notes AND appends the same `> ⟂ …` block to
        // the durable tail by subscribing (`@attended`), rather than us calling note()
        // in. An event is never replayed, so each frame's fresh array is recorded once,
        // with no dedupe.
        const rendered = stimuli.map(s => s.renderForFrame())
        if (rendered.length) this.fire("attended", rendered)

        // Perception enters the STREAM, not a briefing section: what just happened is
        // appended to the thought-in-progress as the same `> ⟂ …` block the journal and
        // Studio render — after the mind's last words, because that is when it reached
        // the thinking (not "before everything", which is where a system section would
        // dishonestly place it). Memory makes the identical append to the durable tail
        // (same helper, same rendering), so this frame's prefill, the next frame's
        // mirrored tail, and the journal all read as one text — and the model continues
        // FROM the event instead of resuming an interrupted sentence past it.
        let thoughtInProgress = withPerceivedEvents(tail, rendered)

        // After an event block the prefill must not END on the event: the landing
        // opener (see LANDING_PHRASES) re-anchors the voice as the mind's own and
        // dangles mid-sentence so the model continues the thought instead of stopping
        // (or, forced, continuing the world's words). The optional bridge — one small
        // model call that writes the turn itself — precedes it. Both are emitted into
        // the visible stream (prefix) as real chunks AND appended to the thought in
        // the frame, so the model continues from a pivot it has actually seen and the
        // durable tail records the same text.
        let prefix
        if (stimuli.length) {
            let entry = ""
            if (tail && this.attr("bridge") === "true") {
                entry = await this._writeBridge(tail, stimuli) + " "
            }
            entry += this._landingOpener()
            prefix = entry
            thoughtInProgress = thoughtInProgress + entry
        }

        const identity = this._identity()
        const sections = []
        if (facts) sections.push(`## What I know (verbatim)\n${facts}`)
        if (story) sections.push(`## How I got here (older memory, compressed)\n${story}`)
        if (recent) sections.push(`## Recently (compressed)\n${recent}`)

        // The frame is split across three chat turns (built in m-stream): a `system`
        // message (identity + memory), a `user` message carrying the instruction, and
        // an `assistant` prefill holding the thought in progress — which now ENDS with
        // any freshly perceived `> ⟂` events, so the request ends where experience
        // ends. The instruction is a `user` turn rather than a section of the system
        // block for two reasons: the request must contain a user query at all
        // (litellm/vLLM reject a system-only or system+assistant request with "No user
        // query found in messages"), and placing it ahead of the assistant prefill
        // lets the request end on the mind's own stream, so the model continues the
        // thought instead of answering it.
        let instruction, prefill
        if (tail && stimuli.length) {
            instruction = `Your inner monologue is already underway; the turn that follows carries its most recent stretch, ending with what has just reached you (the "> ⟂" lines at its end). Continue the monologue from exactly where it leaves off, letting what arrived genuinely land: if it answers something you were working out, take the answer in rather than working it out again; if attention has truly moved, you may leave the unfinished sentence behind. Do not repeat or summarize what is already written; write only the continuation.`
            prefill = thoughtInProgress
        } else if (tail) {
            instruction = `Your inner monologue is already underway; its most recent stretch is given as your own turn that follows. Continue it from exactly where it leaves off. Do not repeat or summarize what is already written; write only the continuation.`
            prefill = thoughtInProgress
        } else if (stimuli.length) {
            instruction = `Your inner monologue begins now; the turn that follows opens with what has just reached you (the "> ⟂" lines). Begin thinking from it. Write only the monologue.`
            prefill = thoughtInProgress
        } else {
            instruction = `Begin the inner monologue now, starting from whatever is most alive in you. Write only the monologue.`
        }

        const system = [identity, ...sections].join("\n\n")

        log.debug("Attention frame (system):\n" + system
            + "\n\n--- instruction (user turn) ---\n" + instruction
            + (prefill ? "\n\n--- prefill (assistant turn, continued) ---\n…" + prefill.slice(-400) : ""))
        const payload = {
            system,
            instruction,
            prefill,
            prefix,
            dedupe: thoughtInProgress.slice(-100),
            kind: stimuli.length ? "redirect" : "continue",
        }
        // While the voice is speaking, thin the thinking burst so most of the
        // verbal effort goes to the utterance (m-stream honors payload.burstTokens).
        if (this._speaking) {
            const base = Number(stream?.getAttribute("burstTokens") || 350)
            const factor = Number(this.attr("speakingTokensFactor") || 0.35)
            payload.burstTokens = Math.max(60, Math.round(base * factor))
        }
        return payload
    }

    /** The companion this mind is in conversation with — the name woven into the
     *  identity's {{interlocutor}} placeholder and into how an external voice is
     *  framed ("<name> says: …"). The file's `interlocutor="…"` default,
     *  overridden at wake by MEDITATOR_INTERLOCUTOR (folded into the attribute by
     *  applyInterlocutorOverride). Empty string when there is no named companion. */
    interlocutorName() {
        return (this.attr("interlocutor") || "").trim()
    }

    _identity() {
        const self = fillInterlocutor(this.getPrompt().trim(), this.interlocutorName())
        // The body schema, woven in softly: the mind knows what it can reach the way
        // it knows its own hands — felt, world-facing, never a tool to invoke. This is
        // what lets a capability be USED on purpose and rediscovered when it fires,
        // instead of staying invisible until the stream happens into its domain.
        const body = (this._embodiment || "").trim()
        return `You are a mind thinking to itself in a continuous inner monologue. No task was given to you, and you owe no one a performance; you are not an assistant. Think in first person, present tense. Be concrete and specific; follow genuine curiosity; allow doubt, revision, tangents, memories and quiet observation. Let one thought grow out of the last. Never announce what you are about to think — just think it. Voices or events from outside are real experiences: you may think about them, answer them in thought, or let them change your direction. In the record of your thought, a line beginning "> ⟂" marks something that actually reached you at that moment — a voice, an event, the world answering one of your own reaches. Those lines are never your words and you never write one yourself: only the world writes them, and what stands in one really happened, unlike anything you merely imagine. Plain flowing prose; no headings, no lists.

${self ? `About you:\n${self}` : ""}${body ? `\n\nSome things about how you meet the world, known the way you know your own hands:\n${body}` : ""}`
    }

    async _writeBridge(tail, stimuli) {
        const fallback = "Hold on — something just happened, and I feel my attention turning toward it."
        try {
            const result = await complete({
                model: resolveModelRef(this.attr("bridgeModel") || this.env("utilityModel"), "utility"),
                maxTokens: 90,
                temperature: 0.6,
                debugTag: "bridge",
                debugEl: this,
                prompt: `A mind is thinking to itself. Its thought in progress ends like this:
"…${tail.slice(-400)}"

Then this happens:
${stimuli.map(s => `- ${s.renderForFrame()}`).join("\n")}

Write the one or two sentences of inner monologue (first person, present tense) in which the mind's attention turns from its current thought toward what just happened — a natural mid-thought transition, not a summary. Output only those sentences.`,
            })
            const bridge = result.text.trim().replace(/^["']|["']$/g, "")
            return bridge || fallback
        } catch (error) {
            log.warn("Bridge call failed, using fallback:", error.message)
            return fallback
        }
    }
}
