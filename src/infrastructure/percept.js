import { createHash, randomUUID } from 'node:crypto';
import { InterruptRecord } from './interruptRecord.js';
import { GateVerdict, legacyCompatibility } from './perceptionContracts.js';

export const clamp01 = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Private edge header. No payload, filename, transcript, or source-supplied policy.
 * Change keys are opaque even in debug output. Materialization lives in a private field.
 */
export class PerceptCandidate {
    #materialize;

    constructor({ changeMagnitude = 0, changeKey = '', occurredAt = Date.now() } = {}, materialize) {
        if (typeof materialize !== 'function') throw new Error('A candidate needs a lazy materializer');
        this.id = randomUUID();
        this.occurredAt = Number.isFinite(occurredAt) ? occurredAt : Date.now();
        this.changeMagnitude = clamp01(changeMagnitude);
        this.changeKey = createHash('sha256').update(String(changeKey).slice(0, 256)).digest('hex');
        this.#materialize = materialize;
        Object.freeze(this);
    }

    async materialize() {
        const text = await this.#materialize(['text']);
        if (typeof text !== 'string' || !text.trim()) throw new Error('A percept needs archival text');
        return text;
    }
}

/** Text-first admitted percept. Inherits the existing framing, including voice
 * attribution and loop-break fields, so the textual tail remains byte-for-byte compatible.
 * `tier` is a sibling of the provenance string; the compatibility path leaves it null.
 * `gateTrail` is the acquisition and awareness verdicts; it is a list even at length 2.
 * Do not put requestId or a receipt here — those are later seams.
 */
export class Percept extends InterruptRecord {
    constructor({ record, sourceId, modality = 'text', provenance = 'legacy-unspecified',
        policy = {}, id = randomUUID(), occurredAt = record.dateTime, tier = null, gateTrail = [] }) {
        super(record);
        if (record.infoton) this.infoton = record.infoton;
        this.dateTime = occurredAt;
        this.id = id;
        this.sourceId = sourceId;
        this.modality = modality;
        this.provenance = provenance;
        this.tier = tier ?? null;
        this.policy = Object.freeze({
            privacy: 'resident-private',
            bypassAperture: policy.bypassAperture === true,
            bypassAdmission: policy.bypassAdmission === true,
            preempt: policy.preempt === true,
        });
        this.urgent = this.policy.preempt;
        this.renditions = Object.freeze([Object.freeze({ kind: 'text', text: this.renderForFrame() })]);
        this.receivedKind = 'text';
        if (!Array.isArray(gateTrail)) throw new Error('Percept.gateTrail is a list');
        this.gateTrail = Object.freeze(gateTrail.map(verdict => {
            if (!(verdict instanceof GateVerdict)) throw new Error('Percept.gateTrail is a list of GateVerdict');
            return verdict;
        }));
    }

    toIndexEntry(attendedAt = new Date().toISOString()) {
        return {
            id: this.id, source: this.sourceId, modality: this.modality,
            provenance: this.provenance, occurredAt: this.dateTime, attendedAt,
            receivedKind: this.receivedKind, renditions: this.renditions,
            policy: this.policy,
        };
    }

    /** Existing in-process InterruptRecords keep their established authority.
     * Serialized compatibility shapes cannot acquire urgency or loop-break powers.
     * Provenance is the enumerated legacy map in perceptionContracts.js.
     */
    static fromInterrupt(detail) {
        if (detail instanceof Percept) return detail;
        const trusted = detail instanceof InterruptRecord;
        const record = InterruptRecord.coerce(detail);
        if (!trusted) { record.urgent = false; record.clearsTail = false; }
        const { provenance, policy } = legacyCompatibility(record, { trusted });
        return new Percept({ record, provenance, sourceId: record.type || 'legacy', policy, tier: null });
    }
}
