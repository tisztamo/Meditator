import A from "amanita"
import { MObserver } from "./mObserver.js"
import { complete } from "../../modelAccess/llm.js"
import { decide, readChoice } from "../../modelAccess/decide.js"
import { resolveModelRef } from "../../modelAccess/modelConfig.js"
import { contentStems, containment } from "../shared/loopMath.js"
import { readKept } from "../shared/recallSources.js"
import { makePhrasebook } from "../shared/i18n.js"
import { mindHome } from '../../infrastructure/memoryVault.js';
import { parseTime } from '../../config/timeParser.js';
import { logger } from '../../infrastructure/logger.js';

const log = logger('mDrift.js');

// What m-drift says, as localizable phrases (i18n.js). Two slots, both first-person
// and self-caused — the mind felt a turn, never a mechanism. `far` names a thread the
// mind itself set down and is turning back to; `fresh` names a thread that came from
// nowhere it was looking (the arm-B idea). The candidate's own words ride in the quotes.
const DRIFT_PHRASES = {
    en: {
        far: ["My attention turns, on its own, back to a thread I set down before"],
        fresh: ["My mind turns, on its own, toward a thread I have not been carrying"],
    },
}

/**
 * m-drift — the spontaneous change-of-direction, rewritten to OFFER a destination.
 *
 * The old wander (an m-timeout in the drift region) fired on a clock and injected a
 * fixed, content-free line — "My mind drifts by itself toward something else I have
 * been carrying." It offered nothing: no thread, no place to go. A mind that cannot
 * think in another direction on its own just describes the drift and snaps straight
 * back to its attractor (the SOL/whisper/stillness rut) — the drift was an unusable
 * piece of torsion. The fix: when the drift fires, it picks a DESTINATION and names
 * it, so the mind can actually go there.
 *
 * Two arms, in order:
 *   - Arm A — a FAR set-down thread. Read the mind's current tail (what it is on now)
 *     and its kept material (notes + knowledge, via readKept); pick the substantive
 *     thread whose vocabulary is FARTHEST from the tail (lowest `containment` overlap,
 *     the same distance math m-resurface uses for loop-breaking). If even the farthest
 *     is too close (the mind has only ever written about one thing), arm A declines.
 *   - Arm B — a FRESH thread. When arm A finds nothing far enough, a tiny model is
 *     asked, at high temperature, for a few short first-person fragments that are
 *     genuinely far from the current thought (randomness as the seed); a second call
 *     (a decision model, or the completion model naming one) chooses the single
 *     fragment the context best supports. That fragment is raised.
 *
 * If both arms come up empty (a soft model failure, no candidates), m-drift stays
 * silent — it never raises a content-free line. That is the whole point: a drift that
 * offers nothing is torsion; a drift that names a place is a direction the mind can
 * take.
 *
 * DETECT ≠ DRIFT ≠ RECALL. m-loop-detector SENSES a rut and publishes `loop`;
 * m-resurface BREAKS it by resurfacing a far kept note (distance, clears the tail);
 * m-recall is the desire-pulled hand (relevance). m-drift is none of those: it is the
 * *unprompted* turn, on its own cadence, that keeps a resting mind from settling into
 * one attractor — and it always offers somewhere to go.
 *
 * Wire it where the old wander lived, in the drift region:
 *   <m-drift name="drift" timeout="15m" sigma="4m" salience="0.55"
 *            farThreshold="0.3" minNoteChars="80" candidates="5"></m-drift>
 *
 * @interface (plus MObserver's window / src / boundarySrc)
 * Attributes:
 *   - timeout: base interval between drifts (default "15m"), sigma: gaussian jitter (default "4m")
 *   - salience: salience of the raised stimulus (default 0.55)
 *   - farThreshold: how much of the tail's vocabulary a kept thread may share and still
 *     count as "far enough" to drift to — if even the farthest thread's overlap is at/above
 *     this, arm A declines and arm B runs (default 0.3)
 *   - minNoteChars: a kept thread must be at least this long to count as substantive (default 80)
 *   - candidates: how many fragments arm A asks the model to generate (default 5)
 *   - model: model for the arm A/B calls (default ancestor utilityModel). If it resolves to a
 *     provider of `kind: decision` (TypeSafe's Jev), arm B uses the decision engine (a `choice`
 *     over the candidates); otherwise the completion engine names the chosen fragment.
 *   - tailSrc: the memory tail topic to read the current thought from (default
 *     "!scope/memory/tail", auto-discovered; "off" falls back to the observer's own window)
 *   - dir: notes directory (default: the mind's vault home `notes/`, matching m-note)
 *   - kb: the scribe's knowledge directory, folded into the same pool ("off" for notes only)
 */
