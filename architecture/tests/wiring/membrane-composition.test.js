// Membrane composition (phase 2 M2–M3, M6 regulator, M7 nested source control,
// M8 pressure fold and aggregator): percept-candidate at acquisition and awareness.
// Fixtures W1/W2/W3, conjunction, the version chain, a test-only regulator port,
// requestControl through nesting, the P1 fold, and aggregator substitution.
import './setup.js';
import { test, expect, afterEach } from 'bun:test';
import A from 'amanita';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { delay } from './setup.js';
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js';
import { MMind } from '../../../src/mindComponents/mind/mMind.js';
import { MBaseComponent } from '../../../src/mindComponents/shared/mBaseComponent.js';
import { Percept } from '../../../src/infrastructure/percept.js';
import { AttentionBid } from '../../../src/infrastructure/attentionBid.js';
import { Aperture } from '../../../src/infrastructure/aperture.js';
import { GateVerdict, pushGainTrail, ControlRequest } from '../../../src/infrastructure/perceptionContracts.js';
import { InterruptRecord } from '../../../src/infrastructure/interruptRecord.js';

let journalDir;

afterEach(async () => {
    const memory = document.querySelector('m-memory');
    await memory?._journalQueue;
    document.body.replaceChildren();
    if (journalDir && fs.existsSync(journalDir)) {
        fs.rmSync(journalDir, { recursive: true, force: true });
    }
    journalDir = null;
});

if (!customElements.get('m-mind')) {
    customElements.define('m-mind', class extends A(HTMLElement) {});
}

if (!customElements.get('x-mind')) {
    customElements.define('x-mind', class extends MBaseComponent {
        static provides = { mind: true }
    });
}

/** Test-only contact regulator: same horizon as the fixture, lower reflex threshold.
 * Defined before mount so part('regulator') sees it when the region connects. */
class XFastRegulator extends MBaseComponent {
    static provides = { regulator: true }
    state = 'closed'
    focus = null
    deficit = 0
    version = 0
    updatedAt = Date.now()
    lastContactAt = -Infinity
    get gain() { return this.state === 'soft' ? 0.5 : 1 }
    allows(sourceName, powers = {}) {
        return powers.bypassAperture || (this.state !== 'closed'
            && (this.state !== 'narrow' || sourceName === this.focus));
    }
    observe() {}
    advance(now, { awake = true, arousal = 1 } = {}) {
        const elapsed = Math.max(0, now - this.updatedAt);
        this.updatedAt = now;
        if (!awake) return false;
        this.deficit = Math.min(1, Math.max(0,
            this.deficit + elapsed / 10000 * (0.25 + 0.75 * Math.min(1, Math.max(0, arousal)))));
        if (this.deficit >= 0.1 && this.state === 'closed') return this.orient('soft', { now });
        if (this.deficit >= 0.2 && this.state === 'soft') return this.orient('open', { now });
        return false;
    }
    orient(state, { source = null } = {}) {
        if (state === this.state && source === this.focus) return false;
        this.state = state;
        this.focus = state === 'narrow' ? source : null;
        this.version++;
        return true;
    }
    attended(occurredAt, now = Date.now()) {
        if (!Number.isFinite(occurredAt) || occurredAt <= this.lastContactAt
            || occurredAt > now || now - occurredAt > 30000) return false;
        this.lastContactAt = occurredAt;
        this.deficit *= 0.1;
        return true;
    }
}

class XIncompleteRegulator extends MBaseComponent {
    static provides = { regulator: true }
    state = 'open'
    focus = null
    deficit = 0
    version = 0
    get gain() { return 1 }
    allows() { return true }
    observe() {}
    advance() { return false }
    orient() { return false }
}

/** Test-only mind-level mix: max of top-level folded pressures, not the mean. */
class XMaxAggregator extends MBaseComponent {
    static provides = { aggregator: true }
    aggregate(pressures) {
        return (pressures || []).reduce((m, p) => Math.max(m, Number(p) || 0), 0)
    }
}

class XConstAggregator extends MBaseComponent {
    static provides = { aggregator: true }
    aggregate() { return 0.73 }
}

class XIncompleteAggregator extends MBaseComponent {
    static provides = { aggregator: true }
}

class XNaNAggregator extends MBaseComponent {
    static provides = { aggregator: true }
    aggregate() { return NaN }
}

if (!customElements.get('x-fast-regulator')) {
    customElements.define('x-fast-regulator', XFastRegulator);
}
if (!customElements.get('x-incomplete-regulator')) {
    customElements.define('x-incomplete-regulator', XIncompleteRegulator);
}
if (!customElements.get('x-max-aggregator')) {
    customElements.define('x-max-aggregator', XMaxAggregator);
}
if (!customElements.get('x-const-aggregator')) {
    customElements.define('x-const-aggregator', XConstAggregator);
}
if (!customElements.get('x-incomplete-aggregator')) {
    customElements.define('x-incomplete-aggregator', XIncompleteAggregator);
}
if (!customElements.get('x-nan-aggregator')) {
    customElements.define('x-nan-aggregator', XNaNAggregator);
}

async function captureConnectError(inner) {
    let captured = null;
    const onError = event => {
        captured = event.error || new Error(event.message);
        event.preventDefault?.();
    };
    window.addEventListener('error', onError);
    try {
        try {
            await mount(inner);
        } catch (error) {
            captured = error;
        }
        await delay(10);
    } finally {
        window.removeEventListener('error', onError);
    }
    return captured;
}

async function mount(inner) {
    journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-compose-'));
    document.body.innerHTML = `
        <m-mind name="compose-test">
          <m-stream name="stream"></m-stream>
          <m-memory name="memory" persist="off" journal="${journalDir}"></m-memory>
          <m-interrupts name="attention" threshold="0.35" rateLimit="0s" keep="1"></m-interrupts>
          ${inner}
        </m-mind>`;
    await loadMindComponents(document);
    await delay(40);
    const mind = document.querySelector('m-mind');
    mind._identity = () => 'A text-only simulated world.';
    mind._landingOpener = () => 'I turn toward it, ';
    return mind;
}

