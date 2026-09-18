import { MSense } from '../../../../src/mindComponents/mind/mSense.js'

/**
 * Test source for tier 1: a sense whose candidates are set by the test and whose
 * decision transport is stubbed, so the grounding path can be exercised with no
 * network and no key.
 *
 * `scores` maps a candidate's text to the `noul` the stubbed model returns for
 * it (default 0.1). `calls` records what was asked, so a test can assert that
 * the candidate text went into the decision call and nowhere else.
 */
export class MGroundedSense extends MSense {
    items = ['a quiet thing', 'the sought thing']
    scores = {}
    calls = []
    failDecide = false
    line = 'hello item'

    ready() { return true }

    async _decide(opts) {
        this.calls.push(opts)
        if (this.failDecide) return null
        const candidate = opts?.state?.candidate
        const noul = Number.isFinite(this.scores[candidate]) ? this.scores[candidate] : 0.1
        return {
            answers: { targetMatch: { type: 'noul', noul } },
            usage: { prompt_tokens: 40, completion_tokens: 0, cost: 0.0000017 },
            latencyMs: 12,
            model: 'jev-1.13.0-test',
        }
    }

    async onSense(request) {
        if (request && this.grounds()) await this.ground(request, this.items)
        // The ordinary path runs too: a closed aperture refuses it, an open one
        // admits it, and neither is the tier-1 score.
        return this.perceive(this.line, { salience: 0.55, changeKey: this.line })
    }
}
