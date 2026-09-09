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

/** Tiny publisher: always `host.fire`, never `host.pub`. Not attached to m-act. */
export function firePrediction(host, prediction) {
    if (!(prediction instanceof Prediction)) throw new Error('firePrediction publishes a Prediction');
    if (host == null || typeof host.fire !== 'function') {
        throw new Error('prediction events use fire(), not pub()');
    }
    return host.fire(PREDICTION_EVENT, prediction);
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
