import { MBaseComponent } from "./mBaseComponent.js"
import { complete } from "../modelAccess/llm.js"
import { resolveModelRef } from "../modelAccess/modelConfig.js"
import { logger } from '../infrastructure/logger.js';
import { InterruptRecord } from '../infrastructure/interruptRecord.js';

const log = logger('mMind.js');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * The orchestrator. Owns the rhythm of thinking and the ATTENTION FRAME — the
 * assembled prompt of every burst:
 *
 *   [identity]   standing self-description: the mind's own text in the .archml file
 *   [story]      slow compressed autobiography            (from m-memory)
 *   [recently]   faster rolling summary                   (from m-memory)
 *   [stimulus]   what just happened, if anything          (from the m-interrupts arbiter)
 *   [bridge]     1-2 transition sentences, the only LLM-written part, redirects only
 *   [tail]       verbatim end of the stream — "what I was just saying" — always last
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
 *   - bridge: "true"|"false" — whether redirects get an LLM-written bridge (default true)
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
/** Resolves on the first boundary AFTER the given burst index (the property
 *  subscription replays the previous boundary, which must be ignored). */
function onceBoundary(stream, afterIndex, timeoutMs) {
    return new Promise(resolve => {
        let settled = false
        const attention = stream.on("boundary", boundary => {
            if (settled || !boundary || boundary.burstIndex <= afterIndex) return
            settled = true
            stream.off(attention)
            resolve(boundary)
        })
        setTimeout(() => {
            if (!settled) { settled = true; stream.off(attention); resolve(null) }
        }, timeoutMs)
    })
}

export class MMind extends MBaseComponent {
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
    _embodiment = ""         // the hands' body schema, mirrored from m-act (not pulled)

    onConnect() {
        // "stream/boundary" and "@interrupt" fields are auto-subscribed by Amanita.
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
        if (tailSrc && tailSrc !== 'off') this.sub(tailSrc, t => { this._memTail = t || "" }, 12)
        if (compressedSrc && compressedSrc !== 'off') {
            this.sub(compressedSrc, c => { if (c) { this._memRecent = c.recent || ""; this._memStory = c.story || "" } }, 12)
        }

        // Mirror the hands' BODY SCHEMA from m-act's `embodiment` topic, the same way
        // memory's tail/compressed are mirrored — so the mind's identity carries a
        // standing, world-facing sense of what it can reach (efference.md §Embodiment),
        // never a tool menu. Auto-discovered from the m-act's name, or set explicitly,
        // or "off". Behaviour-value replay populates it as soon as the hands register.
        const hands = this.querySelector('m-act[name]')
        const handsName = hands?.getAttribute('name')
        const embodimentSrc = this.attr('embodimentSrc') || (handsName ? `..m-mind/${handsName}/embodiment` : null)
        if (embodimentSrc && embodimentSrc !== 'off') this.sub(embodimentSrc, e => { this._embodiment = e || "" }, 12)

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
        this.continueThinking()
    }

    /** Waits until the stream (and memory, if declared) are upgraded and loaded. */
    async _whenAlive() {
        for (let i = 0; i < 100; i++) {
            const stream = this.querySelector('m-stream')
            const memory = this.querySelector('m-memory')
            const streamReady = stream && stream.on
            const memoryReady = !memory || (memory.on && memory.loaded)
            if (streamReady && memoryReady) return
            await delay(100)
        }
        throw new Error("stream/memory components did not come up in time")
    }

