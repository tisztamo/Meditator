import { createHash, randomUUID } from 'node:crypto';
import { InterruptRecord } from './interruptRecord.js';
import { GateVerdict, RenditionRequest, legacyCompatibility } from './perceptionContracts.js';

export const clamp01 = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

function lineageId(requestId) {
    if (requestId == null) return null;
    if (typeof requestId !== 'string' || !requestId) {
        throw new Error('requestId is acquisition lineage, keyed by id');
    }
    return requestId;
}

/** Private edge header. No payload, filename, transcript, or source-supplied policy.
 * Change keys are opaque even in debug output. Materialization lives in a private field.
 */
export class PerceptCandidate {
    #materialize;

    constructor({ changeMagnitude = 0, changeKey = '', occurredAt = Date.now(), requestId = null } = {}, materialize) {
        if (typeof materialize !== 'function') throw new Error('A candidate needs a lazy materializer');
        this.id = randomUUID();
        this.occurredAt = Number.isFinite(occurredAt) ? occurredAt : Date.now();
        this.changeMagnitude = clamp01(changeMagnitude);
        this.changeKey = createHash('sha256').update(String(changeKey).slice(0, 256)).digest('hex');
        // Acquisition lineage only, not causal attribution — looking caused the
        // sample, not everything visible in it.
        this.requestId = lineageId(requestId);
        this.#materialize = materialize;
        Object.freeze(this);
    }

    async materialize(renditionRequest) {
        const request = renditionRequest instanceof RenditionRequest
            ? renditionRequest
            : new RenditionRequest({ kinds: ['text'], requestId: this.requestId });
        const text = await this.#materialize(['text'], request);
        if (typeof text !== 'string' || !text.trim()) throw new Error('A percept needs archival text');
        return text;
    }
}

/** Text-first admitted percept. Inherits the existing framing, including voice
 * attribution and loop-break fields, so the textual tail remains byte-for-byte compatible.
 * `tier` is a sibling of the provenance string; the compatibility path leaves it null.
 * `requestId` is acquisition lineage only, not causal attribution — looking caused
 * the sample, not everything visible in it. Legacy `fromInterrupt` leaves it null.
 * `gateTrail` is the acquisition and awareness verdicts; it is a list even at length 2.
 * Do not put a receipt here — that is the next seam.
 */
export class Percept extends InterruptRecord {
    constructor({ record, sourceId, modality = 'text', provenance = 'legacy-unspecified',
        policy = {}, id = randomUUID(), occurredAt = record.dateTime, tier = null,
        requestId = null, gateTrail = [] }) {
        super(record);
        if (record.infoton) this.infoton = record.infoton;
        this.dateTime = occurredAt;
        this.id = id;
        this.sourceId = sourceId;
        this.modality = modality;
        this.provenance = provenance;
        this.tier = tier ?? null;
        this.requestId = lineageId(requestId);
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
