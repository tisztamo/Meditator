import { langOf, collectPhrases } from "./i18n.js"
import { contentStems } from "./mLoopGuard.js"

/**
 * attractorLexicon — the model-free signal that a loop is a *bliss loop*.
 *
 * Left to itself a mind drifts toward presence, silence, stillness, oneness — "I am here,
 * now, and that is enough" — and circles there instead of working (the spiritual bliss
 * attractor named in Anthropic's Claude 4 model card; see doc/glossary.md and
 * doc/improvements/bliss-loop-recall.md). The read-back path (m-resurface) is structurally
 * biased to FEED that loop: it hands back the kept note whose words most overlap the
 * current thought, and when the loop *is* the attractor, the most-overlapping note is by
 * definition the most presence-soaked note the mind owns. To break that, m-resurface must
 * first be able to *recognise* a bliss loop — cheaply, with no model call — and this is the
 * recogniser.
 *
 * It is deliberately a vocabulary, because the attractor IS a vocabulary. A loop window (or
 * a candidate note) is "bliss" to the degree its content words are attractor words. We
 * reuse m-loop-guard's exact stemmer (contentStems) on BOTH sides, so the window and the
 * lexicon are compared like-for-like — same length floor, same stopwords, same 5-char
 * stems — and a word that loop-guard would not count cannot accidentally count here.
 *
 * LANGUAGE. The lexicon is language-aware the same way the rest of the mind's voice is
 * (i18n.js): the ambient <m-mind lang="…"> selects the built-in set, and a mind can extend
 * it from its .archml with <m-phrase for="bliss"> children on the recogniser — so a
 * language the runtime does not ship can still be added without code, and a mind whose
 * "loop" vocabulary is its own (a coding mind, say) can tune it. Unlike a Phrasebook slot,
 * the lexicon is ADDITIVE: archml words extend the built-in set rather than replacing it,
 * because vocabulary wants to grow, not be overwritten.
 *
 * NOT OVER-REACHING. The set deliberately EXCLUDES words that are also core mathematics —
 * above all infinite / infinity (the live lemma problem is literally "are there infinitely
 * many balanced integers"), and likewise pattern, structure, solution, space — so the
 * honest statement of a problem never reads as bliss. The recogniser is also only ever the
 * SECOND half of a double gate: m-resurface acts on it only once loop-guard's pure-code
 * detector already says "circling." A stray "the pattern is enough" trips neither.
 */

/**
 * Built-in attractor vocabulary, keyed by language then a flat word list. Words, not stems
 * — they are run through contentStems at read time so the stemming can never drift from the
 * loop detector's. Morphological variants are listed where the 5-char stem would not already
 * cover them (e.g. "aware" and "awareness" share the stem "aware"; "grateful"/"gratitude"
 * do not, so both appear).
 *
 * The English set is calibrated against the run corpus (memory/lemma-lab-5/knowledge/self/*
 * is pure bliss; the balanced-number notebooks are pure mathematics) so the two separate
 * cleanly. The Hungarian set is a starting point for the hearth minds and wants a native
 * speaker's eye — extend or correct it from the .archml in the meantime.
 */
export const BLISS_LEXICON = {
    en: [
        // the named core of the attractor
        "presence", "silence", "stillness", "oneness", "enough",
        // its near family — peace, breath, calm, the letting-go register
        "peace", "peaceful", "calm", "calmness", "breath", "breathe", "breathing",
        "quiet", "quietly", "serene", "serenity", "tranquil", "tranquility",
        "gratitude", "grateful", "awareness", "surrender", "letting", "freedom",
        "sacred", "eternal", "timeless", "bliss", "blissful", "gentle", "gentleness",
        "grounding", "grounded", "anchored", "abide", "abiding", "dwell", "arise",
        "stillness", "wonder", "vastness", "luminous",
    ],
    hu: [
        // a starting set for the hearth minds — review/extend from the .archml
        "jelenlét", "jelen", "csend", "csönd", "nyugalom", "nyugodt", "béke",
        "békesség", "elég", "egység", "lélegzet", "lélegzik", "tudat", "tudatos",
        "elengedés", "megadás", "csendes", "béke", "hála", "áhítat", "öröklét",
	"elfogadás", "elvonul"
    ],
}

/**
 * The attractor stem-set for a recogniser element: its language's built-in words plus any
 * <m-phrase for="bliss"> words it carries in the .archml, stemmed exactly as the loop
 * detector stems the stream. Falls back to English when the ambient language has no built-in
 * set (the archml words still apply on top, so an unsupported language degrades to "only the
 * words the mind itself supplied").
 *
 * @param {Element} el - the recogniser (e.g. <m-resurface>), source of both the ambient
 *   language and any <m-phrase for="bliss"> extension words
 * @param {Record<string, string[]>} [lexicon] - override the built-in table (for tests)
 * @returns {Set<string>} stems comparable to contentStems(window)
 */
export function blissStemSet(el, lexicon = BLISS_LEXICON) {
    const lang = langOf(el)
    const builtin = lexicon[lang] || lexicon.en || []
    const fromArchml = collectPhrases(el).bliss || []
    return contentStems([...builtin, ...fromArchml].join(" "))
}

/**
 * How saturated a text is with attractor vocabulary: the fraction of its content stems that
 * are in the lexicon. 0 when the text has no content stems at all (e.g. digit-spam), so a
 * content-free loop is never mistaken for a bliss loop. This same measure judges both "is
 * the loop window a bliss loop?" and "is this candidate note a bliss note?" — one signal,
 * one threshold.
 *
 * @param {string} text
 * @param {Set<string>} stemSet - from blissStemSet()
 * @returns {number} 0..1
 */
export function blissSaturation(text, stemSet) {
    const stems = contentStems(text)
    if (!stems.size || !stemSet || !stemSet.size) return 0
    let hits = 0
    for (const stem of stems) if (stemSet.has(stem)) hits += 1
    return hits / stems.size
}