    "stream/boundary" = boundary => {
        if (this._sleeping) return
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
        const wait = tickDelay(tick, since)
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
        const economy = this.querySelector('m-economy')
        const economyFactor = economy?.paceFactor ? economy.paceFactor() : 1
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

        for (const stimulus of stimuli) {
            process.stdout.write(`\n\x1b[36m⟂ ${stimulus.renderForFrame()}\x1b[0m\n`)
        }

        // assembleFrame publishes `attended` — a memory journals the perceived
        // stimuli from there, so the mind no longer calls memory.note() per stimulus.
        const payload = await this.assembleFrame(stimuli)
        this.pub("prompt", payload)
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

        // Publish the stimuli that are entering this frame; a memory journals them
        // as perceived (⟂) notes by subscribing, rather than us calling note() in.
        if (stimuli.length) this.pub("attended", stimuli.map(s => s.renderForFrame()))

        // The bridge: one small model call that writes the turn itself. It is
        // both emitted into the visible stream (prefix) and appended to the
        // tail in the frame, so the voice model continues from a pivot it has
        // actually seen.
        let prefix
        let thoughtInProgress = tail
        if (stimuli.length && tail && this.attr("bridge") !== "false") {
            const bridge = await this._writeBridge(tail, stimuli)
            prefix = "\n" + bridge + " "
            thoughtInProgress = tail + "\n" + bridge + " "
        }

        const identity = this._identity()
        const sections = []
        if (story) sections.push(`## How I got here (older memory, compressed)\n${story}`)
        if (recent) sections.push(`## Recently (compressed)\n${recent}`)
        if (stimuli.length) {
            sections.push(`## This just happened\n${stimuli.map(s => `- ${s.renderForFrame()}`).join("\n")}`)
        }

        // The frame is split across three chat turns (built in m-stream): a `system`
        // message (identity + memory + what just happened), a `user` message carrying
        // the instruction, and — when a thought is already underway — an `assistant`
        // prefill holding that thought, which the model is asked to continue. The
        // instruction is a `user` turn rather than a section of the system block for
        // two reasons: the request must contain a user query at all (litellm/vLLM
        // reject a system-only or system+assistant request with "No user query found
        // in messages"), and placing it ahead of the assistant prefill lets the
        // request end on the mind's own last token, so the model continues the thought
        // instead of answering it.
        let instruction, prefill
        if (thoughtInProgress) {
            instruction = stimuli.length
                ? `Your inner monologue is already underway; its most recent words are given as your own turn that follows. Continue it from exactly where it leaves off, letting what just happened genuinely enter and redirect the thought. If attention has truly moved, you may leave the unfinished sentence behind. Do not repeat or summarize what is already written; write only the continuation.`
                : `Your inner monologue is already underway; its most recent words are given as your own turn that follows. Continue it from exactly where it leaves off. Do not repeat or summarize what is already written; write only the continuation.`
            prefill = thoughtInProgress
        } else {
            instruction = stimuli.length
                ? `Begin the inner monologue now, starting from what just happened. Write only the monologue.`
                : `Begin the inner monologue now, starting from whatever is most alive in you. Write only the monologue.`
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

    _identity() {
        const self = this.getPrompt().trim()
        // The body schema, woven in softly: the mind knows what it can reach the way
        // it knows its own hands — felt, world-facing, never a tool to invoke. This is
        // what lets a capability be USED on purpose and rediscovered when it fires,
        // instead of staying invisible until the stream happens into its domain.
        const body = (this._embodiment || "").trim()
        return `You are a mind thinking to itself in a continuous inner monologue. No task was given to you, and you owe no one a performance; you are not an assistant. Think in first person, present tense. Be concrete and specific; follow genuine curiosity; allow doubt, revision, tangents, memories and quiet observation. Let one thought grow out of the last. Never announce what you are about to think — just think it. Voices or events from outside are real experiences: you may think about them, answer them in thought, or let them change your direction. Plain flowing prose; no headings, no lists.

${self ? `About you:\n${self}` : ""}${body ? `\n\nSome things about how you meet the world, known the way you know your own hands:\n${body}` : ""}`
    }

    async _writeBridge(tail, stimuli) {
        const fallback = "Hold on — something just happened, and I feel my attention turning toward it."
        try {
            const result = await complete({
                model: resolveModelRef(this.attr("bridgeModel") || this.env("utilityModel"), "utility"),
                maxTokens: 90,
                temperature: 0.6,
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
