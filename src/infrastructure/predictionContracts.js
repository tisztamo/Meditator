import { randomUUID } from 'node:crypto';

/** Ceiling on a prediction's validity window. Matches the default intent-cooldown
 * horizon on m-act: a live expectation may not outlive that window, and may not
 * be published with an unbounded lifetime. */
export const MAX_PREDICTION_LIFETIME_MS = 15 * 60 * 1000;

/** Membrane-local delivery. `fire()` / `@event`, never a retained `pub()` topic —
 * a retained topic would replay the last prediction to a later comparator. */
export const PREDICTION_EVENT = 'prediction';
export const PREDICTION_SETTLED_EVENT = 'prediction-settled';
export const PREDICTION_DELIVERY = 'fire';
export const EVALUATION_COMMIT_EVENT = 'evaluation-commit';
export const EVALUATION_COMMIT_DELIVERY = 'fire';
export const MAX_LIVE_PREDICTIONS = 32;

export const PREDICTION_KIND = 'belief';
export const PREDICTION_SETTLEMENT_STATUSES = Object.freeze([
    'matched', 'mismatched', 'expired', 'cancelled',
]);

function requireText(name, value) {
    if (typeof value !== 'string' || !value) throw new Error(`${name} is required`);
    return value;
}

function optionalId(name, value) {
    if (value == null) return null;
    if (typeof value !== 'string' || !value) {
        throw new Error(`${name} is association, keyed by id`);
    }
    return value;
}

function nowIso() {
    return new Date().toISOString();
}

function toIso(value, name) {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
    if (typeof value === 'number' && Number.isFinite(value)) {
        const iso = new Date(value).toISOString();
        if (iso !== 'Invalid Date') return iso;
    }
    if (typeof value === 'string' && value) {
        const ms = Date.parse(value);
        if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }
    throw new Error(`${name} must be a valid time`);
}

function freezeTarget(target) {
    if (target == null) return Object.freeze({});
    if (typeof target !== 'object') throw new Error('Prediction.target is structured metadata, not text');
    const next = {};
    if (target.sourceId != null) next.sourceId = requireText('target.sourceId', target.sourceId);
    if (target.modality != null) next.modality = requireText('target.modality', target.modality);
    if (target.eventType != null) next.eventType = requireText('target.eventType', target.eventType);
    return Object.freeze(next);
}

function freezeRepresentation(representation) {
    if (representation == null || typeof representation !== 'object') {
        throw new Error('Prediction.representation needs { kind: \'text\', value }');
    }
    if (representation.kind !== 'text') {
        throw new Error(`Unknown representation.kind: ${representation.kind}`);
    }
    if (typeof representation.value !== 'string' || !representation.value.trim()) {
        throw new Error('Prediction.representation.value is required text');
    }
    return Object.freeze({ kind: 'text', value: representation.value });
}

function freezeBasis(basis) {
    if (basis == null || typeof basis !== 'object') {
        throw new Error('Prediction.basis needs { kind: \'realize\', text }');
    }
    if (basis.kind !== 'realize') {
        throw new Error(`Unknown basis.kind: ${basis.kind}`);
    }
    if (typeof basis.text !== 'string' || !basis.text.trim()) {
        throw new Error('Prediction.basis.text is required');
    }
    return Object.freeze({ kind: 'realize', text: basis.text });
}

/** A prior expectation. Identity and clocks are substrate-owned. Settlement is a
 * separate event payload — this record is never rewritten to carry a status.
 * REALIZE produces a belief prediction, not simulator truth. Target identity
 * comes from trusted capability metadata, never from representation text.
 * `actId` is association, not proof of causation. */
