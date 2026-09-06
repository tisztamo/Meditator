import { randomUUID } from 'node:crypto';

/** Architecture-owned provenance vocabulary. `legacy-unspecified` is reserved for
 * the compatibility path (coerced stimuli, receipts) and must not be authored on
 * a source. */
export const PROVENANCE = Object.freeze([
    'physical', 'simulated', 'other-mind', 'generated', 'internal',
    'unspecified', 'legacy-unspecified',
]);

export const PROCESSING_TIERS = Object.freeze([0, 1, 2]);
export const GATE_STAGES = Object.freeze(['acquisition', 'awareness']);
export const APERTURE_STATES = Object.freeze(['open', 'soft', 'narrow', 'closed']);
export const CONTROL_KINDS = Object.freeze(['sample', 'focus', 'detail']);
export const RENDITION_KINDS = Object.freeze(['text']);
export const EVALUATION_VERDICTS = Object.freeze(['match', 'mismatch', 'insufficient']);
export const SUBJECT_KINDS = Object.freeze(['prediction', 'target']);
export const PRIVACY = Object.freeze(['resident-private']);

const UNIMPLEMENTED_TIER =
    'edge-grounded sources are declared but not implemented; see perceptual-membrane.md#processing-tiers';

function requireEnum(name, value, allowed) {
    if (!allowed.includes(value)) throw new Error(`Unknown ${name}: ${value}`);
    return value;
}

function requireId(name, value) {
    if (typeof value !== 'string' || !value) throw new Error(`${name} is keyed by id, never by object identity`);
    return value;
}

function hide(object, key, value) {
    Object.defineProperty(object, key, { value, enumerable: false });
}

function parseProvenance(value, { allowLegacy = false } = {}) {
    const provenance = value == null || value === '' ? 'unspecified' : String(value);
    if (provenance === 'legacy-unspecified' && !allowLegacy) {
        throw new Error('legacy-unspecified is reserved for the compatibility path and cannot be authored on a source');
    }
    return requireEnum('provenance', provenance, PROVENANCE);
}

/** Source contracts refuse tier 1/2 honestly. Receipts and EdgeEvidence may carry them. */
function parseTier(value, { allowNull = false, allowUnimplemented = false } = {}) {
    if (value === undefined || value === '') return 0;
    if (value === null) return allowNull ? null : 0;
    const tier = typeof value === 'number' ? value : Number(String(value).trim());
    if (tier === 1 || tier === 2) {
        if (!allowUnimplemented) throw new Error(UNIMPLEMENTED_TIER);
        return tier;
    }
    if (tier !== 0) throw new Error(`Unknown tier: ${value}`);
    return 0;
}

function freezePowers(powers = {}) {
    // Only the three named booleans grant authority. A nested `policy` or `urgent`
    // flag on the same object is not read.
    return Object.freeze({
        bypassAperture: powers.bypassAperture === true,
        bypassAdmission: powers.bypassAdmission === true,
        preempt: powers.preempt === true,
    });
}

/** Trusted source identity and policy, built from architecture attributes only.
 * Downstream code must not re-read the element. Payloads cannot construct this
 * and cannot grant its powers. */
export class SourceContract {
    constructor({ name, modality, provenance, tier, privacy, powers, element } = {}) {
        if (typeof name !== 'string' || !name) throw new Error('SourceContract needs a name');
        if (typeof modality !== 'string' || !modality) {
            throw new Error('SourceContract modality comes from the provider, not the source');
        }
        this.name = name;
        this.modality = modality;
        this.provenance = parseProvenance(provenance);
        this.tier = parseTier(tier);
        this.privacy = requireEnum('privacy', privacy ?? 'resident-private', PRIVACY);
        this.powers = freezePowers(powers);
        hide(this, 'element', element ?? null);
        Object.freeze(this);
    }

