import { MObserver } from "./mObserver.js"
import { makePhrasebook } from "./i18n.js"
import { logger } from '../infrastructure/logger.js';

const log = logger('mLoopGuard.js');

/**
 * The change-of-direction stimulus, as localizable phrases. The English defaults are
 * verbatim what this guard has always raised; a non-English mind overrides them by
 * dropping <m-phrase for="notice"> / <m-phrase for="redirect"> into the .archml (i18n.js).
 * Exported so m-resurface can share the same two slots for its identical fallback nudge.
 */
export const LOOP_PHRASES = {
    en: {
        notice: ["I notice I am going in circles, repeating the same thoughts in different words."],
        redirect: ["Enough of this thread for now — I will deliberately pick something unrelated that I have been carrying, and start there."],
    },
}

/**
 * Repetition observer — no LLM, pure code. Long unattended runs of language
 * models tend to collapse into attractor loops: re-circling the same idea in
 * lightly paraphrased words. This observer scores the recent stream window for
 * repetition (word-bigram overlap between its halves is robust to paraphrase;
 * verbatim loops score even higher) and, above a threshold, raises a decisive
 * change-of-direction stimulus, in the mind's own language (LOOP_PHRASES).
 *
 * @interface
 * Attributes (plus MObserver's):
 *   - overlap: loop score threshold 0..1 (default 0.3)
 *   - salience: default 0.85
 */
export class MLoopGuard extends MObserver {
    onBoundary() {
        if (this.window.length < 700) return
        const score = loopScore(this.window)
        const threshold = Number(this.attr("overlap") || 0.3)
        if (score >= threshold) {
            log.debug(`Loop detected: score ${(score * 100).toFixed(0)}%`)
            const book = (this.__book ||= makePhrasebook(this, LOOP_PHRASES))
            const raised = this.raise(book.line("notice"), {
                salience: Number(this.attr("salience") || 0.85),
                suggestion: book.line("redirect"),
                type: "LoopGuard",
            })
            if (raised) this.window = "" // start fresh so we do not re-trigger on the same text
        }
    }
}

/**
 * Repetition score for a text window, comparing its two halves:
 *   - bigram Jaccard catches verbatim and near-verbatim loops
 *   - containment of stemmed content words catches paraphrased loops, which
 *     keep circling the same vocabulary while flowing prose keeps introducing
 *     new words
 * The score is the max of the two signals, each scaled to roughly the same
 * "this is a loop" range.
 */
export function loopScore(text) {
    const half = Math.floor(text.length / 2)
    const a = text.slice(0, half), b = text.slice(half)
    const verbatim = jaccard(ngrams(a, 2), ngrams(b, 2))
    const vocabulary = containment(contentStems(a), contentStems(b))
    return Math.max(verbatim, vocabulary * 0.75)
}

const STOPWORDS = new Set(("the a an and or but if then else of to in on at by for with from as is are was were be been " +
    "being am it its this that these those i me my we our you your they them their he she his her not no nor so very " +
    "just only also too than because while when where which who whom what how all any both each few more most other " +
    "some such own same can will would should could may might must do does did have has had").split(" "))

export function contentStems(text) {
    const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/)
    const set = new Set()
    for (const word of words) {
        if (word.length >= 4 && !STOPWORDS.has(word)) set.add(word.slice(0, 5))
    }
    return set
}

export function containment(a, b) {
    const smaller = a.size <= b.size ? a : b
    const larger = a.size <= b.size ? b : a
    if (!smaller.size) return 0
    let hits = 0
    for (const stem of smaller) if (larger.has(stem)) hits += 1
    return hits / smaller.size
}

export function ngrams(text, n) {
    const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean)
    const set = new Set()
    for (let i = 0; i + n - 1 < words.length; i++) {
        set.add(words.slice(i, i + n).join(" "))
    }
    return set
}

export function jaccard(a, b) {
    if (!a.size || !b.size) return 0
    let intersection = 0
    for (const gram of a) if (b.has(gram)) intersection += 1
    return intersection / (a.size + b.size - intersection)
}
