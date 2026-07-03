import { MObserver } from "./mObserver.js"
import { makePhrasebook } from "../shared/i18n.js"
import { loopScore } from "../shared/loopMath.js"
import { logger } from '../../infrastructure/logger.js';

const log = logger('mLoopGuard.js');

// The repetition math lives in the neutral loopMath util now (loop-detection-redesign.md):
// this guard imports it as a library rather than owning it. Re-exported here so existing
// importers (and the unit test) keep working unchanged.
export { loopScore, contentStems, containment, ngrams, jaccard } from "../shared/loopMath.js"

/**
 * The change-of-direction stimulus, as localizable phrases. The English defaults are
 * verbatim what this guard has always raised; a non-English mind overrides them by
 * dropping <m-phrase for="notice"> / <m-phrase for="redirect"> into the .archml (i18n.js).
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
