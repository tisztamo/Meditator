// A3 — comparator, private evidence view, narrowed busy, ordered evaluation-commit.
import './setup.js';
import { test, expect, beforeEach, afterEach } from 'bun:test';
import A from 'amanita';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { delay } from './setup.js';
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js';
import { Percept } from '../../../src/infrastructure/percept.js';
import { AttentionBid } from '../../../src/infrastructure/attentionBid.js';
import { GateVerdict, ControlRequest } from '../../../src/infrastructure/perceptionContracts.js';
import {
    Prediction, firePrediction, PREDICTION_EVENT, PREDICTION_SETTLED_EVENT,
    EVALUATION_COMMIT_EVENT,
} from '../../../src/infrastructure/predictionContracts.js';
import { CompareBudget } from '../../../src/infrastructure/compareContinuation.js';

const FIXTURE = 'the screen answers 42';
const MISMATCH_TEXT = 'the screen answers 43';
const EXPECT_PHRASE = 'EXPECT_PHRASE_A3_DO_NOT_LEAK';
const EXPERIENCE = 'I turn toward the sky and the light has gone grey.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let mind, region, source, other, global, memory, act, compare, journalDir;

function header(key) {
    return { changeMagnitude: 0.9, changeKey: key, occurredAt: Date.now() };
}
function allowOrientation() { region.aperture.changedAt = Date.now() - 2000; }
function horizon(ms = 60_000) { return new Date(Date.now() + ms).toISOString(); }

function makePrediction(overrides = {}) {
    return new Prediction({
        producer: 'hands',
        scopeId: 'hands',
        actId: overrides.actId || crypto.randomUUID(),
        target: { sourceId: 'mock', modality: 'text', eventType: 'Sense-mock' },
        representation: { kind: 'text', value: FIXTURE },
        basis: { kind: 'realize', text: EXPECT_PHRASE },
        validUntil: horizon(),
        ...overrides,
    });
}

async function waitUntil(predicate, { timeout = 400, step = 5 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const value = predicate();
        if (value) return value;
        await delay(step);
    }
    return predicate();
}

function liveExpect(pred) {
    act._ensurePredictionListener();
    firePrediction(act, pred);
    act._rememberLiveAct(pred.actId, pred);
    return pred;
}

