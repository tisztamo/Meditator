// The comparator port as messages (doc/architecture/message-rule.md, review §7 step 8).
//
// An evidence owner (m-region for a sensed percept, m-act for an act's consequence)
// asks the membrane's comparator whether the evidence matches a live expectation.
// Before the message rule the owner looked the comparator up and called
// accepts(view) / evaluate(view, {signal}) on it, reading Evaluation instances back
// and passing its AbortSignal in. Now it asks:
//
//   compare {view, deadline, expects?}  →  {evaluations: [plain Evaluation records]}
//   request-cancel {requestId}   (sleep, disconnect, the owner's own deadline)
//
// The request bubbles from the owner. The comparator answers from a listener bound
// on its membrane at connect (M4: an address, found once), and only for a request
// sent by a component inside that membrane. The membrane stops `compare`, because
// the view carries the evidence's private text. `deadline` is absolute (epoch ms):
// the owner's compare deadline, which the comparator's evaluate() honours as
// before. A cancel aborts the comparator's `signal`, so a model call in flight is
// abandoned on the comparator's side too, not only ignored by the owner.
//
// Order (M5). The prediction an act fires and the compare request for its
// consequence travel on different channels, and the second can arrive first. So
// an owner that knows which prediction the evidence answers names it in
// `expects` (prediction ids), and the comparator waits for those to be indexed
// before it evaluates — until the deadline or a cancel, then it evaluates with
// what it has.
//
// What the comparator hears: `prediction` / `prediction-settled` and
// `search-target` / `search-outcome` on the membrane, each a plain record
// (predictionContracts.js), kept only when a component sent it.
//
// Authoring surface (unchanged): a comparator extends MComparator and writes
// accepts(view) and evaluate(view, {now, deadline, signal}), returning Evaluations
// (or a Promise of them). Its live expectations are `this._index` and
// `this._targets`. One comparator per membrane: a second throws at connect.

import { MBaseComponent } from "./mBaseComponent.js"
import { membraneOf, part } from "./enclosure.js"
import { respond, responderName } from "../../infrastructure/requestReply.js"
import { sentByComponent } from "../../infrastructure/messageOrigin.js"
import { Evaluation } from "../../infrastructure/perceptionContracts.js"
import { PREDICTION_EVENT, PREDICTION_SETTLED_EVENT } from "../../infrastructure/predictionContracts.js"
import { isEvidenceView } from "../../infrastructure/evidenceView.js"
import { createLivePredictionIndex } from "../../infrastructure/livePredictionIndex.js"
import { createLiveSearchIndex } from "../../infrastructure/liveSearchIndex.js"
import { awaitUntilAbort } from "../../infrastructure/compareContinuation.js"
import { logger } from "../../infrastructure/logger.js"

const log = logger("comparators.js")

export const COMPARE_REQUEST = "compare"

/** An Evaluation as it crosses: its plain fields. */
export function evaluationData(evaluation) {
    return {
        id: evaluation.id,
        producer: evaluation.producer,
        subject: { kind: evaluation.subject.kind, id: evaluation.subject.id },
        evidenceIds: [...evaluation.evidenceIds],
        verdict: evaluation.verdict,
        confidence: evaluation.confidence,
        coverage: evaluation.coverage,
        basisAt: evaluation.basisAt,
        createdAt: evaluation.createdAt,
    }
}

/** Rebuild the Evaluations of a compare reply; a malformed entry is dropped. The
 *  constructor keeps the comparator's ids, so the commit and the bid cite them. */
export function evaluationsFrom(list) {
    if (!Array.isArray(list)) return []
    const out = []
    for (const data of list) {
        try {
            out.push(new Evaluation({
                ...data,
                confidence: data?.confidence ?? undefined,
                coverage: data?.coverage ?? undefined,
            }))
        } catch { /* not an evaluation */ }
    }
    return out
}

export class MComparator extends MBaseComponent {
    static provides = { comparator: true }

    _index = createLivePredictionIndex()
    _targets = createLiveSearchIndex()
    _bindGen = 0
    _host = null
    _inFlight = new Set()
    _indexWaiters = new Set()

    onConnect() {
        super.onConnect()
        this._bindGen = (this._bindGen || 0) + 1
        const mind = this.membrane()
        this._host = mind
        if (!mind) return
        const others = part(mind, "comparator").filter(el => el !== this)
        if (others.length) {
            throw new Error("a mind may have only one comparator")
        }
        mind.addEventListener(PREDICTION_EVENT, this._onPrediction)
        mind.addEventListener(PREDICTION_SETTLED_EVENT, this._onSettled)
        mind.addEventListener(this._targets.events.target, this._onTarget)
        mind.addEventListener(this._targets.events.outcome, this._onTargetOutcome)
        this._onCompare = respond(this, COMPARE_REQUEST,
            (detail, event, { signal }) => this._answerCompare(detail, event, signal), { on: mind })
    }

