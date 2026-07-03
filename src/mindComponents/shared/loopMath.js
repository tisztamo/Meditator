/**
 * loopMath — the neutral, model-free text-repetition math, extracted from m-loop-guard so
 * it belongs to no single component (loop-detection-redesign.md §contracts·4). Both the
 * legacy pure-code guard (m-loop-guard) and the new breakers (m-resurface's far-from-vocab
 * distance) import it AS A LIBRARY — a sibling dependency, never one component reaching into
 * another. It carries no opinion about *what* to do with a score; it only measures.
 *
 *   - loopScore(text): how much a window repeats itself (verbatim and paraphrased)
 *   - containment(a, b) / contentStems(text): stemmed-vocabulary overlap, the basis of both
 *     the paraphrase signal and the "how close is this note to the loop's vocabulary" distance
 *   - ngrams / jaccard: the verbatim-repetition primitives
 *
 * The pure-code loopScore is no longer the loop-detection *decision* (that is now
 * m-loop-detector's LLM call, which reads meaning); it stays here as cheap library math a
 * component may still want.
 */

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

export const STOPWORDS = new Set(("the a an and or but if then else of to in on at by for with from as is are was were be been " +
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
