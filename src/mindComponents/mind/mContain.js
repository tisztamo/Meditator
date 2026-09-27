import { MComparator } from "../shared/comparators.js"
import { Evaluation } from '../../infrastructure/perceptionContracts.js'
import { normalizeCompareText } from '../../infrastructure/evidenceView.js'

/**
 * Match-only containment comparator. Match when the normalized expectation
 * (≤ 6 tokens) occurs in the normalized evidence text; otherwise insufficient.
 * Never mismatch. Optional B2 condition — skip unless expect is a short phrase.
 */
export class MContain extends MComparator {
    evaluate(evidenceView, { now = Date.now(), deadline, signal } = {}) {
        try {
            if (signal?.aborted) return []
            if (deadline != null && now >= deadline) return []
            if (!this.accepts(evidenceView)) return []
            if (evidenceView.progress === true) return []
            const actual = normalizeCompareText(evidenceView.archivalText || '')
            if (!actual) return []
            const out = []
            for (const prediction of this._index.values()) {
                if (!prediction.actId || evidenceView.actId !== prediction.actId) continue
                const expected = normalizeCompareText(prediction.representation?.value || '')
                if (!expected) continue
                const tokens = expected.split(/\s+/).filter(Boolean)
                if (tokens.length === 0 || tokens.length > 6) {
                    out.push(this._evaluation(evidenceView, prediction, 'insufficient', now))
                    continue
                }
                const verdict = actual.includes(expected) ? 'match' : 'insufficient'
                out.push(this._evaluation(evidenceView, prediction, verdict, now))
            }
            return out
        } catch {
            return []
        }
    }

    _evaluation(view, prediction, verdict, now) {
        return new Evaluation({
            producer: this.attr('name') || this.localName || 'm-contain',
            subject: { kind: 'prediction', id: prediction.id },
            evidenceIds: [view.id],
            verdict,
            basisAt: now,
        })
    }
}
