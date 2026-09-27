/** Shared live-prediction index for comparators behind the `comparator` port.
 * Indexes `prediction` / `prediction-settled` (fire, never pub). Capped.
 * A prediction arrives as its plain record (message-rule.md, M2) and is kept only
 * when a component sent it: authority is the sender, not the payload's class. */

import { predictionRecord, MAX_LIVE_PREDICTIONS } from './predictionContracts.js'
import { sentByComponent } from './messageOrigin.js'

export function createLivePredictionIndex({ max = MAX_LIVE_PREDICTIONS } = {}) {
    const live = new Map()
    return {
        get size() { return live.size },
        values() { return [...live.values()] },
        clear() { live.clear() },
        onPrediction(event) {
            if (!sentByComponent(event)) return
            const prediction = predictionRecord(event.detail)
            if (!prediction) return
            while (live.size >= max) {
                const oldest = live.keys().next().value
                live.delete(oldest)
            }
            live.set(prediction.id, prediction)
        },
        onSettled(event) {
            const id = event.detail?.predictionId
            if (typeof id === 'string' && id) live.delete(id)
        },
    }
}