const BASE_REGION = `
          <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
            <m-interrupts name="local" threshold="0.3" rateLimit="0s"></m-interrupts>
            <span name="mock" provenance="simulated"></span>
          </m-region>`;

const W1_REGION = `
          <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
            <m-interrupts name="local" threshold="0.3" rateLimit="0s"></m-interrupts>
            <m-region>
              <span name="mock" provenance="simulated"></span>
            </m-region>
          </m-region>`;

const W2_REGION = `
          <m-region name="shell" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
            <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
              <m-interrupts name="local" threshold="0.3" rateLimit="0s"></m-interrupts>
              <span name="mock" provenance="simulated"></span>
            </m-region>
          </m-region>`;

const W3_REGION = `
          <m-region name="shell" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
            <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
              <m-interrupts name="local" threshold="0.3" rateLimit="0s"></m-interrupts>
              <span name="mock" provenance="simulated"></span>
            </m-region>
          </m-region>`;

const header = key => ({ changeMagnitude: 0.9, changeKey: key, occurredAt: Date.now() });
function allowOrientation(region) { region.aperture.changedAt = Date.now() - 2000; }
const TEXT = 'The simulated garden is still.';
const WITHHELD = 'missed secret from inner open';
const PREIMAGE = 'secret-filename.png';

function indexEntries() {
    const file = path.join(journalDir, 'percepts.jsonl');
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

function interceptPub(el) {
    const published = [];
    const orig = el.pub.bind(el);
    el.pub = (topic, data) => {
        published.push({ topic, data });
        return orig(topic, data);
    };
    return published;
}

function interceptFire(el) {
    const fired = [];
    const orig = el.fire.bind(el);
    el.fire = (name, detail) => {
        fired.push({ name, detail });
        return orig(name, detail);
    };
    return fired;
}

function enumerableValues(value, seen = new Set()) {
    if (value == null || typeof value !== 'object') return [value];
    if (seen.has(value)) return [];
    seen.add(value);
    const out = [];
    for (const key of Object.keys(value)) {
        out.push(key, ...enumerableValues(value[key], seen));
    }
    return out;
}

function blobOf(records) {
    return records.map(r => {
        try { return JSON.stringify(r); }
        catch { return String(r); }
    }).join('\n');
}

async function driveOpenOffer(mind, { text = TEXT, changeKey = 'garden-light' } = {}) {
    const inner = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    const global = mind.querySelector('[name="attention"]');
    const memory = mind.querySelector('m-memory');
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const offer = inner.registerSource(source);
    const percept = await offer(header(changeKey), () => text);
    const pending = global.takePending();
    const fired = interceptFire(mind);
    await MMind.prototype.assembleFrame.call(mind, pending);
    await memory._journalQueue;
    const attended = fired.find(f => f.name === 'percepts-attended');
    return {
        percept,
        bids,
        pending: pending.map(p => {
            const evidence = AttentionBid.evidenceOf(p)
            return {
                reason: p.reason, salience: p.salience, source: p.source, type: p.type,
                provenance: evidence.provenance,
            }
        }),
        attended: (attended?.detail || []).map(r => ({
            renditionText: r.renditionText, sourceId: r.sourceId, provenance: r.provenance, receivedKind: r.receivedKind,
        })),
        journal: indexEntries().map(e => ({
            source: e.source, renditions: e.renditions, provenance: e.provenance, receivedKind: e.receivedKind,
        })),
    };
}

test('W1 wrap invariance: a faculty-only region around the sense changes no ordered receipts', async () => {
    const baselineMind = await mount(BASE_REGION);
    const baseline = await driveOpenOffer(baselineMind);
    await baselineMind.querySelector('m-memory')?._journalQueue;
    document.body.replaceChildren();
    fs.rmSync(journalDir, { recursive: true, force: true });

    const wrapMind = await mount(W1_REGION);
    const wrap = await driveOpenOffer(wrapMind);
    expect(wrap.pending).toEqual(baseline.pending);
    expect(wrap.attended).toEqual(baseline.attended);
    expect(wrap.journal).toEqual(baseline.journal);
    expect(wrap.percept).toBeInstanceOf(AttentionBid);
    expect(AttentionBid.evidenceOf(wrap.percept)).toBeInstanceOf(Percept);
});

test('W2 identity aperture: an outer open gate changes no receipts; only telemetry may grow', async () => {
    const baselineMind = await mount(BASE_REGION);
    const baseline = await driveOpenOffer(baselineMind);
    await baselineMind.querySelector('m-memory')?._journalQueue;
    document.body.replaceChildren();
    fs.rmSync(journalDir, { recursive: true, force: true });

    const nestedMind = await mount(W2_REGION);
    const details = [];
    nestedMind.addEventListener('percept-candidate', e => details.push(e.detail));
    const nested = await driveOpenOffer(nestedMind);
    expect(nested.pending).toEqual(baseline.pending);
    expect(nested.attended).toEqual(baseline.attended);
    expect(nested.journal).toEqual(baseline.journal);
    expect(nested.percept).toBeInstanceOf(AttentionBid);
    expect(AttentionBid.evidenceOf(nested.percept).gateTrail).toHaveLength(2);
    expect(details.map(d => d.stage)).toEqual(['acquisition', 'awareness']);
    const acquisition = details[0];
    const awareness = details[1];
    expect(acquisition.verdicts.map(v => v.gate).sort()).toEqual(['outside', 'shell']);
    expect(acquisition.versions.map(v => v.gate).sort()).toEqual(['outside', 'shell']);
    expect(acquisition.verdicts.every(v => v.permitted)).toBe(true);
    expect(acquisition.gainTrail.every(g => g.factor <= 1)).toBe(true);
    expect(awareness.verdicts.map(v => v.gate).sort()).toEqual(['outside', 'shell']);
    expect(awareness.verdicts.every(v => v.stage === 'awareness')).toBe(true);
    expect(awareness.verdicts.every(v => v.reason === 'tier-0-mirror')).toBe(true);
    expect(awareness.verdicts.every(v => v.permitted)).toBe(true);
    expect(awareness.versions).toBeUndefined();
    expect(awareness.gainTrail).toBeUndefined();
});

test('W3 outer closed over inner open: no materializer, no bids, no journal, no withheld text', async () => {
    const mind = await mount(W3_REGION);
    const inner = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    const global = mind.querySelector('[name="attention"]');
    const published = interceptPub(inner);
    const fired = interceptFire(inner);
    const firedMind = interceptFire(mind);
    const publishedMind = interceptPub(mind);
    const events = [];
    mind.addEventListener('percept-candidate', e => events.push(e.detail));
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    let renders = 0;
    const offer = inner.registerSource(source);
    const result = await offer({ ...header(PREIMAGE), reason: WITHHELD }, () => {
        renders++;
        return WITHHELD;
    });
    expect(result).toBeNull();
    expect(renders).toBe(0);
    expect(bids).toHaveLength(0);
    expect(global.takePending()).toHaveLength(0);
    expect(fs.existsSync(path.join(journalDir, 'percepts.jsonl'))).toBe(false);
    const decisions = published.filter(p => p.topic === 'perceptDecision');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].data).toEqual({
        stage: 'acquisition', source: 'mock', permitted: false, reason: 'closed',
        changeMagnitude: 0.9, apertureState: 'closed',
    });
    const blobs = [blobOf(published), blobOf(publishedMind), blobOf(fired), blobOf(firedMind), blobOf(events)];
    for (const blob of blobs) {
        expect(blob).not.toContain(WITHHELD);
        expect(blob).not.toContain(PREIMAGE);
        expect(blob).not.toContain('secret');
    }
});

