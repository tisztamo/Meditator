import { MBaseComponent } from "../shared/mBaseComponent.js"
import {
    PREDICTION_EVENT, PREDICTION_SETTLED_EVENT,
} from '../../infrastructure/predictionContracts.js'
import { evaluationsForEvidence, evaluationsForTargets } from '../../infrastructure/exactTextCompare.js'
import { isEvidenceView } from '../../infrastructure/evidenceView.js'
import { createLivePredictionIndex } from '../../infrastructure/livePredictionIndex.js'
import { createLiveSearchIndex } from '../../infrastructure/liveSearchIndex.js'
import { part } from "../shared/enclosure.js"

/**
 * Mind-scoped reference comparator. Indexes live predictions from `prediction` /
 * `prediction-settled` (fire, never pub). Exact-text equality after Unicode /
 * line-ending / outer-whitespace normalization. Never reads hidden world state.
 * Duplicate comparator in one membrane fails at connect.
 */
export class MCompare extends MBaseComponent {
    static provides = { comparator: true }

    _index = createLivePredictionIndex()
    _targets = createLiveSearchIndex()
    _bindGen = 0
    _host = null

    onConnect() {
        super.onConnect()
        this._bindGen = (this._bindGen || 0) + 1
        const mind = this.membrane()
        this._host = mind
        if (!mind) return
        const others = part(mind, 'comparator').filter(el => el !== this)
        if (others.length) {
            throw new Error('a mind may have only one comparator')
        }
        mind.addEventListener(PREDICTION_EVENT, this._onPrediction)
        mind.addEventListener(PREDICTION_SETTLED_EVENT, this._onSettled)
        mind.addEventListener(this._targets.events.target, this._onTarget)
        mind.addEventListener(this._targets.events.outcome, this._onTargetOutcome)
    }

    onDisconnect() {
        this._bindGen = (this._bindGen || 0) + 1
        if (this._host) {
            this._host.removeEventListener(PREDICTION_EVENT, this._onPrediction)
            this._host.removeEventListener(PREDICTION_SETTLED_EVENT, this._onSettled)
            this._host.removeEventListener(this._targets.events.target, this._onTarget)
            this._host.removeEventListener(this._targets.events.outcome, this._onTargetOutcome)
        }
        this._host = null
        this._index.clear()
        this._targets.clear()
    }

    get _live() { return this._index }

    accepts(evidenceView) {
        return isEvidenceView(evidenceView)
    }

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

    _onPrediction = event => this._index.onPrediction(event)
    _onSettled = event => this._index.onSettled(event)
    _onTarget = event => this._targets.onTarget(event)
    _onTargetOutcome = event => this._targets.onOutcome(event)
}
