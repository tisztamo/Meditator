import { test, expect } from 'bun:test';
import { AttentionBid } from '../../../src/infrastructure/attentionBid.js';
import { Percept } from '../../../src/infrastructure/percept.js';
import { InterruptRecord } from '../../../src/infrastructure/interruptRecord.js';
import { GateVerdict } from '../../../src/infrastructure/perceptionContracts.js';

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

test('9. no mutation: two-level promotion leaves evidence identical to issue', () => {
    const evidence = evidenceAt(0.8);
    const salience = evidence.salience;
    const renditions = evidence.renditions.map(r => ({ ...r }));
    const gateTrail = [...evidence.gateTrail];
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(() => { evidence.salience = 0; }).toThrow();

    const bid = new AttentionBid({
        evidence,
        gainTrail: [{ gate: 'outside', factor: 1 }],
    });
    bid.gainTrail.push(Object.freeze({ gate: 'm-interrupts', factor: 0.5 }));
    bid.recomputeSalience();

    expect(bid.salience).toBeCloseTo(0.4);
    expect(bid.gainTrail).toEqual([
        { gate: 'outside', factor: 1 },
        { gate: 'm-interrupts', factor: 0.5 },
    ]);
    expect(evidence.salience).toBe(salience);
    expect(evidence.salience).toBe(0.8);
    expect(evidence.renditions).toEqual(renditions);
    expect(evidence.gateTrail).toEqual(gateTrail);
    expect(JSON.stringify(bid)).not.toMatch(/gateTrail|renditions|"policy"/);
    expect(JSON.stringify(bid)).not.toContain('"evidence"');
});

test('10. independence: two bids on the same evidence do not see each other', () => {
    const evidence = evidenceAt(0.8);
    const quiet = new AttentionBid({ evidence, gainTrail: [{ gate: 'narrow', factor: 0.25 }] });
    const loud = new AttentionBid({ evidence, gainTrail: [{ gate: 'open', factor: 1 }] });
    const threshold = 0.35;
    expect(quiet.salience).toBeCloseTo(0.2);
    expect(loud.salience).toBeCloseTo(0.8);
    expect(quiet.salience < threshold).toBe(true);
    expect(loud.salience >= threshold).toBe(true);

    quiet.decisions.push(Object.freeze({ by: 'a', accepted: false, why: 'below threshold', at: 1 }));
    loud.gainTrail.push(Object.freeze({ gate: 'faculty', factor: 0.5 }));
    loud.recomputeSalience();
    expect(loud.salience).toBeCloseTo(0.4);
    expect(quiet.gainTrail).toEqual([{ gate: 'narrow', factor: 0.25 }]);
    expect(loud.decisions).toHaveLength(0);
    expect(quiet.decisions).toHaveLength(1);
    expect(evidence.salience).toBe(0.8);
    expect(quiet.evidenceId).toBe(evidence.id);
    expect(loud.evidenceId).toBe(evidence.id);
    expect(quiet.id).not.toBe(loud.id);
});

test('11. identity through the split: evidenceOf never mints a new id', () => {
    const evidence = evidenceAt(0.9);
    const bid = new AttentionBid({ evidence, gainTrail: [{ gate: 'outside', factor: 0.5 }] });
    expect(bid.evidenceId).toBe(evidence.id);
    expect(bid.id).not.toBe(evidence.id);
    expect(AttentionBid.evidenceOf(bid)).toBe(evidence);
    expect(AttentionBid.evidenceOf(bid).id).toBe(evidence.id);
    expect(Percept.fromInterrupt(bid)).toBe(evidence);
    expect(Percept.fromInterrupt(bid).id).toBe(evidence.id);
    expect(AttentionBid.from(bid)).toBe(bid);

    const passed = AttentionBid.from(new InterruptRecord({
        source: 'Observer', type: 'Test', reason: 'legacy', salience: 0.7,
    }));
    expect(passed).toBeInstanceOf(AttentionBid);
    expect(AttentionBid.evidenceOf(passed).id).toBe(passed.evidenceId);
    expect(Percept.fromInterrupt(passed).id).toBe(passed.evidenceId);
});

test('delegated read surface is not a second Percept; salience is the gained value', () => {
    const evidence = evidenceAt(0.9);
    const bid = new AttentionBid({ evidence, gainTrail: [{ gate: 'outside', factor: 0.5 }] });
    expect(bid.salience).toBeCloseTo(0.45);
    expect(bid.source).toBe(evidence.source);
    expect(bid.type).toBe(evidence.type);
    expect(bid.reason).toBe(evidence.reason);
    expect(bid.dateTime).toBe(evidence.dateTime);
    expect(bid.renderForFrame()).toBe(evidence.renderForFrame());
    expect(bid.provenance).toBeUndefined();
    expect(bid.gateTrail).toBeUndefined();
    expect(bid.policy).toBeUndefined();
    expect(Object.keys(bid)).not.toContain('evidence');
    expect(Object.keys(bid)).not.toContain('signals');
    expect(JSON.stringify(bid)).not.toContain('requestedFloor');
});

test('recomputeSalience reapplies decideBid so a requested floor survives nested gain', () => {
    const evidence = new Percept({
        sourceId: 'garden',
        requestId: 'req-still',
        record: new InterruptRecord({
            source: 'External', type: 'Sense-garden', reason: 'Unchanged.', salience: 0,
        }),
        gateTrail: [
            new GateVerdict({ stage: 'acquisition', permitted: true, reason: 'open',
                apertureState: 'open', gate: 'outside' }),
            new GateVerdict({ stage: 'awareness', permitted: true, reason: 'tier-0-mirror',
                apertureState: 'open', gate: 'outside' }),
        ],
    });
    const bid = new AttentionBid({
        evidence,
        gainTrail: [{ gate: 'outside', factor: 1 }],
        signals: { changeMagnitude: 0, requested: true, novelty: null },
        requestedFloor: 0.5,
    });
    expect(bid.salience).toBeCloseTo(0.5);
    expect(evidence.salience).toBe(0);
    bid.gainTrail.push(Object.freeze({ gate: 'm-interrupts', factor: 0.5 }));
    bid.recomputeSalience();
    expect(bid.salience).toBeCloseTo(0.25);
    bid.gainTrail.push(Object.freeze({ gate: 'loud', factor: 2 }));
    bid.recomputeSalience();
    expect(bid.salience).toBeCloseTo(0.5);
    expect(evidence.salience).toBe(0);
    expect(bid.signals).toEqual({ changeMagnitude: 0, requested: true, novelty: null });
    expect(bid.requestedFloor).toBe(0.5);
});

test('legacy from(InterruptRecord) derives default signals and floor 0', () => {
    const passed = AttentionBid.from(new InterruptRecord({
        source: 'Observer', type: 'Test', reason: 'legacy', salience: 0.8,
    }));
    expect(passed.salience).toBeCloseTo(0.8);
    expect(passed.signals).toEqual({
        changeMagnitude: 0.8, requested: false, novelty: null,
    });
    expect(passed.requestedFloor).toBe(0);
    passed.gainTrail.push(Object.freeze({ gate: 'faculty', factor: 0.5 }));
    passed.recomputeSalience();
    expect(passed.salience).toBeCloseTo(0.4);
});
