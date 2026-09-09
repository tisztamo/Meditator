import { randomUUID } from 'node:crypto';
import { Percept } from './percept.js';
import { decideBid } from './perceptionContracts.js';

/** Read surface existing listeners already use. Not a second Percept: no
 * provenance, policy, gateTrail, or renditions. `salience` is the bid's own
 * gained value, not delegated. `infoton` is a writable hop envelope, copied
 * at construction so fire() can stamp the message without touching evidence. */
const DELEGATED = ['source', 'type', 'reason', 'dateTime', 'clearsTail', 'from', 'episode'];

function copyTrail(gainTrail) {
    if (gainTrail == null) return [];
    if (!Array.isArray(gainTrail)) throw new Error('gain trail is a list');
    return gainTrail.map(entry => Object.freeze({ gate: entry.gate, factor: entry.factor }));
}

function optionalUnit(name, value) {
    if (value === undefined) return null;
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`${name} must be a number in [0, 1] or null, got ${value}`);
    }
    return value;
}

/** Independent signal set. Unset optional slots are null, never 0-as-match. */
export function independentSignals({
    changeMagnitude, requested, novelty = null,
    predictionMatch = null, predictionMismatch = null,
    targetMatch = null, causalAttribution = null, confidence = null,
} = {}) {
    return Object.freeze({
        changeMagnitude,
        requested,
        novelty: novelty === undefined ? null : novelty,
        predictionMatch: optionalUnit('predictionMatch', predictionMatch),
        predictionMismatch: optionalUnit('predictionMismatch', predictionMismatch),
        targetMatch: optionalUnit('targetMatch', targetMatch),
        causalAttribution: optionalUnit('causalAttribution', causalAttribution),
        confidence: optionalUnit('confidence', confidence),
    });
}

function freezeSignals(signals) {
    return independentSignals(signals ?? {});
}

function freezeEvaluationIds(evaluationIds) {
    if (evaluationIds == null) return Object.freeze([]);
    if (!Array.isArray(evaluationIds)) throw new Error('evaluationIds is a list of ids');
    return Object.freeze(evaluationIds.map(id => {
        if (typeof id !== 'string' || !id) throw new Error('evaluationIds is a list of ids');
        return id;
    }));
}

function hide(object, key, value) {
    Object.defineProperty(object, key, {
        value,
        enumerable: false,
        writable: false,
        configurable: false,
    });
}

/** The mutable competition record. The percept is the evidence; this is the bid
 * on it. Nested arbiters append a gain-trail entry and recompute `salience`
 * through decideBid with the signal set and floors stored at issue; they never
 * write the evidence. A bid has its own `id`; receipts credit `evidenceId`
 * (the percept id). */
export class AttentionBid {
    constructor({
        evidence, gainTrail = [], signals, requestedFloor = 0,
        expectedFloor = 0, mismatchWeight = 0, evaluationIds = [],
    } = {}) {
        if (!(evidence instanceof Percept)) throw new Error('An attention bid needs Percept evidence');
        this.id = randomUUID();
        this.evidenceId = evidence.id;
        this.createdAt = new Date().toISOString();
        this.gainTrail = copyTrail(gainTrail);
        this.decisions = [];
        this.evaluationIds = freezeEvaluationIds(evaluationIds);
        this.urgent = evidence.policy.preempt === true;
        this.bypassAdmission = evidence.policy.bypassAdmission === true;
        this.infoton = evidence.infoton;
        const signalSet = freezeSignals(signals ?? {
            changeMagnitude: evidence.salience,
            requested: evidence.requestId != null,
            novelty: null,
            predictionMatch: null,
            predictionMismatch: null,
            targetMatch: null,
            causalAttribution: null,
            confidence: null,
        });
        hide(this, 'evidence', evidence);
        hide(this, 'signals', signalSet);
        hide(this, 'requestedFloor', requestedFloor);
        hide(this, 'expectedFloor', expectedFloor);
        hide(this, 'mismatchWeight', mismatchWeight);
        this.salience = decideBid({
            evidence,
            signals: signalSet,
            gainTrail: this.gainTrail,
            requestedFloor,
            expectedFloor,
            mismatchWeight,
        });
        for (const key of DELEGATED) {
            Object.defineProperty(this, key, {
                enumerable: true,
                configurable: false,
                get() { return this.evidence[key]; },
            });
        }
    }

    /** Recompute gained salience through decideBid with the stored signals
     * and the floors used at issue, times the updated trail. Multiplying
     * evidence.salience alone would wipe a requested floor on a zero-change
     * sample. Arbiter factors may be > 1; they are competition, not enclosure,
     * so they must not go through pushGainTrail. decideBid clamps after each
     * factor, so an amplifying hop cannot push salience past 1. */
    recomputeSalience() {
        this.salience = decideBid({
            evidence: this.evidence,
            signals: this.signals,
            gainTrail: this.gainTrail,
            requestedFloor: this.requestedFloor,
            expectedFloor: this.expectedFloor,
            mismatchWeight: this.mismatchWeight,
        });
        return this.salience;
    }

    renderForFrame() {
        return this.evidence.renderForFrame();
    }

    toString() {
        return this.evidence.toString();
    }

    /** A bid passes through. Anything else is coerced via Percept.fromInterrupt
     * and wrapped — legacy producers still raise InterruptRecords. */
    static from(detail) {
        if (detail instanceof AttentionBid) return detail;
        return new AttentionBid({ evidence: Percept.fromInterrupt(detail) });
    }

    /** The bid's evidence, or a Percept coerced from `x`. Frame assembly uses
     * this so a bid cannot mint a new percept id. */
    static evidenceOf(x) {
        if (x instanceof AttentionBid) return x.evidence;
        return Percept.fromInterrupt(x);
    }
}
