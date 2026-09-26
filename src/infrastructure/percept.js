import { createHash, randomUUID } from 'node:crypto';
import { InterruptRecord } from './interruptRecord.js';
import { GateVerdict, RenditionRequest, legacyCompatibility } from './perceptionContracts.js';

export const clamp01 = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

function lineageId(value, name = 'requestId') {
    if (value == null) return null;
    if (typeof value !== 'string' || !value) {
        throw new Error(`${name} is lineage, keyed by id`);
    }
    return value;
}

/** Private edge header. No payload, filename, transcript, or source-supplied policy.
 * Change keys are opaque even in debug output. Materialization lives in a private field.
 */
export class PerceptCandidate {
    #materialize;

    constructor({ changeMagnitude = 0, changeKey = '', occurredAt = Date.now(), requestId = null, actId = null } = {}, materialize) {
        if (typeof materialize !== 'function') throw new Error('A candidate needs a lazy materializer');
        this.id = randomUUID();
        this.occurredAt = Number.isFinite(occurredAt) ? occurredAt : Date.now();
        this.changeMagnitude = clamp01(changeMagnitude);
        this.changeKey = createHash('sha256').update(String(changeKey).slice(0, 256)).digest('hex');
        // Acquisition lineage only, not causal attribution — looking caused the
        // sample, not everything visible in it. `actId` is association with an
        // act, not proof of causation.
        this.requestId = lineageId(requestId);
        this.actId = lineageId(actId, 'actId');
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
 * Frozen at the end of construction: the bid is the competition; this is the evidence.
 * Do not put a receipt here — that is the next seam.
 */
export class Percept extends InterruptRecord {
    constructor({ record, sourceId, modality = 'text', provenance = 'legacy-unspecified',
        policy = {}, id = randomUUID(), occurredAt = record.dateTime, tier = null,
        requestId = null, actId = null, gateTrail = [] }) {
        super(record);
        if (record.infoton) this.infoton = record.infoton;
        this.dateTime = occurredAt;
        this.id = id;
        this.sourceId = sourceId;
        this.modality = modality;
        this.provenance = provenance;
        this.tier = tier ?? null;
        this.requestId = lineageId(requestId);
        this.actId = lineageId(actId, 'actId');
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
        // Frozen at issue: competing evaluations live on AttentionBid, not here.
        Object.freeze(this);
    }

    /** A stimulus in any form, as evidence. Authority is `trusted`: the receiver
     * passes whether a component sent it (messageOrigin.js). Untrusted shapes
     * cannot acquire urgency, loop-break powers or act lineage. Without the
     * option, an in-process InterruptRecord instance counts as trusted (a direct
     * caller holding one built it). Provenance is the enumerated legacy map in
     * perceptionContracts.js.
     */
    static fromInterrupt(detail, { trusted = detail instanceof InterruptRecord } = {}) {
        if (detail instanceof Percept) return detail;
        // A bid is not a payload. Unwrapping preserves the evidence id;
        // coercing it as a plain object would mint a new Percept and break
        // receipt crediting. assembleFrame uses AttentionBid.evidenceOf.
        if (detail && typeof detail === 'object' && detail.evidence instanceof Percept
            && detail.evidenceId === detail.evidence.id && Array.isArray(detail.gainTrail)) {
            return detail.evidence;
        }
        // A bid's or a percept's wire form, from a trusted sender, keeps its id,
        // provenance and powers. From anyone else it is coerced like any payload.
        if (isBidData(detail)) return Percept.fromInterrupt(detail.evidence, { trusted });
        if (trusted && isPerceptData(detail)) return Percept.fromData(detail);
        const record = detail instanceof InterruptRecord ? detail
            : trusted ? InterruptRecord.fromData(detail) : InterruptRecord.coerce(detail);
        if (!trusted) { record.urgent = false; record.clearsTail = false; }
        const { provenance, policy } = legacyCompatibility(record, { trusted });
        return new Percept({
            record, provenance, sourceId: record.type || 'legacy', policy, tier: null,
            // Lineage follows urgency: only a trusted record keeps actId.
            // Coerced plain objects cannot steal it, even if coerce also strips
            // the field.
            actId: trusted ? record.actId : null,
        });
    }

    /** Rebuild a percept from its wire form (perceptData). Only for a trusted
     * sender: the data's provenance and powers are taken as given. */
    static fromData(data) {
        return new Percept({
            record: InterruptRecord.fromData(data),
            id: data.id,
            sourceId: data.sourceId,
            modality: data.modality,
            provenance: data.provenance,
            policy: data.policy ?? {},
            occurredAt: data.dateTime,
            tier: data.tier ?? null,
            requestId: data.requestId ?? null,
            actId: data.actId ?? null,
            gateTrail: (data.gateTrail ?? []).map(v => v instanceof GateVerdict ? v : new GateVerdict(v)),
        });
    }
}

/** A percept's wire form: its own fields as plain data (message rule M2). */
export function perceptData(percept) {
    return { ...percept, gateTrail: percept.gateTrail.map(v => ({ ...v })) };
}

/** Whether `x` is a percept's wire form (not a class instance). */
export function isPerceptData(x) {
    return !!x && typeof x === 'object' && !(x instanceof InterruptRecord)
        && typeof x.id === 'string' && typeof x.provenance === 'string'
        && !!x.policy && typeof x.policy === 'object' && Array.isArray(x.gateTrail);
}

/** Whether `x` is a bid's wire form (see attentionBid.js bidData). Lives here so
 * Percept.fromInterrupt can unwrap one without an import cycle. */
export function isBidData(x) {
    return !!x && typeof x === 'object' && typeof x.evidenceId === 'string'
        && !!x.evidence && typeof x.evidence === 'object' && Array.isArray(x.gainTrail)
        && !(x.evidence instanceof Percept);
}
