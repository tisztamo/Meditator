import { test, expect, describe } from 'bun:test';
import {
    SourceContract, AnnotatedCandidate, GateVerdict, decideGate,
    ControlRequest, RenditionRequest, Evaluation, EdgeEvidence, PerceptReceipt,
    PROVENANCE, LEGACY_EVENT_PROVENANCE, legacyProvenance, legacyCompatibility,
} from '../../../src/infrastructure/perceptionContracts.js';
import { Percept, PerceptCandidate } from '../../../src/infrastructure/percept.js';
import { InterruptRecord } from '../../../src/infrastructure/interruptRecord.js';

function el(attrs = {}, localName = 'm-sense') {
    return {
        localName,
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
        },
    };
}

function contract(attrs = {}, modality = 'text') {
    return SourceContract.fromElement(el({ name: 'garden', ...attrs }), { modality });
}

describe('SourceContract', () => {
    test('fromElement defaults provenance unspecified and tier 0, and freezes nested powers', () => {
        const element = el({ name: 'garden' });
        const c = SourceContract.fromElement(element, { modality: 'text' });
        expect(c.name).toBe('garden');
        expect(c.modality).toBe('text');
        expect(c.provenance).toBe('unspecified');
        expect(c.tier).toBe(0);
        expect(c.privacy).toBe('resident-private');
        expect(c.powers).toEqual({ bypassAperture: false, bypassAdmission: false, preempt: false });
        expect(Object.isFrozen(c)).toBe(true);
        expect(Object.isFrozen(c.powers)).toBe(true);
    });

    test('name falls back to localName; modality is passed in, not read from the source', () => {
        const c = SourceContract.fromElement(el({ modality: 'vision' }, 'm-camera'), { modality: 'text' });
        expect(c.name).toBe('m-camera');
        expect(c.modality).toBe('text');
    });

    test('legacy-unspecified is rejected on a source', () => {
        expect(() => contract({ provenance: 'legacy-unspecified' }))
            .toThrow(/legacy-unspecified/);
        expect(() => new SourceContract({ name: 'x', modality: 'text', provenance: 'legacy-unspecified' }))
            .toThrow(/legacy-unspecified/);
    });

    test('tier 1 and tier 2 throw with the unimplemented-slice message', () => {
        const slice = /edge-grounded sources are declared but not implemented; see perceptual-membrane.md#processing-tiers/;
        expect(() => contract({ tier: '1' })).toThrow(slice);
        expect(() => contract({ tier: '2' })).toThrow(slice);
        expect(() => new SourceContract({ name: 'x', modality: 'text', tier: 1 })).toThrow(slice);
        expect(() => new SourceContract({ name: 'x', modality: 'text', tier: 2 })).toThrow(slice);
    });

    test('unknown provenance, privacy, and tier throw', () => {
        expect(() => contract({ provenance: 'imagined' })).toThrow(/Unknown provenance/);
        expect(() => contract({ tier: '3' })).toThrow(/Unknown tier/);
        expect(() => new SourceContract({ name: 'x', modality: 'text', privacy: 'public' }))
            .toThrow(/Unknown privacy/);
    });

    test('toProvenanceRecord is the flat journalable subset', () => {
        const c = contract({ name: 'garden', provenance: 'simulated', tier: '0' });
        const record = c.toProvenanceRecord();
        expect(record).toEqual({ source: 'garden', modality: 'text', provenance: 'simulated', tier: 0 });
        expect(Object.isFrozen(record)).toBe(true);
        expect(record).not.toHaveProperty('powers');
        expect(record).not.toHaveProperty('element');
        expect(record).not.toHaveProperty('privacy');
    });

    test('the three powers are independent; setting one does not imply another', () => {
        for (const key of ['bypassAperture', 'bypassAdmission', 'preempt']) {
            const c = contract({ [key]: 'true' });
            expect(c.powers[key]).toBe(true);
            for (const other of ['bypassAperture', 'bypassAdmission', 'preempt']) {
                if (other !== key) expect(c.powers[other]).toBe(false);
            }
        }
    });

    test('fromElement ignores urgent and policy attributes; a payload is not an element', () => {
        const c = contract({ urgent: 'true', policy: 'bypassAperture', bypassAdmission: 'true' });
        expect(c.powers).toEqual({ bypassAperture: false, bypassAdmission: true, preempt: false });
        expect(() => SourceContract.fromElement(
            { provenance: 'physical', tier: 1, policy: { bypassAperture: true }, urgent: true },
            { modality: 'text' },
        )).toThrow(/source element/);
        const disguised = {
            provenance: 'physical', tier: '1', policy: { bypassAperture: true }, urgent: true,
            localName: 'm-sense', getAttribute() { return null; },
        };
        const honest = SourceContract.fromElement(disguised, { modality: 'text' });
        expect(honest.provenance).toBe('unspecified');
        expect(honest.tier).toBe(0);
        expect(honest.powers.bypassAperture).toBe(false);
        const fromPayload = new SourceContract({
            name: 'x', modality: 'text',
            policy: { bypassAperture: true }, urgent: true, provenance: 'physical',
        });
        expect(fromPayload.provenance).toBe('physical');
        expect(fromPayload.powers.bypassAperture).toBe(false);
    });
});