test('order independence: the same nesting refuses whether listeners run inner-first or outer-first', async () => {
    const mind = await mount(W3_REGION);
    const inner = mind.querySelector('m-region[name="outside"]');
    const outer = mind.querySelector('m-region[name="shell"]');
    const source = mind.querySelector('[name="mock"]');
    const offer = inner.registerSource(source);

    let renders = 0;
    const first = await offer(header('a'), () => { renders++; return WITHHELD; });
    expect(first).toBeNull();
    expect(renders).toBe(0);

    inner.removeEventListener('percept-candidate', inner._onPerceptCandidate);
    outer.removeEventListener('percept-candidate', outer._onPerceptCandidate);
    outer.addEventListener('percept-candidate', outer._onPerceptCandidate, true);
    inner.addEventListener('percept-candidate', inner._onPerceptCandidate, true);

    const second = await offer(header('b'), () => { renders++; return WITHHELD; });
    expect(second).toBeNull();
    expect(renders).toBe(0);
});

test('fail closed: stopPropagation yields gate-missing, not admission', async () => {
    const mind = await mount(W2_REGION);
    const inner = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    const published = interceptPub(inner);
    inner.addEventListener('percept-candidate', event => event.stopPropagation());
    let renders = 0;
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const offer = inner.registerSource(source);
    const result = await offer(header('rogue'), () => { renders++; return TEXT; });
    expect(result).toBeNull();
    expect(renders).toBe(0);
    expect(bids).toHaveLength(0);
    const decisions = published.filter(p => p.topic === 'perceptDecision');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].data.permitted).toBe(false);
    expect(decisions[0].data.reason).toBe('gate-missing');
});

test('fail closed at awareness: stopPropagation after acquisition is gate-missing, not a bid', async () => {
    const mind = await mount(W2_REGION);
    const inner = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    const published = interceptPub(inner);
    inner.addEventListener('percept-candidate', event => {
        if (event.detail?.stage === 'awareness') event.stopPropagation();
    });
    let renders = 0;
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const offer = inner.registerSource(source);
    const result = await offer(header('rogue-awareness'), () => { renders++; return TEXT; });
    expect(renders).toBe(1);
    expect(result).toBeNull();
    expect(bids).toHaveLength(0);
    const awareness = published.filter(p => p.topic === 'perceptDecision' && p.data.stage === 'awareness');
    expect(awareness).toHaveLength(1);
    expect(awareness[0].data.permitted).toBe(false);
    expect(awareness[0].data.reason).toBe('gate-missing');
});

test('versions across gates: outer orientation during materialization drops the percept', async () => {
    const mind = await mount(W2_REGION);
    const inner = mind.querySelector('m-region[name="outside"]');
    const outer = mind.querySelector('m-region[name="shell"]');
    const source = mind.querySelector('[name="mock"]');
    const global = mind.querySelector('[name="attention"]');
    const lists = [];
    let held;
    const hold = inner._versionsHold.bind(inner);
    inner._versionsHold = annotated => {
        expect(Array.isArray(annotated.versions)).toBe(true);
        lists.push(annotated.versions.map(recorded => ({ gate: recorded.gate, version: recorded.version })));
        held = hold(annotated);
        return held;
    };
    const offer = inner.registerSource(source);
    let finish;
    const rendering = offer(header('slow'), () => new Promise(resolve => { finish = resolve; }));
    const recordedInner = inner.aperture.version;
    const recordedOuter = outer.aperture.version;
    allowOrientation(outer);
    // soft still permits awareness, so a hold that only checked the issuer would admit.
    expect(outer.orient('soft')).toBe(true);
    finish('This render arrived too late.');
    expect(await rendering).toBeNull();
    expect(global.takePending()).toHaveLength(0);
    expect(held).toBe(false);
    expect(lists).toHaveLength(1);
    expect(lists[0].map(v => v.gate).sort()).toEqual(['outside', 'shell']);
    const outerEntry = lists[0].find(v => v.gate === 'shell');
    expect(outerEntry.version).toBe(recordedOuter);
    expect(outer.aperture.version).not.toBe(recordedOuter);
    expect(inner.aperture.version).toBe(recordedInner);
});

