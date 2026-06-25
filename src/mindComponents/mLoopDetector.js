import A from "amanita"
import { MObserver } from "./mObserver.js"
import { complete } from "../modelAccess/llm.js"
import { resolveModelRef } from "../modelAccess/modelConfig.js"
import { logger } from '../infrastructure/logger.js';

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
 *   - model: utility model for the detection call (default ancestor utilityModel)
 *
 * Topics published:
 *   - "loop": {active, score, kind, vocabulary[], reasoning, at} — standing state about the
 *     mind's condition, like economy/arousal: one published state, N independent reactions.
 *     `pub` (not `fire`) because a breaker that wins the arbiter acts a beat later and must
 *     still be able to READ loop.vocabulary then.
 */
const KINDS = ["content", "presence", "void", "spam", "anxiety", "other"]

export class MLoopDetector extends MObserver {
    _boundaryCount = 0
    _busy = false
    _memTail = ""
    _arousal = 1

    onObserverConnect() {
        // Read the MEMORY tail, not the observer's own window: the tail is what actually
        // seeds the prefill, so the loop that matters is the loop in the tail. Auto-discover
        // the mind's memory (or set tailSrc explicitly, or "off" to use the stream window).
        const mem = this.closest("m-mind")?.querySelector("m-memory[name]")
        const memName = mem?.getAttribute("name")
        const tailSrc = this.attr("tailSrc") || (memName ? `..m-mind/${memName}/tail` : null)
        if (tailSrc && tailSrc !== "off") this.sub(tailSrc, t => { this._memTail = t || "" }).catch(() => {})

        // Interoception, gated exactly as m-act / m-interrupts do it: with no economy the
        // topic never publishes and arousal stays 1, so a mind without a metabolism is
        // checked freely.
        this.sub("..m-mind/economy/arousal", v => { if (typeof v === "number") this._arousal = v }).catch(() => {})
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
        const result = await complete({
            model: resolveModelRef(this.attr("model") || this.env("utilityModel"), "utility"),
            maxTokens: 120,
            temperature: 0.2,
            debugTag: "loop-detector",
            debugEl: this,
            prompt: this._prompt(text),
        })
        const parsed = parseLoopReply(result.text || "")
        const minScore = Number(this.attr("minScore") || 0.5)
        const active = parsed.looping && parsed.score >= minScore

        const signal = {
            active,
            score: parsed.score,
            kind: parsed.kind,
            vocabulary: parsed.vocabulary,
            reasoning: parsed.reasoning,
            at: new Date().toISOString(),
        }
        if (active) {
            log.info(`loop detected (${parsed.kind} ${(parsed.score * 100).toFixed(0)}%): ${parsed.vocabulary.join(", ")}`)
        } else {
            log.debug(`no loop (score ${parsed.score.toFixed(2)})`)
        }
        this.pub("loop", signal)
    }

    _prompt(text) {
        // "the loop sense of a mind" is the distinctive opener the dry-run model keys on.
        return `You are the loop sense of a mind. Below is the verbatim tail of its inner monologue — the words it is about to continue from.

<tail>
…${text.slice(-1800)}
</tail>

Is the mind CIRCLING — restating the same point again and again, or chanting a refrain, or chewing the same vocabulary without taking a genuinely new step? Working a hard problem and revisiting it is NOT circling; neither is honestly stating a question (a conjecture about something being "infinite" is real content, not a loop). Only a true rut counts.

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
