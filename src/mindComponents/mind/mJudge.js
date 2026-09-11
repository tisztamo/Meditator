import { MBaseComponent } from "../shared/mBaseComponent.js"
import { Evaluation } from '../../infrastructure/perceptionContracts.js'
import {
    PREDICTION_EVENT, PREDICTION_SETTLED_EVENT,
} from '../../infrastructure/predictionContracts.js'
import { isEvidenceView } from '../../infrastructure/evidenceView.js'
import { createLivePredictionIndex } from '../../infrastructure/livePredictionIndex.js'
import { createLiveSearchIndex } from '../../infrastructure/liveSearchIndex.js'
import { judgePrompt, parseJudgeReply } from '../../infrastructure/judgeCompare.js'
import { complete } from '../../modelAccess/llm.js'
import { resolveModelRef } from '../../modelAccess/modelConfig.js'
import { part } from "../shared/enclosure.js"

/**
 * Declared tier-2 comparator. Sends expectation and evidence text to a model.
 * An architecture that has not wired it makes no such call. Duplicate comparator
 * in one membrane fails at connect.
 *
 * Attributes: model (default ancestor utilityModel), maxTokens (60), temperature (0).
 */
export class MJudge extends MBaseComponent {
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

    accepts(evidenceView) {
        return isEvidenceView(evidenceView)
    }

    async evaluate(evidenceView, { now = Date.now(), deadline, signal } = {}) {
        try {
            if (signal?.aborted) return []
            if (deadline != null && now >= deadline) return []
            if (!this.accepts(evidenceView)) return []
            if (evidenceView.progress === true) return []
            const text = typeof evidenceView.archivalText === 'string' ? evidenceView.archivalText.trim() : ''
            if (!text) return []

            const prediction = this._matchingPrediction(evidenceView)
            const targets = this._matchingTargets(evidenceView)
            if (!prediction && !targets.length) return []

            const out = []
            if (prediction) {
                const expected = prediction.representation?.value
                if (typeof expected === 'string' && expected.trim()) {
                    const judged = await this._judge(expected, text, { deadline, signal })
                    if (signal?.aborted || (deadline != null && Date.now() >= deadline)) {
                        out.push(this._evaluation(evidenceView, 'prediction', prediction.id, 'insufficient', 0, now))
                    } else {
                        out.push(this._evaluation(evidenceView, 'prediction', prediction.id, judged.verdict, judged.confidence, now))
                    }
                }
            }
            for (const target of targets) {
                if (signal?.aborted || (deadline != null && Date.now() >= deadline)) {
                    out.push(this._evaluation(evidenceView, 'target', target.id, 'insufficient', 0, now))
                    continue
                }
                const judged = await this._judge(target.template, text, { deadline, signal })
                if (signal?.aborted || (deadline != null && Date.now() >= deadline)) {
                    out.push(this._evaluation(evidenceView, 'target', target.id, 'insufficient', 0, now))
                } else {
                    out.push(this._evaluation(evidenceView, 'target', target.id, judged.verdict, judged.confidence, now))
                }
            }
            return out
        } catch {
            return []
        }
    }

    _matchingPrediction(view) {
        const actId = view.actId
        if (typeof actId !== 'string' || !actId) return null
        const eventType = view.eventType
        for (const prediction of this._index.values()) {
            if (prediction.actId !== actId) continue
            const target = prediction.target || {}
            if (target.eventType != null && eventType != null && target.eventType !== eventType) continue
            if (target.sourceId != null && target.sourceId !== view.sourceId) continue
            if (target.modality != null && target.modality !== view.modality) continue
            return prediction
        }
        return null
    }

    _matchingTargets(view) {
        const sourceId = view.sourceId
        if (typeof sourceId !== 'string' || !sourceId) return []
        const now = Date.now()
        return this._targets.values().filter(target => {
            if (Date.parse(target.deadline) <= now) return false
            return (target.routes || []).some(route => route.source === sourceId)
        })
    }

    async _complete(opts) {
        return complete(opts)
    }

    async _judge(expectText, evidenceText, { deadline, signal } = {}) {
        const model = resolveModelRef(this.attr('model') || this.env('utilityModel'), 'utility')
        const maxTokens = Number(this.attr('maxTokens') || 60)
        const temperature = Number(this.attr('temperature') ?? 0)
        try {
            const result = await this._complete({
                model,
                maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 60,
                temperature: Number.isFinite(temperature) ? temperature : 0,
                prompt: judgePrompt({ expectText, evidenceText }),
                debugTag: 'judge-compare',
                debugEl: this,
                signal,
            })
            return parseJudgeReply(result?.text || '')
        } catch {
            return { verdict: 'insufficient', confidence: 0 }
        }
    }

    _evaluation(view, kind, id, verdict, confidence, now) {
        return new Evaluation({
            producer: this.attr('name') || this.localName || 'm-judge',
            subject: { kind, id },
            evidenceIds: [view.id],
            verdict,
            confidence,
            basisAt: now,
        })
    }

    _onPrediction = event => this._index.onPrediction(event)
    _onSettled = event => this._index.onSettled(event)
    _onTarget = event => this._targets.onTarget(event)
    _onTargetOutcome = event => this._targets.onOutcome(event)
}