    /** The only place that maps element attributes to authority. `modality` is
     * passed by the provider; `urgent` / `policy` attributes are not powers. */
    static fromElement(element, { modality } = {}) {
        if (element == null || typeof element.getAttribute !== 'function') {
            throw new Error('SourceContract.fromElement reads a source element, not a payload');
        }
        return new SourceContract({
            name: element.getAttribute('name') || element.localName,
            modality,
            provenance: element.getAttribute('provenance') || 'unspecified',
            tier: element.getAttribute('tier'),
            powers: {
                bypassAperture: element.getAttribute('bypassAperture') === 'true',
                bypassAdmission: element.getAttribute('bypassAdmission') === 'true',
                preempt: element.getAttribute('preempt') === 'true',
            },
            element,
        });
    }

    toProvenanceRecord() {
        return Object.freeze({
            source: this.name,
            modality: this.modality,
            provenance: this.provenance,
            tier: this.tier,
        });
    }
}

/** Acquisition vs awareness. `bypass` records whether `bypassAperture` was set
 * on the contract; it is not a second policy channel. */
export class GateVerdict {
    constructor({ stage, permitted, reason, bypass = false, apertureState, gate = 'aperture' } = {}) {
        this.stage = requireEnum('stage', stage, GATE_STAGES);
        if (typeof permitted !== 'boolean') throw new Error('GateVerdict.permitted must be boolean');
        if (typeof reason !== 'string' || !reason) throw new Error('GateVerdict needs a reason');
        this.permitted = permitted;
        this.reason = reason;
        this.bypass = bypass === true;
        this.apertureState = requireEnum('apertureState', apertureState, APERTURE_STATES);
        if (typeof gate !== 'string' || !gate) throw new Error('GateVerdict needs a gate name');
        this.gate = gate;
        Object.freeze(this);
    }
}

/** Pure tier-0 extraction of today's `Aperture.allows(source, policy)`:
 *
 *     policy.bypassAperture || (state !== 'closed' && (state !== 'narrow' || source === focus))
 *
 * `soft` permits like `open`; gain is applied later, not here. `bypassAperture`
 * is read at acquisition only. `bypassAdmission` and `preempt` are unread — they
 * belong to the arbiter. No DOM, no component state, no retuned thresholds.
 *
 * Awareness at tier 0 is a documented mirror (same `permitted`, reason
 * `tier-0-mirror`) so M4 can call this twice and record a real verdict. */
export function decideGate({ stage, apertureState, focus = null, contract } = {}) {
    requireEnum('stage', stage, GATE_STAGES);
    requireEnum('apertureState', apertureState, APERTURE_STATES);
    if (!(contract instanceof SourceContract)) {
        throw new Error('decideGate reads policy only from a SourceContract');
    }
    const bypass = contract.powers.bypassAperture === true;
    const permitted = bypass || (apertureState !== 'closed'
        && (apertureState !== 'narrow' || contract.name === focus));
    if (stage === 'awareness') {
        return new GateVerdict({
            stage, permitted, reason: 'tier-0-mirror', bypass, apertureState,
        });
    }
    let reason;
    if (!permitted && apertureState === 'closed') reason = 'closed';
    else if (!permitted && apertureState === 'narrow') reason = 'narrow';
    else if (bypass && (apertureState === 'closed'
        || (apertureState === 'narrow' && contract.name !== focus))) reason = 'bypassAperture';
    else reason = apertureState;
    return new GateVerdict({ stage: 'acquisition', permitted, reason, bypass, apertureState });
}

/** Trusted annotation of a private candidate. Never leaves the provider chain.
 * `versions` is a list even though there is one gate today — phase 2 fills it. */
