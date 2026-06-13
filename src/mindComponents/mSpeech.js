import { MObserver } from "./mObserver.js"
import { chatStream, complete, defaultModel } from "../modelAccess/llm.js"
import { parseTime } from '../config/timeParser.js';
import { logger } from '../infrastructure/logger.js';

const log = logger('mSpeech.js');

/**
 * The speaking voice — what goes OUT. The mind mostly thinks quietly to itself
 * (m-stream); occasionally a thought wants to become an utterance, and this
 * component gives it outward voice.
 *
 * Speech is VOLITIONAL, not a reply service (the project's anti-chatbot soul):
 *   - At every `every`-th burst boundary — and promptly after a voice from
 *     outside addresses the mind — a cheap utility call judges whether something
 *     genuinely wants to be said aloud, and with what salience. Most of the time
 *     the answer is NONE. Being addressed lowers the bar (addressedBoost) but
 *     never forces a reply: the mind may answer aloud, or just keep thinking.
 *   - If the urge clears `threshold` (and the per-voice `cooldown` has passed),
 *     the utterance is produced as its OWN streamed burst on the voice model,
 *     concurrently with the (thinned) thinking stream — true limited parallelism.
 *
 * The verbal channel is shared but not serialized here: while this is speaking it
 * publishes `speaking=true`, and m-mind thins the thinking stream (fewer tokens,
 * slower pace) so "thinking effort goes to speech". The non-verbal subconscious
 * (observers, memory, economy, scribe) keeps running untouched.
 *
 * The completed utterance is handed to m-memory (`spoke()`), which splices it
 * into the tail as a marked block — so the next thought continues knowing what
 * it just said aloud.
 *
 * @interface
 * Attributes (plus MObserver's window/cooldown):
 *   - every: decision cadence in boundaries for spontaneous speech (default 6)
 *   - threshold: min salience to speak (default 0.6)
 *   - addressedBoost: threshold reduction when freshly addressed (default 0.25)
 *   - cooldown: min time between utterances (default "60s")
 *   - model: the voice model (defaults to ancestor "model")
 *   - decisionModel: tiny model for the impulse (defaults to ancestor utilityModel)
 *   - speakTokens: max tokens per utterance (default 200)
 *   - temperature: sampling temperature for the utterance (default 0.85)
 *
 * Topics published:
 *   - "speech": each spoken text fragment as it arrives
 *   - "speaking": boolean — true while an utterance is in flight
 *   - "speech-boundary": {chars, reason, text} when an utterance ends
 *   - "impulse": {salience, gist, accepted} — every decision, for observability
 *
 * DOM events listened (on parent, bubbling): "interrupt-request" (addressed
 * nudge), "interrupt" (urgent → abort the utterance and attend it).
 */
export class MSpeech extends MObserver {
    _boundaryCount = 0
    _busy = false
    _speaking = false
    _aborted = false
    _burst = null
    _addressed = null
    _lastSpokeAt = 0

    // An urgent stimulus arriving mid-utterance: stop talking and attend it.
    "../@interrupt" = () => {
        if (this._speaking && this._burst) {
            this._aborted = true
            this._burst.abort()
        }
    }

    // A voice from outside raises the urge to speak and schedules a check at the
    // next boundary. It never forces a reply.
    "../@interrupt-request" = e => {
        const r = e && e.detail
        if (r && r.source === "External" && (r.type === "UserInput" || r.type === "ConsoleInput")) {
            this._addressed = r.reason || "A voice from outside."
        }
    }

    async onBoundary(boundary) {
        if (boundary?.reason !== "completed") return
        if (this._speaking || this._busy) return

        this._boundaryCount += 1
        const addressed = this._addressed
        const every = Number(this.attr("every") || 6)
        const due = !!addressed || (this._boundaryCount % every === 0)
        if (!due) return
        if (!addressed && this.window.length < 200) return

        // Respect the cooldown between utterances — addressing makes speech more
        // likely once the cooldown passes, but does not override it.
        const cooldownMs = parseTime(this.attr("cooldown") || "60s")
        if (Date.now() - this._lastSpokeAt < cooldownMs) return

        this._busy = true
        try {
            const decision = await this._decide(addressed)
            this._addressed = null
            if (decision) await this._speak(decision, addressed)
        } catch (error) {
            log.warn("Speech turn failed:", error.message || error)
        } finally {
            this._busy = false
        }
    }