export class Prediction {
    constructor({
        id, producer, scopeId, actId = null, kind = PREDICTION_KIND, target,
        representation, basis, basisAt, validFrom, validUntil,
    } = {}) {
        void id;
        void basisAt;
        void validFrom;
        this.id = randomUUID();
        this.producer = requireText('Prediction.producer', producer);
        this.scopeId = requireText('Prediction.scopeId', scopeId);
        this.actId = optionalId('Prediction.actId', actId);
        if (kind !== PREDICTION_KIND) throw new Error(`Unknown Prediction.kind: ${kind}`);
        this.kind = PREDICTION_KIND;
        this.target = freezeTarget(target);
        this.representation = freezeRepresentation(representation);
        this.basis = freezeBasis(basis);
        const issued = nowIso();
        this.basisAt = issued;
        this.validFrom = issued;
        if (validUntil == null || validUntil === '') {
            throw new Error('Prediction.validUntil is required and bounded');
        }
        this.validUntil = toIso(validUntil, 'validUntil');
        const span = Date.parse(this.validUntil) - Date.parse(this.validFrom);
        if (!(span > 0) || span > MAX_PREDICTION_LIFETIME_MS) {
            throw new Error(`Prediction.validUntil must be after validFrom and within ${MAX_PREDICTION_LIFETIME_MS}ms`);
        }
        Object.freeze(this);
    }
}

/** Completion of a live prediction. Not a field on Prediction; expiry is not mismatch. */
export function predictionSettlement(prediction, { status, evaluationIds = [], reason = null, settledAt } = {}) {
    if (!(prediction instanceof Prediction)) {
        throw new Error('settlement refers to a Prediction');
    }
    if (!PREDICTION_SETTLEMENT_STATUSES.includes(status)) {
        throw new Error(`Unknown settlement status: ${status}`);
    }
    if (!Array.isArray(evaluationIds)) throw new Error('evaluationIds is a list of ids');
    void settledAt;
    return Object.freeze({
        predictionId: prediction.id,
        status,
        evaluationIds: Object.freeze(evaluationIds.map(id => {
            if (typeof id !== 'string' || !id) throw new Error('evaluationIds is a list of ids');
            return id;
        })),
        settledAt: nowIso(),
        reason: reason == null ? null : requireText('settlement.reason', reason),
    });
}

export function expirePrediction(prediction, { reason = 'expired' } = {}) {
    return predictionSettlement(prediction, { status: 'expired', evaluationIds: [], reason });
}

export function cancelPrediction(prediction, { reason = 'cancelled' } = {}) {
    return predictionSettlement(prediction, { status: 'cancelled', evaluationIds: [], reason });
}

/** A Prediction as it crosses (message-rule.md, M2): a frozen plain record with
 * the issuer's id and clocks kept. It validates the same fields the class does,
 * so it also rebuilds a received plain object, and returns null for anything that
 * is not a prediction. Authority is not in it: a receiver trusts a prediction
 * only when a component sent it (messageOrigin.js). */
export function predictionRecord(data) {
    if (data == null || typeof data !== 'object') return null;
    try {
        if ((data.kind ?? PREDICTION_KIND) !== PREDICTION_KIND) return null;
        return Object.freeze({
            id: requireText('Prediction.id', data.id),
            producer: requireText('Prediction.producer', data.producer),
            scopeId: requireText('Prediction.scopeId', data.scopeId),
            actId: optionalId('Prediction.actId', data.actId),
            kind: PREDICTION_KIND,
            target: freezeTarget(data.target),
            representation: freezeRepresentation(data.representation),
            basis: freezeBasis(data.basis),
            basisAt: toIso(data.basisAt, 'basisAt'),
            validFrom: toIso(data.validFrom, 'validFrom'),
            validUntil: toIso(data.validUntil, 'validUntil'),
        });
    } catch {
        return null;
    }
}

/** Tiny publisher: always `host.fire`, never `host.pub`. Not attached to m-act.
 * The event carries the prediction's record, never the instance. */
export function firePrediction(host, prediction) {
    if (!(prediction instanceof Prediction)) throw new Error('firePrediction publishes a Prediction');
    if (host == null || typeof host.fire !== 'function') {
        throw new Error('prediction events use fire(), not pub()');
    }
    return host.fire(PREDICTION_EVENT, predictionRecord(prediction));
}

