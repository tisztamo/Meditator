import { Evaluation } from './perceptionContracts.js'
import { Prediction } from './predictionContracts.js'
import { normalizeCompareText, isEvidenceView } from './evidenceView.js'

function targetMatches(target, view) {
    const t = target && typeof target === 'object' ? target : {}
    if (t.sourceId != null && t.sourceId !== view.sourceId) return false
    if (t.modality != null && t.modality !== view.modality) return false
    if (t.eventType != null && t.eventType !== view.eventType) return false
    return true
}

function timedOut({ now, deadline, signal }) {
    if (signal?.aborted) return true
    if (deadline != null && Number.isFinite(deadline) && now >= deadline) return true
    return false
}

function tokenCount(text) {
    return text.split(/\s+/).filter(Boolean).length
}

/** Side-effect-free exact-text evaluations. Match/mismatch is literal equality, not semantics. */
export function evaluationsForEvidence(predictions, view, {
    now = Date.now(), deadline, signal, producer = 'm-compare',
} = {}) {
    if (timedOut({ now, deadline, signal })) return []
    if (!isEvidenceView(view)) return []
    // A progress line is not the world answering; do not judge it.
    if (view.progress === true) return []
    const list = Array.isArray(predictions) ? predictions : []
    const incomplete = !view.archivalText.trim()
    const out = []
    for (const prediction of list) {
        const t = Date.now()
        if (timedOut({ now: t, deadline, signal })) return []
        if (!(prediction instanceof Prediction)) continue
        if (!prediction.actId || view.actId !== prediction.actId) continue
        if (!targetMatches(prediction.target, view)) continue
        const expired = Date.parse(prediction.validUntil) <= now
        const kind = prediction.representation?.kind
        let verdict
        if (expired || incomplete || kind !== 'text') {
            verdict = 'insufficient'
        } else {
            const expected = normalizeCompareText(prediction.representation.value)
            const actual = normalizeCompareText(view.archivalText)
            if (expected == null || actual == null || expected === '' || actual === '') {
                verdict = 'insufficient'
            } else if (expected === actual) {
                verdict = 'match'
            } else if (tokenCount(expected) >= 8 || tokenCount(actual) >= 8) {
                // Ordinary prose is not a confident exact-fixture mismatch.
                verdict = 'insufficient'
            } else {
                verdict = 'mismatch'
            }
        }
        out.push(new Evaluation({
            producer,
            subject: { kind: 'prediction', id: prediction.id },
            evidenceIds: [view.id],
            verdict,
            basisAt: now,
        }))
    }
    return out
}

function routeMatchesView(target, view) {
    const routes = Array.isArray(target?.routes) ? target.routes : []
    if (!routes.length) return false
    return routes.some(route => route.source === view.sourceId)
}

/** Exact-text evaluations of live search targets. Fixture condition; labelled so. */
export function evaluationsForTargets(targets, view, {
    now = Date.now(), deadline, signal, producer = 'm-compare',
} = {}) {
    if (timedOut({ now, deadline, signal })) return []
    if (!isEvidenceView(view)) return []
    if (view.progress === true) return []
    const list = Array.isArray(targets) ? targets : []
    const incomplete = !view.archivalText.trim()
    const out = []
    for (const target of list) {
        const t = Date.now()
        if (timedOut({ now: t, deadline, signal })) return []
        if (!target || typeof target.template !== 'string' || !target.id) continue
        if (!routeMatchesView(target, view)) continue
        const expired = Date.parse(target.deadline) <= now
        let verdict
        if (expired || incomplete) {
            verdict = 'insufficient'
        } else {
            const expected = normalizeCompareText(target.template)
            const actual = normalizeCompareText(view.archivalText)
            if (expected == null || actual == null || expected === '' || actual === '') {
                verdict = 'insufficient'
            } else if (expected === actual) {
                verdict = 'match'
            } else if (tokenCount(expected) >= 8 || tokenCount(actual) >= 8) {
                verdict = 'insufficient'
            } else {
                verdict = 'mismatch'
            }
        }
        out.push(new Evaluation({
            producer,
            subject: { kind: 'target', id: target.id },
            evidenceIds: [view.id],
            verdict,
            basisAt: now,
        }))
    }
    return out
}
