import { test, expect, describe } from 'bun:test';
import { Prediction, evaluationCommitPayload, EVALUATION_COMMIT_EVENT, EVALUATION_COMMIT_DELIVERY, fireEvaluationCommit } from '../../../src/infrastructure/predictionContracts.js';
import { Evaluation } from '../../../src/infrastructure/perceptionContracts.js';
import { Percept } from '../../../src/infrastructure/percept.js';
import { InterruptRecord } from '../../../src/infrastructure/interruptRecord.js';
import { GateVerdict } from '../../../src/infrastructure/perceptionContracts.js';
import { projectEvidenceView, projectEvidenceFromPercept, normalizeCompareText } from '../../../src/infrastructure/evidenceView.js';
import { evaluationsForEvidence } from '../../../src/infrastructure/exactTextCompare.js';
import { AttentionBid } from '../../../src/infrastructure/attentionBid.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIXTURE = 'the screen answers 42';
const SECRET_CAPTION = 'PRIVATE_CAPTION_MUST_NOT_LEAK';
const EXPECT_TEXT = 'EXPECT_PHRASE_DO_NOT_PUT_ON_VIEW';

function horizon(ms = 60_000) {
    return new Date(Date.now() + ms).toISOString();
}

function prediction(overrides = {}) {
    return new Prediction({
        producer: 'm-act',
        scopeId: 'hands',
        actId: 'act-fixture',
        target: { sourceId: 'mock', modality: 'text', eventType: 'Sense-mock' },
        representation: { kind: 'text', value: FIXTURE },
        basis: { kind: 'realize', text: EXPECT_TEXT },
        validUntil: horizon(),
        ...overrides,
    });
}

function view(overrides = {}) {
    return projectEvidenceView({
        id: 'evidence-1',
        sourceId: 'mock',
        modality: 'text',
        provenance: 'simulated',
        tier: 0,
        actId: 'act-fixture',
        occurredAt: new Date().toISOString(),
        archivalText: FIXTURE,
        eventType: 'Sense-mock',
        ...overrides,
    });
}

describe('private evidence view', () => {
    test('projects percept fields without an independent identity or expect text', () => {
        const percept = new Percept({
            id: 'p-keep',
            sourceId: 'mock',
            modality: 'text',
            provenance: 'simulated',
            actId: 'act-fixture',
            record: new InterruptRecord({
                source: 'External', type: 'Sense-mock', reason: FIXTURE, actId: 'act-fixture',
            }),
            gateTrail: [
                new GateVerdict({ stage: 'acquisition', permitted: true, reason: 'open',
                    apertureState: 'open', gate: 'outside' }),
                new GateVerdict({ stage: 'awareness', permitted: true, reason: 'tier-0-mirror',
                    apertureState: 'open', gate: 'outside' }),
            ],
        });
        const projected = projectEvidenceFromPercept(percept);
        expect(projected.id).toBe(percept.id);
        expect(projected.actId).toBe('act-fixture');
        expect(projected.archivalText).toBe(FIXTURE);
        expect(projected.eventType).toBe('Sense-mock');
        expect(Object.isFrozen(projected)).toBe(true);
        const blob = JSON.stringify(projected);
        expect(blob).toContain(FIXTURE);
        expect(blob).not.toContain(EXPECT_TEXT);
        expect(blob).not.toContain(SECRET_CAPTION);
        expect(String(projected)).not.toContain(SECRET_CAPTION);
        expect(projectEvidenceView({
            id: 'x', archivalText: FIXTURE, sourceId: 'mock',
            caption: SECRET_CAPTION, expect: EXPECT_TEXT, hiddenWorld: 'wet',
        }).toJSON()).not.toHaveProperty('caption');
        expect(JSON.stringify(projectEvidenceView({
            id: 'x', archivalText: FIXTURE, sourceId: 'mock',
        }))).not.toContain(SECRET_CAPTION);
    });

    test('normalizeCompareText is NFC, line-ending, and outer-whitespace exact', () => {
        const composed = 'cafe\u0301';
        const precomposed = 'caf\u00e9';
        expect(normalizeCompareText(composed)).toBe(normalizeCompareText(precomposed));
        expect(normalizeCompareText('  42\r\n')).toBe('42');
        expect(normalizeCompareText('\t42\n')).toBe('42');
        expect(normalizeCompareText('42')).not.toBe(normalizeCompareText('43'));
    });
});

