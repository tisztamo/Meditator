import { MComparator } from "../shared/comparators.js"
import { evaluationsForEvidence, evaluationsForTargets } from '../../infrastructure/exactTextCompare.js'

/**
 * Mind-scoped reference comparator. Indexes live predictions from `prediction` /
 * `prediction-settled` (fire, never pub). Exact-text equality after Unicode /
 * line-ending / outer-whitespace normalization. Never reads hidden world state.
 * Duplicate comparator in one membrane fails at connect. Answers the owners'
 * `compare` requests through MComparator (shared/comparators.js).
 */
export class MCompare extends MComparator {
    get _live() { return this._index }

    evaluate(evidenceView, { now = Date.now(), deadline, signal } = {}) {
        try {
            if (signal?.aborted) return []
            if (deadline != null && now >= deadline) return []
            if (!this.accepts(evidenceView)) return []
            if (evidenceView.progress === true) return []
            const producer = this.attr('name') || this.localName || 'm-compare'
            const predictions = evaluationsForEvidence(this._index.values(), evidenceView, {
                now, deadline, signal, producer,
            })
            const targets = evaluationsForTargets(this._targets.values(), evidenceView, {
                now, deadline, signal, producer,
            })
            return [...predictions, ...targets]
        } catch {
            return []
        }
    }
}
