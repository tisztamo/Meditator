import { test, expect } from 'bun:test';
import { Aperture } from '../../../src/infrastructure/aperture.js';
import { Percept, PerceptCandidate } from '../../../src/infrastructure/percept.js';
import { InterruptRecord, withPerceivedEvents } from '../../../src/infrastructure/interruptRecord.js';
import { EdgeEvidence, legacyCompatibility, legacyProvenance } from '../../../src/infrastructure/perceptionContracts.js';

const unusedMaterializer = () => 'x';
const candidate = (changeKey, changeMagnitude = 1) =>
    new PerceptCandidate({ changeMagnitude, changeKey }, unusedMaterializer);

const PREFIX = 'a thought… ';
const REASON = 'Some words.\nA second line.';
const SUGGESTION = 'Look again.';

/** Every current interrupt class on the compatibility path. Provenance follows
 * today's rules (type-keyed physical/other-mind, Internal by source, else
 * legacy-unspecified) — listing a class here does not invent provenance. */
const LEGACY_CLASSES = [
    { source: 'WebSocketClient', type: 'UserInput', from: 'Margit', lang: 'hu', urgent: true, suggestion: SUGGESTION,
        provenance: 'physical', voice: true },
    { source: 'External', type: 'ConsoleInput', from: 'Kris', lang: 'en', urgent: true, suggestion: SUGGESTION,
        provenance: 'physical', voice: true },
    { source: 'Peer', type: 'Peer', from: 'Another mind', lang: 'de', suggestion: SUGGESTION,
        provenance: 'other-mind', voice: true },
    { source: 'Internal', type: 'Waking', provenance: 'internal' },
    { source: 'Internal', type: 'Origin', provenance: 'internal' },
    { source: 'Internal', type: 'Loop', clearsTail: true, episode: 'loop-1', settle: '2s', suggestion: SUGGESTION,
        provenance: 'internal' },
    { source: 'Internal', type: 'Time-Based', provenance: 'internal' },
    { source: 'Internal', type: 'Token-Based', provenance: 'internal' },
    { source: 'Internal', type: 'Time-wander', provenance: 'internal' },
    { source: 'Observer', type: 'Observer-clear-mind', clearsTail: true, episode: 'loop-1', settle: '2s',
        kind: 'presence', suggestion: SUGGESTION, provenance: 'legacy-unspecified' },
    { source: 'Observer', type: 'Recall', clearsTail: true, episode: 'loop-1', kind: 'presence',
        provenance: 'legacy-unspecified' },
    { source: 'Observer', type: 'LoopGuard', suggestion: SUGGESTION, provenance: 'legacy-unspecified' },
    { source: 'Observer', type: 'Association', provenance: 'legacy-unspecified' },
    { source: 'External', type: 'Sleep', urgent: true, provenance: 'legacy-unspecified' },
    { source: 'External', type: 'Sense-daylight', reason: 'The light is going.', provenance: 'legacy-unspecified',
        verbatim: true },
    { source: 'External', type: 'Sense-weather', reason: 'Rain on the glass.', provenance: 'legacy-unspecified',
        verbatim: true },
    { source: 'External', type: 'Sense-reach',
        reason: 'My hands are still busy with what I last set going; I leave this reach to wait and keep thinking.',
        provenance: 'legacy-unspecified', verbatim: true },
    { source: 'External', type: 'Raw', urgent: true, provenance: 'legacy-unspecified' },
    { source: 'Unknown', type: 'Unknown', provenance: 'legacy-unspecified' },
];