describe('exact-text comparator', () => {
    test('8. exact fixture text produces match/mismatch without rewriting a percept', () => {
        const p = prediction();
        const matched = evaluationsForEvidence([p], view());
        expect(matched).toHaveLength(1);
        expect(matched[0]).toBeInstanceOf(Evaluation);
        expect(matched[0].verdict).toBe('match');
        expect(matched[0].subject).toEqual({ kind: 'prediction', id: p.id });
        expect(matched[0].evidenceIds).toEqual(['evidence-1']);
        expect(matched[0].id).toMatch(UUID);
        expect(Object.isFrozen(matched[0])).toBe(true);

        const mismatched = evaluationsForEvidence([p], view({ archivalText: 'the screen answers 43' }));
        expect(mismatched[0].verdict).toBe('mismatch');
        expect(mismatched[0].evidenceIds).toEqual(['evidence-1']);

        const nfc = evaluationsForEvidence(
            [prediction({ representation: { kind: 'text', value: '  caf\u00e9\r\n' } })],
            view({ archivalText: '\tcafé  ' }),
        );
        expect(nfc[0].verdict).toBe('match');
    });

    test('9. unknown or ordinary natural-language comparison produces insufficient, not confident mismatch', () => {
        const p = prediction();
        const ordinary = view({
            actId: 'some-other-act',
            archivalText: 'I wonder whether the weather will hold tomorrow, perhaps with rain.',
        });
        const unmatched = evaluationsForEvidence([p], ordinary);
        expect(unmatched).toEqual([]);
        expect(unmatched.some(e => e.verdict === 'mismatch')).toBe(false);

        const incomplete = evaluationsForEvidence([p], view({ archivalText: '   ' }));
        expect(incomplete).toHaveLength(1);
        expect(incomplete[0].verdict).toBe('insufficient');
        expect(incomplete[0].verdict).not.toBe('mismatch');

        const prose = evaluationsForEvidence([p], view({
            archivalText: 'I wonder whether the weather will hold tomorrow, perhaps with rain.',
        }));
        expect(prose).toHaveLength(1);
        expect(prose[0].verdict).toBe('insufficient');
        expect(prose[0].verdict).not.toBe('mismatch');

        const expired = prediction({ validUntil: new Date(Date.now() + 5).toISOString() });
        const past = evaluationsForEvidence([expired], view({ actId: expired.actId }), {
            now: Date.parse(expired.validUntil) + 1,
        });
        expect(past[0].verdict).toBe('insufficient');
        expect(past[0].verdict).not.toBe('mismatch');

        const unknown = evaluationsForEvidence([{ id: 'not-a-prediction', actId: 'act-fixture' }], view());
        expect(unknown).toEqual([]);
        expect(unknown.some(e => e.verdict === 'mismatch')).toBe(false);
    });

    test('abort and deadline return no evaluations without throwing', () => {
        const p = prediction();
        const aborted = new AbortController();
        aborted.abort();
        expect(evaluationsForEvidence([p], view(), { signal: aborted.signal })).toEqual([]);
        expect(evaluationsForEvidence([p], view(), { now: 10, deadline: 5 })).toEqual([]);
    });

    test('compares only matching actId and trusted target metadata', () => {
        const p = prediction();
        expect(evaluationsForEvidence([p], view({ actId: 'other' }))).toEqual([]);
        expect(evaluationsForEvidence([p], view({ sourceId: 'garden' }))).toEqual([]);
        expect(evaluationsForEvidence([p], view({ eventType: 'Sense-garden' }))).toEqual([]);
        expect(evaluationsForEvidence([p], view({ modality: 'vision' }))).toEqual([]);
    });
});

describe('evaluation-commit', () => {
    test('is id-only: no expect or archival text, delivered by fire', () => {
        expect(EVALUATION_COMMIT_DELIVERY).toBe('fire');
        expect(EVALUATION_COMMIT_EVENT).toBe('evaluation-commit');
        const payload = evaluationCommitPayload({
            evaluationIds: ['e1'],
            verdicts: ['match'],
            evidenceId: 'ev1',
            actId: 'act1',
            predictionId: 'pred1',
        });
        expect(Object.isFrozen(payload)).toBe(true);
        const blob = JSON.stringify(payload);
        expect(blob).not.toContain(EXPECT_TEXT);
        expect(blob).not.toContain(FIXTURE);
        expect(payload).not.toHaveProperty('archivalText');
        expect(payload).not.toHaveProperty('expect');
        const fired = [];
        fireEvaluationCommit({ fire(name, detail) { fired.push({ name, detail }); } }, payload);
        expect(fired[0].name).toBe(EVALUATION_COMMIT_EVENT);
        expect(fired[0].detail).toBe(payload);
        expect(() => fireEvaluationCommit({ pub() {} }, payload)).toThrow(/fire/);
    });
});

describe('AttentionBid evaluation ids', () => {
    test('carries committed ids without changing salience or the percept', () => {
        const evidence = new Percept({
            sourceId: 'garden',
            record: new InterruptRecord({
                source: 'External', type: 'Sense-garden', reason: 'A change.', salience: 0.8,
            }),
            gateTrail: [
                new GateVerdict({ stage: 'acquisition', permitted: true, reason: 'open',
                    apertureState: 'open', gate: 'outside' }),
                new GateVerdict({ stage: 'awareness', permitted: true, reason: 'tier-0-mirror',
                    apertureState: 'open', gate: 'outside' }),
            ],
        });
        const plain = new AttentionBid({ evidence });
        expect(plain.evaluationIds).toEqual([]);
        expect(plain.salience).toBeCloseTo(0.8);
        const withIds = new AttentionBid({ evidence, evaluationIds: ['e-1'] });
        expect(withIds.evaluationIds).toEqual(['e-1']);
        expect(withIds.salience).toBe(plain.salience);
        expect(withIds.evidence).toBe(evidence);
        expect(Object.isFrozen(withIds.evaluationIds)).toBe(true);
    });
});
