// Tier 1 — the contracts that let an edge-grounded source exist at all, and the
// one question it asks. Pure; no DOM, no model, no network.
// doc/plans/jev-system-one-integration.md §1 Phase 4.
import { test, expect, describe } from "bun:test";
import {
    SourceContract, EdgeEvidence, EDGE_EVIDENCE_EVENT, fireEdgeEvidence, ControlRequest,
} from "../../../src/infrastructure/perceptionContracts.js";
import { targetMatchQuestion } from "../../../src/mindComponents/mind/mSense.js";

function el(attrs = {}, localName = 'm-sense') {
    return { localName, getAttribute: name => (name in attrs ? attrs[name] : null) };
}

describe('a tier-1 source contract', () => {
    test('tier 1 is allowed exactly when a decider is declared', () => {
        const grounded = SourceContract.fromElement(
            el({ name: 'earth', tier: '1', decider: 'jev' }), { modality: 'text' },
        );
        expect(grounded.tier).toBe(1);
        expect(grounded.decider).toBe('jev');

        expect(() => SourceContract.fromElement(el({ name: 'earth', tier: '1' }), { modality: 'text' }))
            .toThrow(/must declare a `decider` model/);
        expect(() => SourceContract.fromElement(
            el({ name: 'earth', tier: '1', decider: '   ' }), { modality: 'text' },
        )).toThrow(/decider/);
    });

    test('tier 2 is still refused, decider or not — nothing implements it', () => {
        expect(() => SourceContract.fromElement(
            el({ name: 'earth', tier: '2', decider: 'jev' }), { modality: 'text' },
        )).toThrow(/not implemented/);
    });

    test('a tier-0 source has no decider, and the journalable record is unchanged', () => {
        const plain = SourceContract.fromElement(el({ name: 'earth' }), { modality: 'text' });
        expect(plain.tier).toBe(0);
        expect(plain.decider).toBeNull();
        expect(plain.toProvenanceRecord())
            .toEqual({ source: 'earth', modality: 'text', provenance: 'unspecified', tier: 0 });
    });
});

describe('EdgeEvidence', () => {
    const base = { targetId: 't-1', score: 0.91, sourceName: 'earth', tier: 1 };

    test('carries the score, its request, and a frozen provenance record', () => {
        const evidence = new EdgeEvidence({
            ...base,
            requestId: 'r-1',
            provenance: {
                tier: 1, engine: 'decide', decider: 'jev', model: 'jev-1.13.0',
                questions: ['targetMatch'], strength: 0.82,
                strengthFrom: '|p-0.5|*2 (noul carries no confidence)',
                candidates: 3, calls: 3, latencyMs: 900, promptTokens: 120, cost: 0.000005,
                apertureState: 'closed',
            },
        });
        expect(evidence.score).toBe(0.91);
        expect(evidence.requestId).toBe('r-1');
        expect(evidence.provenance.model).toBe('jev-1.13.0');
        expect(evidence.provenance.questions).toEqual(['targetMatch']);
        expect(Object.isFrozen(evidence)).toBe(true);
        expect(Object.isFrozen(evidence.provenance)).toBe(true);
    });

    test('provenance is a closed vocabulary: anything else is dropped, not carried', () => {
        const evidence = new EdgeEvidence({
            ...base,
            provenance: { tier: 1, candidateText: 'the bell in the fog', template: 'a bell', apiKey: 'sk-xxx' },
        });
        expect(JSON.stringify(evidence)).not.toContain('bell');
        expect(JSON.stringify(evidence)).not.toContain('sk-xxx');
        expect(evidence.provenance).not.toHaveProperty('candidateText');
        expect(evidence.provenance).not.toHaveProperty('template');
    });

    test('a score is a number and a target is an id', () => {
        expect(() => new EdgeEvidence({ ...base, score: 'high' })).toThrow(/numeric score/);
        expect(() => new EdgeEvidence({ ...base, targetId: null })).toThrow(/keyed by id/);
    });

    test('it is fired, never published: a retained score would replay to a later search', () => {
        expect(EDGE_EVIDENCE_EVENT).toBe('edge-evidence');
        const fired = [];
        const host = { fire: (name, detail) => { fired.push([name, detail]); return true; } };
        const evidence = new EdgeEvidence(base);
        fireEdgeEvidence(host, evidence);
        expect(fired[0][0]).toBe('edge-evidence');
        expect(fired[0][1]).toBe(evidence);
        expect(() => fireEdgeEvidence({ pub() {} }, evidence)).toThrow(/fire\(\)/);
        expect(() => fireEdgeEvidence(host, { score: 1 })).toThrow(/EdgeEvidence/);
    });
});

test('ControlRequest carries the served target id, id-only and null by default', () => {
    const plain = new ControlRequest({ kind: 'focus', issuedBy: 'search', reason: 'search' });
    expect(plain.targetId).toBeNull();
    const served = new ControlRequest({ kind: 'focus', issuedBy: 'search', reason: 'search', targetId: 'st-1' });
    expect(served.targetId).toBe('st-1');
    expect(() => new ControlRequest({ kind: 'focus', issuedBy: 'search', reason: 'search', targetId: 7 }))
        .toThrow(/keyed by id/);
});

test('the grounding question is a noul the endpoint will accept', () => {
    const q = targetMatchQuestion();
    expect(q.type).toBe('noul');
    // The Phase-0 probe: a question with neither criteria nor instructions is a 422.
    expect(typeof q.instructions).toBe('string');
    expect(q.instructions.length).toBeGreaterThan(0);
    expect(Object.keys(q.criteria).sort()).toEqual(['false', 'true']);
    expect(q).not.toHaveProperty('question');
});
