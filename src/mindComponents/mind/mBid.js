import { MBaseComponent } from "../shared/mBaseComponent.js"
import { AttentionBid, independentSignals } from '../../infrastructure/attentionBid.js'
import { predictionSignalsFromEvaluations, targetSignalFromEvaluations } from '../../infrastructure/bidderPolicy.js'
import { evaluationIdsOf } from '../../infrastructure/compareContinuation.js'

function unitAttr(host, name) {
    const raw = host.attr(name)
    if (raw == null || raw === '') return 0
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0 || n > 1) {
        throw new Error(`${name} must be a number in [0, 1], got ${JSON.stringify(raw)}`)
    }
    return n
}

/**
 * Owner-local reference bidder. Mounted under `m-region` or `m-act` (not the mind).
 * `expectedFloor` and `mismatchWeight` default to 0 so mounting without attrs does
 * not retune salience. Match/mismatch slots come from committed Evaluation verdicts;
 * missing evaluation is null, not match.
 */
export class MBid extends MBaseComponent {
    static provides = { bidder: true }

    createBid({ evidence, evaluations, gainTrail, requestedFloor } = {}) {
        const { predictionMatch, predictionMismatch } = predictionSignalsFromEvaluations(evaluations)
        return new AttentionBid({
            evidence,
            gainTrail,
            requestedFloor: requestedFloor ?? 0,
            expectedFloor: unitAttr(this, 'expectedFloor'),
            mismatchWeight: unitAttr(this, 'mismatchWeight'),
            evaluationIds: evaluationIdsOf(evaluations),
            signals: independentSignals({
                changeMagnitude: evidence.salience,
                requested: evidence.requestId != null,
                novelty: null,
                predictionMatch,
                predictionMismatch,
                targetMatch: targetSignalFromEvaluations(evaluations),
                causalAttribution: null,
                confidence: null,
            }),
        })
    }
}
