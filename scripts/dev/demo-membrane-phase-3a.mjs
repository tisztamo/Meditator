// Offline Phase 3A sketch: act-bound expectation, exact-text comparison, owner-local bidding.
// No model or provider call. Proves transport and replacement seams only — not that
// exact text is a useful cognitive comparator, that mismatch improves functioning,
// or that these fixture weights belong in a resident mind.
import '../../src/startup/jsdom.js';
import { MMind } from '../../src/mindComponents/mind/mMind.js';
import { MBaseComponent } from '../../src/mindComponents/shared/mBaseComponent.js';
import { loadMindComponents } from '../../src/startup/loadMindComponents.js';
import { AttentionBid } from '../../src/infrastructure/attentionBid.js';
import {
    PREDICTION_EVENT, EVALUATION_COMMIT_EVENT, firePrediction, Prediction,
} from '../../src/infrastructure/predictionContracts.js';
import { ControlRequest } from '../../src/infrastructure/perceptionContracts.js';

const FIXTURE = 'the screen answers 42';
const CONTRADICTION = 'the screen answers 43';
const EXPECT_PHRASE = 'EXPECT_PHRASE_A4_DO_NOT_LEAK';

customElements.define('m-mind', class extends MBaseComponent {
    assembleFrame = MMind.prototype.assembleFrame;
    _identity() { return this.getPrompt(); }
    _landingOpener() { return 'I turn toward it.'; }
});

document.body.innerHTML = `
  <m-mind name="membrane-3a-demo" space="off">
    I encounter a small simulated outside through descriptions, not sight.
    Prediction, comparison, and bidding are fixture seams, not a resident policy.
    <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
    <m-compare name="compare"></m-compare>
    <m-act name="hands" prediction="on" every="1" cooldown="0s" intentCooldown="15m"
           src="!scope/attention" boundarySrc="!scope/attention">
      <m-bid name="act-bid" expectedFloor="0.8" mismatchWeight="0.95"></m-bid>
      <m-terminal name="terminal"></m-terminal>
    </m-act>
    <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
      <m-bid name="region-bid" expectedFloor="0.8" mismatchWeight="0.95"></m-bid>
      <m-interrupts name="local" threshold="0" rateLimit="0s"></m-interrupts>
      <span name="garden" provenance="simulated"></span>
    </m-region>
  </m-mind>`;
await loadMindComponents(document);

function waitUntil(predicate, { timeout = 800, step = 5 } = {}) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
            const value = predicate();
            if (value) return resolve(value);
            if (Date.now() - start > timeout) return reject(new Error('waitUntil timed out'));
            setTimeout(tick, step);
        };
        tick();
    });
}