export class MDrift extends MObserver {
    _timer = null
    _lastKey = null

    onConnect() {
        super.onConnect()   // the observer's stream/window subscription — the tail fallback
        this.timeoutMs = parseTime(this.attr("timeout") || "15m")
        this.sigmaMs = parseTime(this.attr("sigma") || "4m")
        if (this.attr("tailSrc") !== "off") {
            this.sub(this.attr("tailSrc") || "!scope/memory/tail", t => { this._memTail = t || "" }).catch(() => {})
        }
        this._schedule(this._nextDelay())
    }

    onDisconnect() {
        if (this._timer) clearTimeout(this._timer)
    }

    _nextDelay() {
        const normal = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random())
        return Math.max(500, this.timeoutMs + normal * this.sigmaMs)
    }

    _schedule(delayMs) {
        if (this._timer) clearTimeout(this._timer)
        this._timer = setTimeout(this._onTimer, delayMs)
    }

    _onTimer = () => {
        this._drift().catch(error => log.warn("drift failed:", error.message || error))
            .finally(() => { this._schedule(this._nextDelay()) })
    }

    /** The drift itself: pick a destination, name it, raise it. Silence when both arms fail. */
    async _drift() {
        const tail = this._tail()
        const far = await this._pickFar(tail)
        if (far) {
            const book = this._book()
            const raised = this.raise(
                `${book.line("far")}: “${this._excerpt(far.text)}”`,
                { salience: Number(this.attr("salience") || 0.55), type: "Drift" }
            )
            if (raised) this._lastKey = far.key
            return
        }
        // Arm A found nothing far enough (or there is nothing set down) — arm B: a fresh
        // thread, generated from randomness and chosen by context.
        const fresh = await this._freshThread(tail)
        if (fresh) {
            this.raise(`${this._book().line("fresh")}: “${fresh}”`,
                { salience: Number(this.attr("salience") || 0.55), type: "Drift" })
        } else {
            log.debug("drift offered nothing — staying silent (no content-free line)")
        }
    }

    /** The current thought: the memory tail (the authoritative prefill text), else the window. */
    _tail() {
        return (this._memTail || this.window || "")
    }

    _book() {
        return (this.__book ||= makePhrasebook(this, DRIFT_PHRASES))
    }

    _excerpt(text, max = 300) {
        const t = (text || "").trim()
        return t.length > max ? t.slice(0, max).trimEnd() + "…" : t
    }

    /**
     * Arm A — the kept thread FARTHEST from the current tail. Lowest `containment` overlap
     * wins; the last thread drifted to is avoided; a thread that shares at/above
     * `farThreshold` of the tail's vocabulary is too close to feed. Returns null when the
     * notebook is empty or every thread is too close — the caller then runs arm B. Pure
     * file reads, no model call.
     */
    async _pickFar(tail) {
        const notesDir = this.attr("dir") || mindHome(this, "notes")
        const kb = this.attr("kb")
        const kbDir = kb === "off" ? null : (kb || mindHome(this, "knowledge"))
        const kept = await readKept({ notesDir, kbDir })
        if (!kept.length) return null

        const farThreshold = Number(this.attr("farThreshold") || 0.3)
        const minNoteChars = Number(this.attr("minNoteChars") || 80)
        const tailStems = contentStems(tail)
        if (!tailStems.size) return null   // no tail to be far FROM — nothing to drift away from

        const fresh = kept.filter(n => n.key !== this._lastKey)
        const pool = fresh.length ? fresh : kept
        const substantive = pool.filter(n => n.text.length >= minNoteChars)
        const candidates = substantive.length ? substantive : pool

        let best = null, bestOverlap = Infinity
        for (const n of candidates) {
            const overlap = containment(contentStems(`${n.title || ""} ${n.text}`), tailStems)
            if (overlap <= bestOverlap) { bestOverlap = overlap; best = n }   // <= lets a newer note win a tie
        }
        if (!best || bestOverlap >= farThreshold) return null   // even the farthest is soaked in the tail — arm B
        return best
    }

    /**
     * Arm B — a fresh thread. Two calls: a tiny model, at high temperature, generates
     * `candidates` short first-person fragments genuinely far from the current thought
     * (randomness as the seed); then a second call chooses the single one the context
     * best supports. Returns the chosen fragment, or null when both arms come up empty
     * (a soft failure is silence, never a fabricated destination).
     */
    async _freshThread(tail) {
        const spec = resolveModelRef(this.attr("model") || this.env("utilityModel"), "utility")
        const candidates = await this._generate(tail, spec)
        if (!candidates.length) return null
        const chosen = await this._choose(tail, candidates, spec)
        return chosen || null
    }

    /** The generator: N short, far, first-person fragments. High temperature — randomness is the seed. */
    async _generate(tail, spec) {
        const n = Number(this.attr("candidates") || 5)
        const salt = Math.floor(Math.random() * 1_000_000)
        const result = await complete({
            model: spec,
            maxTokens: 200,
            temperature: 1.2,
            debugTag: "drift-gen",
            debugEl: this,
            prompt: `You are the drift sense of a mind. Its current thought is below. From a different life, a different field of work, a different kind of wondering — NOT a continuation of this thought, NOT a rewording of it — offer ${n} short first-person fragments a drifting mind might turn toward. Each is one line, a few words, no preamble, no numbering, no quotation marks. They should feel genuinely far from the thought, and different from one another.

<tail>
…${(tail || "").slice(-900)}
</tail>

Seed: ${salt}

${n} lines:`,
        })
        const text = (result?.text || "").trim()
        if (!text) return []
        return text.split(/\r?\n/)
            .map(l => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").replace(/^["“’']|["“’']\s*$/g, "").trim())
            .filter(l => l.length >= 4 && l.length <= 120)
            .slice(0, n)
    }

    /** The chooser: one fragment, by context. Decision engine (a `choice`) or completion (names one). */
    async _choose(tail, candidates, spec) {
        if (spec.kind === "decision") {
            const result = await decide({
                model: spec,
                state: this._choosePrompt(tail, candidates),
                questions: {
                    turn: {
                        type: "choice",
                        instructions: "Which of these fragments would the mind most genuinely turn toward right now — the one that is farthest from its current thought yet still worth a turn?",
                        criteria: Object.fromEntries(candidates.map(c => [c, c])),
                    },
                },
                debugTag: "drift-choose",
                debugEl: this,
            })
            if (!result) return null
            const chosen = readChoice(result.answers?.turn)
            return candidates.includes(chosen.value) ? chosen.value : (chosen.value || candidates[0])
        }
        const result = await complete({
            model: spec,
            maxTokens: 60,
            temperature: 0.3,
            debugTag: "drift-choose",
            debugEl: this,
            prompt: `${this._choosePrompt(tail, candidates)}

Reply with EXACTLY the one fragment above the mind would most genuinely turn toward — copy it verbatim, nothing else.`,
        })
        const reply = (result?.text || "").trim()
        return candidates.find(c => reply.includes(c) || c.includes(reply)) || candidates[0]
    }

    _choosePrompt(tail, candidates) {
        return `The mind is currently thinking:
…${(tail || "").slice(-900)}

Which of these fragments would it most genuinely turn toward right now — the one farthest from its current thought yet still worth a turn?
${candidates.map(c => `- ${c}`).join("\n")}`
    }
}

A.define('m-drift', MDrift);
