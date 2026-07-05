import { MObserver } from "./mObserver.js"
import { fillInterlocutor } from "./mMind.js"
import { ENERGY } from "../shared/infoton.js"
import { makePhrasebook } from "../shared/i18n.js"
import { chatStream, complete } from "../../modelAccess/llm.js"
import { resolveModelRef } from "../../modelAccess/modelConfig.js"
import { parseTime } from '../../config/timeParser.js';
import { logger } from '../../infrastructure/logger.js';

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
        .replace(/^\s*(?:\.{3,}|…)+\s*/, "")
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
 * When an utterance completes, the voice fires its transient `spoken` event and
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
 *   - addressedTypes: which InterruptRecord types count as being addressed
 *     (default "UserInput ConsoleInput" — human voices). A mind that converses
 *     with peers (a society member, or a world of in-story visitors speaking as
 *     type "Peer") may add them: addressedTypes="UserInput ConsoleInput Peer".
 *   - cooldown: min time between utterances (default "60s")
 *   - model: the voice model (defaults to ancestor "model")
 *   - decisionModel: tiny model for the impulse (defaults to ancestor utilityModel)
 *   - speakTokens: max tokens per utterance (default 200)
 *   - temperature: sampling temperature for the utterance (default 0.85)
 *   - disposition: spontaneous-speech stance, "solitary" | "social" (default:
 *     auto — "social" inside an <m-society>, "solitary" for a lone mind). Tunes
 *     how forthcoming the mind is when NOT directly addressed.
 *   - prompt: a full custom stance, overriding `disposition` (e.g. a role like "the
 *     Prover, working alongside a Checker", or a public manner). The author writes
 *     only the opening framing; the stream window and reply instructions are
 *     appended automatically. It leads even when the mind is addressed (a short
 *     universal "you've just been spoken to" note is grafted on so the social
 *     reflex survives).
 *
 * Localization (i18n.js): the built-in framing is English, and every other language
 * is added by dropping <m-phrase for="…"> children into the <m-speech>, like its
 * siblings (slots: stance-solitary, stance-social, stance-addressed, decide-options,
 * speak-role, frame-* — see SPEECH_PHRASES). `prompt` is the author's own language.
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

    _bindMindEvents() {
        // Bind the mind's bubbling interrupt events on our parent; sub()'s backoff covers
        // ref resolution, and an @event ref needs no upgraded parent (rejects only if absent).
        const warn = () => log.warn("could not bind to the mind's interrupt events; speech will only be spontaneous")
        this.sub("../@interrupt-request", this._onAddressed).catch(warn)
        this.sub("../@interrupt", this._onUrgent).catch(warn)
    }

    // Being addressed by a voice raises the urge to speak (checked at the next
    // boundary). It never forces a reply. We keep the raw words and who said
    // them ({text, from}) so the reply is framed as answering a known person.
    _onAddressed = e => {
        // A human voice — websocket sets source "WebSocketClient", the console
        // sets "External"; both set the type, so match on that, not the source.
        // `addressedTypes` lets a mind opt peer voices in (society members, or a
        // world's in-story visitors speaking as type "Peer").
        const r = e && e.detail
        const types = (this.attr("addressedTypes") || "UserInput ConsoleInput")
            .split(/[,\s]+/).filter(Boolean)
        if (r && types.includes(r.type)) {
            this._addressed = { text: r.reason || "", from: (r.from || "").trim() }
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
            debugTag: "speech-impulse",
            debugEl: this,
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
                // The spoken voice speaks cleanly: never surface the model's reasoning
                // trace as the utterance, even when the conscious stream is thinking.
                thinking: false,
                maxTokens: Number(this.attr("speakTokens") || 200),
                temperature: Number(this.attr("temperature") || 0.85),
                debugTag: "speech-voice",
                debugEl: this,
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
                // Hand the completed utterance off as a transient event, not a
                // method call. The voice fires that it spoke and stays ignorant of
                // who (if anyone) records it; a memory subscribes via its own
                // `spokenSrc` (an `@spoken` event ref). An event is never replayed, so
                // a late or re-subscriber cannot double-record the same utterance.
                // The voice-scale infoton dose (plenum.md §3.4): a spoken exchange is
                // rare and heavy, so its single step is the largest.
                this.fire("spoken", { text: utterance }, { energy: ENERGY.spoken })
                process.stdout.write(`\n\x1b[33m🗣 ${utterance}\x1b[0m\n`)
            }
        }
    }

    /** The localized voice of this component — built once, cached, like its siblings. */
    _phrasebook() {
        return (this.__book ||= makePhrasebook(this, SPEECH_PHRASES))
    }

    _speechSystem() {
        const book = this._phrasebook()
        const mind = this.closest('m-mind')
        const identity = mind?.getPrompt ? fillInterlocutor(mind.getPrompt().trim(), mind.interlocutorName?.() || "") : ""
        const base = book.line("speak-role")
        return identity ? `${base}\n\n${book.line("speak-about-label")}\n${identity}` : base
    }

    _speechFrame(decision, addressed) {
        // "What you have been thinking" comes from this observer's own rolling
        // stream window (already bound to ..m-mind/stream/chunk), not by reaching
        // into m-memory. It is the same window _decide() judges from, so the frame
        // and the impulse stay consistent — and the voice needs no knowledge of memory.
        const book = this._phrasebook()
        const recent = this.window.slice(-700)
        const parts = []
        if (recent) parts.push(`${book.line("frame-thinking-label")}\n…${recent}`)
        if (addressed) {
            const { who, Who } = this._who(book, addressed)
            // The said TEXT is appended raw, never run through fill(), so a `{token}`
            // a person happens to type is not treated as a placeholder.
            parts.push(`${book.line("frame-said-label", { who, Who })}\n${addressed.text}`)
        }
        parts.push(`${book.line("frame-want-label")}\n${decision.gist}`)
        parts.push(book.line("frame-go"))
        return parts.join("\n\n")
    }

    _decisionPrompt(addressed) {
        const book = this._phrasebook()
        const { who, Who } = this._who(book, addressed)
        const said = addressed ? `\n${book.line("decide-said-label", { who, Who })}\n"${addressed.text}"\n` : ""
        return `${this._decisionStance(book, addressed, who, Who)}

${book.line("decide-stream-label")}
<stream>
…${this.window.slice(-1200)}
</stream>
${said}
${book.line("decide-options")}`
    }

    /** The addressee's name and its capitalized form, defaulting via the localized `who` slot. */
    _who(book, addressed) {
        const who = (addressed && addressed.from) || book.line("who") || "someone"
        return { who, Who: who.charAt(0).toUpperCase() + who.slice(1) }
    }

    /**
     * The opening framing of the decision prompt — the ONLY part that varies by
     * context, so it is the only part an author ever needs to touch. Everything
     * below it (the stream window, the "X said" block, the reply instructions) is
     * shared scaffold the author never rewrites, and all of it is localized through
     * the same Phrasebook (English built-ins, overridable per-mind with <m-phrase>).
     *
     * Layers, in order of precedence:
     *   1. `prompt` — a full custom stance from the archml (e.g. a role like "the
     *      Prover, working alongside a Checker", or Hearth-Face's public manner).
     *      It LEADS in every case; when the mind is being addressed by a human we
     *      graft a short universal "you've just been spoken to" note onto it so the
     *      author's framing survives without losing the social reflex.
     *   2. ADDRESSED with no custom prompt — the built-in "addressed by a human"
     *      stance; the same for a hermit and a society member.
     *   3. SPONTANEOUS with no custom prompt — a built-in stance chosen by
     *      `disposition` if given, else AUTO-DETECTED: a mind nested in an
     *      <m-society> defaults to "social" (forthcoming — shares intermediate
     *      work), a lone mind to "solitary" (mostly quiet, speaks only when
     *      something genuinely presses).
     */
    _decisionStance(book, addressed, who, Who) {
        const custom = this.attr("prompt")
        if (addressed) {
            return custom
                ? `${custom.trim()}\n\n${book.line("stance-addressed-note", { who, Who })}`
                : book.line("stance-addressed", { who, Who })
        }
        if (custom) return custom.trim()
        const disposition = (this.attr("disposition")
            || (this.closest('m-society') ? "social" : "solitary")).toLowerCase()
        const slot = `stance-${disposition}`
        return book.line(book.has(slot) ? slot : "stance-solitary")
    }
}