let act;
try {
    const mind = document.querySelector('m-mind');
    const region = mind.querySelector('m-region');
    act = mind.querySelector('m-act');
    const source = region.querySelector('[name="garden"]');
    const terminal = mind.querySelector('m-terminal');
    const attention = mind.querySelector('[name="attention"]');
    const compare = mind.querySelector('m-compare');

    const pubs = [];
    const origPub = region.pub.bind(region);
    region.pub = (topic, data) => {
        pubs.push({ topic, data });
        return origPub(topic, data);
    };
    const actPubs = [];
    const origActPub = act.pub.bind(act);
    act.pub = (topic, data) => {
        actPubs.push({ topic, data });
        return origActPub(topic, data);
    };

    const commits = [];
    mind.addEventListener(EVALUATION_COMMIT_EVENT, e => commits.push(e.detail));

    region.aperture.changedAt = Date.now() - 2000;
    const offer = region.registerSource(source);

    const order = [];
    act.addEventListener(PREDICTION_EVENT, () => order.push('prediction'));
    act._registerCapability({
        name: 'probe',
        description: 'fixture hand',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        felt: 'reach',
        execute: async () => {
            order.push('execute');
            return { experience: FIXTURE, salience: 0.2 };
        },
    });
    await act._execute(
        { function: { name: 'probe', arguments: JSON.stringify({ q: 'sky', expect: EXPECT_PHRASE }) } },
        { gist: 'look' },
    );
    console.log(`1. expectation published before execute: order=${order.join('→')}`);

    const confirmBids = [];
    const onConfirm = e => { if (e.detail instanceof AttentionBid) confirmBids.push(e.detail); };
    mind.addEventListener('interrupt-request', onConfirm);
    await act._execute(
        { function: { name: 'probe', arguments: JSON.stringify({ q: 'sky', expect: FIXTURE }) } },
        { gist: 'look' },
    );
    const confirmation = await waitUntil(() => confirmBids.find(b => b.signals.predictionMatch === 1));
    mind.removeEventListener('interrupt-request', onConfirm);
    console.log(`2. exact confirmation bids through expectedFloor: match=${confirmation.signals.predictionMatch} salience=${confirmation.salience} (floor 0.8, change 0.2)`);

    act._registerCapability({
        name: 'contradict',
        description: 'fixture hand',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        felt: 'reach',
        execute: async () => ({ experience: CONTRADICTION, salience: 0.2 }),
    });
    const contraBids = [];
    const onContra = e => { if (e.detail instanceof AttentionBid) contraBids.push(e.detail); };
    mind.addEventListener('interrupt-request', onContra);
    await act._execute(
        { function: { name: 'contradict', arguments: JSON.stringify({ q: 'sky', expect: FIXTURE }) } },
        { gist: 'look' },
    );
    const contradiction = await waitUntil(() => contraBids.find(b => b.evidence?.reason === CONTRADICTION
        && b.signals.predictionMismatch === 1));
    mind.removeEventListener('interrupt-request', onContra);
    console.log(`3. contradiction bids through mismatchWeight without changing evidence: mismatch=${contradiction.signals.predictionMismatch} changeMagnitude=${contradiction.signals.changeMagnitude} evidence="${contradiction.evidence.reason}" salience=${contradiction.salience}`);

    function live(actId, value = FIXTURE) {
        const pred = new Prediction({
            producer: 'hands', scopeId: 'hands', actId,
            target: { sourceId: 'garden', modality: 'text', eventType: 'Sense-garden' },
            representation: { kind: 'text', value },
            basis: { kind: 'realize', text: EXPECT_PHRASE },
            validUntil: new Date(Date.now() + 60_000).toISOString(),
        });
        act._ensurePredictionListener();
        firePrediction(act, pred);
        act._rememberLiveAct(pred.actId, pred);
        return pred;
    }
    const memAct = crypto.randomUUID();
    live(memAct);
    const entry = region._sources.get(source);
    entry.control = new ControlRequest({ kind: 'sample', issuedBy: 'demo', reason: 'fixture', actId: memAct });
    const membraneMatch = await offer({ changeMagnitude: 0.2, changeKey: 'mem-match', occurredAt: Date.now() },
        () => FIXTURE);
    console.log(`4a. membrane percept (same comparator/bidder): match=${membraneMatch.signals.predictionMatch} salience=${membraneMatch.salience}`);

    const memMis = crypto.randomUUID();
    live(memMis);
    entry.control = new ControlRequest({ kind: 'sample', issuedBy: 'demo', reason: 'fixture', actId: memMis });
    const membraneMismatch = await offer({ changeMagnitude: 0.2, changeKey: 'mem-mis', occurredAt: Date.now() },
        () => CONTRADICTION);
    console.log(`4b. membrane mismatch: mismatch=${membraneMismatch.signals.predictionMismatch} evidence unchanged salience=${membraneMismatch.salience}`);

    let seenCtx = null;
    act._registerCapability({
        name: 'defer',
        description: 'fixture',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
        felt: 'reach',
        execute: async (_args, ctx) => {
            seenCtx = ctx;
            return { experience: '' };
        },
        predictionTarget: { eventType: 'Sense-terminal' },
    });
    const defBids = [];
    const onDef = e => { if (e.detail instanceof AttentionBid) defBids.push(e.detail); };
    mind.addEventListener('interrupt-request', onDef);
    await act._execute(
        { function: { name: 'defer', arguments: JSON.stringify({ q: 'sky', expect: FIXTURE }) } },
        { gist: 'run' },
    );
    terminal._dispatch({
        experience: CONTRADICTION,
        salience: 0.2,
        urgent: true,
        type: 'Sense-terminal',
        actId: seenCtx.actId,
    });
    const deferred = await waitUntil(() => defBids.find(b => String(b.type).startsWith('Sense-terminal')
        && b.signals.predictionMismatch === 1));
    mind.removeEventListener('interrupt-request', onDef);
    console.log(`4c. deferred hand consequence: mismatch=${deferred.signals.predictionMismatch} salience=${deferred.salience} actId preserved=${deferred.evidence.actId === seenCtx.actId}`);
    console.log(`4d. immediate hand confirmation already shown in step 2 (same act bidder).`);

    let evaluateStarted = 0;
    let releaseSlow;
    const origEval = compare.evaluate.bind(compare);
    compare.evaluate = (view, opts) => new Promise(resolve => {
        evaluateStarted++;
        releaseSlow = () => resolve(origEval(view, opts));
    });
    const slow = offer({ changeMagnitude: 0.4, changeKey: 'slow', occurredAt: Date.now() }, () => 'slow archival');
    await waitUntil(() => evaluateStarted === 1);
    const busyDuringCompare = region._sources.get(source).busy;
    let secondMaterialized = false;
    const second = offer({ changeMagnitude: 0.4, changeKey: 'next', occurredAt: Date.now() }, () => {
        secondMaterialized = true;
        return 'next archival';
    });
    await waitUntil(() => secondMaterialized);
    releaseSlow();
    await slow;
    await second;
    compare.evaluate = origEval;
    console.log(`5. slow comparison does not hold the source busy: busy=${busyDuringCompare} secondMaterialized=${secondMaterialized}`);

    let releaseLate;
    compare.evaluate = () => new Promise(resolve => { releaseLate = () => resolve([]); });
    const pending = offer({ changeMagnitude: 0.4, changeKey: 'late', occurredAt: Date.now() }, () => 'late archival');
    await waitUntil(() => typeof releaseLate === 'function');
    region.remove();
    releaseLate();
    const late = await pending;
    console.log(`6. cancellation makes late work inert: lateBid=${late}`);

    const telemetry = JSON.stringify({ pubs, actPubs, commits: commits.map(c => ({ ...c })) });
    const leaked = telemetry.includes(EXPECT_PHRASE);
    const commitHasText = JSON.stringify(commits).includes(FIXTURE) || JSON.stringify(commits).includes(CONTRADICTION);
    console.log(`7. no expectation or private text in pre-awareness telemetry: leakedExpect=${leaked} commitHasEvidenceText=${commitHasText} pending=${attention.pending.length}`);
    console.log(`Stop: later architecture can replace producer, comparator, or bidder without changing evidence, authority, frame assembly, or memory.`);
} finally {
    act?._teardownPrediction?.('demo-end');
    document.body.replaceChildren();
}