describe('AnnotatedCandidate', () => {
    test('construction freezes the wrapper and the versions list', () => {
        const c = contract();
        const candidate = new PerceptCandidate({ changeKey: 'k' }, () => 'text');
        const annotated = new AnnotatedCandidate({
            candidate, contract: c, versions: [{ gate: 'aperture', version: 3 }],
        });
        expect(annotated.candidate).toBe(candidate);
        expect(annotated.contract).toBe(c);
        expect(annotated.versions).toEqual([{ gate: 'aperture', version: 3 }]);
        expect(Object.isFrozen(annotated)).toBe(true);
        expect(Object.isFrozen(annotated.versions)).toBe(true);
        expect(Object.isFrozen(annotated.versions[0])).toBe(true);
    });

    test('JSON.stringify does not leak captions, filenames, materializer, or change-key preimage', () => {
        const candidate = new PerceptCandidate({
            changeKey: 'private-caption.png', caption: 'secret-words',
            changeMagnitude: 0.4, provenance: 'physical', policy: { preempt: true },
        }, () => 'A simulated light changes.');
        const annotated = new AnnotatedCandidate({
            candidate, contract: contract({ provenance: 'simulated' }),
            versions: [{ gate: 'aperture', version: 0 }],
            provenance: 'physical', tier: 1, policy: { bypassAperture: true }, urgent: true,
        });
        const json = JSON.stringify(annotated);
        expect(json).not.toMatch(/secret-words|private-caption|preempt/);
        expect(json).not.toMatch(/bypassAperture/);
        expect(JSON.parse(json).contract.provenance).toBe('simulated');
        expect(JSON.parse(json).candidate.changeKey).toBe(candidate.changeKey);
        expect(JSON.parse(json).candidate.changeKey).not.toBe('private-caption.png');
    });

    test('annotation requires a SourceContract, not a payload-shaped stand-in', () => {
        const candidate = new PerceptCandidate({}, () => 'text');
        expect(() => new AnnotatedCandidate({
            candidate,
            contract: { name: 'garden', powers: { bypassAperture: true }, provenance: 'physical' },
            versions: [{ gate: 'aperture', version: 0 }],
        })).toThrow(/SourceContract/);
    });
});

