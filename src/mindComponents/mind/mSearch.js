import { MBaseComponent } from "../shared/mBaseComponent.js"
import { part } from "../shared/enclosure.js"
import {
    ControlRequest, CONTROL_RESULT_EVENT, EdgeEvidence, EDGE_EVIDENCE_EVENT,
} from '../../infrastructure/perceptionContracts.js'
import {
    SearchTarget, SearchAttempt, SearchOutcome,
    fireSearchTarget, fireSearchOutcome,
    EVALUATION_COMMIT_EVENT, SEARCH_OUTCOME_STATUSES,
} from '../../infrastructure/predictionContracts.js'
import { Evaluation } from '../../infrastructure/perceptionContracts.js'
import { parseTime } from '../../config/timeParser.js'
import { MIND_SLEEPING_EVENT } from '../../infrastructure/evidenceCase.js'
import { logger } from '../../infrastructure/logger.js'

const log = logger('mSearch.js')

/**
 * First search controller: one active target, declared routes, id-only handoff.
 * Coverage is distinct completed routes / declared routes. Outcomes are internally
 * derived, never a Sense-* percept.
 *
 * Two matchers, chosen per route by the source's declared tier, never by this
 * component's own policy:
 *
 *  - **tier 0** (the default and the control arm): `ControlRequest.template`
 *    stays null, nothing about what is sought reaches the source, and the match
 *    is made after materialization by the comparator — so a closed aperture
 *    cannot be searched through at all.
 *  - **tier 1**: a source that declares `tier="1"` and a `decider` gets the
 *    template on its request and answers with an `EdgeEvidence` score. A score
 *    at or above `matchThreshold` completes the route as a match; below it, as a
 *    comparable non-match. The candidate text stays inside the source; only the
 *    number and its provenance cross, and they cross while the aperture is
 *    closed. The score is never fed to the contact regulator as a change header
 *    (perceptual-membrane.md#processing-tiers).
 *
 * Attributes: sampleBudget, deadline, attemptTimeout, matchThreshold (0.7).
 */
export class MSearch extends MBaseComponent {
    static provides = { search: true }

    _live = null
    _attempt = null
    _timer = null
    _host = null
    _gen = 0

    onConnect() {
        super.onConnect()
        const mind = this.membrane()
        this._host = mind
        if (!mind) return
        const others = part(mind, 'search').filter(el => el !== this)
        if (others.length) throw new Error('a mind may have only one search controller')
        mind.addEventListener(CONTROL_RESULT_EVENT, this._onControlResult)
        mind.addEventListener(EVALUATION_COMMIT_EVENT, this._onCommit)
        mind.addEventListener(EDGE_EVIDENCE_EVENT, this._onEdgeEvidence)
        mind.addEventListener(MIND_SLEEPING_EVENT, this._onSleeping)
    }

    onDisconnect() {
        this._gen++
        this._clearTimer()
        if (this._live) this._settle('abandoned', 'disconnect')
        if (this._host) {
            this._host.removeEventListener(CONTROL_RESULT_EVENT, this._onControlResult)
            this._host.removeEventListener(EVALUATION_COMMIT_EVENT, this._onCommit)
            this._host.removeEventListener(EDGE_EVIDENCE_EVENT, this._onEdgeEvidence)
            this._host.removeEventListener(MIND_SLEEPING_EVENT, this._onSleeping)
        }
        this._host = null
    }

    start(target) {
        if (!(target instanceof SearchTarget)) throw new Error('start requires a SearchTarget')
        if (this._live) this.cancel(this._live.target.id, 'replaced')
        fireSearchTarget(this, target)
        this._gen++
        this._live = {
            target,
            generation: this._gen,
            inspected: new Set(),
            attemptedSamples: 0,
            evidenceIds: [],
            evaluationIds: [],
            routeIndex: 0,
        }
        this._issueNext()
        return target.id
    }

    observe({ requestId, evidenceId, evaluations } = {}) {
        this._noteEvidence(requestId, evidenceId, evaluations)
    }

    cancel(targetId, reason = 'cancelled') {
        if (!this._live || this._live.target.id !== targetId) return null
        return this._settle('abandoned', reason)
    }

