import './setup.js';
import { test, expect, beforeEach, afterEach } from 'bun:test';
import A from 'amanita';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { delay } from './setup.js';
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js';
import { MMind } from '../../../src/mindComponents/mind/mMind.js';
import { Percept } from '../../../src/infrastructure/percept.js';
import { InterruptRecord } from '../../../src/infrastructure/interruptRecord.js';
import { GateVerdict, ControlRequest, RenditionRequest, PerceptReceipt } from '../../../src/infrastructure/perceptionContracts.js';

let mind, region, local, global, memory, source, journalDir;

beforeEach(async () => {
    if (!customElements.get('m-mind')) customElements.define('m-mind', class extends A(HTMLElement) {});
    journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-membrane-'));
    document.body.innerHTML = `
        <m-mind name="membrane-test">
          <m-stream name="stream"></m-stream>
          <m-memory name="memory" persist="off" journal="${journalDir}"></m-memory>
          <m-interrupts name="attention" threshold="0.35" rateLimit="0s" keep="1"></m-interrupts>
          <m-region name="outside" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
            <m-interrupts name="local" threshold="0.3" rateLimit="0s"></m-interrupts>
            <span name="mock" provenance="simulated"></span>
            <span name="human" provenance="physical" bypassAperture="true" bypassAdmission="true" preempt="true"></span>
          </m-region>
        </m-mind>`;
    await loadMindComponents(document);
    await delay(40);
    mind = document.querySelector('m-mind');
    region = mind.querySelector('m-region');
    source = region.querySelector('[name="mock"]');
    local = region.querySelector('m-interrupts');
    global = mind.querySelector('[name="attention"]');
    memory = mind.querySelector('m-memory');
    mind._identity = () => 'A text-only simulated world.';
    mind._landingOpener = () => 'I turn toward it, ';
});

afterEach(async () => {
    await memory?._journalQueue;
    document.body.replaceChildren();
    fs.rmSync(journalDir, { recursive: true, force: true });
});

function allowOrientation() { region.aperture.changedAt = Date.now() - 2000; }
const frame = stimuli => MMind.prototype.assembleFrame.call(mind, stimuli);
const header = key => ({ changeMagnitude: 0.9, changeKey: key, occurredAt: Date.now() });

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

function assertTextAbsent(records, ...snippets) {
    for (const record of records) {
        const blob = JSON.stringify(record);
        for (const snippet of snippets) expect(blob).not.toContain(snippet);
    }
}

