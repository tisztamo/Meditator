/** Shared comparison choreography for evidence owners (m-act, m-region).
 *
 * The runner owns: budget reservation, deadline and abort timer, evaluate under
 * `awaitUntilAbort`, budget release, ordered wait, the deadline/abort re-check
 * that zeroes evaluations, comparator-loss admission (empty evaluations, still
 * commit), finally cleanup.
 *
 * Owners keep: claiming, view construction, awareness (region), percept
 * construction, and dispatch. `revalidate` is the owner's attachment/sleep/
 * version check after the wait — false drops the case (no commit). Comparator
 * rebinding is not a drop: it admits with no evaluations, like timeout.
 */

import { Evaluation } from './perceptionContracts.js'
import {
    asEvaluations, compareDeadlineMs, awaitUntilAbort, DEFAULT_COMPARE_DEADLINE_MS,
} from './compareContinuation.js'

export const MIND_SLEEPING_EVENT = 'mind-sleeping'

/**
 * @param {object} opts
 * @param {object} opts.owner            for isConnected / deadline attr
 * @param {object} opts.view             projected evidence view (private)
 * @param {object|null} opts.comparator  resolved by the owner; required here
 * @param {number} [opts.comparatorGen]
 * @param {() => object|null} [opts.liveComparator]
 * @param {object} opts.budget           CompareBudget
 * @param {object} opts.order            per-lane CommitOrder
 * @param {Set} opts.aborts              owner's live AbortController set
 * @param {() => boolean} opts.revalidate  owner-specific checks after the wait
 * @param {(evaluations: object[]) => void} [opts.commit]
 * @returns {Promise<object[]|null>} evaluations, or null when the case is dropped
 */
export async function runEvidenceCase({
    owner,
    view,
    comparator,
    comparatorGen,
    liveComparator,
    budget,
    order,
    aborts,
    revalidate,
    commit,
}) {
    if (!comparator) {
        const empty = []
        commit?.(empty)
        return empty
    }

    const reserved = budget.tryAcquire()
    const ticket = order.enqueue()
    const controller = new AbortController()
    aborts.add(controller)
    const deadline = Date.now() + compareDeadlineMs(owner, DEFAULT_COMPARE_DEADLINE_MS)
    const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()))
    let releasedBudget = !reserved

    try {
        let evaluations = []
        if (reserved && typeof comparator.accepts === 'function' && comparator.accepts(view)) {
            try {
                const raw = await awaitUntilAbort(comparator.evaluate(view, {
                    now: Date.now(), deadline, signal: controller.signal,
                }), controller.signal)
                if (!controller.signal.aborted && Date.now() < deadline) {
                    evaluations = asEvaluations(raw, Evaluation)
                }
            } catch {
                evaluations = []
            }
        }
        if (reserved && !releasedBudget) {
            budget.release()
            releasedBudget = true
        }
        await ticket.wait()
        if (typeof revalidate === 'function' && !revalidate()) return null
        const live = typeof liveComparator === 'function' ? liveComparator() : comparator
        if (live !== comparator || live?._bindGen !== comparatorGen) evaluations = []
        if (controller.signal.aborted || Date.now() >= deadline) evaluations = []
        commit?.(evaluations)
        return evaluations
    } finally {
        clearTimeout(timer)
        aborts.delete(controller)
        if (!releasedBudget) budget.release()
        ticket.complete()
    }
}