    _issueNext() {
        const live = this._live
        if (!live) return
        if (Date.now() >= Date.parse(live.target.deadline)) {
            this._settle('budget-exhausted', 'deadline')
            return
        }
        if (live.attemptedSamples >= live.target.sampleBudget) {
            this._settle('budget-exhausted', 'sample-budget')
            return
        }
        if (live.inspected.size === live.target.routes.length) {
            this._settle('not-detected-in-inspected-area', 'coverage')
            return
        }
        const routes = live.target.routes
        const route = routes[live.routeIndex % routes.length]
        live.routeIndex++
        live.attemptedSamples++
        const attemptTimeout = parseTime(this.attr('attemptTimeout') || '8s')
        const attemptDeadlineMs = Math.min(
            Date.parse(live.target.deadline),
            Date.now() + (Number.isFinite(attemptTimeout) && attemptTimeout > 0 ? attemptTimeout : 8000),
        )
        const attempt = new SearchAttempt({
            targetId: live.target.id,
            actId: live.target.actId,
            route,
            ordinal: live.attemptedSamples,
            deadline: new Date(attemptDeadlineMs).toISOString(),
        })
        const aperture = this._apertureNamed(route.aperture)
        // The template travels only to a source that declared it can ground it.
        // A tier-0 source is told nothing about what is sought — that is the
        // control arm and the no-leak guarantee both.
        const grounded = this._groundedRoute(aperture, route.source)
        const request = new ControlRequest({
            id: attempt.id,
            kind: 'focus',
            issuedBy: this.attr('name') || 'search',
            target: route.source,
            reason: 'search',
            actId: live.target.actId,
            targetId: grounded ? live.target.id : null,
            deadline: attemptDeadlineMs,
            template: grounded ? live.target.template : null,
        })
        this._attempt = {
            record: attempt,
            state: 'issued',
            evidenceTaken: false,
            grounded,
            edge: null,
        }
        const delivered = aperture && typeof aperture.requestControl === 'function'
            ? aperture.requestControl(request)
            : false
        if (!delivered) {
            this._completeAttempt('refused')
            return
        }
        this._clearTimer()
        const wait = Math.max(1, attemptDeadlineMs - Date.now())
        const gen = live.generation
        this._timer = setTimeout(() => {
            if (!this._live || this._live.generation !== gen) return
            if (!this._attempt || this._attempt.record.id !== attempt.id) return
            if (this._attempt.state !== 'issued') return
            this._completeAttempt('timed-out')
        }, wait)
    }

    /** A route is edge-grounded when its source's own contract says so: tier 1
     * plus a decider. Read from the frozen SourceContract through the aperture,
     * never from the element. */
    _groundedRoute(aperture, source) {
        const contract = typeof aperture?.contractFor === 'function' ? aperture.contractFor(source) : null
        return contract?.tier === 1 && !!contract.decider
    }

    _matchThreshold() {
        const raw = Number(this.attr('matchThreshold'))
        return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.7
    }

    /** A tier-1 score for the live attempt. The number decides the route; the
     * source's text never arrives and is never asked for. */
    _onEdgeEvidence = event => {
        const evidence = event.detail
        const live = this._live
        const attempt = this._attempt
        if (!(evidence instanceof EdgeEvidence) || !live || !attempt) return
        if (attempt.state !== 'issued') return
        if (evidence.requestId !== attempt.record.id) return
        if (evidence.sourceName !== attempt.record.route.source) return
        attempt.edge = evidence
        this._completeAttempt(evidence.score >= this._matchThreshold()
            ? 'comparable-match'
            : 'comparable-nonmatch')
    }

    _completeAttempt(state) {
        const live = this._live
        const attempt = this._attempt
        if (!live || !attempt) return
        this._clearTimer()
        attempt.state = state
        const routeKey = `${attempt.record.route.aperture}:${attempt.record.route.source}`
        if (state === 'comparable-match') {
            live.inspected.add(routeKey)
            this._settle('found', attempt.edge ? 'edge-match' : 'match')
            return
        }
        if (state === 'comparable-nonmatch') {
            live.inspected.add(routeKey)
        }
        this._attempt = null
        if (live.inspected.size === live.target.routes.length) {
            this._settle('not-detected-in-inspected-area', 'coverage')
            return
        }
        if (live.attemptedSamples >= live.target.sampleBudget || Date.now() >= Date.parse(live.target.deadline)) {
            this._settle('budget-exhausted', state)
            return
        }
        this._issueNext()
    }