describe('GateVerdict and decideGate', () => {
    test('GateVerdict constructs frozen and rejects unknown stage or aperture state', () => {
        const v = new GateVerdict({
            stage: 'acquisition', permitted: true, reason: 'open', apertureState: 'open',
        });
        expect(Object.isFrozen(v)).toBe(true);
        expect(v.gate).toBe('aperture');
        expect(() => new GateVerdict({
            stage: 'materialize', permitted: true, reason: 'x', apertureState: 'open',
        })).toThrow(/Unknown stage/);
        expect(() => new GateVerdict({
            stage: 'acquisition', permitted: true, reason: 'x', apertureState: 'ajar',
        })).toThrow(/Unknown apertureState/);
    });

    test('decideGate is a pure extraction of Aperture.allows: open/soft/narrow/closed and bypassAperture', () => {
        const ordinary = new SourceContract({
            name: 'garden', modality: 'text',
            powers: { bypassAdmission: true, preempt: true },
        });
        expect(decideGate({ stage: 'acquisition', apertureState: 'open', contract: ordinary }).permitted).toBe(true);
        expect(decideGate({ stage: 'acquisition', apertureState: 'soft', contract: ordinary }).permitted).toBe(true);
        const focused = decideGate({
            stage: 'acquisition', apertureState: 'narrow', focus: 'garden', contract: ordinary,
        });
        expect(focused.permitted).toBe(true);
        // The permitted focus and the refused non-focus share `apertureState: 'narrow'`
        // but must not share `reason` — a reader scanning perceptDecision needs to tell
        // "narrow let this through" from "narrow refused this" without cross-checking
        // `permitted`.
        expect(focused.reason).toBe('narrow-focus');
        const refused = decideGate({
            stage: 'acquisition', apertureState: 'narrow', focus: 'voice', contract: ordinary,
        });
        expect(refused.permitted).toBe(false);
        expect(refused.reason).toBe('narrow');
        const closed = decideGate({ stage: 'acquisition', apertureState: 'closed', contract: ordinary });
        expect(closed.permitted).toBe(false);
        expect(closed.reason).toBe('closed');
        expect(closed.bypass).toBe(false);
    });

    test('bypassAperture permits acquisition while closed; bypassAdmission and preempt do not', () => {
        const bypass = new SourceContract({
            name: 'voice', modality: 'text', powers: { bypassAperture: true },
        });
        const admitted = decideGate({ stage: 'acquisition', apertureState: 'closed', contract: bypass });
        expect(admitted.permitted).toBe(true);
        expect(admitted.bypass).toBe(true);
        expect(admitted.reason).toBe('bypassAperture');
        const otherPowers = new SourceContract({
            name: 'voice', modality: 'text',
            powers: { bypassAdmission: true, preempt: true },
        });
        expect(decideGate({ stage: 'acquisition', apertureState: 'closed', contract: otherPowers }).permitted)
            .toBe(false);
    });

    test('awareness at tier 0 is a real verdict that mirrors acquisition', () => {
        const c = new SourceContract({ name: 'garden', modality: 'text' });
        const awareness = decideGate({ stage: 'awareness', apertureState: 'open', contract: c });
        expect(awareness).toBeInstanceOf(GateVerdict);
        expect(awareness.stage).toBe('awareness');
        expect(awareness.permitted).toBe(true);
        expect(awareness.reason).toBe('tier-0-mirror');
        const closed = decideGate({ stage: 'awareness', apertureState: 'closed', contract: c });
        expect(closed.permitted).toBe(false);
        expect(closed.reason).toBe('tier-0-mirror');
        const bypass = new SourceContract({
            name: 'voice', modality: 'text', powers: { bypassAperture: true },
        });
        expect(decideGate({ stage: 'awareness', apertureState: 'closed', contract: bypass }))
            .toMatchObject({ permitted: true, reason: 'tier-0-mirror' });
    });

    test('decideGate does not read the DOM and ignores payload policy on the argument object', () => {
        const element = el({ name: 'garden', bypassAperture: 'true' });
        const c = SourceContract.fromElement(element, { modality: 'text' });
        element.getAttribute = () => { throw new Error('decideGate must not read the DOM'); };
        expect(() => decideGate({ stage: 'acquisition', apertureState: 'open', contract: c })).not.toThrow();
        const ordinary = new SourceContract({ name: 'garden', modality: 'text' });
        const verdict = decideGate({
            stage: 'acquisition', apertureState: 'closed', contract: ordinary,
            policy: { bypassAperture: true }, urgent: true, provenance: 'physical', tier: 1,
        });
        expect(verdict.permitted).toBe(false);
        expect(() => decideGate({
            stage: 'acquisition', apertureState: 'closed',
            contract: { name: 'garden', powers: { bypassAperture: true } },
        })).toThrow(/SourceContract/);
    });
});

describe('ControlRequest and RenditionRequest', () => {
    test('ControlRequest constructs frozen; focus is a valid kind; unknown kind throws', () => {
        const sample = new ControlRequest({ kind: 'sample', issuedBy: 'm-region', reason: 'reopening' });
        expect(sample.kind).toBe('sample');
        expect(typeof sample.id).toBe('string');
        expect(Object.isFrozen(sample)).toBe(true);
        const focus = new ControlRequest({
            kind: 'focus', issuedBy: 'search', reason: 'look-near-the-door',
            provenance: 'physical', tier: 1, policy: { bypassAperture: true }, urgent: true,
        });
        expect(focus.kind).toBe('focus');
        expect(focus).not.toHaveProperty('powers');
        expect(focus).not.toHaveProperty('policy');
        expect(() => new ControlRequest({ kind: 'orient', issuedBy: 'x', reason: 'y' }))
            .toThrow(/Unknown kind/);
        expect(new ControlRequest({ kind: 'detail', issuedBy: 'x', reason: 'y' }).kind).toBe('detail');
    });

    test('RenditionRequest keeps kinds as a frozen list', () => {
        const r = new RenditionRequest({ requestId: 'req-1' });
        expect(r.kinds).toEqual(['text']);
        expect(Object.isFrozen(r)).toBe(true);
        expect(Object.isFrozen(r.kinds)).toBe(true);
        expect(() => new RenditionRequest({ kinds: 'text', requestId: 'req-1' })).toThrow(/list/);
        expect(() => new RenditionRequest({ kinds: ['image'], requestId: 'req-1' }))
            .toThrow(/Unknown rendition kind/);
    });
});