test('outer awareness refusal never reaches interrupt-request', async () => {
    const mind = await mount(W2_REGION);
    const inner = mind.querySelector('m-region[name="outside"]');
    const outer = mind.querySelector('m-region[name="shell"]');
    const source = mind.querySelector('[name="mock"]');
    const global = mind.querySelector('[name="attention"]');
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const published = interceptPub(inner);
    outer.permitAwareness = () => new GateVerdict({
        stage: 'awareness', permitted: false, reason: 'tier-0-mirror',
        bypass: false, apertureState: outer.aperture.state, gate: 'shell',
    });
    let renders = 0;
    const offer = inner.registerSource(source);
    const result = await offer(header('named'), () => { renders++; return TEXT; });
    expect(renders).toBe(1);
    expect(result).toBeNull();
    expect(bids).toHaveLength(0);
    expect(global.takePending()).toHaveLength(0);
    const awareness = published.filter(p => p.topic === 'perceptDecision' && p.data.stage === 'awareness');
    expect(awareness).toHaveLength(1);
    expect(awareness[0].data.permitted).toBe(false);
    expect(awareness[0].data.reason).toBe('tier-0-mirror');
});

test('monotone authority: outer cannot admit what inner refused; factor > 1 is rejected at the push', async () => {
    const mind = await mount(`
          <m-region name="shell" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
            <m-region name="outside" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
              <span name="mock" provenance="simulated"></span>
            </m-region>
          </m-region>`);
    const inner = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    let renders = 0;
    const offer = inner.registerSource(source);
    const result = await offer(header('denied'), () => { renders++; return WITHHELD; });
    expect(result).toBeNull();
    expect(renders).toBe(0);

    const trail = [];
    expect(() => pushGainTrail(trail, 'shell', 1.5)).toThrow(/amplify/);
    expect(trail).toHaveLength(0);
    pushGainTrail(trail, 'shell', 1);
    expect(trail).toEqual([{ gate: 'shell', factor: 1 }]);
});

test('bypass: trusted bypassAperture on the source crosses two closed gates; a payload claim does not', async () => {
    const mind = await mount(`
          <m-region name="shell" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
            <m-region name="outside" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
              <span name="voice" provenance="physical" bypassAperture="true"></span>
              <span name="mock" provenance="simulated"></span>
            </m-region>
          </m-region>`);
    const inner = mind.querySelector('m-region[name="outside"]');
    const voice = mind.querySelector('[name="voice"]');
    const mock = mind.querySelector('[name="mock"]');
    const global = mind.querySelector('[name="attention"]');

    let trustedRenders = 0;
    const trusted = inner.registerSource(voice);
    const percept = await trusted(header('voice'), () => { trustedRenders++; return 'Hello.'; });
    expect(trustedRenders).toBe(1);
    expect(percept).toBeInstanceOf(AttentionBid);
    expect(global.takePending()).toEqual([percept]);

    let payloadRenders = 0;
    const untrusted = inner.registerSource(mock);
    const refused = await untrusted(
        { ...header('fake'), policy: { bypassAperture: true } },
        () => { payloadRenders++; return WITHHELD; },
    );
    expect(refused).toBeNull();
    expect(payloadRenders).toBe(0);
});

test('policy comes from the frozen contract, not from origin attributes after registration', async () => {
    const mind = await mount(W3_REGION);
    const inner = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    const offer = inner.registerSource(source);
    source.setAttribute('bypassAperture', 'true');
    let renders = 0;
    const result = await offer(header('late'), () => { renders++; return WITHHELD; });
    expect(result).toBeNull();
    expect(renders).toBe(0);
});

test('membrane stop: a percept-candidate inside member A is not heard on member B or the society', async () => {
    journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-compose-'));
    document.body.innerHTML = `
        <m-society name="lab" space="off">
          <x-mind name="alpha" space="off">
            <m-region name="sight" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
              <span name="src" provenance="simulated"></span>
            </m-region>
          </x-mind>
          <x-mind name="beta" space="off"></x-mind>
        </m-society>`;
    await loadMindComponents(document);
    await delay(40);

    const society = document.querySelector('m-society');
    const alpha = document.querySelector('x-mind[name="alpha"]');
    const beta = document.querySelector('x-mind[name="beta"]');
    const region = alpha.querySelector('m-region');
    const source = alpha.querySelector('[name="src"]');

    const heard = { society: 0, beta: 0, alpha: 0 };
    society.addEventListener('percept-candidate', () => { heard.society++; });
    beta.addEventListener('percept-candidate', () => { heard.beta++; });
    alpha.addEventListener('percept-candidate', () => { heard.alpha++; });

    const offer = region.registerSource(source);
    await offer(header('cross'), () => TEXT);
    expect(heard.alpha).toBe(2);
    expect(heard.society).toBe(0);
    expect(heard.beta).toBe(0);
});

test('aperture names must be unique within a membrane', async () => {
    await mount(BASE_REGION);
    const mind = document.querySelector('m-mind');
    const dup = document.createElement('m-region');
    dup.setAttribute('name', 'outside');
    dup.setAttribute('modality', 'text');
    let captured = null;
    const onError = event => {
        captured = event.error || new Error(event.message);
        event.preventDefault?.();
    };
    window.addEventListener('error', onError);
    try {
        try {
            mind.appendChild(dup);
        } catch (error) {
            captured = error;
        }
        await delay(10);
    } finally {
        window.removeEventListener('error', onError);
    }
    expect(captured?.message || String(captured)).toMatch(/unique within a membrane/);
});