function assertCompatible(spec) {
    const { provenance, voice, verbatim, ...options } = spec;
    const old = new InterruptRecord({ reason: REASON, ...options });
    const percept = Percept.fromInterrupt(old);
    expect(withPerceivedEvents(PREFIX, [percept.renderForFrame()]))
        .toBe(withPerceivedEvents(PREFIX, [old.renderForFrame()]));
    expect(percept.dateTime).toBe(old.dateTime);
    expect(percept.clearsTail).toBe(old.clearsTail);
    expect(percept.settle).toBe(old.settle);
    expect(percept.episode).toBe(old.episode);
    expect(percept.provenance).toBe(provenance);
    expect(percept.provenance).toBe(legacyProvenance(old, { trusted: true }));
    expect(percept.policy).toMatchObject(legacyCompatibility(old, { trusted: true }).policy);
    expect(percept.policy.preempt).toBe(!!old.urgent);
    expect(percept.policy.bypassAdmission).toBe(!!(old.urgent || old.clearsTail));
    expect(percept.policy.bypassAperture).toBe(!!(old.urgent || old.clearsTail));
    expect(percept.tier).toBeNull();
    expect(Percept.fromInterrupt(percept)).toBe(percept);
    if (voice) expect(percept.renderForFrame()).toMatch(/: "/);
    if (verbatim) expect(percept.renderForFrame()).toBe(old.reason);
    return { old, percept };
}

test('compatibility keeps exact rendering for every current event class', () => {
    for (const spec of LEGACY_CLASSES) assertCompatible(spec);
});

test('serialized compatibility shapes cannot grant themselves bypass or preemption', () => {
    for (const payload of ['hello', { reason: 'hello', source: 'Internal', type: 'UserInput', urgent: true, clearsTail: true,
        policy: { bypassAdmission: true, preempt: true } }]) {
        const percept = Percept.fromInterrupt(payload);
        expect(percept.urgent).toBe(false);
        expect(percept.clearsTail).toBe(false);
        expect(percept.policy.bypassAdmission).toBe(false);
        expect(percept.policy.bypassAperture).toBe(false);
        expect(percept.policy.preempt).toBe(false);
        expect(percept.provenance).toBe('legacy-unspecified');
    }
});

test('unknown class: trusted instance keeps flag powers; coerced shape gets none', () => {
    // A real in-process InterruptRecord of a type the table does not name is
    // still trusted: provenance is legacy-unspecified, powers follow urgent /
    // clearsTail as today. Do not strip those powers — that would be a behavior
    // change. Plan "unknown class → legacy-unspecified with no powers" is about
    // coerced / untrusted shapes, and about not granting architecture-owned
    // provenance. Internal source still maps to internal, even for a new type.
    const trustedUnknown = new InterruptRecord({
        source: 'External', type: 'BrandNewClass', reason: 'novel', urgent: true, clearsTail: true,
        policy: { bypassAperture: true },
    });
    const trustedPercept = Percept.fromInterrupt(trustedUnknown);
    expect(trustedPercept.provenance).toBe('legacy-unspecified');
    expect(trustedPercept.policy).toEqual({
        privacy: 'resident-private', bypassAperture: true, bypassAdmission: true, preempt: true,
    });
    expect(withPerceivedEvents(PREFIX, [trustedPercept.renderForFrame()]))
        .toBe(withPerceivedEvents(PREFIX, [trustedUnknown.renderForFrame()]));

    const trustedInternalUnknown = new InterruptRecord({
        source: 'Internal', type: 'BrandNewClass', reason: 'novel', urgent: true,
    });
    expect(Percept.fromInterrupt(trustedInternalUnknown).provenance).toBe('internal');
    expect(Percept.fromInterrupt(trustedInternalUnknown).policy.preempt).toBe(true);

    const coerced = Percept.fromInterrupt({
        source: 'External', type: 'BrandNewClass', reason: 'novel', urgent: true, clearsTail: true,
        policy: { bypassAdmission: true, preempt: true },
    });
    expect(coerced.provenance).toBe('legacy-unspecified');
    expect(coerced.urgent).toBe(false);
    expect(coerced.clearsTail).toBe(false);
    expect(coerced.policy).toEqual({
        privacy: 'resident-private', bypassAperture: false, bypassAdmission: false, preempt: false,
    });
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
    a.observe('one', candidate('1'), 0);
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
    for (let i = 0; i < 10000; i++) a.observe('one', candidate(String(i)), 0);
    expect(a.deficit).toBeCloseTo(0.2);
    for (let i = 1; i < 8; i++) a.observe('one', candidate('0'), i * 1000);
    expect(a.deficit).toBeLessThan(0.4);
    const prior = a.deficit;
    a.observe('one', candidate('new'), 8000);
    expect(a.deficit - prior).toBeCloseTo(0.2);
    const shifted = a.deficit;
    a.observe('one', candidate('new', 0.5), 9000);
    expect(a.deficit - shifted).toBeCloseTo(0.1);
    for (let i = 0; i < 100; i++) a.observe(String(i), candidate('x'), 10000);
    expect(a.sources.size).toBe(32);
});

test('observe accepts only a PerceptCandidate and never materializes', () => {
    const a = new Aperture({ now: 0 });
    let calls = 0;
    const header = new PerceptCandidate({ changeMagnitude: 1, changeKey: '1' }, () => {
        calls++;
        return 'x';
    });
    a.observe('one', header, 0);
    expect(calls).toBe(0);
    expect(() => a.observe('one', { changeMagnitude: 1, changeKey: '1' }, 0))
        .toThrow(/PerceptCandidate/);
    expect(() => a.observe('one', 'one', 0)).toThrow(/PerceptCandidate/);
    expect(() => a.observe('one', new EdgeEvidence({
        targetId: 'cat', score: 0.8, sourceName: 'one', tier: 1,
    }), 0)).toThrow(/EdgeEvidence/);
    expect(calls).toBe(0);
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