describe('Evaluation', () => {
    test('references evidence by id, is frozen, and never holds a Percept', () => {
        const percept = new Percept({
            sourceId: 'garden',
            record: new InterruptRecord({ source: 'External', type: 'Sense-garden', reason: 'A cat.' }),
        });
        const ids = [percept.id];
        const evaluation = new Evaluation({
            id: 'eval-1', producer: 'comparator',
            subject: { kind: 'prediction', id: 'pred-1' },
            evidenceIds: ids, verdict: 'mismatch',
            percept, policy: { bypassAperture: true }, urgent: true, provenance: 'physical', tier: 1,
        });
        expect(evaluation.evidenceIds).toEqual([percept.id]);
        expect(evaluation.evidenceIds[0]).toBe(percept.id);
        expect('percept' in evaluation).toBe(false);
        expect(Object.isFrozen(evaluation)).toBe(true);
        expect(Object.isFrozen(evaluation.evidenceIds)).toBe(true);
        expect(Object.isFrozen(evaluation.subject)).toBe(true);
        expect(() => new Evaluation({
            producer: 'comparator', subject: { kind: 'target', id: 't' },
            evidenceIds: [percept], verdict: 'match',
        })).toThrow(/by id/);
        ids.push('other');
        expect(evaluation.evidenceIds).toEqual([percept.id]);
    });

    test('insufficient round-trips; two evaluations of the same ids are independent', () => {
        const evidenceIds = ['p-1', 'p-2'];
        const a = new Evaluation({
            id: 'a', producer: 'one', subject: { kind: 'target', id: 't' },
            evidenceIds, verdict: 'insufficient',
        });
        const b = new Evaluation({
            id: 'b', producer: 'two', subject: { kind: 'prediction', id: 'p' },
            evidenceIds, verdict: 'match',
        });
        expect(a.verdict).toBe('insufficient');
        expect(b.verdict).toBe('match');
        expect(a.evidenceIds).toEqual(b.evidenceIds);
        expect(a.evidenceIds).not.toBe(b.evidenceIds);
        expect(() => { a.verdict = 'match'; }).toThrow();
        expect(() => { a.evidenceIds.push('p-3'); }).toThrow();
        expect(b.evidenceIds).toEqual(['p-1', 'p-2']);
        expect(b.verdict).toBe('match');
    });

    test('absence of an evaluation is not a match; unknown enums throw', () => {
        const missing = undefined;
        expect(missing).not.toBeInstanceOf(Evaluation);
        expect(missing?.verdict).not.toBe('match');
        expect(() => new Evaluation({
            producer: 'one', subject: { kind: 'target', id: 't' }, evidenceIds: [],
        })).toThrow(/Unknown verdict/);
        expect(() => new Evaluation({
            producer: 'one', subject: { kind: 'guess', id: 't' },
            evidenceIds: [], verdict: 'match',
        })).toThrow(/Unknown subject.kind/);
    });
});

describe('EdgeEvidence', () => {
    test('constructs frozen as a distinct type a regulator can refuse', () => {
        const edge = new EdgeEvidence({ targetId: 'cat', score: 0.8, sourceName: 'garden', tier: 1 });
        expect(edge).toBeInstanceOf(EdgeEvidence);
        expect(edge).not.toBeInstanceOf(SourceContract);
        expect(Object.isFrozen(edge)).toBe(true);
        expect(edge.tier).toBe(1);
        expect(() => decideGate({
            stage: 'acquisition', apertureState: 'open', contract: edge,
        })).toThrow(/SourceContract/);
        expect(() => new EdgeEvidence({ targetId: 'cat', score: 0.8, sourceName: 'garden', tier: 4 }))
            .toThrow(/Unknown tier/);
    });
});