    _noteEvidence(requestId, evidenceId, evaluations) {
        const live = this._live
        const attempt = this._attempt
        if (!live || !attempt || attempt.record.id !== requestId) return
        if (attempt.evidenceTaken) return
        attempt.evidenceTaken = true
        const list = Array.isArray(evaluations) ? evaluations : []
        if (evidenceId) live.evidenceIds.push(evidenceId)
        for (const evaluation of list) {
            if (evaluation instanceof Evaluation) live.evaluationIds.push(evaluation.id)
        }
        const targetVerdicts = list
            .filter(e => e?.subject?.kind === 'target' && e.subject.id === live.target.id)
            .map(e => e.verdict)
        if (targetVerdicts.includes('match')) {
            this._completeAttempt('comparable-match')
            return
        }
        if (targetVerdicts.includes('mismatch')) {
            this._completeAttempt('comparable-nonmatch')
            return
        }
        this._completeAttempt('insufficient')
    }

    _onControlResult = event => {
        const detail = event.detail
        const attempt = this._attempt
        if (!attempt || !detail || detail.requestId !== attempt.record.id) return
        if (attempt.state !== 'issued') return
        if (detail.accepted === true) return
        // On a grounded route the refusal is the expected case, not the answer:
        // the aperture is closed to the text while the tier-1 score is still
        // being made behind it. Wait for the score (or the attempt timeout).
        if (attempt.grounded) return
        this._completeAttempt('refused')
    }

    _onCommit = event => {
        const commit = event.detail
        if (!commit || !this._attempt || commit.requestId !== this._attempt.record.id) return
        if (this._attempt.evidenceTaken) return
        const live = this._live
        const subjects = Array.isArray(commit.subjects) ? commit.subjects : []
        const targetVerdicts = subjects
            .filter(s => s.kind === 'target')
            .map(s => s.verdict)
        const fallback = !subjects.length && Array.isArray(commit.verdicts) ? commit.verdicts : targetVerdicts
        const evaluations = fallback.map(verdict => ({
            subject: { kind: 'target', id: live.target.id },
            verdict,
        }))
        this._noteEvidence(commit.requestId, commit.evidenceId, evaluations)
    }

    _onSleeping = () => {
        if (this._live) this._settle('abandoned', 'sleep')
    }

    _settle(status, reason) {
        const live = this._live
        if (!live) return null
        if (!SEARCH_OUTCOME_STATUSES.includes(status)) status = 'abandoned'
        this._clearTimer()
        this._attempt = null
        this._live = null
        const routes = live.target.routes
        const inspectedRoutes = routes.filter(r => live.inspected.has(`${r.aperture}:${r.source}`))
        const coverage = routes.length ? inspectedRoutes.length / routes.length : 0
        const outcome = new SearchOutcome({
            targetId: live.target.id,
            status,
            evidenceIds: live.evidenceIds,
            evaluationIds: live.evaluationIds,
            inspectedRoutes,
            attemptedSamples: live.attemptedSamples,
            coverage,
            reason,
        })
        fireSearchOutcome(this, outcome)
        log.debug(`search ${status} coverage=${coverage.toFixed(2)} samples=${live.attemptedSamples}`)
        return outcome
    }

    _apertureNamed(name) {
        const mind = this.membrane()
        if (!mind || !name) return null
        let found = null
        const walk = node => {
            for (const el of part(node, 'aperture')) {
                const n = el.getAttribute('name') || el.localName
                if (n === name) { found = el; return }
                walk(el)
                if (found) return
            }
        }
        walk(mind)
        return found
    }

    _clearTimer() {
        if (this._timer) {
            clearTimeout(this._timer)
            this._timer = null
        }
    }
}