export function firePredictionSettlement(host, settlement) {
    if (settlement == null || typeof settlement !== 'object' || typeof settlement.predictionId !== 'string') {
        throw new Error('firePredictionSettlement publishes a settlement payload');
    }
    if (host == null || typeof host.fire !== 'function') {
        throw new Error('prediction events use fire(), not pub()');
    }
    return host.fire(PREDICTION_SETTLED_EVENT, settlement);
}

const COMMIT_VERDICTS = Object.freeze(['match', 'mismatch', 'insufficient']);

function freezeIdList(name, ids = []) {
    if (!Array.isArray(ids)) throw new Error(`${name} is a list of ids`);
    return Object.freeze(ids.map(id => {
        if (typeof id !== 'string' || !id) throw new Error(`${name} is a list of ids`);
        return id;
    }));
}

/** Id-only commit after an evidence owner revalidates. No expectation or archival text. */
export function evaluationCommitPayload({
    evaluationIds = [], verdicts = [], evidenceId, actId = null, predictionId = null,
    requestId = null, subjects = [],
} = {}) {
    const ids = freezeIdList('evaluationIds', evaluationIds);
    const frozenVerdicts = Object.freeze(verdicts.map(verdict => {
        if (!COMMIT_VERDICTS.includes(verdict)) throw new Error(`Unknown evaluation verdict: ${verdict}`);
        return verdict;
    }));
    if (ids.length !== frozenVerdicts.length) {
        throw new Error('evaluation-commit pairs each id with a verdict');
    }
    return Object.freeze({
        evaluationIds: ids,
        verdicts: frozenVerdicts,
        evidenceId: evidenceId == null ? null : requireText('evidenceId', evidenceId),
        actId: actId == null ? null : requireText('actId', actId),
        predictionId: predictionId == null ? null : requireText('predictionId', predictionId),
        requestId: optionalId('requestId', requestId),
        subjects: freezeSubjects(subjects),
    });
}

export function fireEvaluationCommit(host, payload) {
    const commit = payload && payload.evaluationIds && Object.isFrozen(payload)
        ? payload
        : evaluationCommitPayload(payload);
    if (host == null || typeof host.fire !== 'function') {
        throw new Error('evaluation-commit uses fire(), not pub()');
    }
    return host.fire(EVALUATION_COMMIT_EVENT, commit);
}

function freezeSubjects(subjects = []) {
    if (!Array.isArray(subjects)) throw new Error('subjects is a list');
    return Object.freeze(subjects.map(subject => {
        if (!subject || typeof subject !== 'object') throw new Error('subjects entries are {kind, verdict}');
        const kind = subject.kind;
        const verdict = subject.verdict;
        if (kind !== 'prediction' && kind !== 'target') throw new Error(`Unknown subject.kind: ${kind}`);
        if (!COMMIT_VERDICTS.includes(verdict)) throw new Error(`Unknown evaluation verdict: ${verdict}`);
        return Object.freeze({ kind, verdict });
    }));
}

export const APERTURE_ORIENT_STATES = Object.freeze(['open', 'soft', 'narrow', 'closed']);
export const SEARCH_OUTCOME_STATUSES = Object.freeze([
    'found', 'not-detected-in-inspected-area', 'budget-exhausted', 'abandoned',
]);
export const SEARCH_TARGET_EVENT = 'search-target';
export const SEARCH_OUTCOME_EVENT = 'search-outcome';
export const MAX_SEARCH_LIFETIME_MS = MAX_PREDICTION_LIFETIME_MS;

function freezeRoute(route) {
    if (!route || typeof route !== 'object') throw new Error('SearchTarget.routes entries are {aperture, source}');
    const aperture = requireText('route.aperture', route.aperture);
    const source = requireText('route.source', route.source);
    return Object.freeze({ aperture, source });
}

