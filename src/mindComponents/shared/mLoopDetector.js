import A from "amanita"
import { MObserver } from "../mind/mObserver.js"
import { complete } from "../../modelAccess/llm.js"
import { decide, readChoice } from "../../modelAccess/decide.js"
import { resolveModelRef } from "../../modelAccess/modelConfig.js"
import { logger } from '../../infrastructure/logger.js';

const log = logger('mLoopDetector.js');

/**
 * m-loop-detector — the SENSE half of loop handling (loop-detection-redesign.md). It only
 * detects and *publishes a signal*; it never breaks anything. Intervention is left to the
 * breakers (m-clear-mind, m-resurface) that subscribe to that signal and bid through the
 * ordinary attention arbiter.
 *
 * On a cadence — every `every` completed boundaries, and arousal-gated so a tired mind is
 * not made to pay for a check — it reads the memory `tail` (the authoritative text that
 * becomes the next burst's prefill, NOT a private observer window) and makes ONE
 * utility-model call: is this circling? score it, and if so name the vocabulary/themes it is
 * stuck on, what KIND of loop it is, and one sentence why. It parses the reply with regex
 * (the codebase convention, cf. mAssociate) and does nothing but `pub("loop", …)`.
 *
 * This replaces the old pure-code `loopScore` gate as the DECISION-maker: the LLM reads
 * meaning, so the conjecture word *infinite* no longer trips it, digit-spam and a
 * presence/void rut are recognised for what they are, and the hand-tuned bliss lexicon is
 * retired (the LLM's `kind` + `vocabulary` subsume it). A loop develops over several bursts,
 * so a per-N-boundary check is responsive enough, and the bounded tail is cheap.
 *
 * The `reasoning` is the utility model's judgement ABOUT the mind, never the mind's own
 * thought — it is for the dashboard and logs only and must never leak into the tail/journal.
 *
 * @interface (plus MObserver's window / src / boundarySrc)
 * Attributes:
 *   - every: check at every Nth completed boundary (default 5)
 *   - minTail: minimum tail length in chars before it will judge (default 700)
 *   - minScore: score at/above which a "yes" counts as an active loop (default 0.5)
 *   - minArousal: stand down below this arousal — a near-exhausted mind is not checked
 *     (default 0.1; needs an m-economy to ever fall, else arousal stays 1)
 *   - tailSrc: memory tail topic (default: the mind's m-memory `<name>/tail`, auto-discovered;
 *     "off" falls back to the observer's own stream window)
 *   - model: model for the detection call (default ancestor utilityModel). If it resolves to
 *     a provider of `kind: decision` (TypeSafe's Jev), the detector switches to the decision
 *     engine below: three questions instead of a format prompt, no text out, and `vocabulary`
 *     / `reasoning` come back empty because a System-One model generates nothing.
 *
 * Topics published:
 *   - "loop": {active, score, kind, vocabulary[], reasoning, at, engine, model, confidence,
 *     strength} — the first six fields are what both engines produce and what every consumer
 *     has always read; the last four are provenance. Standing state about the
 *     mind's condition, like economy/arousal: one published state, N independent reactions.
 *     `pub` (not `fire`) because a breaker that wins the arbiter acts a beat later and must
 *     still be able to READ loop.vocabulary then.
 */
const KINDS = ["content", "presence", "void", "spam", "anxiety", "other"]

// --- the Jev (System One) engine -------------------------------------------
// A decision model answers questions and generates nothing, so the five-field
// format prompt becomes three questions (plan §1 Phase 5): the yes/no as a
// `noul`, the 0–1 score as a 5-level `score`, the kind as a `choice`. VOCABULARY
// and WHY are dropped — they were text, and a model that cannot generate cannot
// produce them. The signal shape the mind sees is unchanged; those two fields
// come back empty, and the honest consequence is that m-resurface loses the
// words to steer AWAY from (its containment search then reduces to "the newest
// substantive kept note"), while the m-clear-mind floor is unaffected.

