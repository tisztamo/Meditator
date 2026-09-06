import { randomUUID } from 'node:crypto';
import { clamp01, Percept } from './percept.js';

/** Read surface existing listeners already use. Not a second Percept: no
 * provenance, policy, gateTrail, or renditions. `salience` is the bid's own
 * gained value, not delegated. `infoton` is a writable hop envelope, copied
 * at construction so fire() can stamp the message without touching evidence. */
const DELEGATED = ['source', 'type', 'reason', 'dateTime', 'clearsTail', 'from', 'episode'];

function trailProduct(gainTrail) {
    return gainTrail.reduce((product, entry) => product * entry.factor, 1);
}

function copyTrail(gainTrail) {
    if (gainTrail == null) return [];
    if (!Array.isArray(gainTrail)) throw new Error('gain trail is a list');
    return gainTrail.map(entry => Object.freeze({ gate: entry.gate, factor: entry.factor }));
}

/** The mutable competition record. The percept is the evidence; this is the bid
 * on it. Nested arbiters append a gain-trail entry and recompute `salience`;
 * they never write the evidence. A bid has its own `id`; receipts credit
 * `evidenceId` (the percept id). */
export class AttentionBid {
    constructor({ evidence, gainTrail = [] } = {}) {
        if (!(evidence instanceof Percept)) throw new Error('An attention bid needs Percept evidence');
        this.id = randomUUID();
        this.evidenceId = evidence.id;
        this.createdAt = new Date().toISOString();
        this.gainTrail = copyTrail(gainTrail);
        this.decisions = [];
        this.urgent = evidence.policy.preempt === true;
        this.bypassAdmission = evidence.policy.bypassAdmission === true;
        this.infoton = evidence.infoton;
        this.salience = clamp01(evidence.salience * trailProduct(this.gainTrail));
        Object.defineProperty(this, 'evidence', {
            value: evidence,
            enumerable: false,
            writable: false,
            configurable: false,
        });
        for (const key of DELEGATED) {
            Object.defineProperty(this, key, {
                enumerable: true,
                configurable: false,
                get() { return this.evidence[key]; },
            });
        }
    }

    /** Recompute gained salience from frozen evidence × the trail. Arbiter
     * factors may be > 1; they are competition, not enclosure, so they must
     * not go through pushGainTrail. */
    recomputeSalience() {
        this.salience = clamp01(this.evidence.salience * trailProduct(this.gainTrail));
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