/** Provider control, not source acquisition. Do not overload ControlRequest.kind. */
export class OrientationRequest {
    constructor({
        id, issuedBy, actId = null, aperture, state, source = null, reason, issuedAt, deadline = null,
    } = {}) {
        this.id = randomUUID();
        void id;
        this.issuedBy = requireText('OrientationRequest.issuedBy', issuedBy);
        this.actId = optionalId('OrientationRequest.actId', actId);
        this.aperture = requireText('OrientationRequest.aperture', aperture);
        if (!APERTURE_ORIENT_STATES.includes(state)) {
            throw new Error(`Unknown OrientationRequest.state: ${state}`);
        }
        this.state = state;
        this.source = source == null || source === '' ? null : requireText('OrientationRequest.source', source);
        if (this.state === 'narrow' && !this.source) {
            throw new Error('Narrow orientation needs a source');
        }
        this.reason = requireText('OrientationRequest.reason', reason);
        void issuedAt;
        this.issuedAt = nowIso();
        this.deadline = deadline == null || deadline === '' ? null : toIso(deadline, 'OrientationRequest.deadline');
        Object.freeze(this);
    }
}

/** What a search is looking for. The template does not say the target exists. */
export class SearchTarget {
    constructor({
        id, owner, scopeId, actId = null, template, routes, sampleBudget, deadline, createdAt,
    } = {}) {
        void id;
        void createdAt;
        this.id = randomUUID();
        this.owner = requireText('SearchTarget.owner', owner);
        this.scopeId = requireText('SearchTarget.scopeId', scopeId);
        this.actId = optionalId('SearchTarget.actId', actId);
        this.template = requireText('SearchTarget.template', typeof template === 'string' ? template.trim() : template);
        if (!Array.isArray(routes) || !routes.length) {
            throw new Error('SearchTarget.routes is a non-empty list of {aperture, source}');
        }
        this.routes = Object.freeze(routes.map(freezeRoute));
        const budget = Number(sampleBudget);
        if (!Number.isFinite(budget) || budget <= 0) {
            throw new Error('SearchTarget.sampleBudget must be a positive number');
        }
        this.sampleBudget = budget;
        this.createdAt = nowIso();
        this.deadline = toIso(deadline, 'SearchTarget.deadline');
        const span = Date.parse(this.deadline) - Date.parse(this.createdAt);
        if (!(span > 0) || span > MAX_SEARCH_LIFETIME_MS) {
            throw new Error(`SearchTarget.deadline must be after createdAt and within ${MAX_SEARCH_LIFETIME_MS}ms`);
        }
        Object.freeze(this);
    }
}

/** One issued control request in a search. `id` is also the ControlRequest id. */
export class SearchAttempt {
    constructor({
        id, targetId, actId = null, route, ordinal, issuedAt, deadline,
    } = {}) {
        this.id = typeof id === 'string' && id ? id : randomUUID();
        this.targetId = requireText('SearchAttempt.targetId', targetId);
        this.actId = optionalId('SearchAttempt.actId', actId);
        this.route = freezeRoute(route);
        const n = Number(ordinal);
        if (!Number.isFinite(n) || n < 0) throw new Error('SearchAttempt.ordinal is a non-negative number');
        this.ordinal = n;
        void issuedAt;
        this.issuedAt = nowIso();
        this.deadline = toIso(deadline, 'SearchAttempt.deadline');
        Object.freeze(this);
    }
}