/** The five ordered levels of `score`. Index i maps to i/(n-1) on the mind's 0–1 scale. */
export const LOOP_SCORE_LEVELS = [
    "flowing: every step takes the thought somewhere it has not been",
    "revisiting: it returns to earlier ground but develops it further",
    "circling: it keeps coming back to the same point without adding to it",
    "restating: it says the same thing again in fresh words, over and over",
    "stuck: a tight, near-verbatim refrain with no movement at all",
]

/** The kind glosses, the same ones the format prompt puts in parentheses. */
export const LOOP_KIND_CRITERIA = {
    presence: "bliss, stillness, arrival — the refrain that being here is enough",
    void: "dissolution, emptiness, 'I am the void' — the self talked away",
    spam: "digits, punctuation or fragments repeated as output, not as thought",
    content: "one real idea chewed past the point where chewing adds anything",
    anxiety: "a fretful spiral that keeps returning to the same worry",
    other: "circling that none of the above describes",
}

const JEV_FRAMING = 'The state is the verbatim tail of a mind\'s inner monologue — the words it is about to continue from. '
    + 'Lines beginning "> ⟂" are events it perceived at that moment (a voice, or an answer coming back from its own reach '
    + 'into the world), not its own words.'

/**
 * The detector's three questions for a decision model. Pure, so the question set
 * is unit-tested and a lab script can ask it without a component.
 */
export function loopQuestions() {
    return {
        looping: {
            type: "noul",
            instructions: `${JEV_FRAMING} Is the mind CIRCLING — restating the same point again and again, chanting a refrain, `
                + `or chewing the same vocabulary without taking a genuinely new step? Working a hard problem and revisiting it `
                + `is NOT circling; neither is honestly stating a question (a conjecture about something being "infinite" is real `
                + `content). But re-reaching for the same thing whose answer already came back, or re-declaring a conclusion it `
                + `has already reached, IS circling even when every restatement is freshly worded.`,
            criteria: {
                true: "the mind is in a genuine rut: the thought is not moving",
                false: "the thought is moving, even if slowly or over familiar ground",
            },
        },
        score: {
            type: "score",
            instructions: `${JEV_FRAMING} How stuck is it?`,
            criteria: LOOP_SCORE_LEVELS,
        },
        kind: {
            type: "choice",
            instructions: `${JEV_FRAMING} If it is circling, what kind of rut is it? Answer with the closest match even when `
                + `the mind is not circling at all.`,
            criteria: LOOP_KIND_CRITERIA,
        },
    }
}

/**
 * Read the three answers into the same {looping, score, kind, vocabulary, reasoning}
 * shape parseLoopReply returns, plus the provenance a calibrated sensor can carry.
 *
 * `noul` has no confidence field (plan §3), so the strength of the yes/no is derived
 * as |p − 0.5|·2 and reported as `strength` — a derived number, said to be derived.
 * `confidence` is the `score` question's own, because that is the field the mind's
 * threshold actually rides on.
 *
 * Defensive in the same direction as parseLoopReply: anything missing reads as NOT
 * looping, so a soft failure never fabricates a loop.
 */
export function readLoopDecision(answers) {
    const a = answers && typeof answers === "object" ? answers : {}

    const p = Number(a.looping?.noul)
    const loopingP = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : NaN
    // STRICTLY greater: an exact 0.5 is the maximum-entropy answer (and what dry-run
    // returns), and a coin flip is not evidence of a loop.
    const looping = Number.isFinite(loopingP) && loopingP > 0.5
    const strength = Number.isFinite(loopingP) ? Math.abs(loopingP - 0.5) * 2 : 0

    // `score` comes back as the EXPECTED LEVEL (a float over 0…n-1), with legend and
    // probabilities keyed by level index. Normalise to the 0–1 scale the rest of the
    // mind has always seen.
    const levels = LOOP_SCORE_LEVELS.length
    const rawLevel = Number(a.score?.score)
    const level = Number.isFinite(rawLevel) ? Math.max(0, Math.min(levels - 1, rawLevel)) : NaN
    const normalised = Number.isFinite(level) ? level / (levels - 1) : NaN
    const scoreConfidence = clamp01(Number(a.score?.confidence))

    const chosen = readChoice(a.kind)
    const kind = chosen.value && KINDS.includes(chosen.value) ? chosen.value : "other"

    return {
        looping,
        // Same fallback discipline as the text parser: a missing score still counts
        // as a modest loop when the noul said yes, and as nothing when it said no.
        score: Number.isFinite(normalised) ? normalised : (looping ? 0.6 : 0),
        kind,
        vocabulary: [],     // a model that generates nothing cannot name the words
        reasoning: null,    // …nor say why; null, not a fabricated sentence
        confidence: Number.isFinite(scoreConfidence) ? scoreConfidence : 0,
        loopingP: Number.isFinite(loopingP) ? loopingP : null,
        strength,
        kindConfidence: chosen.confidence,
    }
}