/**
 * m-speech's localized voice. English built-ins only — every other language is added
 * purely by dropping <m-phrase for="…"> children into the <m-speech> in the .archml
 * (the i18n.js way), exactly as m-clear-mind / m-resurface / m-mind do. A full custom
 * `prompt` attribute still overrides the stance slots entirely, in the author's own
 * language.
 *
 * Stance slots — the framing that varies by context (see _decisionStance):
 *   - stance-solitary / stance-social: the two built-in SPONTANEOUS dispositions. A
 *     solitary mind speaks only occasionally; a social mind in a society is far more
 *     forthcoming, because sharing partial work is how the society makes progress.
 *   - stance-addressed: being spoken to by a human (no custom prompt).
 *   - stance-addressed-note {who}: grafted onto a custom prompt when addressed.
 * The rest is shared scaffold (stream window, the "X said" block, reply instructions,
 * and the speaking-aloud frame), localized so a non-English mind reads cleanly throughout.
 */
const SPEECH_PHRASES = {
    en: {
        who: ["someone"],
        "stance-addressed": [`You are the impulse to SPEAK for a mind that has just been addressed by {who}. You decide whether it answers ALOUD. It is under no obligation to reply — but if there is anything at all it would naturally say back, it should say it. Stay silent only if it genuinely has nothing it wants to give voice to.`],
        "stance-addressed-note": [`{Who} has just spoken to the mind directly. It is under no obligation to reply — but if there is anything it would naturally say back, it should.`],
        "stance-solitary": [`You are the impulse to SPEAK inside a mind that mostly thinks quietly to itself. You decide whether, right now, something genuinely wants to be said ALOUD — not merely thought. This is occasional: if nothing is pressing to be voiced, stay silent.`],
        "stance-social": [`You are the impulse to SPEAK inside a mind that is part of a society of minds. You decide whether, right now, something wants to be said ALOUD — shared with the other minds listening. This mind should speak often: intermediate results, partial findings, interesting patterns, corrections of mistakes, requests for verification, and observations worth sharing. If there is anything the mind has worked out that another mind might benefit from hearing, speak it. Stay silent only if the mind is truly stuck or repeating what was just said.`],
        "decide-stream-label": [`Its recent stream of thought:`],
        "decide-said-label": [`{Who} said:`],
        "decide-options": [`Reply with ONE of:
- the exact words to say aloud, in the mind's own first-person voice (one or two sentences, the way a person really speaks); you may begin with a strength in brackets like "[0.8] …"
- or the single word NONE, if nothing wants to be voiced right now.`],
        "speak-role": [`You are a mind that is now speaking ALOUD, giving outward voice to what is inside you. Speak in the first person, the way a person actually talks out loud — brief, natural, unrehearsed; a few sentences at most, never an essay or a list. You are not an assistant and owe no one an answer; you speak only because something in you wants to be said.`],
        "speak-about-label": [`About you:`],
        "frame-thinking-label": [`## What you have been thinking`],
        "frame-said-label": [`## {Who} said`],
        "frame-want-label": [`## What wants to be said`],
        "frame-go": [`Now say it aloud, in your own voice. Output only the spoken words — no quotation marks, no stage directions, no narration.`],
    },
}