export class AnnotatedCandidate {
    constructor({ candidate, contract, versions, annotatedAt = Date.now() } = {}) {
        if (candidate == null || typeof candidate !== 'object') {
            throw new Error('AnnotatedCandidate needs a candidate header');
        }
        if (!(contract instanceof SourceContract)) {
            throw new Error('Annotation requires a SourceContract');
        }
        if (!Array.isArray(versions)) throw new Error('AnnotatedCandidate.versions is a list');
        this.candidate = candidate;
        this.contract = contract;
        this.versions = Object.freeze(versions.map(entry => {
            if (!entry || typeof entry.gate !== 'string' || !entry.gate) {
                throw new Error('Each version needs a gate name');
            }
            if (!Number.isFinite(entry.version)) throw new Error('Each version needs a numeric version');
            return Object.freeze({ gate: entry.gate, version: entry.version });
        }));
        this.annotatedAt = annotatedAt;
        Object.freeze(this);
    }

    // Enumerable fields include the candidate object; stringify must still not
    // dump captions, filenames, payload-provenance, policy, or a change-key preimage.
    toJSON() {
        return {
            candidate: {
                id: this.candidate.id,
                occurredAt: this.candidate.occurredAt,
                changeMagnitude: this.candidate.changeMagnitude,
                changeKey: this.candidate.changeKey,
            },
            contract: this.contract.toProvenanceRecord(),
            versions: this.versions,
            annotatedAt: this.annotatedAt,
        };
    }
}

/** Sample / focus / detail request reaching a source before detection.
 * `focus` is a valid kind so it can be delivered and recorded, but it must
 * change no policy: the search controller that owns focus is phase 3.
 *
 * `id` is acquisition lineage only — which request asked for the sample — not
 * causal attribution. Looking caused the sample, not everything visible in it.
 * `template` is reserved for tier-1 grounding queries. */
export class ControlRequest {
    constructor({
        id, kind, issuedBy, target, reason, detail, budget, deadline,
        issuedAt = Date.now(), template,
    } = {}) {
        this.id = requireId('ControlRequest.id', id ?? randomUUID());
        this.kind = requireEnum('kind', kind, CONTROL_KINDS);
        if (typeof issuedBy !== 'string' || !issuedBy) throw new Error('ControlRequest needs issuedBy');
        this.issuedBy = issuedBy;
        this.target = target ?? null;
        if (typeof reason !== 'string' || !reason) throw new Error('ControlRequest needs a reason');
        this.reason = reason;
        this.detail = detail ?? null;
        this.budget = budget ?? null;
        this.deadline = deadline ?? null;
        this.issuedAt = issuedAt;
        this.template = template ?? null;
        Object.freeze(this);
    }
}

/** What the materializer is asked for after acquisition permission. `kinds` stays
 * a list. `requestId` is acquisition lineage only, not causal attribution. */
export class RenditionRequest {
    constructor({ kinds = ['text'], detail, requestId = null, budget } = {}) {
        if (!Array.isArray(kinds)) throw new Error('RenditionRequest.kinds is a list');
        this.kinds = Object.freeze(kinds.map(kind => requireEnum('rendition kind', kind, RENDITION_KINDS)));
        this.detail = detail ?? null;
        this.requestId = requestId === null || requestId === undefined ? null : requireId('requestId', requestId);
        this.budget = budget ?? null;
        Object.freeze(this);
    }
}

/** Independent judgment referring to evidence by id. Never holds or mutates a
 * Percept. Two evaluations of the same evidence are separate records.
 * `insufficient` is a first-class verdict. Absence of an evaluation is not a
 * match: constructing nothing is how you have no evaluation, not how you get
 * `match`. Nothing in this phase produces one. */