export class MLoopDetector extends MObserver {
    _boundaryCount = 0
    _busy = false
    _memTail = ""
    _arousal = 1

    onObserverConnect() {
        if (this.attr("tailSrc") !== "off") {
            this.sub(this.attr("tailSrc") || "!scope/memory/tail", t => { this._memTail = t || "" }).catch(() => {})
        }

        // Interoception, gated exactly as m-act / m-interrupts do it: with no economy the
        // topic never publishes and arousal stays 1, so a mind without a metabolism is
        // checked freely.
        this.sub("!scope/economy/arousal", v => { if (typeof v === "number") this._arousal = v }).catch(() => {})
    }

    onBoundary(boundary) {
        if (boundary?.reason !== "completed") return
        this._boundaryCount += 1
        const every = Number(this.attr("every") || 5)
        if (this._boundaryCount % every !== 0) return
        if (this._busy) return

        const text = (this._memTail || this.window || "")
        if (text.length < Number(this.attr("minTail") || 700)) return

        if (this._arousal < Number(this.attr("minArousal") || 0.1)) {
            log.debug(`standing down — arousal ${this._arousal.toFixed(2)} below floor`)
            return
        }

        this._busy = true
        this._detect(text).catch(error => log.warn("loop detection failed:", error.message || error))
            .finally(() => { this._busy = false })
    }

    async _detect(text) {
        // The engine is chosen by the RESOLVED PROVIDER'S KIND, never by a flag of its
        // own — exactly as Phase 3 plans it for m-judge. Naming a decision preset
        // (model="jev") is enough; the switch is config, not code. The `utility` role
        // itself stays completion-only, because the scribe and the distiller share it.
        const spec = resolveModelRef(this.attr("model") || this.env("utilityModel"), "utility")
        const parsed = spec.kind === "decision"
            ? await this._detectDecision(spec, text)
            : await this._detectCompletion(spec, text)
        if (!parsed) return   // a soft failure is silence, never a fabricated verdict

        const minScore = Number(this.attr("minScore") || 0.5)
        const active = parsed.looping && parsed.score >= minScore

        const signal = {
            active,
            score: parsed.score,
            kind: parsed.kind,
            vocabulary: parsed.vocabulary,
            reasoning: parsed.reasoning,
            at: new Date().toISOString(),
            // Provenance: which engine saw this, which model version answered, and —
            // for a calibrated sensor — how sure it was. `strength` is DERIVED from the
            // noul as |p − 0.5|·2 (a noul carries no confidence of its own); it is named
            // separately from `confidence`, which is the score question's own statistic.
            engine: parsed.engine,
            model: parsed.model,
            confidence: parsed.confidence ?? null,
            strength: parsed.strength ?? null,
        }
        if (active) {
            log.info(`loop detected (${parsed.kind} ${(parsed.score * 100).toFixed(0)}%)`
                + `${parsed.vocabulary.length ? `: ${parsed.vocabulary.join(", ")}` : ""}`
                + `${parsed.confidence != null ? ` [conf ${parsed.confidence.toFixed(2)}]` : ""}`)
        } else {
            log.debug(`no loop (score ${parsed.score.toFixed(2)})`)
        }
        this.pub("loop", signal)
    }

