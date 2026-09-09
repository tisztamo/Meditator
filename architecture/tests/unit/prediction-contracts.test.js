import { test, expect, describe } from 'bun:test';
import {
    Prediction, MAX_PREDICTION_LIFETIME_MS, PREDICTION_EVENT, PREDICTION_SETTLED_EVENT,
    PREDICTION_DELIVERY, PREDICTION_KIND, expirePrediction, cancelPrediction,
    predictionSettlement, firePrediction, firePredictionSettlement,
} from '../../../src/infrastructure/predictionContracts.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T/;

function horizon(ms = 60_000) {
    return new Date(Date.now() + ms).toISOString();
}

function prediction(overrides = {}) {
    return new Prediction({
        producer: 'm-act',
        scopeId: 'hands',
        representation: { kind: 'text', value: 'the screen answers 42' },
        basis: { kind: 'realize', text: 'expect the screen to show 42' },
        validUntil: horizon(),
        ...overrides,
    });
}

describe('Prediction', () => {
    test('id and times are substrate-owned; caller payloads cannot mint them', () => {
        const forgedAt = '2000-01-01T00:00:00.000Z';
        const p = prediction({
            id: 'pred-stolen',
            basisAt: forgedAt,
            validFrom: forgedAt,
            actId: 'act-from-producer',
            validUntil: horizon(5_000),
        });
        expect(p.id).not.toBe('pred-stolen');
        expect(p.id).toMatch(UUID);
        expect(p.basisAt).not.toBe(forgedAt);
        expect(p.validFrom).not.toBe(forgedAt);
        expect(p.basisAt).toMatch(ISO);
        expect(p.validFrom).toMatch(ISO);
        expect(p.validUntil).toMatch(ISO);
        expect(p.actId).toBe('act-from-producer');
        expect(p.kind).toBe(PREDICTION_KIND);
        expect(Date.parse(p.validFrom)).toBeGreaterThan(Date.parse(forgedAt));
    });

    test('is frozen and settlement is not written onto it', () => {
        const p = prediction();
        expect(Object.isFrozen(p)).toBe(true);
        expect(Object.isFrozen(p.target)).toBe(true);
        expect(Object.isFrozen(p.representation)).toBe(true);
        expect(Object.isFrozen(p.basis)).toBe(true);
        expect(p).not.toHaveProperty('status');
        expect(p).not.toHaveProperty('evaluationIds');
        const expired = expirePrediction(p);
        const cancelled = cancelPrediction(p, { reason: 'disconnect' });
        expect(p.status).toBeUndefined();
        expect(() => { p.status = 'mismatched'; }).toThrow();
        expect(expired.predictionId).toBe(p.id);
        expect(cancelled.predictionId).toBe(p.id);
        expect(p.id).toMatch(UUID);
    });

    test('expiry is not mismatch; cancel does not manufacture mismatch', () => {
        const p = prediction();
        const expired = expirePrediction(p);
        const cancelled = cancelPrediction(p);
        expect(expired.status).toBe('expired');
        expect(cancelled.status).toBe('cancelled');
        expect(expired.status).not.toBe('mismatched');
        expect(cancelled.status).not.toBe('mismatched');
        expect(expired.evaluationIds).toEqual([]);
        expect(Object.isFrozen(expired)).toBe(true);
        expect(expired.settledAt).toMatch(ISO);
        expect(predictionSettlement(p, { status: 'mismatched', evaluationIds: ['e1'] }).status)
            .toBe('mismatched');
        expect(p.status).toBeUndefined();
    });

    test('validUntil is required and bounded', () => {
        expect(() => prediction({ validUntil: undefined })).toThrow(/validUntil/);
        expect(() => new Prediction({
            producer: 'm-act', scopeId: 'hands',
            representation: { kind: 'text', value: 'x' },
            basis: { kind: 'realize', text: 'y' },
        })).toThrow(/validUntil/);
        expect(() => prediction({ validUntil: 'not-a-time' })).toThrow(/valid time/);
        expect(() => prediction({ validUntil: '1999-01-01T00:00:00.000Z' })).toThrow(/within/);
        expect(() => prediction({
            validUntil: new Date(Date.now() + MAX_PREDICTION_LIFETIME_MS + 1000).toISOString(),
        })).toThrow(/within/);
        const atCap = prediction({
            validUntil: new Date(Date.now() + MAX_PREDICTION_LIFETIME_MS - 50).toISOString(),
        });
        expect(Date.parse(atCap.validUntil) - Date.parse(atCap.validFrom))
            .toBeLessThanOrEqual(MAX_PREDICTION_LIFETIME_MS);
    });

    test('target identity is structured metadata, never parsed from representation text', () => {
        const p = prediction({
            representation: { kind: 'text', value: 'sourceId=garden modality=vision eventType=Sense-garden' },
            target: { sourceId: 'terminal', modality: 'text', eventType: 'Sense-terminal' },
        });
        expect(p.target).toEqual({ sourceId: 'terminal', modality: 'text', eventType: 'Sense-terminal' });
        expect(p.target.sourceId).not.toBe('garden');
        const untargeted = prediction();
        expect(untargeted.target).toEqual({});
        expect(untargeted.target.sourceId).toBeUndefined();
    });

    test('kind is belief; unknown representation or basis is refused', () => {
        expect(() => prediction({ kind: 'truth' })).toThrow(/Prediction.kind/);
        expect(() => prediction({ representation: { kind: 'embedding', value: 'x' } }))
            .toThrow(/representation.kind/);
        expect(() => prediction({ basis: { kind: 'simulator', text: 'x' } })).toThrow(/basis.kind/);
    });
});

describe('prediction events', () => {
    test('events are fire() / @event, not a retained pub() topic', () => {
        expect(PREDICTION_DELIVERY).toBe('fire');
        expect(PREDICTION_EVENT).toBe('prediction');
        expect(PREDICTION_SETTLED_EVENT).toBe('prediction-settled');
        const fired = [];
        const host = {
            fire(name, detail) { fired.push({ name, detail }); },
            pub() { throw new Error('prediction events must not pub()'); },
        };
        const p = prediction();
        firePrediction(host, p);
        const expired = expirePrediction(p);
        firePredictionSettlement(host, expired);
        expect(fired).toEqual([
            { name: PREDICTION_EVENT, detail: p },
            { name: PREDICTION_SETTLED_EVENT, detail: expired },
        ]);
        expect(() => firePrediction({ pub() {} }, p)).toThrow(/fire/);
    });
});
