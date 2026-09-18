import { MBaseComponent } from "../shared/mBaseComponent.js"
import { Evaluation } from '../../infrastructure/perceptionContracts.js'
import {
    PREDICTION_EVENT, PREDICTION_SETTLED_EVENT,
} from '../../infrastructure/predictionContracts.js'
import { isEvidenceView } from '../../infrastructure/evidenceView.js'
import { createLivePredictionIndex } from '../../infrastructure/livePredictionIndex.js'
import { createLiveSearchIndex } from '../../infrastructure/liveSearchIndex.js'
import { judgePrompt, parseJudgeReply, JUDGE_MAX_TOKENS, JUDGE_VERDICTS } from '../../infrastructure/judgeCompare.js'
import { complete } from '../../modelAccess/llm.js'
import { decide, verdictChoice, readChoice } from '../../modelAccess/decide.js'
import { resolveModelRef } from '../../modelAccess/modelConfig.js'
import { logger } from '../../infrastructure/logger.js'
import { part } from "../shared/enclosure.js"

const log = logger('mJudge.js')

/**
 * Declared tier-2 comparator. Sends expectation and evidence text to a model.
 * An architecture that has not wired it makes no such call. Duplicate comparator
 * in one membrane fails at connect.
 *
 * Attributes: model, maxTokens (JUDGE_MAX_TOKENS), temperature (0).
 *
 * The model resolves: this element's `model`, else a `judgeModel` on any
 * ancestor (usually `<m-mind>`), else the `judge` role under the active profile.
 * It deliberately does NOT follow the ancestor `utilityModel` — a comparator
 * that grades the mind's own evidence is worth choosing on its own, and under
 * `local-voice` the judge runs local while utility stays cloud.
 *
 * Which ENGINE answers follows from that model and nothing else. A completion
 * provider is asked in prose and the reply is parsed; a provider whose `kind` is
 * `decision` (TypeSafe's Jev) is asked the same question as a question, through
 * decide(). Both return `{verdict, confidence}`, so the comparator port, the
 * bidder and the ledger cannot tell which one spoke — which is the point: the
 * seam was built for this replacement. See doc/research/expect-study.md §2.7–2.8.
 */
export class MJudge extends MBaseComponent {
    static provides = { comparator: true }

    _index = createLivePredictionIndex()
    _targets = createLiveSearchIndex()
    _bindGen = 0
    _host = null

    /** Provenance of the last judgement: which engine answered, the version the
     * endpoint pinned, how long it took. Not part of the Evaluation contract
     * (that is frozen and carries no provenance field) — it is read by tests and
     * written to the process log, which is where a study picks the trace up. */
    lastJudgement = null


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

    async _decide(opts) {
        return decide(opts)
    }

    async _judge(expectText, evidenceText, { deadline, signal } = {}) {
        const model = resolveModelRef(this.attr('model') || this.env('judgeModel'), 'judge')
        if (model?.kind === 'decision') {
            return this._judgeByDecision(model, expectText, evidenceText, { deadline, signal })
        }
        const maxTokens = Number(this.attr('maxTokens') || JUDGE_MAX_TOKENS)
        const temperature = Number(this.attr('temperature') ?? 0)
        const startedAt = Date.now()
        try {
            const result = await this._complete({
                model,
                maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : JUDGE_MAX_TOKENS,
                temperature: Number.isFinite(temperature) ? temperature : 0,
                prompt: judgePrompt({ expectText, evidenceText }),
                debugTag: 'judge-compare',
                debugEl: this,
                signal,
            })
            const judged = parseJudgeReply(result?.text || '')
            this._noteJudgement({
                engine: 'completion', model: model?.model ?? null,
                latencyMs: Date.now() - startedAt, ...judged,
            })
            return judged
        } catch {
            return { verdict: 'insufficient', confidence: 0 }
        }
    }

    /**
     * The System-One path. The same question, asked as a question: one `choice`
     * whose `criteria` are the three verdict glosses, over a state of
     * `{expected, perceived}` with the perception as the layer narrated it. That
     * is the arm Phase 2 picked — it beat the two-`noul` decomposition and the
     * raw-payload state on the B1 ledger (expect-study §2.7).
     *
     * `confidence` is passed through unchanged. It is not a decoded number but a
     * statistic of the answer's distribution, and on that ledger every pair it
     * answered above 0.9 was a pair the reader labelled the same way, so
     * `bidderPolicy` multiplying by it means something here in a way it did not
     * with the text judge's self-report.
     *
     * A soft failure — a timeout inside the compare deadline, a 429 cooldown, a
     * malformed answer — reads `insufficient` at zero confidence, the same safe
     * direction a truncated LLM reply takes.
     */
    async _judgeByDecision(model, expectText, evidenceText, { deadline, signal } = {}) {
        try {
            const result = await this._decide({
                model,
                state: {
                    expected: typeof expectText === 'string' ? expectText : '',
                    perceived: typeof evidenceText === 'string' ? evidenceText : '',
                },
                questions: { verdict: verdictChoice() },
                deadline,
                signal,
                debugTag: 'judge-compare',
                debugEl: this,
            })
            if (!result) {
                this._noteJudgement({
                    engine: 'decision', model: model?.model ?? null,
                    verdict: 'insufficient', confidence: 0, softFail: true,
                })
                return { verdict: 'insufficient', confidence: 0 }
            }
            const { value, confidence } = readChoice(result.answers?.verdict)
            const verdict = JUDGE_VERDICTS.has(value) ? value : 'insufficient'
            const judged = { verdict, confidence: verdict === value ? confidence : 0 }
            this._noteJudgement({
                engine: 'decision',
                // What the endpoint resolved "jev-latest" to; another version is
                // another measurement, so the trace pins it per judgement.
                model: result.model || model?.model || null,
                latencyMs: result.latencyMs ?? null,
                cost: result.usage?.cost ?? null,
                ...judged,
            })
            return judged
        } catch {
            return { verdict: 'insufficient', confidence: 0 }
        }
    }

    /** One line per judgement, whichever engine answered: the live-judge analysis
     * reads the trace back out of the process log, and an arm is only comparable
     * with the other if both wrote it. */
    _noteJudgement(note) {
        this.lastJudgement = note
        log.info(`judge[${note.engine}] model=${note.model} verdict=${note.verdict} `
            + `confidence=${Number(note.confidence).toFixed(3)} latencyMs=${note.latencyMs ?? 'n/a'}`
            + `${note.cost != null ? ` cost=${note.cost.toFixed(8)}` : ''}${note.softFail ? ' softFail=1' : ''}`)
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
