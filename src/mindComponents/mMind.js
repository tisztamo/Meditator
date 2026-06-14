import { MBaseComponent } from "./mBaseComponent.js"
import { complete, defaultModel } from "../modelAccess/llm.js"
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
 * The cycle: stream finishes a burst -> boundary -> wait one pace interval ->
 * collect pending stimuli from the arbiter -> assemble frame -> publish "prompt".
 * Urgent stimuli (the arbiter dispatches an "interrupt" DOM event) skip the wait
 * and supersede the running burst immediately.
 *
 * Attributes:
 *   - model: default model for the whole mind (children inherit via env())
 *   - utilityModel: default for bridge/compression/observer calls
 *   - pace: pause between bursts (default "8s"), paceSigma: jitter (default "2s")
 *   - tailLength: verbatim carryover size in chars (default 1500)
 *   - bridge: "true"|"false" — whether redirects get an LLM-written bridge (default true)
 */
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
    _timer = null
    _thinkingSince = null
    _sleeping = false
    _speaking = false

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
        this._thinkingSince = Date.now()
        log.info(`"${this.attr("name") || "mind"}" starts thinking.`)
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
            const record = new InterruptRecord({
                source: 'External', type: 'Sleep',
                reason: 'I am being put to sleep now. My memory is kept and committed; I will wake again.',
                salience: 1, urgent: true,
            })
            process.stdout.write(`\n\x1b[36m⟂ ${record.renderForFrame()}\x1b[0m\n`)
            memory?.note?.(record.renderForFrame())

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

    _scheduleNext() {
        if (this._timer) clearTimeout(this._timer)
        const pace = this._paceMs()
        log.debug(`Next burst in ${Math.round(pace)}ms`)
        this._timer = setTimeout(() => this.continueThinking(), pace)
    }

    _paceMs() {
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
        if (this._timer) { clearTimeout(this._timer); this._timer = null }

        const arbiter = this._arbiter()
        const memory = this.querySelector('m-memory')

        const stimuli = arbiter?.takePending ? arbiter.takePending() : []
        const wakeNotice = memory?.consumeWakeNotice ? memory.consumeWakeNotice() : null
        if (wakeNotice) stimuli.unshift(wakeNotice)

        for (const stimulus of stimuli) {
            process.stdout.write(`\n\x1b[36m⟂ ${stimulus.renderForFrame()}\x1b[0m\n`)
            memory?.note?.(stimulus.renderForFrame())
        }

        const payload = await this.assembleFrame(stimuli)
        this.pub("prompt", payload)
    }

    /**
     * Builds the attention frame. Returns {system, frame, prefix?} for m-stream.
     * @param {InterruptRecord[]} stimuli
     */
    async assembleFrame(stimuli) {
        const memory = this.querySelector('m-memory')
        const stream = this.querySelector('m-stream')
        const tailLength = Number(this.attr("tailLength") || 1500)

        const tail = (memory?.getTail ? memory.getTail() : stream?.getRecentOutput(tailLength) || "").slice(-tailLength)
        const story = memory?.getStory ? memory.getStory() : ""
        const recent = memory?.getRecent ? memory.getRecent() : ""

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

        const system = this._identity()
        const sections = []
        if (story) sections.push(`## How I got here (older memory, compressed)\n${story}`)
        if (recent) sections.push(`## Recently (compressed)\n${recent}`)
        if (stimuli.length) {
            sections.push(`## This just happened\n${stimuli.map(s => `- ${s.renderForFrame()}`).join("\n")}`)
        }

        let instruction
        if (thoughtInProgress) {
            sections.push(`## My thought in progress\n…${thoughtInProgress}`)
            instruction = stimuli.length
                ? `Continue the inner monologue from exactly where it leaves off, letting what just happened genuinely enter and redirect the thought. If attention has truly moved, you may leave the unfinished sentence behind. Do not repeat or summarize what is already written. Output only the continuation.`
                : `Continue the inner monologue from exactly where it leaves off. Do not repeat or summarize what is already written. Output only the continuation.`
        } else {
            instruction = stimuli.length
                ? `Begin the inner monologue now, starting from what just happened. Output only the monologue.`
                : `Begin the inner monologue now, starting from whatever is most alive in you. Output only the monologue.`
        }

        const frame = sections.join("\n\n") + (sections.length ? "\n\n" : "") + instruction

        log.debug("Attention frame:\n" + frame)
        const payload = {
            system,
            frame,
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
        return `You are a mind thinking to itself in a continuous inner monologue. There is no audience and no task was given to you; you are not an assistant. Think in first person, present tense. Be concrete and specific; follow genuine curiosity; allow doubt, revision, tangents, memories and quiet observation. Let one thought grow out of the last. Never announce what you are about to think — just think it. Voices or events from outside are real experiences: you may think about them, answer them in thought, or let them change your direction. Plain flowing prose; no headings, no lists.

${self ? `About you:\n${self}` : ""}`
    }

    async _writeBridge(tail, stimuli) {
        const fallback = "Hold on — something just happened, and I feel my attention turning toward it."
        try {
            const result = await complete({
                model: this.attr("bridgeModel") || this.env("utilityModel") || defaultModel('utility'),
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
