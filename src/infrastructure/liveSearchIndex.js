/** Shared live-search-target index for comparators behind the `comparator` port.
 * Indexes `search-target` / `search-outcome` (fire, never pub). One active target
 * is the first controller's rule; the index still caps. */

import { SearchTarget, SEARCH_TARGET_EVENT, SEARCH_OUTCOME_EVENT } from './predictionContracts.js'

const MAX_LIVE_TARGETS = 8

export function createLiveSearchIndex({ max = MAX_LIVE_TARGETS } = {}) {
    const live = new Map()
    return {
        get size() { return live.size },
        values() { return [...live.values()] },
        clear() { live.clear() },
        onTarget(event) {
            const target = event.detail
            if (!(target instanceof SearchTarget)) return
            while (live.size >= max) {
                const oldest = live.keys().next().value
                live.delete(oldest)
            }
            live.set(target.id, target)
        },
        onOutcome(event) {
            const id = event.detail?.targetId
            if (typeof id === 'string' && id) live.delete(id)
        },
        events: { target: SEARCH_TARGET_EVENT, outcome: SEARCH_OUTCOME_EVENT },
    }
}