function armActId(actId) {
    const entry = region._sources.get(source);
    entry.control = new ControlRequest({
        kind: 'sample', issuedBy: 'test', reason: 'fixture', actId,
    });
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

function interceptPub(el) {
    const published = [];
    const orig = el.pub.bind(el);
    el.pub = (topic, data) => {
        published.push({ topic, data });
        return orig(topic, data);
    };
    return published;
}

beforeEach(async () => {
    if (!customElements.get('m-mind')) customElements.define('m-mind', class extends A(HTMLElement) {});
    journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-compare-'));
    document.body.innerHTML = `
        <m-mind name="compare-test">
          <m-stream name="stream"></m-stream>
          <m-memory name="memory" persist="off" journal="${journalDir}"></m-memory>
          <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
          <m-compare name="compare"></m-compare>
          <m-act name="hands" prediction="on" every="1" cooldown="0s" intentCooldown="15m"></m-act>
          <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
            <m-interrupts name="local" threshold="0" rateLimit="0s"></m-interrupts>
            <span name="mock" provenance="simulated"></span>
            <span name="other" provenance="simulated"></span>
          </m-region>
        </m-mind>`;
    await loadMindComponents(document);
    await delay(40);
    mind = document.querySelector('m-mind');
    region = mind.querySelector('m-region');
    source = region.querySelector('[name="mock"]');
    other = region.querySelector('[name="other"]');
    global = mind.querySelector('[name="attention"]');
    memory = mind.querySelector('m-memory');
    act = mind.querySelector('m-act');
    compare = mind.querySelector('m-compare');
    allowOrientation();
});

afterEach(async () => {
    act?._teardownPrediction?.('test-end');
    await memory?._journalQueue;
    document.body.replaceChildren();
    fs.rmSync(journalDir, { recursive: true, force: true });
});

test('8. exact fixture text on the membrane produces match/mismatch without rewriting the percept', async () => {
    const pred = liveExpect(makePrediction());
    await delay(5);
    const offer = region.registerSource(source);
    armActId(pred.actId);
    const commits = [];
    mind.addEventListener(EVALUATION_COMMIT_EVENT, e => commits.push(e.detail));
    const settlements = [];
    act.addEventListener(PREDICTION_SETTLED_EVENT, e => settlements.push(e.detail));
    const bid = await offer(header('match'), () => FIXTURE);
    expect(bid).toBeInstanceOf(AttentionBid);
    const evidence = AttentionBid.evidenceOf(bid);
    expect(evidence).toBeInstanceOf(Percept);
    expect(evidence.id).toBe(bid.evidenceId);
    expect(evidence.renderForFrame()).toBe(FIXTURE);
    expect(evidence.reason).toBe(FIXTURE);
    expect(bid.evaluationIds).toHaveLength(1);
    expect(bid.signals).toEqual({ changeMagnitude: 0.9, requested: true, novelty: null });
    await waitUntil(() => commits.length);
    expect(commits[0].evaluationIds).toEqual(bid.evaluationIds);
    expect(JSON.stringify(commits[0])).not.toContain(EXPECT_PHRASE);
    expect(JSON.stringify(commits[0])).not.toContain(FIXTURE);
    expect(commits[0].verdicts).toEqual(['match']);

    await waitUntil(() => settlements.length);
    expect(settlements[0].status).toBe('matched');
    expect(settlements[0].predictionId).toBe(pred.id);

    const pred2 = liveExpect(makePrediction());
    armActId(pred2.actId);
    const mismatchBid = await offer(header('mismatch'), () => MISMATCH_TEXT);
    expect(AttentionBid.evidenceOf(mismatchBid).renderForFrame()).toBe(MISMATCH_TEXT);
    expect(mismatchBid.evaluationIds.length).toBe(1);
    await waitUntil(() => settlements.some(s => s.predictionId === pred2.id));
    expect(settlements.find(s => s.predictionId === pred2.id).status).toBe('mismatched');
});

test('9. ordinary natural-language evidence does not manufacture mismatch', async () => {
    const pred = liveExpect(makePrediction());
    const offer = region.registerSource(source);
    armActId(pred.actId);
    const settlements = [];
    act.addEventListener(PREDICTION_SETTLED_EVENT, e => settlements.push(e.detail));
    const bid = await offer(header('nl'), () => 'I wonder whether the weather will hold tomorrow.');
    expect(bid).toBeInstanceOf(AttentionBid);
    expect(AttentionBid.evidenceOf(bid).renderForFrame()).toContain('weather');
    await delay(40);
    const own = settlements.filter(s => s.predictionId === pred.id);
    expect(own.every(s => s.status !== 'mismatched')).toBe(true);
});

test('10. comparator timeout cannot settle a prediction; late resolution is ignored', async () => {
    const pred = liveExpect(makePrediction());
    const orig = compare.evaluate.bind(compare);
    let finish;
    compare.evaluate = (view, opts) => new Promise(resolve => {
        finish = () => resolve(orig(view, opts));
    });
    region._compareDeadlineOverride = 25;
    const settlements = [];
    act.addEventListener(PREDICTION_SETTLED_EVENT, e => settlements.push(e.detail));
    const offer = region.registerSource(source);
    armActId(pred.actId);
    const pending = offer(header('slow'), () => FIXTURE);
    await delay(80);
    const bid = await pending;
    expect(bid).toBeInstanceOf(AttentionBid);
    expect(settlements.filter(s => s.predictionId === pred.id && (s.status === 'matched' || s.status === 'mismatched')))
        .toHaveLength(0);
    finish?.();
    await delay(40);
    expect(settlements.filter(s => s.predictionId === pred.id && (s.status === 'matched' || s.status === 'mismatched')))
        .toHaveLength(0);
});

test('11. a second sensory candidate can materialize while the first is comparing', async () => {
    let inEvaluate = false;
    let release;
    compare.evaluate = () => new Promise(resolve => {
        inEvaluate = true;
        release = () => resolve([]);
    });
    const offer = region.registerSource(source);
    let secondMaterialized = 0;
    const first = offer(header('one'), () => 'first archival');
    await waitUntil(() => inEvaluate);
    expect(region._sources.get(source).busy).toBe(false);
    const second = offer(header('two'), () => {
        secondMaterialized++;
        return 'second archival';
    });
    await waitUntil(() => secondMaterialized === 1);
    expect(secondMaterialized).toBe(1);
    release();
    expect(await first).toBeInstanceOf(AttentionBid);
    expect(await second).toBeInstanceOf(AttentionBid);
});

test('12. faster later comparison does not overtake earlier commit from the same source; unrelated sources proceed', async () => {
    const blockers = new Map();
    compare.evaluate = view => new Promise(resolve => {
        blockers.set(view.archivalText, () => resolve([]));
    });
    const offerA = region.registerSource(source);
    const offerB = region.registerSource(other);
    const order = [];
    mind.addEventListener('interrupt-request', e => {
        if (e.detail instanceof AttentionBid) order.push(AttentionBid.evidenceOf(e.detail).reason);
    });
    const a1 = offerA(header('a1'), () => 'alpha-slow');
    await waitUntil(() => blockers.has('alpha-slow'));
    const a2 = offerA(header('a2'), () => 'alpha-fast');
    await waitUntil(() => blockers.has('alpha-fast'));
    const b1 = offerB(header('b1'), () => 'beta-independent');
    await waitUntil(() => blockers.has('beta-independent'));
    blockers.get('alpha-fast')();
    blockers.get('beta-independent')();
    await waitUntil(() => order.includes('beta-independent'));
    expect(order).toContain('beta-independent');
    expect(order).not.toContain('alpha-fast');
    blockers.get('alpha-slow')();
    await Promise.all([a1, a2, b1]);
    const aIndexSlow = order.indexOf('alpha-slow');
    const aIndexFast = order.indexOf('alpha-fast');
    expect(aIndexSlow).toBeGreaterThanOrEqual(0);
    expect(aIndexFast).toBeGreaterThan(aIndexSlow);
    expect(order.indexOf('beta-independent')).toBeGreaterThanOrEqual(0);
});

test('13. disconnect prevents stale commit', async () => {
    let release;
    compare.evaluate = () => new Promise(resolve => { release = () => resolve([]); });
    const offer = region.registerSource(source);
    const pending = offer(header('stale'), () => 'stale archival');
    await waitUntil(() => typeof release === 'function');
    region.remove();
    release();
    expect(await pending).toBeNull();
});

test('13b. sleep, moved source, and rebound comparator drop in-flight comparison', async () => {
    const offer = region.registerSource(source);

    let releaseSleep;
    compare.evaluate = () => new Promise(resolve => { releaseSleep = () => resolve([]); });
    const sleeping = offer(header('sleep'), () => 'sleep archival');
    await waitUntil(() => typeof releaseSleep === 'function');
    mind._sleeping = true;
    releaseSleep();
    expect(await sleeping).toBeNull();
    mind._sleeping = false;

    let releaseMove;
    compare.evaluate = () => new Promise(resolve => { releaseMove = () => resolve([]); });
    const moving = offer(header('move'), () => 'move archival');
    await waitUntil(() => typeof releaseMove === 'function');
    mind.appendChild(source);
    releaseMove();
    expect(await moving).toBeNull();
    region.appendChild(source);

    const offerAgain = region.registerSource(source);
    let releaseBind;
    compare.evaluate = () => new Promise(resolve => { releaseBind = () => resolve([]); });
    const rebound = offerAgain(header('bind'), () => 'bind archival');
    await waitUntil(() => typeof releaseBind === 'function');
    const old = compare;
    old.onDisconnect();
    releaseBind();
    expect(await rebound).toBeNull();
});

test('18. awareness refusal after comparison produces no bid, receipt, memory line, or content-bearing telemetry', async () => {
    const pred = liveExpect(makePrediction());
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const commits = [];
    mind.addEventListener(EVALUATION_COMMIT_EVENT, e => commits.push(e.detail));
    const published = interceptPub(region);
    const firedMind = interceptFire(mind);
    const decide = region.permitAwareness.bind(region);
    region.permitAwareness = annotated => {
        const mirrored = decide(annotated);
        return new GateVerdict({
            stage: mirrored.stage, permitted: false, reason: mirrored.reason,
            bypass: mirrored.bypass, apertureState: mirrored.apertureState, gate: mirrored.gate,
        });
    };
    const offer = region.registerSource(source);
    armActId(pred.actId);
    const result = await offer(header('refuse'), () => FIXTURE);
    expect(result).toBeNull();
    expect(bids).toHaveLength(0);
    expect(commits).toHaveLength(0);
    expect(global.takePending()).toHaveLength(0);
    const awareness = published.filter(p => p.topic === 'perceptDecision' && p.data.stage === 'awareness');
    expect(awareness).toHaveLength(1);
    expect(awareness[0].data.permitted).toBe(false);
    expect(JSON.stringify(published)).not.toContain(FIXTURE);
    expect(JSON.stringify(published)).not.toContain(EXPECT_PHRASE);
    expect(firedMind.some(f => f.name === 'percepts-attended')).toBe(false);
    await memory._journalQueue;
    expect(fs.existsSync(path.join(journalDir, 'percepts.jsonl'))).toBe(false);
    const day = path.join(journalDir, `${new Date().toISOString().slice(0, 10)}.md`);
    if (fs.existsSync(day)) {
        expect(fs.readFileSync(day, 'utf8')).not.toContain(FIXTURE);
        expect(fs.readFileSync(day, 'utf8')).not.toContain(EXPECT_PHRASE);
    }
});

test('19. prediction events and private evidence remain inside their membrane', async () => {
    const pubs = interceptPub(act);
    const pubsCompare = interceptPub(compare);
    const pred = liveExpect(makePrediction());
    expect(pubs.every(p => p.topic !== PREDICTION_EVENT && p.topic !== PREDICTION_SETTLED_EVENT)).toBe(true);
    expect(pubsCompare.every(p => p.topic !== PREDICTION_EVENT)).toBe(true);
    const offer = region.registerSource(source);
    armActId(pred.actId);
    const commits = [];
    mind.addEventListener(EVALUATION_COMMIT_EVENT, e => commits.push(e.detail));
    await offer(header('in'), () => FIXTURE);
    await waitUntil(() => commits.length);
    expect(JSON.stringify(commits[0])).not.toContain(EXPECT_PHRASE);
    expect(JSON.stringify(commits[0])).not.toContain(FIXTURE);
    expect(commits[0].evaluationIds[0]).toMatch(UUID);
});

test('busy is released after materialization so a second offer can enter evaluate delay', async () => {
    let evaluateStarted = 0;
    compare.evaluate = () => new Promise(() => { evaluateStarted++; });
    const offer = region.registerSource(source);
    offer(header('hold'), () => 'holding');
    await waitUntil(() => evaluateStarted === 1);
    expect(region._sources.get(source).busy).toBe(false);
    let secondEntered = false;
    offer(header('next'), () => { secondEntered = true; return 'next'; });
    await waitUntil(() => secondEntered);
    expect(secondEntered).toBe(true);
});

test('capacity full still admits evidence without match/mismatch', async () => {
    compare.evaluate = () => new Promise(() => {});
    const offerA = region.registerSource(source);
    const offerB = region.registerSource(other);
    region._compareBudget = new CompareBudget(1);
    offerA(header('fill'), () => 'occupies capacity');
    await waitUntil(() => region._compareBudget.inFlight === 1);
    const admitted = await offerB(header('overflow'), () => 'still admitted');
    expect(admitted).toBeInstanceOf(AttentionBid);
    expect(AttentionBid.evidenceOf(admitted).renderForFrame()).toBe('still admitted');
    expect(admitted.evaluationIds).toEqual([]);
});

test('act-path comparison uses the same Percept id through commit and bid', async () => {
    act._registerCapability({
        name: 'probe',
        description: 'fixture',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        felt: 'reach',
        execute: async () => ({ experience: FIXTURE }),
    });
    const settlements = [];
    act.addEventListener(PREDICTION_SETTLED_EVENT, e => settlements.push(e.detail));
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    await act._execute(
        { function: { name: 'probe', arguments: JSON.stringify({ q: 'sky', expect: FIXTURE }) } },
        { gist: 'look' },
    );
    const bid = await waitUntil(() => bids.find(d => d instanceof AttentionBid && d.evidence?.reason === FIXTURE));
    expect(bid.evidence.id).toBe(bid.evidenceId);
    expect(bid.evaluationIds.length).toBe(1);
    await waitUntil(() => settlements.some(s => s.status === 'matched'));
    expect(settlements.some(s => s.status === 'matched')).toBe(true);
});

test('act-path without comparator stays synchronous A2 redispatch', async () => {
    compare.remove();
    act._registerCapability({
        name: 'sync-probe',
        description: 'fixture',
        parameters: { type: 'object', properties: { q: { type: 'string' } } },
        felt: 'reach',
        execute: async () => ({ experience: EXPERIENCE }),
    });
    const seen = [];
    mind.addEventListener('interrupt-request', e => seen.push(e.detail));
    await act._execute(
        { function: { name: 'sync-probe', arguments: JSON.stringify({ q: 'sky', expect: EXPECT_PHRASE }) } },
        { gist: 'look' },
    );
    const bid = seen.find(d => d instanceof AttentionBid);
    expect(bid).toBeDefined();
    expect(bid.evaluationIds).toEqual([]);
    expect(bid.evidence.renderForFrame()).toContain('grey');
});