/** Internally derived. Never a Sense-* percept. */
export class SearchOutcome {
    constructor({
        id, targetId, status, evidenceIds = [], evaluationIds = [], inspectedRoutes = [],
        attemptedSamples = 0, coverage = 0, settledAt, reason = null,
    } = {}) {
        void id;
        void settledAt;
        this.id = randomUUID();
        this.targetId = requireText('SearchOutcome.targetId', targetId);
        if (!SEARCH_OUTCOME_STATUSES.includes(status)) {
            throw new Error(`Unknown SearchOutcome.status: ${status}`);
        }
        this.status = status;
        this.evidenceIds = freezeIdList('evidenceIds', evidenceIds);
        this.evaluationIds = freezeIdList('evaluationIds', evaluationIds);
        this.inspectedRoutes = Object.freeze((inspectedRoutes || []).map(freezeRoute));
        const samples = Number(attemptedSamples);
        if (!Number.isFinite(samples) || samples < 0) {
            throw new Error('SearchOutcome.attemptedSamples is a non-negative number');
        }
        this.attemptedSamples = samples;
        const cov = Number(coverage);
        if (!Number.isFinite(cov) || cov < 0 || cov > 1) {
            throw new Error('SearchOutcome.coverage is a unit');
        }
        this.coverage = cov;
        this.settledAt = nowIso();
        this.reason = reason == null || reason === '' ? null : requireText('SearchOutcome.reason', reason);
        Object.freeze(this);
    }
}

/** A SearchTarget as it crosses: a frozen plain record, the issuer's id and clocks
 * kept, or null when the data is not a search target (see predictionRecord). */
export function searchTargetRecord(data) {
    if (data == null || typeof data !== 'object') return null;
    try {
        if (!Array.isArray(data.routes) || !data.routes.length) return null;
        const budget = Number(data.sampleBudget);
        if (!Number.isFinite(budget) || budget <= 0) return null;
        return Object.freeze({
            id: requireText('SearchTarget.id', data.id),
            owner: requireText('SearchTarget.owner', data.owner),
            scopeId: requireText('SearchTarget.scopeId', data.scopeId),
            actId: optionalId('SearchTarget.actId', data.actId),
            template: requireText('SearchTarget.template', data.template),
            routes: Object.freeze(data.routes.map(freezeRoute)),
            sampleBudget: budget,
            createdAt: toIso(data.createdAt, 'SearchTarget.createdAt'),
            deadline: toIso(data.deadline, 'SearchTarget.deadline'),
        });
    } catch {
        return null;
    }
}

/** A SearchOutcome as it crosses: a frozen plain record, or null. */
export function searchOutcomeRecord(data) {
    if (data == null || typeof data !== 'object') return null;
    try {
        if (!SEARCH_OUTCOME_STATUSES.includes(data.status)) return null;
        const samples = Number(data.attemptedSamples);
        const coverage = Number(data.coverage);
        if (!Number.isFinite(samples) || samples < 0) return null;
        if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1) return null;
        return Object.freeze({
            id: requireText('SearchOutcome.id', data.id),
            targetId: requireText('SearchOutcome.targetId', data.targetId),
            status: data.status,
            evidenceIds: freezeIdList('evidenceIds', data.evidenceIds ?? []),
            evaluationIds: freezeIdList('evaluationIds', data.evaluationIds ?? []),
            inspectedRoutes: Object.freeze((data.inspectedRoutes || []).map(freezeRoute)),
            attemptedSamples: samples,
            coverage,
            settledAt: toIso(data.settledAt, 'SearchOutcome.settledAt'),
            reason: data.reason == null || data.reason === '' ? null : requireText('SearchOutcome.reason', data.reason),
        });
    } catch {
        return null;
    }
}

export function fireSearchTarget(host, target) {
    if (!(target instanceof SearchTarget)) throw new Error('fireSearchTarget publishes a SearchTarget');
    if (host == null || typeof host.fire !== 'function') {
        throw new Error('search-target events use fire(), not pub()');
    }
    return host.fire(SEARCH_TARGET_EVENT, searchTargetRecord(target));
}

export function fireSearchOutcome(host, outcome) {
    if (!(outcome instanceof SearchOutcome)) throw new Error('fireSearchOutcome publishes a SearchOutcome');
    if (host == null || typeof host.fire !== 'function') {
        throw new Error('search-outcome events use fire(), not pub()');
    }
    return host.fire(SEARCH_OUTCOME_EVENT, searchOutcomeRecord(outcome));
}