test('test 18: percept-candidate carries no content, materializer, or un-hashed key', async () => {
    const mind = await mount(BASE_REGION);
    const inner = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    const seen = [];
    mind.addEventListener('percept-candidate', event => {
        seen.push(event.detail);
        const json = JSON.stringify(event.detail);
        expect(json).not.toContain(TEXT);
        expect(json).not.toContain(PREIMAGE);
        expect(json).not.toContain('secret');
        expect(json).not.toMatch(/materialize/i);
        const walked = enumerableValues({
            header: event.detail.header,
            contract: event.detail.contract,
            verdicts: event.detail.verdicts,
            versions: event.detail.versions,
            gainTrail: event.detail.gainTrail,
        });
        const blob = walked.map(v => typeof v === 'string' ? v : '').join(' ');
        expect(blob).not.toContain(TEXT);
        expect(blob).not.toContain(PREIMAGE);
        expect(Object.keys(event.detail.header)).not.toContain('materialize');
        expect(Object.prototype.hasOwnProperty.call(event.detail.header, 'materialize')).toBe(false);
    });
    const offer = inner.registerSource(source);
    await offer({ ...header(PREIMAGE), reason: TEXT, caption: TEXT }, () => TEXT);
    expect(seen).toHaveLength(2);
    expect(seen.map(d => d.stage)).toEqual(['acquisition', 'awareness']);
    expect(typeof seen[0].header.changeKey).toBe('string');
    expect(seen[0].header.changeKey).not.toBe(PREIMAGE);
    expect(seen[0].header.changeKey).toHaveLength(64);
    expect(seen[1].header.changeKey).toBe(seen[0].header.changeKey);
});

const FAST_REGION = `
          <m-region name="outside" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
            <x-fast-regulator></x-fast-regulator>
            <m-interrupts name="local" threshold="0.3" rateLimit="0s"></m-interrupts>
            <span name="mock" provenance="simulated"></span>
          </m-region>`;

test('15. Regulator substitution: faster reflex, gate and receipts unchanged', async () => {
    const mind = await mount(FAST_REGION);
    const region = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    const global = mind.querySelector('[name="attention"]');
    const regulator = mind.querySelector('x-fast-regulator');
    expect(region.aperture).toBe(regulator);
    expect(region.aperture).not.toBeInstanceOf(Aperture);

    const events = [];
    mind.addEventListener('percept-candidate', e => events.push(e.detail));
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const published = interceptPub(region);
    let renders = 0;
    const offer = region.registerSource(source, request => offer(header('fresh'), () => {
        renders++;
        return TEXT;
    }));
    const withheld = await offer(header(PREIMAGE), () => {
        renders++;
        return WITHHELD;
    });
    expect(withheld).toBeNull();
    expect(renders).toBe(0);
    expect(bids).toHaveLength(0);
    expect(events).toHaveLength(1);
    expect(events[0].stage).toBe('acquisition');
    expect(events[0].verdicts.some(v => v.reason === 'closed' && v.permitted === false)).toBe(true);
    const decisions = published.filter(p => p.topic === 'perceptDecision');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].data.reason).toBe('closed');
    expect(decisions[0].data.permitted).toBe(false);

    const t = Date.now();
    const control = new Aperture({ state: 'closed', now: t, dwellMs: 1000, horizonMs: 10000 });
    expect(control.advance(t + 2000)).toBe(false);
    expect(control.state).toBe('closed');

    const credited = [];
    const origAttended = regulator.attended.bind(regulator);
    regulator.attended = (occurredAt, now) => {
        credited.push(occurredAt);
        return origAttended(occurredAt, now);
    };
    region.onBoundary(t + 2000);
    expect(regulator.state).toBe('soft');
    await delay(5);
    expect(renders).toBe(1);
    expect(bids).toHaveLength(1);
    const pending = global.takePending();
    expect(pending).toEqual(bids);
    const fired = interceptFire(mind);
    await MMind.prototype.assembleFrame.call(mind, pending);
    expect(credited).toHaveLength(1);
    const attended = fired.find(f => f.name === 'percepts-attended');
    expect(attended).toBeTruthy();
    expect(attended.detail[0].perceptId).toBe(bids[0].evidenceId);
});

test('15. Nested apertures keep their own regulator; outer still uses Aperture', async () => {
    const mind = await mount(`
          <m-region name="shell" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
            <m-region name="outside" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
              <x-fast-regulator></x-fast-regulator>
              <m-interrupts name="local" threshold="0.3" rateLimit="0s"></m-interrupts>
              <span name="mock" provenance="simulated"></span>
            </m-region>
          </m-region>`);
    const outer = mind.querySelector('m-region[name="shell"]');
    const inner = mind.querySelector('m-region[name="outside"]');
    const regulator = mind.querySelector('x-fast-regulator');
    expect(outer.aperture).toBeInstanceOf(Aperture);
    expect(inner.aperture).toBe(regulator);
    expect(outer.part('regulator')).toEqual([regulator]);

    const t = Date.now();
    inner.onBoundary(t + 2000);
    expect(inner.aperture.state).toBe('soft');
    expect(outer.aperture.state).toBe('closed');

    const source = mind.querySelector('[name="mock"]');
    let renders = 0;
    const offer = inner.registerSource(source);
    const result = await offer(header('nested-closed'), () => { renders++; return WITHHELD; });
    expect(result).toBeNull();
    expect(renders).toBe(0);
});

test('15. Port-incomplete regulator throws at connect naming the missing method', async () => {
    const captured = await captureConnectError(`
          <m-region name="outside" modality="text" aperture="open">
            <x-incomplete-regulator></x-incomplete-regulator>
          </m-region>`);
    expect(captured?.message || String(captured)).toMatch(/regulator is missing attended/);
});