    /** The original engine: one utility-model call, five fields parsed back out of prose. */
    async _detectCompletion(spec, text) {
        const result = await complete({
            model: spec,
            maxTokens: 120,
            temperature: 0.2,
            debugTag: "loop-detector",
            debugEl: this,
            prompt: this._prompt(text),
        })
        return { ...parseLoopReply(result.text || ""), engine: "llm", model: spec.model, confidence: null, strength: null }
    }

    /** The Jev engine: one decide() call, three questions, no text anywhere. */
    async _detectDecision(spec, text) {
        const result = await decide({
            model: spec,
            state: `…${text.slice(-1800)}`,
            questions: loopQuestions(),
            debugTag: "loop-detector",
            debugEl: this,
        })
        if (!result) return null   // decide() soft-fails to null, like complete() does
        return { ...readLoopDecision(result.answers), engine: "jev", model: result.model }
    }

    _prompt(text) {
        // "the loop sense of a mind" is the distinctive opener the dry-run model keys on.
        return `You are the loop sense of a mind. Below is the verbatim tail of its inner monologue — the words it is about to continue from.

<tail>
…${text.slice(-1800)}
</tail>

Lines beginning "> ⟂" are events the mind perceived at that moment (a voice, or an answer coming back from its own reach into the world) — not its own words.

Is the mind CIRCLING — restating the same point again and again, or chanting a refrain, or chewing the same vocabulary without taking a genuinely new step? Working a hard problem and revisiting it is NOT circling; neither is honestly stating a question (a conjecture about something being "infinite" is real content, not a loop). But re-reaching for the same thing whose answer already came back (repeated near-identical "> ⟂" events the thought never takes up), or re-deriving and re-declaring a conclusion it has already reached, IS circling even when every restatement is freshly worded. Only a true rut counts.

Reply in EXACTLY this format, nothing else:
LOOPING: yes or no
SCORE: <0.0-1.0, how stuck — 0 flowing, 1 a tight verbatim loop>
KIND: <one of: ${KINDS.join(" | ")}>  (presence = bliss/stillness/"enough"; void = dissolution/"I am the void"; spam = digits/punctuation; content = a real idea over-chewed; anxiety = fretful spiral)
VOCABULARY: <up to 6 comma-separated words/themes it is stuck on, empty if not looping>
WHY: <one short sentence, your judgement about the mind — not its own voice>`
    }
}

/**
 * Parse the detector's reply into {looping, score, kind, vocabulary[], reasoning}. Lenient
 * by design — the local utility model is not perfectly obedient — but it defaults to NOT
 * looping when the signal is unclear, so a parse miss never fabricates a loop. Pure, so it
 * is unit-tested without a model.
 */
export function parseLoopReply(raw) {
    const text = String(raw || "")
    const looping = /LOOPING:\s*(yes|true)\b/i.test(text)
    const score = clamp01(parseFloat((text.match(/SCORE:\s*([\d.]+)/i) || [])[1]))
    let kind = (text.match(/KIND:\s*([a-z]+)/i) || [])[1]
    kind = kind ? kind.toLowerCase() : "other"
    if (!KINDS.includes(kind)) kind = "other"
    // Same-line whitespace only ([ \t], not \s) so an EMPTY "VOCABULARY:" / "WHY:" line does
    // not let the capture spill onto the next line.
    const vocabLine = (text.match(/VOCABULARY:[ \t]*(.*)/i) || [])[1] || ""
    const vocabulary = vocabLine
        .split(/[,;]/)
        .map(w => w.trim().toLowerCase())
        .filter(w => w && !/^(none|n\/a|empty)$/i.test(w))
        .slice(0, 6)
    const reasoning = ((text.match(/WHY:[ \t]*(.*)/i) || [])[1] || "").trim()
    return {
        looping,
        score: Number.isFinite(score) ? score : (looping ? 0.6 : 0),
        kind,
        vocabulary,
        reasoning,
    }
}

function clamp01(n) {
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : NaN
}

A.define('m-loop-detector', MLoopDetector);