    onDisconnect() {
        this._bindGen = (this._bindGen || 0) + 1
        // A compare in flight ends now, with no evaluations: an unbound comparator
        // cannot vouch for an answer it finishes later.
        for (const controller of this._inFlight) controller.abort()
        this._inFlight.clear()
        if (this._host) {
            this._host.removeEventListener(PREDICTION_EVENT, this._onPrediction)
            this._host.removeEventListener(PREDICTION_SETTLED_EVENT, this._onSettled)
            this._host.removeEventListener(this._targets.events.target, this._onTarget)
            this._host.removeEventListener(this._targets.events.outcome, this._onTargetOutcome)
            if (this._onCompare) this._host.removeEventListener(COMPARE_REQUEST, this._onCompare)
        }
        this._onCompare = null
        this._host = null
        this._index.clear()
        this._targets.clear()
    }

    accepts(evidenceView) {
        return isEvidenceView(evidenceView)
    }

    evaluate() {
        return []
    }

    /** One compare request: {evaluations}, or undefined (abstain) for a request
     *  that is not this membrane's or not from a component. */
    async _answerCompare(detail, event, cancel) {
        const host = this._host
        if (!host || !sentByComponent(event) || membraneOf(event.target) !== host) return undefined
        const view = detail?.view
        const deadline = Number.isFinite(detail?.deadline) ? detail.deadline : undefined
        const gen = this._bindGen
        const controller = new AbortController()
        const onCancel = () => controller.abort()
        if (cancel?.aborted) controller.abort()
        cancel?.addEventListener("abort", onCancel, { once: true })
        this._inFlight.add(controller)
        try {
            if (controller.signal.aborted || !this.accepts(view)) return { evaluations: [] }
            await this._whenIndexed(detail?.expects, deadline, controller.signal)
            if (controller.signal.aborted || gen !== this._bindGen) return { evaluations: [] }
            let raw
            try {
                raw = await awaitUntilAbort(this.evaluate(view, {
                    now: Date.now(), deadline, signal: controller.signal,
                }), controller.signal)
            } catch (error) {
                log.warn(`${responderName(this)}: evaluate threw: ${error?.message || error}`)
                raw = []
            }
            if (controller.signal.aborted || gen !== this._bindGen) return { evaluations: [] }
            const evaluations = Array.isArray(raw) ? raw.filter(e => e instanceof Evaluation) : []
            return { evaluations: evaluations.map(evaluationData) }
        } finally {
            cancel?.removeEventListener("abort", onCancel)
            this._inFlight.delete(controller)
        }
    }

    /** Resolve once every id in `ids` is a live prediction here, or at the
     *  deadline, or on abort — never later, and never rejecting. */
    _whenIndexed(ids, deadline, signal) {
        const wanted = Array.isArray(ids) ? ids.filter(id => typeof id === "string" && id) : []
        const indexed = () => {
            const live = new Set(this._index.values().map(p => p.id))
            return wanted.every(id => live.has(id))
        }
        if (!wanted.length || indexed() || signal.aborted) return Promise.resolve()
        return new Promise(resolve => {
            const waiter = { check: () => { if (indexed()) done() } }
            const timer = setTimeout(() => done(), Math.max(0, (deadline ?? Date.now()) - Date.now()))
            const done = () => {
                clearTimeout(timer)
                signal.removeEventListener("abort", done)
                this._indexWaiters.delete(waiter)
                resolve()
            }
            signal.addEventListener("abort", done, { once: true })
            this._indexWaiters.add(waiter)
        })
    }

    _onPrediction = event => {
        this._index.onPrediction(event)
        for (const waiter of [...this._indexWaiters]) waiter.check()
    }
    _onSettled = event => this._index.onSettled(event)
    _onTarget = event => this._targets.onTarget(event)
    _onTargetOutcome = event => this._targets.onOutcome(event)
}

/**
 * The owner's side (m-region, m-act): the membrane's comparator as a NAME (M4), or
 * null when there is none or more than one (then comparison is skipped, with one
 * warning per owner). Recomputed per case, so a comparator that left or was
 * replaced is noticed after the wait.
 */
export function comparatorOf(owner) {
    const mind = owner.membrane?.()
    if (!mind) return null
    const found = part(mind, "comparator")
    if (found.length > 1) {
        if (!owner._warnedDuplicateComparator) {
            owner._warnedDuplicateComparator = true
            log.warn("a mind may have only one comparator; comparison is skipped")
        }
        return null
    }
    return found[0] ? responderName(found[0]) : null
}

/**
 * Ask the comparator named `comparator` about `view`, until `deadline` (epoch ms)
 * or until `signal` aborts (which sends the cancel). `expects`: the ids of the
 * predictions the evidence answers, when the owner knows them (see Order above).
 * Resolves to the rebuilt Evaluations — [] for no answer, an error, a cancel, or
 * a reply from anyone else.
 */
export async function askComparator(owner, comparator, view, { deadline, signal, expects = null }) {
    const data = { view: { ...view }, deadline }
    if (Array.isArray(expects) && expects.length) data.expects = [...expects]
    const reply = await owner.request(COMPARE_REQUEST, data, {
        deadline: Math.max(0, deadline - Date.now()),
        signal,
    })
    if (reply.status !== "ok" || reply.from !== comparator) return []
    return evaluationsFrom(reply.data?.evaluations)
}
