import { MBaseComponent } from "../shared/mBaseComponent.js"
import { Evaluation } from '../../infrastructure/perceptionContracts.js'
import {
    PREDICTION_EVENT, PREDICTION_SETTLED_EVENT,
} from '../../infrastructure/predictionContracts.js'
import { isEvidenceView, normalizeCompareText } from '../../infrastructure/evidenceView.js'
import { createLivePredictionIndex } from '../../infrastructure/livePredictionIndex.js'
import { part } from "../shared/enclosure.js"

/**
 * Match-only containment comparator. Match when the normalized expectation
 * (≤ 6 tokens) occurs in the normalized evidence text; otherwise insufficient.
 * Never mismatch. Optional B2 condition — skip unless expect is a short phrase.
 */
export class MContain extends MBaseComponent {
    static provides = { comparator: true }

    _index = createLivePredictionIndex()
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
    }

    onDisconnect() {
        this._bindGen = (this._bindGen || 0) + 1
        if (this._host) {
            this._host.removeEventListener(PREDICTION_EVENT, this._onPrediction)
            this._host.removeEventListener(PREDICTION_SETTLED_EVENT, this._onSettled)
        }
        this._host = null
        this._index.clear()
    }

    accepts(evidenceView) {
        return isEvidenceView(evidenceView)
    }

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

    _onPrediction = event => this._index.onPrediction(event)
    _onSettled = event => this._index.onSettled(event)
}
