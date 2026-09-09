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

function freezeSignals(signals) {
    return Object.freeze({
        changeMagnitude: signals.changeMagnitude,
        requested: signals.requested,
        novelty: signals.novelty === undefined ? null : signals.novelty,
    });
}

function freezeEvaluationIds(evaluationIds) {
    if (evaluationIds == null) return Object.freeze([]);
    if (!Array.isArray(evaluationIds)) throw new Error('evaluationIds is a list of ids');
    return Object.freeze(evaluationIds.map(id => {
        if (typeof id !== 'string' || !id) throw new Error('evaluationIds is a list of ids');
        return id;
    }));
}

/** The mutable competition record. The percept is the evidence; this is the bid
 * on it. Nested arbiters append a gain-trail entry and recompute `salience`
 * through decideBid with the signal set and floor stored at issue; they never
 * write the evidence. A bid has its own `id`; receipts credit `evidenceId`
 * (the percept id). */
export class AttentionBid {
    constructor({ evidence, gainTrail = [], signals, requestedFloor = 0, evaluationIds = [] } = {}) {
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
        });
        Object.defineProperty(this, 'evidence', {
            value: evidence,
            enumerable: false,
            writable: false,
            configurable: false,
        });
        Object.defineProperty(this, 'signals', {
            value: signalSet,
            enumerable: false,
            writable: false,
            configurable: false,
        });
        Object.defineProperty(this, 'requestedFloor', {
            value: requestedFloor,
            enumerable: false,
            writable: false,
            configurable: false,
        });
        this.salience = decideBid({
            evidence,
            signals: signalSet,
            gainTrail: this.gainTrail,
            requestedFloor,
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
     * and the floor used at issue, times the updated trail. Multiplying
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