export class Evaluation {
    constructor({
        id, producer, subject, evidenceIds, verdict, confidence, coverage,
        basisAt, createdAt = Date.now(),
    } = {}) {
        this.id = requireId('Evaluation.id', id ?? randomUUID());
        if (typeof producer !== 'string' || !producer) throw new Error('Evaluation needs a producer');
        this.producer = producer;
        if (!subject || typeof subject !== 'object') throw new Error('Evaluation needs a subject');
        this.subject = Object.freeze({
            kind: requireEnum('subject.kind', subject.kind, SUBJECT_KINDS),
            id: requireId('subject.id', subject.id),
        });
        if (!Array.isArray(evidenceIds)) throw new Error('Evaluation.evidenceIds is a list of ids');
        this.evidenceIds = Object.freeze(evidenceIds.map(evidenceId => {
            if (typeof evidenceId !== 'string' || !evidenceId) {
                throw new Error('Evaluation references evidence by id, never by object');
            }
            return evidenceId;
        }));
        this.verdict = requireEnum('verdict', verdict, EVALUATION_VERDICTS);
        if (confidence !== undefined && !Number.isFinite(confidence)) {
            throw new Error('Evaluation.confidence must be numeric');
        }
        if (coverage !== undefined && !Number.isFinite(coverage)) {
            throw new Error('Evaluation.coverage must be numeric');
        }
        this.confidence = confidence ?? null;
        this.coverage = coverage ?? null;
        this.basisAt = basisAt ?? createdAt;
        this.createdAt = createdAt;
        Object.freeze(this);
    }
}

/** Tier-1 match score, typed so a regulator can refuse it. Nothing produces one. */
export class EdgeEvidence {
    constructor({ targetId, score, sourceName, tier } = {}) {
        this.targetId = requireId('targetId', targetId);
        if (!Number.isFinite(score)) throw new Error('EdgeEvidence needs a numeric score');
        this.score = score;
        if (typeof sourceName !== 'string' || !sourceName) throw new Error('EdgeEvidence needs a sourceName');
        this.sourceName = sourceName;
        this.tier = parseTier(tier, { allowUnimplemented: true });
        Object.freeze(this);
    }
}

/** Authoritative frame-assembly receipt, credited by percept id. Optional
 * `percept` is non-enumerable so it cannot reach a journal line by accident.
 *
 * `requestId` is acquisition lineage only, not causal attribution. Legacy
 * coerced stimuli may use provenance `legacy-unspecified` and `tier: null`. */
export class PerceptReceipt {
    constructor({
        perceptId, frameId, sourceId, modality, provenance, tier,
        occurredAt, attendedAt, receivedKind, renditionText, requestId = null, percept,
    } = {}) {
        this.perceptId = requireId('perceptId', perceptId);
        this.frameId = requireId('frameId', frameId);
        this.sourceId = requireId('sourceId', sourceId);
        if (typeof modality !== 'string' || !modality) throw new Error('PerceptReceipt needs a modality');
        this.modality = modality;
        this.provenance = parseProvenance(provenance, { allowLegacy: true });
        this.tier = parseTier(tier, { allowNull: true, allowUnimplemented: true });
        this.occurredAt = occurredAt;
        this.attendedAt = attendedAt;
        if (typeof receivedKind !== 'string' || !receivedKind) throw new Error('PerceptReceipt needs receivedKind');
        this.receivedKind = receivedKind;
        if (typeof renditionText !== 'string') throw new Error('PerceptReceipt needs renditionText');
        this.renditionText = renditionText;
        this.requestId = requestId === null || requestId === undefined ? null : requireId('requestId', requestId);
        if (percept !== undefined) hide(this, 'percept', percept);
        Object.freeze(this);
    }
}

/** Compatibility-path provenance. First matching row wins. Type-keyed physical /
 * other-mind rows precede Internal-by-source, matching today's fromInterrupt
 * order: a trusted UserInput is physical even if someone set source Internal.
 *
 * Every currently constructed interrupt class is a row so unknown is no longer
 * an unwritten default — it is the table's last row. Listed classes that
 * currently fall through stay `legacy-unspecified`; this is coverage, not a
 * reclassification. Internal is by source, not type. Observer is not Internal.
 *
 * Association / LoopGuard / Recall are raised through MObserver (source
 * Observer). Waking / Origin / Time-* / the test-class Loop are source Internal.
 * Sleep, Sense-*, and act consequences are External and unspecified.
 *
 * Powers are not in this table: they still come from trusted urgent/clearsTail
 * flags, never from event class. */
