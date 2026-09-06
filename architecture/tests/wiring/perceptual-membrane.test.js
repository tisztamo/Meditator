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

test('closed content is never rendered, dispatched, or journaled; reopening samples the present', async () => {
    let renders = 0, present = 'missed secret', samples = 0;
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const offer = region.registerSource(source, () => {
        samples++;
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
    const pending = global.takePending();
    expect(pending).toHaveLength(1);
    expect(pending[0].reason).toBe(present);
    expect(pending[0].provenance).toBe('simulated');
    expect(region.contactPressure).toBeGreaterThan(0); // queued is not attended
    const payload = await frame(pending);
    expect(payload.prefill).toContain(`> ⟂ ${present}\n\n`);
    expect(region.contactPressure).toBeLessThan(debt);
    await memory._journalQueue;
    const entry = JSON.parse(fs.readFileSync(path.join(journalDir, 'percepts.jsonl'), 'utf8').trim());
    expect(entry.id).toBe(pending[0].id);
    expect(entry.provenance).toBe('simulated');
    expect(entry.modality).toBe('text');
    expect(entry.receivedKind).toBe('text');
    expect(entry.renditions).toEqual([{ kind: 'text', text: present }]);
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

test('boundary reflex requests a fresh sample without preemption; sleep suppresses sensing', async () => {
    let samples = 0, interrupts = 0;
    mind.addEventListener('interrupt', () => interrupts++);
    const offer = region.registerSource(source, () => { samples++; return offer(header('now'), () => 'A fresh observation.'); });
    region.onBoundary(Date.now() + 7000);
    await delay(5);
    expect(region.aperture.state).toBe('soft');
    expect(samples).toBe(1);
    expect(global.takePending()).toHaveLength(1);
    expect(interrupts).toBe(0);
    mind._sleeping = true;
    const before = region.contactPressure;
    region.onBoundary(Date.now() + 100000);
    expect(region.contactPressure).toBe(before);
    let rendered = false;
    await offer(header('asleep'), () => { rendered = true; return 'Asleep.'; });
    expect(rendered).toBe(false);
});