test('15. Two regulators for one aperture fail at connect', async () => {
    const captured = await captureConnectError(`
          <m-region name="outside" modality="text" aperture="open">
            <x-fast-regulator></x-fast-regulator>
            <x-fast-regulator></x-fast-regulator>
          </m-region>`);
    expect(captured?.message || String(captured)).toMatch(/only one regulator/);
});

function sampleRequest(target) {
    return new ControlRequest({
        kind: 'sample', issuedBy: 'test', reason: 'probe',
        ...(target != null ? { target } : {}),
    });
}

test('M7. Outer untargeted requestControl reaches a source registered on the inner aperture', async () => {
    const mind = await mount(W2_REGION);
    const outer = mind.querySelector('m-region[name="shell"]');
    const inner = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    let hits = 0;
    let received = null;
    inner.registerSource(source, request => {
        hits++;
        received = request;
    });
    const request = sampleRequest();
    outer.requestControl(request);
    await delay(5);
    expect(hits).toBe(1);
    expect(received).toBe(request);
});

test('M7. Targeted request is delivered once by the nearest owner; first sibling in tree order wins', async () => {
    const mind = await mount(`
          <m-region name="shell" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
            <m-region name="left" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
              <span name="garden" provenance="simulated"></span>
              <span name="pond" provenance="simulated"></span>
            </m-region>
            <m-region name="right" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
              <span name="garden" provenance="simulated"></span>
            </m-region>
          </m-region>`);
    const outer = mind.querySelector('m-region[name="shell"]');
    const left = mind.querySelector('m-region[name="left"]');
    const right = mind.querySelector('m-region[name="right"]');
    const garden = left.querySelector('[name="garden"]');
    const pond = left.querySelector('[name="pond"]');
    const siblingGarden = right.querySelector('[name="garden"]');
    const called = [];
    left.registerSource(garden, () => { called.push('left-garden'); });
    left.registerSource(pond, () => { called.push('pond'); });
    right.registerSource(siblingGarden, () => { called.push('right-garden'); });
    outer.requestControl(sampleRequest('garden'));
    await delay(5);
    expect(called).toEqual(['left-garden']);
});

test('M7. Untargeted respects each provider\'s allows(); targeted from outer still reaches a closed inner', async () => {
    const mind = await mount(`
          <m-region name="shell" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
            <m-region name="outside" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
              <span name="mock" provenance="simulated"></span>
            </m-region>
          </m-region>`);
    const outer = mind.querySelector('m-region[name="shell"]');
    const inner = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    let hits = 0;
    inner.registerSource(source, () => { hits++; });
    expect(inner.aperture.state).toBe('closed');
    expect(outer.aperture.state).toBe('open');

    outer.requestControl(sampleRequest());
    await delay(5);
    expect(hits).toBe(0);

    outer.requestControl(sampleRequest('mock'));
    await delay(5);
    expect(hits).toBe(1);
});

test('M7. Child aperture appended after the parent has connected still forwards', async () => {
    const mind = await mount(BASE_REGION);
    const outer = mind.querySelector('m-region[name="outside"]');
    const inner = document.createElement('m-region');
    inner.setAttribute('name', 'inside');
    inner.setAttribute('modality', 'text');
    inner.setAttribute('aperture', 'open');
    inner.setAttribute('dwell', '1s');
    inner.setAttribute('contactHorizon', '10s');
    outer.appendChild(inner);
    await delay(10);
    expect(inner.aperture).toBeTruthy();

    const source = document.createElement('span');
    source.setAttribute('name', 'late');
    source.setAttribute('provenance', 'simulated');
    inner.appendChild(source);
    let hits = 0;
    inner.registerSource(source, () => { hits++; });
    outer.requestControl(sampleRequest());
    await delay(5);
    expect(hits).toBe(1);
});

const P1_REGION = `
          <m-region name="shell" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
            <m-region name="outside" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
              <m-interrupts name="local" threshold="0.3" rateLimit="0s"></m-interrupts>
              <span name="mock" provenance="simulated"></span>
            </m-region>
          </m-region>`;

test('P1: nested suppressed header — outer pressure is max fold; nearest issuer credits once', async () => {
    const mind = await mount(P1_REGION);
    const outer = mind.querySelector('m-region[name="shell"]');
    const inner = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    const global = mind.querySelector('[name="attention"]');
    expect(outer._childProviders()).toContain(inner);

    outer.aperture.deficit = 0.1;
    outer._publishAperture();
    expect(outer.contactPressure).toBeCloseTo(0.1);

    let renders = 0;
    const offer = inner.registerSource(source, request => offer(header('fresh'), () => {
        renders++;
        return TEXT;
    }));
    const withheld = await offer(header(PREIMAGE), () => {
        renders++;
        return WITHHELD;
    });
    expect(withheld).toBeNull();
    expect(renders).toBe(0);
    expect(inner._issued.size).toBe(0);
    expect(outer._issued.size).toBe(0);

    const innerFolded = inner.contactPressure;
    expect(innerFolded).toBeCloseTo(inner.aperture.deficit);
    expect(innerFolded).toBeGreaterThan(outer.aperture.deficit);
    expect(outer.contactPressure).toBeCloseTo(Math.max(outer.aperture.deficit, innerFolded));
    expect(outer.contactPressure).toBeCloseTo(outer.fold(outer.aperture.deficit, [innerFolded]));

    // 9.3: max is the published signal. Close the outer, put 0.9 on the inner,
    // and advance must still read own deficit — a starved inner does not trip
    // the outer reflex. (If this ever fires, record it; do not switch to mean.)
    allowOrientation(outer);
    expect(outer.orient('closed')).toBe(true);
    const savedOwn = outer.aperture.deficit;
    outer.aperture.deficit = 0;
    inner.aperture.deficit = 0.9;
    inner._publishAperture();
    expect(outer.contactPressure).toBeCloseTo(0.9);
    expect(outer.aperture.deficit).toBe(0);
    outer.aperture.changedAt = Date.now() - 2000;
    const t = Date.now();
    outer.aperture.updatedAt = t;
    outer.onBoundary(t + 1);
    expect(outer.aperture.state).toBe('closed');
    expect(outer.aperture.deficit).toBeLessThan(0.1);

    outer.aperture.deficit = savedOwn;
    allowOrientation(outer);
    expect(outer.orient('open')).toBe(true);
    outer._publishAperture();

    allowOrientation(inner);
    expect(inner.orient('open')).toBe(true);
    await delay(5);
    expect(renders).toBe(1);
    const pending = global.takePending();
    expect(pending).toHaveLength(1);
    const evidenceId = pending[0].evidenceId;
    expect(inner._issued.has(evidenceId)).toBe(true);
    expect(outer._issued.has(evidenceId)).toBe(false);

    const innerDebt = inner.aperture.deficit;
    const outerDebt = outer.aperture.deficit;
    const outerCredits = [];
    const origOuterAttended = outer.aperture.attended.bind(outer.aperture);
    outer.aperture.attended = (...args) => {
        outerCredits.push(args);
        return origOuterAttended(...args);
    };

    await MMind.prototype.assembleFrame.call(mind, pending);
    expect(inner.aperture.deficit).toBeLessThan(innerDebt);
    expect(outer.aperture.deficit).toBe(outerDebt);
    expect(outerCredits).toHaveLength(0);
    expect(inner._issued.has(evidenceId)).toBe(false);
    expect(outer._issued.size).toBe(0);
});