export const LEGACY_EVENT_PROVENANCE = Object.freeze([
    Object.freeze({ type: 'UserInput', provenance: 'physical' }),
    Object.freeze({ type: 'ConsoleInput', provenance: 'physical' }),
    Object.freeze({ type: 'Peer', provenance: 'other-mind' }),
    Object.freeze({ type: 'Waking', source: 'Internal', provenance: 'internal' }),
    Object.freeze({ type: 'Origin', source: 'Internal', provenance: 'internal' }),
    Object.freeze({ type: 'Loop', source: 'Internal', provenance: 'internal' }),
    Object.freeze({ type: 'Time-Based', source: 'Internal', provenance: 'internal' }),
    Object.freeze({ type: 'Token-Based', source: 'Internal', provenance: 'internal' }),
    Object.freeze({ typePrefix: 'Time-', source: 'Internal', provenance: 'internal' }),
    Object.freeze({ source: 'Internal', provenance: 'internal' }),
    Object.freeze({ type: 'Sleep', provenance: 'legacy-unspecified' }),
    Object.freeze({ type: 'Sense-reach', provenance: 'legacy-unspecified' }),
    Object.freeze({ typePrefix: 'Sense-', provenance: 'legacy-unspecified' }),
    Object.freeze({ type: 'Recall', provenance: 'legacy-unspecified' }),
    Object.freeze({ type: 'LoopGuard', provenance: 'legacy-unspecified' }),
    Object.freeze({ type: 'Association', provenance: 'legacy-unspecified' }),
    Object.freeze({ typePrefix: 'Observer-', provenance: 'legacy-unspecified' }),
    Object.freeze({ type: 'Raw', provenance: 'legacy-unspecified' }),
    Object.freeze({ type: 'Unknown', provenance: 'legacy-unspecified' }),
    Object.freeze({ otherwise: true, provenance: 'legacy-unspecified' }),
]);

function rowMatches(row, record) {
    if (row.otherwise) return true;
    if (row.source != null && record.source !== row.source) return false;
    if (row.type != null && record.type !== row.type) return false;
    if (row.typePrefix != null) {
        if (typeof record.type !== 'string' || !record.type.startsWith(row.typePrefix)) return false;
    }
    return row.source != null || row.type != null || row.typePrefix != null;
}

function matchLegacyProvenance(record) {
    for (const row of LEGACY_EVENT_PROVENANCE) {
        if (rowMatches(row, record)) return row.provenance;
    }
    return 'legacy-unspecified';
}

/** Provenance for the compatibility path. Coerced / untrusted shapes never
 * consult the class table — they are `legacy-unspecified` even if the payload
 * names UserInput. A trusted unknown type is also `legacy-unspecified`, unless
 * its source is Internal, which still maps to `internal` as today. */
export function legacyProvenance(record, { trusted = false } = {}) {
    return legacyCompatibility(record, { trusted }).provenance;
}

/** Compatibility-path provenance and powers. fromInterrupt delegates here.
 *
 * Trusted in-process InterruptRecords keep powers from their flags:
 *   bypassAperture / bypassAdmission ← urgent || clearsTail
 *   preempt ← urgent
 * A trusted record of an unknown class still takes those powers; only
 * provenance is unspecified (or internal, if source is Internal).
 * Coerced strings and plain objects get no powers, even if they claim
 * urgent / policy / a known type. */
export function legacyCompatibility(record, { trusted = false } = {}) {
    const provenance = trusted ? matchLegacyProvenance(record) : 'legacy-unspecified';
    requireEnum('provenance', provenance, PROVENANCE);
    return Object.freeze({
        provenance,
        policy: freezePowers({
            bypassAperture: trusted && (record.urgent === true || record.clearsTail === true),
            bypassAdmission: trusted && (record.urgent === true || record.clearsTail === true),
            preempt: trusted && record.urgent === true,
        }),
    });
}
