import { MBaseComponent } from "../shared/mBaseComponent.js"
import {
    Prediction, PREDICTION_EVENT, PREDICTION_SETTLED_EVENT, MAX_LIVE_PREDICTIONS,
} from '../../infrastructure/predictionContracts.js'
import { evaluationsForEvidence } from '../../infrastructure/exactTextCompare.js'
import { isEvidenceView } from '../../infrastructure/evidenceView.js'

/**
 * Mind-scoped reference comparator. Indexes live predictions from `prediction` /
 * `prediction-settled` (fire, never pub). Exact-text equality after Unicode /
 * line-ending / outer-whitespace normalization. Never reads hidden world state.
 */
export class MCompare extends MBaseComponent {
    static provides = { comparator: true }

    _live = new Map()
    _bindGen = 0
    _host = null

    onConnect() {
        super.onConnect()
        this._bindGen = (this._bindGen || 0) + 1
        const mind = this.membrane()
        this._host = mind
        if (!mind) return
        mind.addEventListener(PREDICTION_EVENT, this._onPrediction)
        mind.addEventListener(PREDICTION_SETTLED_EVENT, this._onSettled)
    }

    onDisconnect() {
        this._bindGen = (this._bindGen || 0) + 1
        if (this._host) {
            this._host.removeEventListener(PREDICTION_EVENT, this._onPrediction)
            this._host.removeEventListener(PREDICTION_SETTLED_EVENT, this._onSettled)
        }
        this._host = null
        this._live.clear()
    }

    accepts(evidenceView) {
        return isEvidenceView(evidenceView)
    }

    evaluate(evidenceView, { now = Date.now(), deadline, signal } = {}) {
        try {
            if (signal?.aborted) return []
            if (deadline != null && now >= deadline) return []
            if (!this.accepts(evidenceView)) return []
            return evaluationsForEvidence([...this._live.values()], evidenceView, {
                now, deadline, signal,
                producer: this.attr('name') || this.localName || 'm-compare',
            })
        } catch {
            return []
        }
    }

    _onPrediction = event => {
        const prediction = event.detail
        if (!(prediction instanceof Prediction)) return
        while (this._live.size >= MAX_LIVE_PREDICTIONS) {
            const oldest = this._live.keys().next().value
            this._live.delete(oldest)
        }
        this._live.set(prediction.id, prediction)
    }

    _onSettled = event => {
        const id = event.detail?.predictionId
        if (typeof id === 'string' && id) this._live.delete(id)
    }
}