test('17. Aggregator substitution: global mix follows aggregate(); without one, built-in mean', async () => {
    const meanMind = await mount(`
          <m-region name="left" modality="text" aperture="open" dwell="1s" contactHorizon="10s"></m-region>
          <m-region name="right" modality="text" aperture="open" dwell="1s" contactHorizon="10s"></m-region>`);
    const meanGlobal = meanMind.querySelector('[name="attention"]');
    const left = meanMind.querySelector('m-region[name="left"]');
    const right = meanMind.querySelector('m-region[name="right"]');
    left.aperture.deficit = 0.2;
    right.aperture.deficit = 0.8;
    left._publishAperture();
    right._publishAperture();
    meanGlobal._pressureAt = Date.now() - 600000;
    meanGlobal._updateContactPressure(Date.now());
    // 60s smoothing stays in the arbiter; after ~10 time-constants the mix is the mean.
    expect(meanGlobal.contactPressure).toBeCloseTo(0.5, 3);
    expect(meanGlobal._aggregator).toBeNull();

    await meanMind.querySelector('m-memory')?._journalQueue;
    document.body.replaceChildren();
    fs.rmSync(journalDir, { recursive: true, force: true });

    const maxMind = await mount(`
          <x-max-aggregator></x-max-aggregator>
          <m-region name="left" modality="text" aperture="open" dwell="1s" contactHorizon="10s"></m-region>
          <m-region name="right" modality="text" aperture="open" dwell="1s" contactHorizon="10s"></m-region>`);
    const maxGlobal = maxMind.querySelector('[name="attention"]');
    const maxLeft = maxMind.querySelector('m-region[name="left"]');
    const maxRight = maxMind.querySelector('m-region[name="right"]');
    expect(maxGlobal._aggregator).toBe(maxMind.querySelector('x-max-aggregator'));
    maxLeft.aperture.deficit = 0.2;
    maxRight.aperture.deficit = 0.8;
    maxLeft._publishAperture();
    maxRight._publishAperture();
    maxGlobal._pressureAt = Date.now() - 600000;
    maxGlobal._updateContactPressure(Date.now());
    expect(maxGlobal.contactPressure).toBeCloseTo(0.8, 3);
    expect(maxGlobal.contactPressure).not.toBeCloseTo(0.5, 2);

    await maxMind.querySelector('m-memory')?._journalQueue;
    document.body.replaceChildren();
    fs.rmSync(journalDir, { recursive: true, force: true });

    const constMind = await mount(`
          <x-const-aggregator></x-const-aggregator>
          <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s"></m-region>`);
    const constGlobal = constMind.querySelector('[name="attention"]');
    const region = constMind.querySelector('m-region');
    region.aperture.deficit = 0.2;
    region._publishAperture();
    constGlobal._pressureAt = Date.now() - 600000;
    constGlobal._updateContactPressure(Date.now());
    expect(constGlobal.contactPressure).toBeCloseTo(0.73, 3);
});

test('17. Port-incomplete aggregator throws at connect naming the missing method', async () => {
    const captured = await captureConnectError(`
          <x-incomplete-aggregator></x-incomplete-aggregator>
          <m-region name="outside" modality="text" aperture="open"></m-region>`);
    expect(captured?.message || String(captured)).toMatch(/aggregator is missing aggregate/);
});

test('17. Two aggregators in one mind fail at connect', async () => {
    const captured = await captureConnectError(`
          <x-max-aggregator></x-max-aggregator>
          <x-const-aggregator></x-const-aggregator>
          <m-region name="outside" modality="text" aperture="open"></m-region>`);
    expect(captured?.message || String(captured)).toMatch(/only one aggregator/);
});

test('nested arbiter gain 2 clamps salience to 1', async () => {
    const mind = await mount(`
          <m-region name="loud" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
            <m-interrupts name="local" gain="2" threshold="0.1" rateLimit="0s"></m-interrupts>
            <span name="mock" provenance="simulated"></span>
          </m-region>`);
    const inner = mind.querySelector('m-region[name="loud"]');
    const source = mind.querySelector('[name="mock"]');
    const global = mind.querySelector('[name="attention"]');
    const offer = inner.registerSource(source);
    const bid = await offer(header('loud-gain'), () => TEXT);
    expect(bid.salience).toBeCloseTo(1);
    expect(global.takePending()[0].salience).toBeCloseTo(1);
});

