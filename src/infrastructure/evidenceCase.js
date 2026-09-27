/** Shared comparison choreography for evidence owners (m-act, m-region).
 *
 * The runner owns: budget reservation, deadline and abort timer, the `compare`
 * request (shared/comparators.js) with a cancel on abort, budget release, ordered
 * wait, the deadline/abort re-check that zeroes evaluations, comparator-loss
 * admission (empty evaluations, still commit), finally cleanup.
 *
 * Owners keep: claiming, view construction, awareness (region), percept
 * construction, and dispatch. `revalidate` is the owner's attachment/sleep/
 * version check after the wait — false drops the case (no commit). A comparator
 * that left or was replaced during the wait is not a drop: it admits with no
 * evaluations, like timeout.
 */

import { compareDeadlineMs, DEFAULT_COMPARE_DEADLINE_MS } from './compareContinuation.js'

/**
 * @param {object} opts
 * @param {object} opts.owner            asks (request) and carries the deadline attr
 * @param {object} opts.view             projected evidence view (private)
 * @param {string|null} opts.comparator  the comparator's name (comparatorOf); required here
 * @param {() => string|null} [opts.liveComparator]  its name now, after the wait
 * @param {(owner, comparator, view, {deadline, signal}) => Promise<object[]>} opts.ask
 * @param {object} opts.budget           CompareBudget
 * @param {object} opts.order            per-lane CommitOrder
 * @param {Set} opts.aborts              owner's live AbortController set
 * @param {() => boolean} opts.revalidate  owner-specific checks after the wait
 * @param {(evaluations: object[]) => void|Promise} [opts.commit]  awaited inside
 *   the lane's order, so what it sends keeps the commit order
 * @returns {Promise<object[]|null>} evaluations, or null when the case is dropped
 */
export async function runEvidenceCase({
    owner,
    view,
    comparator,
    liveComparator,
    ask,
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
        if (reserved) {
            try {
                const answered = await ask(owner, comparator, view, { deadline, signal: controller.signal })
                if (!controller.signal.aborted && Date.now() < deadline) evaluations = answered
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
        if (live !== comparator) evaluations = []
        if (controller.signal.aborted || Date.now() >= deadline) evaluations = []
        await commit?.(evaluations)
        return evaluations
    } finally {
        clearTimeout(timer)
        aborts.delete(controller)
        if (!releasedBudget) budget.release()
        ticket.complete()
    }
}