function indexEntries() {
    const file = path.join(journalDir, 'percepts.jsonl');
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

function receiptOf(fired) {
    const event = fired.find(f => f.name === 'percepts-attended');
    expect(event).toBeTruthy();
    expect(Array.isArray(event.detail)).toBe(true);
    return event.detail[0];
}

function cloneReceipt(receipt, overrides = {}) {
    return new PerceptReceipt({
        perceptId: receipt.perceptId,
        frameId: receipt.frameId,
        sourceId: receipt.sourceId,
        modality: receipt.modality,
        provenance: receipt.provenance,
        tier: receipt.tier,
        occurredAt: receipt.occurredAt,
        attendedAt: receipt.attendedAt,
        receivedKind: receipt.receivedKind,
        renditionText: receipt.renditionText,
        requestId: receipt.requestId,
        ...overrides,
    });
}

test('closed content is never rendered, dispatched, or journaled; reopening samples the present', async () => {
    let renders = 0, present = 'missed secret', samples = 0, sampleRequest = null;
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const offer = region.registerSource(source, request => {
        samples++;
        sampleRequest = request;
        return offer(header('fresh'), () => { renders++; return present; });
    });
    await offer({ ...header('old'), reason: 'secret', policy: { bypassAperture: true }, urgent: true }, () => {
        renders++;
        return 'missed secret';
    });
    expect(renders).toBe(0);
    expect(bids).toHaveLength(0);
    expect(global.takePending()).toHaveLength(0);
    expect(memory.getTail()).not.toContain('secret');
    expect(fs.existsSync(path.join(journalDir, 'percepts.jsonl'))).toBe(false);
    const debt = region.contactPressure;
    present = 'The simulated light is blue now.';
    allowOrientation();
    expect(region.orient('open')).toBe(true);
    expect(region.contactPressure).toBe(debt);
    await delay(5);
    expect(samples).toBe(1);
    expect(renders).toBe(1);
    expect(sampleRequest).toBeInstanceOf(ControlRequest);
    expect(sampleRequest.kind).toBe('sample');
    expect(sampleRequest.reason).toBe('orientation');
    const pending = global.takePending();
    expect(pending).toHaveLength(1);
    expect(pending[0].reason).toBe(present);
    expect(pending[0].provenance).toBe('simulated');
    expect(pending[0].requestId).toBe(sampleRequest.id);
    expect(region.contactPressure).toBeGreaterThan(0); // queued is not attended
    const fired = interceptFire(mind);
    const payload = await frame(pending);
    expect(payload.prefill).toContain(`> ⟂ ${present}\n\n`);
    expect(region.contactPressure).toBeLessThan(debt);
    const attended = fired.find(f => f.name === 'attended');
    expect(attended.detail).toEqual([present]);
    const receipt = receiptOf(fired);
    expect(receipt).toBeInstanceOf(PerceptReceipt);
    expect(receipt.perceptId).toBe(pending[0].id);
    expect(receipt.renditionText).toBe(present);
    expect(receipt.requestId).toBe(sampleRequest.id);
    expect(receipt.tier).toBe(0);
    expect(receipt.frameId).toBeTruthy();
    await memory._journalQueue;
    const entry = JSON.parse(fs.readFileSync(path.join(journalDir, 'percepts.jsonl'), 'utf8').trim());
    expect(entry.id).toBe(pending[0].id);
    expect(entry.provenance).toBe('simulated');
    expect(entry.modality).toBe('text');
    expect(entry.receivedKind).toBe('text');
    expect(entry.renditions).toEqual([{ kind: 'text', text: present }]);
    expect(entry.tier).toBe(0);
    expect(entry.requestId).toBe(sampleRequest.id);
    expect(entry.frameId).toBe(receipt.frameId);
    const journal = fs.readFileSync(path.join(journalDir, `${new Date().toISOString().slice(0, 10)}.md`), 'utf8');
    expect(journal).not.toContain('missed secret');
    expect(journal).toContain('⌁ Attention aperture: closed → open');
});

test('tier 1 is refused at source registration', () => {
    const edge = document.createElement('span');
    edge.setAttribute('name', 'grounded');
    edge.setAttribute('tier', '1');
    region.appendChild(edge);
    expect(() => region.registerSource(edge))
        .toThrow(/edge-grounded sources are declared but not implemented; see perceptual-membrane.md#processing-tiers/);
});

test('threshold rejection and crowd-out do not clear debt or enter the typed index', async () => {
    allowOrientation();
    region.orient('open');
    const offer = region.registerSource(source);
    local.setAttribute('threshold', '0.99');
    await offer(header('first'), () => 'Rejected locally.');
    expect(global.takePending()).toHaveLength(0);
    expect(region.contactPressure).toBeGreaterThan(0);
    local.setAttribute('threshold', '0.3');
    const candidate = await offer(header('second'), () => 'Crowded out globally.');
    mind.dispatchEvent(new CustomEvent('interrupt-request', { bubbles: true,
        detail: new InterruptRecord({ source: 'Internal', type: 'Other', reason: 'Another bid.', salience: 1 }) }));
    const debt = region.contactPressure;
    const pending = global.takePending();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).not.toBe(candidate.id);
    await frame(pending);
    expect(region.contactPressure).toBe(debt);
    await memory._journalQueue;
    const index = fs.readFileSync(path.join(journalDir, 'percepts.jsonl'), 'utf8');
    expect(index).not.toMatch(/Rejected locally|Crowded out globally/);
});

test('trusted human bypass crosses closure and preempts; a source payload cannot grant it', async () => {
    let interrupts = 0;
    mind.addEventListener('interrupt', () => interrupts++);
    const human = region.querySelector('[name="human"]');
    const offer = region.registerSource(human);
    local.setAttribute('threshold', '0.99');
    global.setAttribute('threshold', '0.99');
    global.setAttribute('rateLimit', '1h');
    global.lastAcceptedAt = Date.now();
    const percept = await offer({ ...header('voice'), changeMagnitude: 0.1, provenance: 'simulated' }, () => 'Hello.');
    expect(global.takePending()).toEqual([percept]);
    expect(percept.provenance).toBe('physical');
    expect(interrupts).toBe(1);
    expect(region.aperture.state).toBe('closed');
});

test('a non-preempting admission bypass crosses both gates without interrupting the burst', async () => {
    source.setAttribute('bypassAperture', 'true');
    source.setAttribute('bypassAdmission', 'true');
    const offer = region.registerSource(source);
    let interrupts = 0;
    mind.addEventListener('interrupt', () => interrupts++);
    const percept = await offer({ ...header('1'), changeMagnitude: 0.01 }, () => 'A quiet protected event.');
    expect(global.takePending()).toEqual([percept]);
    expect(interrupts).toBe(0);
});

test('an in-flight materializer cannot deliver after voluntary closure', async () => {
    allowOrientation();
    region.orient('open');
    const offer = region.registerSource(source);
    let finish;
    const rendering = offer(header('slow'), () => new Promise(resolve => { finish = resolve; }));
    allowOrientation();
    region.orient('closed');
    finish('This render arrived too late.');
    expect(await rendering).toBeNull();
    expect(global.takePending()).toHaveLength(0);
});

test('narrow attention only materializes its selected source and honors minimum dwell', async () => {
    const other = document.createElement('span');
    other.setAttribute('name', 'other');
    region.appendChild(other);
    const offer = region.registerSource(source);
    const offerOther = region.registerSource(other);
    allowOrientation();
    expect(region.orient('narrow', 'mock')).toBe(true);
    expect(region.orient('closed')).toBe(false);
    let otherRendered = false;
    await offerOther(header('elsewhere'), () => { otherRendered = true; return 'Outside the focus.'; });
    const focused = await offer(header('here'), () => 'Within the focus.');
    expect(otherRendered).toBe(false);
    expect(global.takePending()).toEqual([focused]);
});

test('moving a source invalidates both in-flight work and its old adapter', async () => {
    allowOrientation();
    region.orient('open');
    const offer = region.registerSource(source);
    let finish;
    const rendering = offer(header('slow'), () => new Promise(resolve => { finish = resolve; }));
    mind.appendChild(source);
    finish('An obsolete observation.');
    expect(await rendering).toBeNull();
    let rendered = false;
    await offer(header('moved'), () => { rendered = true; return 'Wrong boundary.'; });
    expect(rendered).toBe(false);
    expect(global.takePending()).toHaveLength(0);
});

test('local pressure lowers admission threshold and global pressure follows more slowly', async () => {
    allowOrientation();
    region.orient('soft');
    const offer = region.registerSource(source);
    const percept = await offer(header('first'), () => 'Peripheral contact.');
    expect(percept).toBeInstanceOf(Percept);
    expect(percept.salience).toBeCloseTo(0.45);
    global.takePending();
    region.aperture.deficit = 0.8;
    region._publishAperture();
    local.setAttribute('threshold', '0.6');
    await offer(header('second'), () => 'Pressure makes this faint contact audible.');
    expect(global.takePending()).toHaveLength(1);
    global._pressureAt = Date.now() - 60000;
    global._updateContactPressure(Date.now());
    expect(global.contactPressure).toBeGreaterThan(0);
    expect(global.contactPressure).toBeLessThan(region.contactPressure);
});

test('awareness verdict is recorded at tier 0 even when it mirrors acquisition', async () => {
    allowOrientation();
    region.orient('open');
    const text = 'A simulated light in the garden.';
    const preimage = 'secret-filename.png';
    const published = interceptPub(region);
    const offer = region.registerSource(source);
    const percept = await offer(header(preimage), () => text);
    expect(percept).toBeInstanceOf(Percept);
    expect(percept.id).toBeDefined();
    expect(percept.gateTrail).toHaveLength(2);
    const [acquisition, awareness] = percept.gateTrail;
    expect(acquisition).toBeInstanceOf(GateVerdict);
    expect(acquisition.stage).toBe('acquisition');
    expect(acquisition.permitted).toBe(true);
    expect(awareness).toBeInstanceOf(GateVerdict);
    expect(awareness.stage).toBe('awareness');
    expect(awareness.reason).toBe('tier-0-mirror');
    expect(awareness.permitted).toBe(acquisition.permitted);
    expect(percept.requestId).toBeNull();
    const decisions = published.filter(p => p.topic === 'perceptDecision').map(p => p.data);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toEqual({
        stage: 'acquisition', source: 'mock', permitted: true, reason: 'open',
        changeMagnitude: 0.9, apertureState: 'open',
    });
    expect(decisions[1]).toEqual({
        stage: 'awareness', source: 'mock', permitted: true, reason: 'tier-0-mirror',
        changeMagnitude: 0.9, apertureState: 'open',
    });
    assertTextAbsent(published, text, preimage);
    expect(JSON.stringify(percept.toIndexEntry())).not.toMatch(/gateTrail/);
    expect(global.takePending()).toEqual([percept]);
    const fired = interceptFire(mind);
    await frame([percept]);
    const receipt = receiptOf(fired);
    expect(receipt).toBeInstanceOf(PerceptReceipt);
    expect(JSON.stringify(receipt)).not.toMatch(/gateTrail|secret-filename/);
    expect(receipt.percept).toBeUndefined();
    await memory._journalQueue;
    const entry = indexEntries()[0];
    expect(entry.id).toBe(percept.id);
    expect(entry.tier).toBe(0);
    expect(entry.requestId).toBeNull();
    expect(entry.frameId).toBe(receipt.frameId);
    expect(JSON.stringify(entry)).not.toMatch(/gateTrail|secret-filename/);
});

test('closed aperture publishes a non-semantic acquisition denial and never the withheld text', async () => {
    const withheld = 'missed secret';
    const preimage = 'private-caption.png';
    const published = interceptPub(region);
    const fired = interceptFire(region);
    let renders = 0;
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const offer = region.registerSource(source);
    await offer({ ...header(preimage), reason: withheld, caption: withheld }, () => {
        renders++;
        return withheld;
    });
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
    expect(published.some(p => p.topic === 'materializationFailure')).toBe(false);
    assertTextAbsent(published, withheld, preimage, 'secret');
    assertTextAbsent(fired, withheld, preimage, 'secret');
});

test('an in-flight materializer is dropped by re-checking the recorded version list', async () => {
    allowOrientation();
    region.orient('open');
    const lists = [];
    const hold = region._versionsHold.bind(region);
    region._versionsHold = annotated => {
        expect(Array.isArray(annotated.versions)).toBe(true);
        lists.push(annotated.versions.map(recorded => ({ gate: recorded.gate, version: recorded.version })));
        return hold(annotated);
    };
    const offer = region.registerSource(source);
    let finish;
    const rendering = offer(header('slow'), () => new Promise(resolve => { finish = resolve; }));
    const recordedAt = region.aperture.version;
    allowOrientation();
    region.orient('closed');
    finish('This render arrived too late.');
    expect(await rendering).toBeNull();
    expect(global.takePending()).toHaveLength(0);
    expect(lists).toHaveLength(1);
    expect(lists[0]).toEqual([{ gate: 'aperture', version: recordedAt }]);
    expect(lists[0][0].version).not.toBe(region.aperture.version);
});

test('a percept refused at awareness never reaches interrupt-request', async () => {
    allowOrientation();
    region.orient('open');
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const published = interceptPub(region);
    const decide = region.permitAwareness.bind(region);
    region.permitAwareness = (percept, annotated) => {
        const mirrored = decide(percept, annotated);
        expect(mirrored).toBeInstanceOf(GateVerdict);
        expect(mirrored.reason).toBe('tier-0-mirror');
        expect(mirrored.permitted).toBe(true);
        return new GateVerdict({
            stage: mirrored.stage, permitted: false, reason: mirrored.reason,
            bypass: mirrored.bypass, apertureState: mirrored.apertureState, gate: mirrored.gate,
        });
    };
    const offer = region.registerSource(source);
    let rendered = 0;
    const result = await offer(header('here'), () => { rendered++; return 'Should not reach attention.'; });
    expect(rendered).toBe(1);
    expect(result).toBeNull();
    expect(bids).toHaveLength(0);
    expect(global.takePending()).toHaveLength(0);
    const awareness = published.filter(p => p.topic === 'perceptDecision' && p.data.stage === 'awareness');
    expect(awareness).toHaveLength(1);
    expect(awareness[0].data.permitted).toBe(false);
    expect(awareness[0].data.reason).toBe('tier-0-mirror');
    assertTextAbsent(published, 'Should not reach attention.');
});

test('boundary reflex requests a fresh sample without preemption; sleep suppresses sensing', async () => {
    let samples = 0, interrupts = 0, sampleRequest = null;
    mind.addEventListener('interrupt', () => interrupts++);
    const offer = region.registerSource(source, request => {
        samples++;
        sampleRequest = request;
        return offer(header('now'), () => 'A fresh observation.');
    });
    region.onBoundary(Date.now() + 7000);
    await delay(5);
    expect(region.aperture.state).toBe('soft');
    expect(samples).toBe(1);
    expect(sampleRequest).toBeInstanceOf(ControlRequest);
    expect(sampleRequest.kind).toBe('sample');
    expect(sampleRequest.reason).toBe('reopening');
    const pending = global.takePending();
    expect(pending).toHaveLength(1);
    expect(pending[0].requestId).toBe(sampleRequest.id);
    expect(interrupts).toBe(0);
    mind._sleeping = true;
    const before = region.contactPressure;
    region.onBoundary(Date.now() + 100000);
    expect(region.contactPressure).toBe(before);
    let rendered = false;
    await offer(header('asleep'), () => { rendered = true; return 'Asleep.'; });
    expect(rendered).toBe(false);
});

test('requestControl drops detached or sleeping sources without throwing', async () => {
    allowOrientation();
    region.orient('open');
    await delay(5);
    let samples = 0;
    region.registerSource(source, () => { samples++; });
    source.remove();
    expect(() => region.requestControl(new ControlRequest({
        kind: 'sample', issuedBy: 'test', reason: 'probe', target: 'mock',
    }))).not.toThrow();
    await delay(5);
    expect(samples).toBe(0);

    const still = document.createElement('span');
    still.setAttribute('name', 'still');
    region.appendChild(still);
    region.registerSource(still, () => { samples++; });
    mind._sleeping = true;
    expect(() => region.requestControl(new ControlRequest({
        kind: 'sample', issuedBy: 'test', reason: 'probe', target: 'still',
    }))).not.toThrow();
    await delay(5);
    expect(samples).toBe(0);
});

test('focus is delivered and recorded but changes no aperture policy', async () => {
    let received = null;
    region.registerSource(source, request => { received = request; });
    allowOrientation();
    const version = region.aperture.version;
    const state = region.aperture.state;
    const focus = region.aperture.focus;
    const request = new ControlRequest({
        kind: 'focus', issuedBy: 'test', reason: 'search', target: 'mock',
    });
    expect(() => region.requestControl(request)).not.toThrow();
    await delay(5);
    expect(received).toBe(request);
    expect(received.kind).toBe('focus');
    expect(region.aperture.state).toBe(state);
    expect(region.aperture.focus).toBe(focus);
    expect(region.aperture.version).toBe(version);
});

test('materializer receives kinds plus a RenditionRequest; a one-arg materializer still works', async () => {
    allowOrientation();
    region.orient('open');
    await delay(5);
    const offer = region.registerSource(source);
    let kindsArg, renditionArg;
    const twoArg = await offer(header('two-arg'), (kinds, rendition) => {
        kindsArg = kinds;
        renditionArg = rendition;
        return 'Two-arg materializer.';
    });
    expect(kindsArg).toEqual(['text']);
    expect(renditionArg).toBeInstanceOf(RenditionRequest);
    expect(renditionArg.kinds).toEqual(['text']);
    expect(renditionArg.requestId).toBeNull();
    expect(renditionArg.detail).toBeNull();
    expect(twoArg.requestId).toBeNull();
    global.takePending();
    const oneArg = await offer(header('one-arg'), kinds => {
        expect(kinds).toEqual(['text']);
        return 'One-arg materializer.';
    });
    expect(oneArg.reason).toBe('One-arg materializer.');
    expect(oneArg.requestId).toBeNull();
});

test('a detail request carries detail to the materializer and still cannot render while closed', async () => {
    let renders = 0, renditionArg;
    const offer = region.registerSource(source, request => offer(header('now'), (kinds, rendition) => {
        renders++;
        renditionArg = rendition;
        return 'A closer look.';
    }));
    const closed = new ControlRequest({
        kind: 'detail', issuedBy: 'test', reason: 'look', target: 'mock',
        detail: { crop: 'the-door' },
    });
    region.requestControl(closed);
    await delay(5);
    expect(renders).toBe(0);
    expect(renditionArg).toBeUndefined();
    expect(global.takePending()).toHaveLength(0);

    allowOrientation();
    region.orient('open');
    await delay(5);
    expect(renders).toBe(1);
    expect(renditionArg.detail).toBeNull();
    expect(renditionArg.requestId).toBeTruthy();
    renders = 0;
    renditionArg = undefined;
    global.takePending();

    const request = new ControlRequest({
        kind: 'detail', issuedBy: 'test', reason: 'look', target: 'mock',
        detail: { crop: 'the-door' },
    });
    region.requestControl(request);
    await delay(5);
    expect(renders).toBe(1);
    expect(renditionArg).toBeInstanceOf(RenditionRequest);
    expect(renditionArg.kinds).toEqual(['text']);
    expect(renditionArg.detail).toEqual({ crop: 'the-door' });
    expect(renditionArg.requestId).toBe(request.id);
    const pending = global.takePending();
    expect(pending).toHaveLength(1);
    expect(pending[0].requestId).toBe(request.id);
});

test('requestControl requires a ControlRequest', () => {
    expect(() => region.requestControl({ kind: 'sample', issuedBy: 'test', reason: 'probe' }))
        .toThrow(/ControlRequest/);
});

test('percept id is stable from issue to journal and unique per observation', async () => {
    allowOrientation();
    region.orient('open');
    const offer = region.registerSource(source);
    const first = await offer(header('first-id'), () => 'First light.');
    expect(first.id).toBeDefined();
    await frame(global.takePending());
    const second = await offer(header('second-id'), () => 'Second light.');
    expect(second.id).not.toBe(first.id);
    await frame(global.takePending());
    await memory._journalQueue;
    const entries = indexEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe(first.id);
    expect(entries[1].id).toBe(second.id);
    expect(entries[0].id).not.toBe(entries[1].id);
    expect(entries[0].requestId).toBeNull();
    expect(entries[1].requestId).toBeNull();
});

test('receipts credit by percept id once; a rebuilt equal credits; a replay does not', async () => {
    allowOrientation();
    region.orient('open');
    const offer = region.registerSource(source);
    const percept = await offer(header('same'), () => 'The same light.');
    expect(global.takePending()).toEqual([percept]);
    const debt = region.contactPressure;
    expect(debt).toBeGreaterThan(0);
    const rebuilt = new PerceptReceipt({
        perceptId: percept.id,
        frameId: 'rebuilt-frame',
        sourceId: percept.sourceId,
        modality: percept.modality,
        provenance: percept.provenance,
        tier: percept.tier,
        occurredAt: percept.dateTime,
        attendedAt: new Date().toISOString(),
        receivedKind: percept.receivedKind,
        renditionText: percept.renderForFrame(),
        requestId: percept.requestId,
    });
    expect(rebuilt).not.toBe(percept);
    mind.dispatchEvent(new CustomEvent('percepts-attended', { detail: [rebuilt] }));
    expect(region.contactPressure).toBeLessThan(debt);

    const afterCredit = region.contactPressure;
    mind.dispatchEvent(new CustomEvent('percepts-attended', { detail: [rebuilt] }));
    expect(region.contactPressure).toBe(afterCredit);
    const clone = cloneReceipt(rebuilt);
    mind.dispatchEvent(new CustomEvent('percepts-attended', { detail: [clone] }));
    expect(region.contactPressure).toBe(afterCredit);

    await frame([percept]);
    expect(region.contactPressure).toBe(afterCredit);
});

test('a stale receipt is refused by the aperture freshness window', async () => {
    allowOrientation();
    region.orient('open');
    const offer = region.registerSource(source);
    const percept = await offer({ ...header('stale'), occurredAt: Date.now() - 31000 }, () => 'Too old to credit.');
    expect(global.takePending()).toEqual([percept]);
    const debt = region.contactPressure;
    expect(debt).toBeGreaterThan(0);
    await frame([percept]);
    expect(region.contactPressure).toBe(debt);
});

test('a coerced legacy stimulus gets a legacy-unspecified receipt and credits nothing', async () => {
    allowOrientation();
    region.orient('open');
    const offer = region.registerSource(source);
    const queued = await offer(header('queued'), () => 'Still waiting.');
    expect(global.takePending()).toEqual([queued]);
    const debt = region.contactPressure;
    expect(debt).toBeGreaterThan(0);
    const fired = interceptFire(mind);
    const payload = await frame(['Not a registered source.']);
    expect(payload.prefill).toContain('> ⟂ Not a registered source.\n\n');
    expect(region.contactPressure).toBe(debt);
    const receipt = receiptOf(fired);
    expect(receipt).toBeInstanceOf(PerceptReceipt);
    expect(receipt.provenance).toBe('legacy-unspecified');
    expect(receipt.tier).toBeNull();
    expect(receipt.perceptId).not.toBe(queued.id);
    await memory._journalQueue;
    const entry = indexEntries().at(-1);
    expect(entry.provenance).toBe('legacy-unspecified');
    expect(entry.tier).toBeNull();
    expect(entry.id).toBe(receipt.perceptId);
    expect(entry.renditions).toEqual([{ kind: 'text', text: 'Not a registered source.' }]);
});