test('awareness re-checks versions: closing a gate after its verdict does not issue', async () => {
    const mind = await mount(W2_REGION);
    const inner = mind.querySelector('m-region[name="outside"]');
    const source = mind.querySelector('[name="mock"]');
    const global = mind.querySelector('[name="attention"]');
    allowOrientation(inner);
    mind.addEventListener('percept-candidate', event => {
        if (event.detail?.stage !== 'awareness') return;
        inner.orient('closed');
    });
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    let renders = 0;
    const offer = inner.registerSource(source);
    const result = await offer(header('late-close'), () => { renders++; return TEXT; });
    expect(renders).toBe(1);
    expect(result).toBeNull();
    expect(bids).toHaveLength(0);
    expect(global.takePending()).toHaveLength(0);
});

test('removing a nested aperture republishes the outer fold', async () => {
    const mind = await mount(P1_REGION);
    const outer = mind.querySelector('m-region[name="shell"]');
    const inner = mind.querySelector('m-region[name="outside"]');
    outer.aperture.deficit = 0;
    inner.aperture.deficit = 0.9;
    inner._publishAperture();
    expect(outer.contactPressure).toBeCloseTo(0.9);
    inner.remove();
    expect(outer._childProviders()).toHaveLength(0);
    expect(outer.contactPressure).toBeCloseTo(0);
});

test('targeted control at a detached nearest owner does not fall through to a sibling', async () => {
    const mind = await mount(`
          <m-region name="shell" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
            <m-region name="left" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
              <span name="garden" provenance="simulated"></span>
            </m-region>
            <m-region name="right" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
              <span name="garden" provenance="simulated"></span>
            </m-region>
          </m-region>`);
    const outer = mind.querySelector('m-region[name="shell"]');
    const left = mind.querySelector('m-region[name="left"]');
    const right = mind.querySelector('m-region[name="right"]');
    const garden = left.querySelector('[name="garden"]');
    const siblingGarden = right.querySelector('[name="garden"]');
    const called = [];
    left.registerSource(garden, () => { called.push('left-garden'); });
    right.registerSource(siblingGarden, () => { called.push('right-garden'); });
    garden.remove();
    outer.requestControl(sampleRequest('garden'));
    await delay(5);
    expect(called).toEqual([]);
});

test('invalid aggregator output fails closed: threshold stays finite', async () => {
    const mind = await mount(`
          <x-nan-aggregator></x-nan-aggregator>
          <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s"></m-region>`);
    const global = mind.querySelector('[name="attention"]');
    const region = mind.querySelector('m-region');
    region.aperture.deficit = 0.8;
    region._publishAperture();
    global._pressureAt = Date.now() - 600000;
    global._updateContactPressure(Date.now());
    expect(global.contactPressure).toBe(0);
    expect(Number.isFinite(global.contactPressure)).toBe(true);
    const source = document.createElement('span');
    mind.appendChild(source);
    source.dispatchEvent(new CustomEvent('interrupt-request', {
        bubbles: true,
        detail: new InterruptRecord({ source: 'Observer', type: 'Test', reason: 'quiet', salience: 0.2 }),
    }));
    expect(global.takePending()).toHaveLength(0);
});

test('same-batch regulator binds after its tag is defined, without failing the port check', async () => {
    const mind = await mount(`
          <m-region name="host" modality="text" aperture="open" dwell="1s" contactHorizon="10s"></m-region>`);
    const tag = `x-deferred-regulator-${Date.now()}`;
    class XDeferredRegulator extends MBaseComponent {
        static provides = { regulator: true }
        state = 'open'
        focus = null
        deficit = 0.42
        version = 0
        get gain() { return 1 }
        allows() { return true }
        observe() {}
        advance() { return false }
        orient() { return false }
        attended() { return false }
    }
    const region = document.createElement('m-region');
    region.setAttribute('name', `deferred-${Date.now()}`);
    region.setAttribute('modality', 'text');
    region.setAttribute('aperture', 'open');
    region.setAttribute('dwell', '1s');
    region.setAttribute('contactHorizon', '10s');
    const child = document.createElement(tag);
    child.setAttribute('provides', 'regulator');
    region.appendChild(child);
    let captured = null;
    const onError = event => {
        captured = event.error || new Error(event.message);
        event.preventDefault?.();
    };
    window.addEventListener('error', onError);
    try {
        mind.appendChild(region);
        await delay(10);
    } finally {
        window.removeEventListener('error', onError);
    }
    expect(captured).toBeNull();
    expect(region.aperture).toBeFalsy();
    customElements.define(tag, XDeferredRegulator);
    await delay(20);
    expect(region.aperture).toBe(child);
    expect(region.aperture.deficit).toBe(0.42);
});

test('same-batch aggregator binds after its tag is defined', async () => {
    const mind = await mount(`
          <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s"></m-region>`);
    const tag = `x-deferred-aggregator-${Date.now()}`;
    class XDeferredAggregator extends MBaseComponent {
        static provides = { aggregator: true }
        aggregate() { return 0.61 }
    }
    const agg = document.createElement(tag);
    agg.setAttribute('provides', 'aggregator');
    const arb = document.createElement('m-interrupts');
    arb.setAttribute('name', `deferred-attention-${Date.now()}`);
    arb.setAttribute('threshold', '0.35');
    arb.setAttribute('rateLimit', '0s');
    mind.appendChild(agg);
    let captured = null;
    const onError = event => {
        captured = event.error || new Error(event.message);
        event.preventDefault?.();
    };
    window.addEventListener('error', onError);
    try {
        mind.appendChild(arb);
        await delay(10);
    } finally {
        window.removeEventListener('error', onError);
    }
    expect(captured).toBeNull();
    expect(arb._aggregator).toBeNull();
    customElements.define(tag, XDeferredAggregator);
    await delay(20);
    expect(arb._aggregator).toBe(agg);
});
