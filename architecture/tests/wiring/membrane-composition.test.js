// Membrane composition (phase 2 M2–M3): percept-candidate at acquisition and
// awareness. Fixtures W1/W2/W3, conjunction, and the version chain.
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
import { GateVerdict, pushGainTrail } from '../../../src/infrastructure/perceptionContracts.js';

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
        pending: pending.map(p => ({
            reason: p.reason, salience: p.salience, source: p.source, type: p.type, provenance: p.provenance,
        })),
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
    expect(wrap.percept).toBeInstanceOf(Percept);
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
    expect(nested.percept).toBeInstanceOf(Percept);
    expect(nested.percept.gateTrail).toHaveLength(2);
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
    expect(percept).toBeInstanceOf(Percept);
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