describe('PerceptReceipt', () => {
    test('non-enumerable percept is omitted from JSON; legacy-unspecified and null tier are allowed', () => {
        const percept = new Percept({
            sourceId: 'legacy',
            record: new InterruptRecord({ source: 'External', type: 'Raw', reason: 'SECRET-TEXT' }),
        });
        const receipt = new PerceptReceipt({
            perceptId: percept.id, frameId: 'frame-1', sourceId: 'legacy', modality: 'text',
            provenance: 'legacy-unspecified', tier: null,
            occurredAt: percept.dateTime, attendedAt: new Date().toISOString(),
            receivedKind: 'text', renditionText: 'visible-line', requestId: null, percept,
        });
        expect(receipt.provenance).toBe('legacy-unspecified');
        expect(receipt.tier).toBeNull();
        expect(receipt.percept).toBe(percept);
        expect(Object.keys(receipt)).not.toContain('percept');
        expect(Object.isFrozen(receipt)).toBe(true);
        const json = JSON.stringify(receipt);
        expect(json).not.toMatch(/SECRET-TEXT/);
        expect(json).not.toMatch(/"percept"/);
        expect(JSON.parse(json).renditionText).toBe('visible-line');
        expect(JSON.parse(json).percept).toBeUndefined();
    });

    test('unknown provenance throws; requestId is optional lineage, not an object', () => {
        expect(() => new PerceptReceipt({
            perceptId: 'p', frameId: 'f', sourceId: 's', modality: 'text',
            provenance: 'imagined', tier: 0, occurredAt: 0, attendedAt: 0,
            receivedKind: 'text', renditionText: '',
        })).toThrow(/Unknown provenance/);
        const receipt = new PerceptReceipt({
            perceptId: 'p', frameId: 'f', sourceId: 's', modality: 'text',
            provenance: 'simulated', occurredAt: 0, attendedAt: 0,
            receivedKind: 'text', renditionText: 'A cat.',
        });
        expect(receipt.requestId).toBeNull();
        expect(receipt.tier).toBe(0);
        expect(PROVENANCE).toContain('legacy-unspecified');
    });

    // Finding 1: before crediting from typed frame receipts, journal entries came
    // from Percept.toIndexEntry(), which carried `policy`; the receipt-built entry
    // silently dropped it because PerceptReceipt carried no policy at all. A
    // receipt is now the only authority the journal reads, so it must be able to
    // recover the full field set toIndexEntry() once offered.
    test('policy is frozen, defaults like an unpoliced Percept, and mirrors what was authorized', () => {
        const bare = new PerceptReceipt({
            perceptId: 'p', frameId: 'f', sourceId: 's', modality: 'text',
            provenance: 'simulated', occurredAt: 0, attendedAt: 0,
            receivedKind: 'text', renditionText: 'A cat.',
        });
        expect(bare.policy).toEqual({
            privacy: 'resident-private', bypassAperture: false, bypassAdmission: false, preempt: false,
        });
        expect(Object.isFrozen(bare.policy)).toBe(true);

        const percept = new Percept({
            sourceId: 'garden',
            record: new InterruptRecord({ source: 'External', type: 'Sense-garden', reason: 'A cat.' }),
            policy: { bypassAperture: true, preempt: true },
        });
        const receipt = new PerceptReceipt({
            perceptId: percept.id, frameId: 'f', sourceId: percept.sourceId, modality: percept.modality,
            provenance: percept.provenance, tier: percept.tier, occurredAt: percept.dateTime,
            attendedAt: new Date().toISOString(), receivedKind: percept.receivedKind,
            renditionText: percept.renderForFrame(), requestId: percept.requestId, policy: percept.policy,
        });
        expect(receipt.policy).toEqual(percept.policy);
    });
});

describe('payloads cannot grant authority', () => {
    test('extra provenance/tier/policy/urgent on non-source types do not change decideGate', () => {
        const trusted = new SourceContract({ name: 'garden', modality: 'text' });
        const candidate = new PerceptCandidate({
            provenance: 'physical', tier: 2, policy: { bypassAperture: true }, urgent: true,
        }, () => 'text');
        const annotated = new AnnotatedCandidate({
            candidate, contract: trusted, versions: [{ gate: 'aperture', version: 0 }],
            provenance: 'physical', policy: { bypassAperture: true },
        });
        const request = new ControlRequest({
            kind: 'sample', issuedBy: 'payload', reason: 'now',
            provenance: 'physical', tier: 1, policy: { bypassAperture: true }, urgent: true,
        });
        expect(annotated.contract).toBe(trusted);
        expect(request.kind).toBe('sample');
        expect(decideGate({
            stage: 'acquisition', apertureState: 'closed',
            contract: annotated.contract, policy: request, urgent: true,
        }).permitted).toBe(false);
        expect(decideGate({
            stage: 'acquisition', apertureState: 'closed', contract: trusted,
        }).permitted).toBe(false);
    });
});

