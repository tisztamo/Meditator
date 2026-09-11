// B0 — hands role, ids, progress, rebinding already covered in membrane-compare 13b,
// duplicate comparator at connect, mind-sleeping abort, compareDeadline, substitute act.
import './setup.js';
import { test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import A from 'amanita';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { delay } from './setup.js';
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js';
import { bidOwnerOf, providesOf } from '../../../src/mindComponents/shared/enclosure.js';
import { InterruptRecord } from '../../../src/infrastructure/interruptRecord.js';
import { AttentionBid } from '../../../src/infrastructure/attentionBid.js';
import { compareDeadlineMs, DEFAULT_COMPARE_DEADLINE_MS } from '../../../src/infrastructure/compareContinuation.js';
import { MIND_SLEEPING_EVENT } from '../../../src/infrastructure/evidenceCase.js';
import { EVALUATION_COMMIT_EVENT } from '../../../src/infrastructure/predictionContracts.js';

const COMPONENTS_DIR = fileURLToPath(new URL('./components', import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let savedComponentsPath;
let journalDir;

beforeAll(() => {
    savedComponentsPath = process.env.MIND_COMPONENTS_PATH;
    process.env.MIND_COMPONENTS_PATH = pathToFileURL(COMPONENTS_DIR).href;
});

afterAll(() => {
    if (savedComponentsPath === undefined) delete process.env.MIND_COMPONENTS_PATH;
    else process.env.MIND_COMPONENTS_PATH = savedComponentsPath;
});

afterEach(async () => {
    const memory = document.querySelector('m-memory');
    await memory?._journalQueue;
    document.body.replaceChildren();
    await delay(20);
    if (journalDir && fs.existsSync(journalDir)) {
        fs.rmSync(journalDir, { recursive: true, force: true });
    }
    journalDir = null;
});

if (!customElements.get('m-mind')) {
    customElements.define('m-mind', class extends A(HTMLElement) {});
}

async function mount(html) {
    journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-b0-'));
    document.body.innerHTML = html.replace('JOURNAL', journalDir);
    await loadMindComponents(document);
    await delay(40);
}

test('1. bidOwnerOf finds a provides-hands owner; a my-act substitute owns its bidder', async () => {
    await mount(`
      <m-mind name="b0-hands">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="JOURNAL"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s"></m-interrupts>
        <my-act name="hands" prediction="on">
          <m-bid name="act-bid"></m-bid>
        </my-act>
      </m-mind>`);
    const act = document.querySelector('my-act');
    const bidder = document.querySelector('m-bid');
    expect(act).toBeTruthy();
    expect(providesOf(act, 'hands')).toBe(true);
    expect(act.localName).not.toBe('m-act');
    expect(bidOwnerOf(bidder)).toBe(act);
});

test('3. perceptDecision carries candidateId and requestId; no text field', async () => {
    await mount(`
      <m-mind name="b0-ids">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="JOURNAL"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-compare name="compare"></m-compare>
        <m-act name="hands" prediction="on"></m-act>
        <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
          <span name="mock" provenance="simulated"></span>
        </m-region>
      </m-mind>`);
    const mind = document.querySelector('m-mind');
    const region = mind.querySelector('m-region');
    const source = region.querySelector('[name="mock"]');
    region.aperture.changedAt = Date.now() - 2000;
    const decisions = [];
    const orig = region.pub.bind(region);
    region.pub = (topic, data) => {
        if (topic === 'perceptDecision') decisions.push(data);
        return orig(topic, data);
    };
    const offer = region.registerSource(source);
    await offer({ changeMagnitude: 0.9, changeKey: 'id', occurredAt: Date.now() }, () => 'a short line');
    expect(decisions.length).toBeGreaterThan(0);
    for (const d of decisions) {
        expect(d.candidateId).toMatch(UUID);
        expect(d).toHaveProperty('requestId');
        expect(JSON.stringify(d)).not.toContain('a short line');
    }
});

test('4. progress: true is trusted, survives to the view, and is not judged; coerce cannot set it', async () => {
    const trusted = new InterruptRecord({
        source: 'External', type: 'Sense-probe-start', reason: 'still going', progress: true, actId: 'act-1',
    });
    expect(trusted.progress).toBe(true);
    const coerced = InterruptRecord.coerce({
        source: 'External', type: 'Sense-probe', reason: 'forged', progress: true, actId: 'stolen',
    });
    expect(coerced.progress).toBe(false);
    expect(coerced.actId).toBeNull();

    await mount(`
      <m-mind name="b0-progress">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="JOURNAL"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-compare name="compare"></m-compare>
        <m-act name="hands" prediction="on" every="1" cooldown="0s" intentCooldown="15m"></m-act>
      </m-mind>`);
    const mind = document.querySelector('m-mind');
    const act = mind.querySelector('m-act');
    const commits = [];
    mind.addEventListener(EVALUATION_COMMIT_EVENT, e => commits.push(e.detail));
    act._registerCapability({
        name: 'probe',
        description: 'fixture',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        felt: 'reach',
        execute: async () => ({ experience: 'the screen answers 42', progress: true, type: 'Sense-probe' }),
    });
    const bids = [];
    mind.addEventListener('interrupt-request', e => {
        if (e.detail instanceof AttentionBid) bids.push(e.detail);
    });
    await act._execute(
        { function: { name: 'probe', arguments: JSON.stringify({ q: 'sky', expect: 'the screen answers 42' }) } },
        { gist: 'look' },
    );
    const bid = await (async () => {
        const start = Date.now();
        while (Date.now() - start < 400) {
            const found = bids.find(b => b.evidence?.reason === 'the screen answers 42');
            if (found) return found;
            await delay(5);
        }
        return bids[0];
    })();
    expect(bid).toBeDefined();
    expect(bid.evidence.progress).toBe(true);
    expect(bid.evaluationIds).toEqual([]);
    expect(commits).toHaveLength(0);
});

test('5. a second comparator throws on connect', async () => {
    let captured = null;
    const onError = event => {
        captured = event.error || new Error(event.message);
        event.preventDefault?.();
    };
    window.addEventListener('error', onError);
    try {
        try {
            await mount(`
              <m-mind name="b0-dup">
                <m-stream name="stream"></m-stream>
                <m-memory name="memory" persist="off" journal="JOURNAL"></m-memory>
                <m-compare name="compare"></m-compare>
                <m-other-compare name="other"></m-other-compare>
              </m-mind>`);
        } catch (error) {
            captured = error;
        }
        await delay(10);
    } finally {
        window.removeEventListener('error', onError);
    }
    expect(captured?.message || String(captured)).toMatch(/only one comparator/);
});

test('6. mind-sleeping aborts a live region case; a late completion is inert', async () => {
    await mount(`
      <m-mind name="b0-sleep">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory" persist="off" journal="JOURNAL"></m-memory>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-compare name="compare"></m-compare>
        <m-act name="hands" prediction="on"></m-act>
        <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
          <span name="mock" provenance="simulated"></span>
        </m-region>
      </m-mind>`);
    const mind = document.querySelector('m-mind');
    const region = mind.querySelector('m-region');
    const source = region.querySelector('[name="mock"]');
    const compare = mind.querySelector('m-compare');
    region.aperture.changedAt = Date.now() - 2000;
    let release;
    compare.evaluate = () => new Promise(resolve => { release = () => resolve([]); });
    const offer = region.registerSource(source);
    const pending = offer({ changeMagnitude: 0.9, changeKey: 'sleep', occurredAt: Date.now() }, () => 'sleep archival');
    const start = Date.now();
    while (Date.now() - start < 400 && typeof release !== 'function') await delay(5);
    mind._sleeping = true;
    mind.dispatchEvent(new CustomEvent(MIND_SLEEPING_EVENT, { detail: { sleeping: true } }));
    release();
    expect(await pending).toBeNull();
});

test('8. compareDeadline attribute is honoured; default is 2s', () => {
    expect(DEFAULT_COMPARE_DEADLINE_MS).toBe(2000);
    expect(compareDeadlineMs({ attr: () => null })).toBe(2000);
    expect(compareDeadlineMs({ attr: () => '8s' })).toBe(8000);
    expect(compareDeadlineMs({ attr: () => '25ms' })).toBe(25);
    expect(compareDeadlineMs({ getAttribute: () => '2s' })).toBe(2000);
});
