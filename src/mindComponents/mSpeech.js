import { MObserver } from "./mObserver.js"
import { chatStream, complete } from "../modelAccess/llm.js"
import { resolveModelRef } from "../modelAccess/modelConfig.js"
import { parseTime } from '../config/timeParser.js';
import { logger } from '../infrastructure/logger.js';

const log = logger('mSpeech.js');

/**
 * Parses the speech-decision model's reply TOLERANTLY. Small utility models
 * rarely keep a rigid two-line format, so rather than demanding a literal
 * "SAY:" line (and silently treating everything else as refusal), we treat any
 * non-NONE reply as the utterance and pull an optional strength score out of
 * whatever shape it arrived in. Returns
 *   { say: string|null, salience: number|null, reason: "say"|"none"|"empty" }.
 */
export function parseSpeechDecision(text) {
    let raw = (text || "").trim()
    if (!raw) return { say: null, salience: null, reason: "empty" }
    // Unwrap a reply the model wrapped wholesale in quotes (it sometimes tucks
    // the score inside, e.g. `"[0.9] I hear you."`), so the score still parses.
    if (raw.length > 1 && /^["'][\s\S]*["']$/.test(raw)) raw = raw.slice(1, -1).trim()

    // An optional strength score, in any of the tolerated shapes.
    let salience = null
    const sal = raw.match(/(?:salience|strength)\s*[:=]?\s*([01]?\.?\d+)/i)
        || raw.match(/^\s*\[\s*([01]?\.?\d+)\s*\]/)
        || raw.match(/^\s*([01]?\.?\d+)\s*[|:–-]\s/)
    if (sal) {
        const n = parseFloat(sal[1])
        if (Number.isFinite(n)) salience = Math.max(0, Math.min(1, n))
    }

    // Strip score markers and any leading label to isolate the words.
    let body = raw
        .replace(/(?:salience|strength)\s*[:=]?\s*[01]?\.?\d+\s*[:|–-]?\s*/i, "")
        .replace(/^\s*\[\s*[01]?\.?\d+\s*\]\s*/, "")
        .replace(/^\s*[01]?\.?\d+\s*[|:–-]\s*/, "")
        .replace(/^\s*(?:SAY|SAID|THOUGHT|UTTERANCE|RESPONSE|REPLY)\s*[:–-]\s*/im, "")
        .trim()

    // Explicit refusal — when NONE is essentially the whole reply.
    if (/^["']?none\b/i.test(body)) return { say: null, salience: salience ?? 0, reason: "none" }

    body = body.replace(/^["']|["']$/g, "").trim()
    if (!body) return { say: null, salience: salience ?? 0, reason: "none" }
    return { say: body, salience, reason: "say" }
}

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
 * When an utterance completes, the voice publishes it on its `spoken` topic and
 * is otherwise ignorant of what becomes of it. A memory subscribes (via its own
 * `spokenSrc`) and splices it into the tail as a marked block — so the next
 * thought continues knowing what it just said aloud. The voice does not know
 * memory exists, so memory can be replaced, or several can listen at once.
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
 *   - "spoken": {text, at} — a completed (non-error) utterance, for a memory to record
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

    onObserverConnect() {
        // Bind to the mind's bubbling interrupt events — but only once m-mind has
        // upgraded into an Amanita component. Component upgrade order is not
        // guaranteed, and an auto-subscribed "../@…" field can bind before the
        // mind exists, in which case the ".." ref resolves to nothing and the
        // handler silently never fires. That race is exactly why the addressed
        // nudge appeared dead: the voice could not hear it was being spoken to.
        this._bindMindEvents()
    }

    async _bindMindEvents() {
        for (let i = 0; i < 100; i++) {
            const mind = this.closest('m-mind')
            if (mind && mind.on) {
                this.sub("../@interrupt-request", this._onAddressed, 12)
                this.sub("../@interrupt", this._onUrgent, 12)
                return
            }
            await new Promise(resolve => setTimeout(resolve, 50))
        }
        log.warn("could not bind to the mind's interrupt events; speech will only be spontaneous")
    }

    // A voice from outside raises the urge to speak (checked at the next
    // boundary). It never forces a reply.
    _onAddressed = e => {
        // A human voice — websocket sets source "WebSocketClient", the console
        // sets "External"; both set the type, so match on that, not the source.
        const r = e && e.detail
        if (r && (r.type === "UserInput" || r.type === "ConsoleInput")) {
            this._addressed = r.reason || "A voice from outside."
        }
    }

    // An urgent stimulus arriving mid-utterance: stop talking and attend it.
    _onUrgent = () => {
        if (this._speaking && this._burst) {
            this._aborted = true
            this._burst.abort()
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
        this._addressed = null   // consume now; a new address arriving during the call is kept for next time
        try {
            const decision = await this._decide(addressed)
            if (decision) await this._speak(decision, addressed)
        } catch (error) {
            log.warn("Speech turn failed:", error.message || error)
        } finally {
            this._busy = false
        }
    }

    /** The volitional impulse: does anything want to be said aloud right now? */
    async _decide(addressed) {
        // When addressed by a human, let the full voice model judge whether and
        // what to reply — the tiny utility model is far too eager to answer NONE
        // for a real social moment. Spontaneous checks stay on the cheap model.
        const model = addressed
            ? resolveModelRef(this.attr("model") || this.env("model"), "voice")
            : resolveModelRef(this.attr("decisionModel") || this.env("utilityModel"), "utility")
        const result = await complete({
            model,
            maxTokens: 120,
            temperature: 0.7,
            prompt: this._decisionPrompt(addressed),
        })
        const raw = (result.text || "").trim()
        const parsed = parseSpeechDecision(raw)
        log.debug(`decision (addressed=${!!addressed}): ${JSON.stringify(raw).slice(0, 300)} -> say=${parsed.say ? JSON.stringify(parsed.say.slice(0, 80)) : "none"} salience=${parsed.salience}`)

        const threshold = Number(this.attr("threshold") || 0.6)
            - (addressed ? Number(this.attr("addressedBoost") || 0.25) : 0)
        // Default the strength when the model gave none. Being addressed and
        // having something to say is reason enough — a natural reply should not
        // be vetoed by a missing score; spontaneous speech still clears threshold.
        const salience = parsed.salience != null ? parsed.salience : (addressed ? 0.8 : 0.55)
        const accepted = !!parsed.say && (addressed || salience >= threshold)

        this.pub("impulse", {
            salience,
            gist: parsed.say ? parsed.say.slice(0, 200) : null,
            accepted,
            addressed: !!addressed,
            reason: parsed.say ? (accepted ? "speak" : `below ${threshold.toFixed(2)}`) : "nothing to say",
        })
        return accepted ? { salience, gist: parsed.say } : null
    }

    /** Produce the utterance as its own streamed burst on the voice model. */
    async _speak(decision, addressed) {
        this._speaking = true
        this._aborted = false
        this._lastSpokeAt = Date.now()
        this.pub("speaking", true)

        const model = resolveModelRef(this.attr("model") || this.env("model"), "voice")
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
                // Hand the completed utterance off as a topic, not a method call.
                // The voice publishes that it spoke and stays ignorant of who (if
                // anyone) records it; a memory subscribes via its own `spokenSrc`,
                // and any number of memories may listen to the same topic.
                this.pub("spoken", { text: utterance, at: this._lastSpokeAt })
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
        // "What you have been thinking" comes from this observer's own rolling
        // stream window (already bound to ..m-mind/stream/chunk), not by reaching
        // into m-memory. It is the same window _decide() judges from, so the frame
        // and the impulse stay consistent — and the voice needs no knowledge of memory.
        const recent = this.window.slice(-700)
        const parts = []
        if (recent) parts.push(`## What you have been thinking\n…${recent}`)
        if (addressed) parts.push(`## A voice from outside\n${addressed}`)
        parts.push(`## What wants to be said\n${decision.gist}`)
        parts.push(`Now say it aloud, in your own voice. Output only the spoken words — no quotation marks, no stage directions, no narration.`)
        return parts.join("\n\n")
    }

    _decisionPrompt(addressed) {
        const intro = addressed
            ? `You are the impulse to SPEAK for a mind that has just been addressed by a voice from outside. You decide whether it answers ALOUD. It is under no obligation to reply — but if there is anything at all it would naturally say back, it should say it. Stay silent only if it genuinely has nothing it wants to give voice to.`
            : `You are the impulse to SPEAK inside a mind that mostly thinks quietly to itself. You decide whether, right now, something genuinely wants to be said ALOUD — not merely thought. This is occasional: if nothing is pressing to be voiced, stay silent.`
        return `${intro}

Its recent stream of thought:
<stream>
…${this.window.slice(-1200)}
</stream>
${addressed ? `\nThe voice from outside said:\n"${addressed}"\n` : ""}
Reply with ONE of:
- the exact words to say aloud, in the mind's own first-person voice (one or two sentences, the way a person really speaks); you may begin with a strength in brackets like "[0.8] …"
- or the single word NONE, if nothing wants to be voiced right now.`
    }
}
