import { test, expect } from 'bun:test';
import { AttentionBid, independentSignals } from '../../../src/infrastructure/attentionBid.js';
import { Percept } from '../../../src/infrastructure/percept.js';
import { InterruptRecord } from '../../../src/infrastructure/interruptRecord.js';
import { Evaluation, GateVerdict } from '../../../src/infrastructure/perceptionContracts.js';
import {
    acceptIssuedBid, expectedBidSignals, issueOwnerBid, predictionSignalsFromEvaluations,
} from '../../../src/infrastructure/bidderPolicy.js';

function evidenceAt(salience, reason = 'A change in the garden.') {
    return new Percept({
        sourceId: 'garden',
        record: new InterruptRecord({
            source: 'External', type: 'Sense-garden', reason, salience,
        }),
        gateTrail: [
            new GateVerdict({ stage: 'acquisition', permitted: true, reason: 'open',
                apertureState: 'open', gate: 'outside' }),
            new GateVerdict({ stage: 'awareness', permitted: true, reason: 'tier-0-mirror',
                apertureState: 'open', gate: 'outside' }),
        ],
    });
}

function evaluation(verdict, extras = {}) {
    return new Evaluation({
        producer: 'm-compare',
        subject: { kind: 'prediction', id: extras.predictionId || 'pred-1' },
        evidenceIds: extras.evidenceIds || ['ev-1'],
        verdict,
        confidence: extras.confidence,
    });
}

test('16. missing evaluation is null, not match; mismatch does not replace changeMagnitude', () => {
    expect(predictionSignalsFromEvaluations([])).toEqual({
        predictionMatch: null, predictionMismatch: null,
    });
    expect(predictionSignalsFromEvaluations([evaluation('insufficient')])).toEqual({
        predictionMatch: null, predictionMismatch: null,
    });
    expect(predictionSignalsFromEvaluations([evaluation('match')])).toEqual({
        predictionMatch: 1, predictionMismatch: null,
    });
    expect(predictionSignalsFromEvaluations([evaluation('mismatch')])).toEqual({
        predictionMatch: null, predictionMismatch: 1,
    });
    const both = predictionSignalsFromEvaluations([
        evaluation('match', { predictionId: 'a' }),
        evaluation('mismatch', { predictionId: 'b' }),
    ]);
    expect(both).toEqual({ predictionMatch: 1, predictionMismatch: 1 });

    const evidence = evidenceAt(0.4);
    const mismatch = evaluation('mismatch', { evidenceIds: [evidence.id] });
    const bid = issueOwnerBid({
        bidder: {
            createBid({ evidence: ev, evaluations, gainTrail, requestedFloor }) {
                const { predictionMatch, predictionMismatch } = predictionSignalsFromEvaluations(evaluations);
                return new AttentionBid({
                    evidence: ev,
                    gainTrail,
                    requestedFloor,
                    mismatchWeight: 0.9,
                    evaluationIds: evaluations.map(e => e.id),
                    signals: independentSignals({
                        changeMagnitude: ev.salience,
                        requested: ev.requestId != null,
                        predictionMatch,
                        predictionMismatch,
                    }),
                });
            },
        },
        evidence,
        evaluations: [mismatch],
    });
    expect(bid.signals.changeMagnitude).toBe(0.4);
    expect(bid.signals.predictionMismatch).toBe(1);
    expect(bid.signals.predictionMatch).toBeNull();
    expect(evidence.salience).toBe(0.4);
    expect(bid.salience).toBe(0.9);
});

test('17. a custom bidder cannot replace evidence, ids, powers, evaluations, or signals', () => {
    const evidence = evidenceAt(0.5);
    const other = evidenceAt(0.9, 'Other evidence.');
    const ev = evaluation('match', { evidenceIds: [evidence.id] });
    const expectedSignals = expectedBidSignals({
        evidence, evaluations: [ev], populatePrediction: true,
    });
    const evaluationIds = [ev.id];

    const good = new AttentionBid({
        evidence,
        evaluationIds,
        expectedFloor: 0.8,
        signals: expectedSignals,
    });
    expect(acceptIssuedBid(good, { evidence, expectedSignals, evaluationIds })).toBe(true);

    expect(acceptIssuedBid(new AttentionBid({
        evidence: other,
        evaluationIds,
        signals: expectedBidSignals({ evidence: other, evaluations: [ev], populatePrediction: true }),
    }), { evidence, expectedSignals, evaluationIds })).toBe(false);

    expect(acceptIssuedBid(new AttentionBid({
        evidence,
        evaluationIds: ['forged-id'],
        signals: expectedSignals,
    }), { evidence, expectedSignals, evaluationIds })).toBe(false);

    expect(acceptIssuedBid(new AttentionBid({
        evidence,
        evaluationIds,
        signals: independentSignals({
            changeMagnitude: 0.5, requested: false, predictionMatch: 0,
        }),
    }), { evidence, expectedSignals, evaluationIds })).toBe(false);

    expect(issueOwnerBid({
        bidder: { createBid() { return new AttentionBid({ evidence: other }); } },
        evidence,
        evaluations: [ev],
    })).toBeNull();

    expect(issueOwnerBid({
        bidder: { createBid() { throw new Error('nope'); } },
        evidence,
        evaluations: [ev],
    })).toBeNull();

    const absent = issueOwnerBid({ evidence, evaluations: [ev] });
    expect(absent.signals.predictionMatch).toBeNull();
    expect(absent.evaluationIds).toEqual([ev.id]);
    expect(absent.salience).toBe(0.5);
});
