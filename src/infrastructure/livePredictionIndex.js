/** Shared live-prediction index for comparators behind the `comparator` port.
 * Indexes `prediction` / `prediction-settled` (fire, never pub). Capped. */

import { Prediction, MAX_LIVE_PREDICTIONS } from './predictionContracts.js'

export function createLivePredictionIndex({ max = MAX_LIVE_PREDICTIONS } = {}) {
    const live = new Map()
    return {
        get size() { return live.size },
        values() { return [...live.values()] },
        clear() { live.clear() },
        onPrediction(event) {
            const prediction = event.detail
            if (!(prediction instanceof Prediction)) return
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