    /** The volitional impulse: does anything want to be said aloud right now? */
    async _decide(addressed) {
        const threshold = Number(this.attr("threshold") || 0.6)
            - (addressed ? Number(this.attr("addressedBoost") || 0.25) : 0)
        const result = await complete({
            model: this.attr("decisionModel") || this.env("utilityModel") || defaultModel('utility'),
            maxTokens: 120,
            temperature: 0.7,
            prompt: this._decisionPrompt(addressed),
        })
        const text = (result.text || "").trim()
        if (/^NONE\b/i.test(text) || !/SAY:/i.test(text)) {
            this.pub("impulse", { salience: 0, gist: null, accepted: false })
            return null
        }
        const salience = parseFloat((text.match(/SALIENCE:\s*([\d.]+)/i) || [])[1])
        const rawSay = (text.match(/SAY:\s*([\s\S]+)/i) || [])[1]
        const sal = Number.isFinite(salience) ? salience : 0.5
        const gist = rawSay ? rawSay.trim().replace(/^["']|["']$/g, "") : null
        const accepted = !!gist && sal >= threshold
        this.pub("impulse", { salience: sal, gist: gist ? gist.slice(0, 200) : null, accepted })
        return accepted ? { salience: sal, gist } : null
    }

    /** Produce the utterance as its own streamed burst on the voice model. */
    async _speak(decision, addressed) {
        this._speaking = true
        this._aborted = false
        this._lastSpokeAt = Date.now()
        this.pub("speaking", true)

        const model = this.attr("model") || this.env("model") || defaultModel('stream')
        const messages = [
            { role: 'system', content: this._speechSystem() },
            { role: 'user', content: this._speechFrame(decision, addressed) },
        ]

        let said = ""
        let reason = "completed"
        try {
            const burst = await chatStream({
                model,
                messages,
                maxTokens: Number(this.attr("speakTokens") || 200),
                temperature: Number(this.attr("temperature") || 0.85),
            })
            this._burst = burst
            for await (const text of burst) {
                if (this._aborted) { reason = "aborted"; break }
                said += text
                this.pub("speech", text)
            }
        } catch (error) {
            reason = "error"
            log.warn("Speech burst failed:", error.message || error)
        } finally {
            this._burst = null
            this._speaking = false
            this.pub("speaking", false)
            const utterance = said.trim()
            this.pub("speech-boundary", { chars: utterance.length, reason, text: utterance })
            if (utterance && reason !== "error") {
                const memory = this.closest('m-mind')?.querySelector('m-memory')
                memory?.spoke?.(utterance)
                process.stdout.write(`\n\x1b[33m🗣 ${utterance}\x1b[0m\n`)
            }
        }
    }

    _speechSystem() {
        const mind = this.closest('m-mind')
        const identity = mind?.getPrompt ? mind.getPrompt().trim() : ""
        return `You are a mind that is now speaking ALOUD, giving outward voice to what is inside you. Speak in the first person, the way a person actually talks out loud — brief, natural, unrehearsed; a few sentences at most, never an essay or a list. You are not an assistant and owe no one an answer; you speak only because something in you wants to be said.${identity ? `\n\nAbout you:\n${identity}` : ""}`
    }

    _speechFrame(decision, addressed) {
        const mind = this.closest('m-mind')
        const memory = mind?.querySelector('m-memory')
        const recent = (memory?.getTail ? memory.getTail() : this.window).slice(-700)
        const parts = []
        if (recent) parts.push(`## What you have been thinking\n…${recent}`)
        if (addressed) parts.push(`## A voice from outside\n${addressed}`)
        parts.push(`## What wants to be said\n${decision.gist}`)
        parts.push(`Now say it aloud, in your own voice. Output only the spoken words — no quotation marks, no stage directions, no narration.`)
        return parts.join("\n\n")
    }

    _decisionPrompt(addressed) {
        return `You are the impulse to SPEAK inside a mind that mostly just thinks quietly to itself. Speaking aloud is occasional and must be worth it — most of the time the honest answer is NONE.

Its recent stream of thought:
<stream>
…${this.window.slice(-1200)}
</stream>
${addressed ? `\nA voice from outside just addressed it:\n${addressed}\n` : ""}
Does the mind genuinely want to say something ALOUD right now${addressed ? " (it may answer the voice, or it may not)" : ""}? Say yes only if there is a real urge to give something outward voice, not merely to keep thinking.

If nothing wants to be said aloud, output exactly: NONE
Otherwise output exactly two lines:
SALIENCE: <0.0-1.0, how strongly it wants to speak>
SAY: <what it wants to say, first person, one or two sentences>`
    }
}