describe('legacy provenance map', () => {
    test('the table ends at an explicit unknown row; every provenance is in the vocab', () => {
        const last = LEGACY_EVENT_PROVENANCE[LEGACY_EVENT_PROVENANCE.length - 1];
        expect(last.otherwise).toBe(true);
        expect(last.provenance).toBe('legacy-unspecified');
        for (const row of LEGACY_EVENT_PROVENANCE) {
            expect(PROVENANCE).toContain(row.provenance);
        }
    });

    test('trusted type-keyed rows, Internal by source, and listed fall-throughs', () => {
        const trusted = { trusted: true };
        expect(legacyProvenance({ type: 'UserInput', source: 'WebSocketClient' }, trusted)).toBe('physical');
        expect(legacyProvenance({ type: 'ConsoleInput', source: 'External' }, trusted)).toBe('physical');
        expect(legacyProvenance({ type: 'Peer', source: 'Peer' }, trusted)).toBe('other-mind');
        expect(legacyProvenance({ type: 'Waking', source: 'Internal' }, trusted)).toBe('internal');
        expect(legacyProvenance({ type: 'Origin', source: 'Internal' }, trusted)).toBe('internal');
        expect(legacyProvenance({ type: 'Loop', source: 'Internal' }, trusted)).toBe('internal');
        expect(legacyProvenance({ type: 'Time-Based', source: 'Internal' }, trusted)).toBe('internal');
        expect(legacyProvenance({ type: 'Token-Based', source: 'Internal' }, trusted)).toBe('internal');
        expect(legacyProvenance({ type: 'Time-wander', source: 'Internal' }, trusted)).toBe('internal');
        expect(legacyProvenance({ type: 'Association', source: 'Internal' }, trusted)).toBe('internal');
        expect(legacyProvenance({ type: 'Sleep', source: 'External' }, trusted)).toBe('legacy-unspecified');
        expect(legacyProvenance({ type: 'Sense-daylight', source: 'External' }, trusted)).toBe('legacy-unspecified');
        expect(legacyProvenance({ type: 'Sense-reach', source: 'External' }, trusted)).toBe('legacy-unspecified');
        expect(legacyProvenance({ type: 'Observer-clear-mind', source: 'Observer' }, trusted))
            .toBe('legacy-unspecified');
        expect(legacyProvenance({ type: 'Recall', source: 'Observer' }, trusted)).toBe('legacy-unspecified');
        expect(legacyProvenance({ type: 'LoopGuard', source: 'Observer' }, trusted)).toBe('legacy-unspecified');
        expect(legacyProvenance({ type: 'Association', source: 'Observer' }, trusted)).toBe('legacy-unspecified');
        expect(legacyProvenance({ type: 'Raw', source: 'External' }, trusted)).toBe('legacy-unspecified');
        expect(legacyProvenance({ type: 'BrandNewClass', source: 'External' }, trusted)).toBe('legacy-unspecified');
        expect(legacyProvenance({ type: 'BrandNewClass', source: 'Internal' }, trusted)).toBe('internal');
        expect(legacyProvenance({ type: 'UserInput', source: 'Internal' }, trusted)).toBe('physical');
    });

    test('untrusted payloads never consult the class table and never receive powers', () => {
        const claimed = {
            type: 'UserInput', source: 'Internal', urgent: true, clearsTail: true,
            policy: { bypassAperture: true, preempt: true },
        };
        expect(legacyProvenance(claimed, { trusted: false })).toBe('legacy-unspecified');
        expect(legacyCompatibility(claimed, { trusted: false }).policy).toEqual({
            bypassAperture: false, bypassAdmission: false, preempt: false,
        });
        expect(legacyCompatibility(claimed, { trusted: true }).policy).toEqual({
            bypassAperture: true, bypassAdmission: true, preempt: true,
        });
    });
});
