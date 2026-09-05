import { test, expect } from 'bun:test';
import { Aperture } from '../../../src/infrastructure/aperture.js';
import { Percept, PerceptCandidate } from '../../../src/infrastructure/percept.js';
import { InterruptRecord, withPerceivedEvents } from '../../../src/infrastructure/interruptRecord.js';

test('compatibility keeps exact voice, suggestion, and loop-break rendering', () => {
    for (const options of [
        { source: 'External', type: 'UserInput', from: 'Margit', lang: 'hu', urgent: true },
        { source: 'External', type: 'Peer', from: 'Another mind' },
        { source: 'Internal', type: 'Loop', clearsTail: true, episode: 'loop-1', settle: '2s' },
    ]) {
        const old = new InterruptRecord({ ...options, reason: 'Some words.\nA second line.', suggestion: 'Look again.' });
        const percept = Percept.fromInterrupt(old);
        expect(withPerceivedEvents('a thought… ', [percept.renderForFrame()]))
            .toBe(withPerceivedEvents('a thought… ', [old.renderForFrame()]));
        expect(percept.dateTime).toBe(old.dateTime);
        expect(percept.clearsTail).toBe(old.clearsTail);
        expect(percept.settle).toBe(old.settle);
        expect(percept.policy.preempt).toBe(old.urgent);
        expect(percept.policy.bypassAdmission).toBe(old.urgent || old.clearsTail);
        expect(Percept.fromInterrupt(percept)).toBe(percept);
    }
});

test('serialized compatibility shapes cannot grant themselves bypass or preemption', () => {
    for (const payload of ['hello', { reason: 'hello', source: 'Internal', type: 'UserInput', urgent: true, clearsTail: true,
        policy: { bypassAdmission: true, preempt: true } }]) {
        const percept = Percept.fromInterrupt(payload);
        expect(percept.urgent).toBe(false);
        expect(percept.clearsTail).toBe(false);
        expect(percept.policy.bypassAdmission).toBe(false);
        expect(percept.provenance).toBe('legacy-unspecified');
    }
});

test('headers expose no semantics and materialization requires real archival text', async () => {
    let calls = 0;
    const candidate = new PerceptCandidate({ changeKey: 'private-caption.png', caption: 'secret',
        changeMagnitude: 99, provenance: 'physical', policy: { preempt: true } }, kinds => {
        calls++;
        expect(kinds).toEqual(['text']);
        return 'A simulated light changes.';
    });
    expect(calls).toBe(0);
    expect(JSON.stringify(candidate)).not.toMatch(/secret|private-caption|physical|preempt/);
    expect(candidate.changeMagnitude).toBe(1);
    expect(await candidate.materialize()).toBe('A simulated light changes.');
    expect(calls).toBe(1);
    await expect(new PerceptCandidate({}, () => '').materialize()).rejects.toThrow('archival text');
});

test('deficit survives opening and rejects stale/repeated receipts', () => {
    const a = new Aperture({ state: 'closed', now: 0, dwellMs: 1000 });
    a.observe('one', { changeMagnitude: 1, changeKey: '1' }, 0);
    const deficit = a.deficit;
    expect(a.orient('open', { now: 1000 })).toBe(true);
    expect(a.deficit).toBe(deficit);
    expect(a.orient('closed', { now: 1001 })).toBe(false);
    expect(a.attended(0, 40000)).toBe(false);
    expect(a.attended(39000, 40000)).toBe(true);
    expect(a.deficit).toBeCloseTo(deficit * 0.1);
    expect(a.attended(39000, 40000)).toBe(false);
});

test('fake-clock reopening is gradual, has an arousal floor, and stops in sleep', () => {
    const a = new Aperture({ state: 'closed', now: 0, dwellMs: 1000, horizonMs: 10000 });
    expect(a.advance(26000, { arousal: 0 })).toBe(true);
    expect(a.state).toBe('soft');
    expect(a.advance(26001, { arousal: 0 })).toBe(false);
    a.advance(36000, { arousal: 0 });
    expect(a.state).toBe('open');
    const before = a.deficit;
    a.advance(1000000, { awake: false });
    expect(a.deficit).toBe(before);
    a.advance(1000001);
    expect(a.deficit - before).toBeLessThan(0.001);
});

test('noise is bounded and habituates; a changed key or magnitude restores credit', () => {
    const a = new Aperture({ now: 0 });
    for (let i = 0; i < 10000; i++) a.observe('one', { changeMagnitude: 1, changeKey: String(i) }, 0);
    expect(a.deficit).toBeCloseTo(0.2);
    for (let i = 1; i < 8; i++) a.observe('one', { changeMagnitude: 1, changeKey: '0' }, i * 1000);
    expect(a.deficit).toBeLessThan(0.4);
    const prior = a.deficit;
    a.observe('one', { changeMagnitude: 1, changeKey: 'new' }, 8000);
    expect(a.deficit - prior).toBeCloseTo(0.2);
    const shifted = a.deficit;
    a.observe('one', { changeMagnitude: 0.5, changeKey: 'new' }, 9000);
    expect(a.deficit - shifted).toBeCloseTo(0.1);
    for (let i = 0; i < 100; i++) a.observe(String(i), { changeMagnitude: 1, changeKey: 'x' }, 10000);
    expect(a.sources.size).toBe(32);
});

test('aperture bypass, admission bypass, and preemption remain independent', () => {
    const a = new Aperture({ state: 'closed' });
    expect(a.allows('voice', { bypassAdmission: true, preempt: true })).toBe(false);
    expect(a.allows('voice', { bypassAperture: true })).toBe(true);
    const percept = new Percept({ sourceId: 'loop', record: new InterruptRecord({ reason: 'Turn outward.' }),
        policy: { bypassAdmission: true } });
    expect(percept.urgent).toBe(false);
    expect(percept.policy.bypassAdmission).toBe(true);
});
