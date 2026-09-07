// C1 / S1 — the aperture role contract, run against the built-in
// `m-region[modality]` and against `m-test-aperture` from a components/ dir.
// Inner source stays a span and finds the aperture by role, not tag.
import './setup.js';
import { test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import A from 'amanita';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { delay } from './setup.js';
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js';
import { getLoadedComponentSources } from '../../../src/config/componentResolver.js';
import { MMind } from '../../../src/mindComponents/mind/mMind.js';
import { enclosingOf } from '../../../src/mindComponents/shared/enclosure.js';
import { AttentionBid } from '../../../src/infrastructure/attentionBid.js';
import { Percept } from '../../../src/infrastructure/percept.js';
import { ControlRequest } from '../../../src/infrastructure/perceptionContracts.js';

const COMPONENTS_DIR = fileURLToPath(new URL('./components', import.meta.url));
const TEXT = 'The simulated garden is still.';
const WITHHELD = 'missed secret from inner open';
const header = key => ({ changeMagnitude: 0.9, changeKey: key, occurredAt: Date.now() });

let journalDir;
let savedComponentsPath;

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
    if (journalDir && fs.existsSync(journalDir)) {
        fs.rmSync(journalDir, { recursive: true, force: true });
    }
    journalDir = null;
});

if (!customElements.get('m-mind')) {
    customElements.define('m-mind', class extends A(HTMLElement) {});
}

const REGION = {
    name: 'baseline m-region',
    tag: 'm-region',
    attrs: 'modality="text"',
};

const SUBSTITUTE = {
    name: 'S1 m-test-aperture',
    tag: 'm-test-aperture',
    attrs: '',
};

function openTag(provider, name, aperture) {
    const extra = provider.attrs ? ` ${provider.attrs}` : '';
    return `<${provider.tag} name="${name}" aperture="${aperture}" dwell="1s" contactHorizon="10s"${extra}>`;
}

function closeTag(provider) {
    return `</${provider.tag}>`;
}

function nestedHtml(provider, { outer, inner }) {
    return `
          ${openTag(provider, 'shell', outer)}
            ${openTag(provider, 'outside', inner)}
              <m-interrupts name="local" threshold="0.3" rateLimit="0s"></m-interrupts>
              <span name="mock" provenance="simulated"></span>
            ${closeTag(provider)}
          ${closeTag(provider)}`;
}

async function mount(inner) {
    journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'med-c1-'));
    document.body.innerHTML = `
        <m-mind name="c1-test">
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

function indexEntries() {
    const file = path.join(journalDir, 'percepts.jsonl');
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
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

function allowOrientation(el) { el.aperture.changedAt = Date.now() - 2000; }

function sampleRequest(target) {
    return new ControlRequest({
        kind: 'sample', issuedBy: 'test', reason: 'probe',
        ...(target != null ? { target } : {}),
    });
}

/** Inner source is a span; the aperture is whatever provides the role. */
function aperturesOf(mind) {
    const source = mind.querySelector('[name="mock"]');
    const inner = enclosingOf(source, 'aperture');
    const outer = inner?.enclosing('aperture') ?? null;
    return { source, inner, outer, global: mind.querySelector('[name="attention"]') };
}

async function driveOpenOffer(mind) {
    const { source, inner, global } = aperturesOf(mind);
    const memory = mind.querySelector('m-memory');
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const offer = inner.registerSource(source);
    const percept = await offer(header('garden-light'), () => TEXT);
    const pending = global.takePending();
    const fired = interceptFire(mind);
    await MMind.prototype.assembleFrame.call(mind, pending);
    await memory._journalQueue;
    const attended = fired.find(f => f.name === 'percepts-attended');
    return {
        percept,
        bids,
        pending: pending.map(p => {
            const evidence = AttentionBid.evidenceOf(p);
            return {
                reason: p.reason, salience: p.salience, source: p.source, type: p.type,
                provenance: evidence.provenance,
            };
        }),
        attended: (attended?.detail || []).map(r => ({
            renditionText: r.renditionText, sourceId: r.sourceId, provenance: r.provenance,
            receivedKind: r.receivedKind,
        })),
        journal: indexEntries().map(e => ({
            source: e.source, renditions: e.renditions, provenance: e.provenance,
            receivedKind: e.receivedKind,
        })),
    };
}

/**
 * C1: veto, nearest-credits, id-based receipt, fold, forwarding, control delivery.
 * Parameterized by the mounted architecture; looks up the aperture by role.
 */
async function runC1(mind, provider) {
    const { source, inner, outer, global } = aperturesOf(mind);
    expect(source.localName).toBe('span');
    expect(inner).toBeTruthy();
    expect(outer).toBeTruthy();
    expect(inner.provides('aperture')).toBe(true);
    expect(outer.provides('aperture')).toBe(true);
    expect(inner.localName).toBe(provider.tag);
    expect(outer.localName).toBe(provider.tag);
    expect(enclosingOf(source, 'aperture')).toBe(inner);

    const hits = [];
    let renders = 0;
    const offer = inner.registerSource(source, request => { hits.push(request); });

    // Veto: outer closed, inner open — zero materializer, zero bids.
    expect(outer.aperture.state).toBe('closed');
    expect(inner.aperture.state).toBe('open');
    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
    const refused = await offer({ ...header('veto'), reason: WITHHELD }, () => {
        renders++;
        return WITHHELD;
    });
    expect(refused).toBeNull();
    expect(renders).toBe(0);
    expect(bids).toHaveLength(0);
    expect(global.takePending()).toHaveLength(0);
    expect(fs.existsSync(path.join(journalDir, 'percepts.jsonl'))).toBe(false);

    // Fold: outer published pressure is max(own, children).
    expect(inner.contactPressure).toBeCloseTo(inner.aperture.deficit);
    expect(outer.contactPressure).toBeCloseTo(
        outer.fold(outer.aperture.deficit, [inner.contactPressure]),
    );

    // Forwarding: opening the outer issues an untargeted sample that reaches the inner source.
    hits.length = 0;
    allowOrientation(outer);
    expect(outer.orient('open')).toBe(true);
    await delay(5);
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('sample');

    // Nearest-credits + id-based receipt: only the issuing (inner) provider holds the id.
    const admitted = await offer(header('admitted'), () => {
        renders++;
        return TEXT;
    });
    expect(renders).toBe(1);
    expect(admitted).toBeInstanceOf(AttentionBid);
    const evidence = AttentionBid.evidenceOf(admitted);
    expect(evidence).toBeInstanceOf(Percept);
    const evidenceId = admitted.evidenceId;
    expect(evidenceId).toBe(evidence.id);
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

    const pending = global.takePending();
    expect(pending).toHaveLength(1);
    expect(pending[0].evidenceId).toBe(evidenceId);
    const fired = interceptFire(mind);
    await MMind.prototype.assembleFrame.call(mind, pending);
    const attended = fired.find(f => f.name === 'percepts-attended');
    expect(attended).toBeTruthy();
    expect(attended.detail).toHaveLength(1);
    expect(attended.detail[0].perceptId).toBe(evidenceId);
    expect(inner.aperture.deficit).toBeLessThan(innerDebt);
    expect(outer.aperture.deficit).toBe(outerDebt);
    expect(outerCredits).toHaveLength(0);
    expect(inner._issued.has(evidenceId)).toBe(false);
    expect(outer._issued.size).toBe(0);

    // Control delivery: untargeted skips a closed inner; a named target is delivered once.
    allowOrientation(inner);
    expect(inner.orient('closed')).toBe(true);
    await delay(5);
    hits.length = 0;
    outer.requestControl(sampleRequest());
    await delay(5);
    expect(hits).toHaveLength(0);
    outer.requestControl(sampleRequest('mock'));
    await delay(5);
    expect(hits).toHaveLength(1);
}

test(`C1 ${REGION.name}: veto, nearest-credits, id receipt, fold, forwarding, control`, async () => {
    const mind = await mount(nestedHtml(REGION, { outer: 'closed', inner: 'open' }));
    await runC1(mind, REGION);
});

test(`C1 ${SUBSTITUTE.name}: same table; loaded from a components/ dir`, async () => {
    const mind = await mount(nestedHtml(SUBSTITUTE, { outer: 'closed', inner: 'open' }));
    const loaded = getLoadedComponentSources().find(s => s.tag === 'm-test-aperture');
    if (loaded) {
        expect(loaded.layer).toBe('env');
        expect(loaded.path.replaceAll('\\', '/')).toMatch(/components\/mTestAperture\.js$/);
    } else {
        expect(customElements.get('m-test-aperture')).toBeTruthy();
    }
    await runC1(mind, SUBSTITUTE);
});

test('S1: m-test-aperture receipts are identical to the baseline m-region', async () => {
    const baselineMind = await mount(nestedHtml(REGION, { outer: 'open', inner: 'open' }));
    const { source: baselineSource, inner: baselineInner } = aperturesOf(baselineMind);
    expect(baselineSource.localName).toBe('span');
    expect(baselineInner.localName).toBe('m-region');
    const baseline = await driveOpenOffer(baselineMind);
    await baselineMind.querySelector('m-memory')?._journalQueue;
    document.body.replaceChildren();
    fs.rmSync(journalDir, { recursive: true, force: true });

    const subMind = await mount(nestedHtml(SUBSTITUTE, { outer: 'open', inner: 'open' }));
    const { source: subSource, inner: subInner } = aperturesOf(subMind);
    expect(subSource.localName).toBe('span');
    expect(subInner.localName).toBe('m-test-aperture');
    expect(enclosingOf(subSource, 'aperture')).toBe(subInner);
    const sub = await driveOpenOffer(subMind);
    expect(sub.pending).toEqual(baseline.pending);
    expect(sub.attended).toEqual(baseline.attended);
    expect(sub.journal).toEqual(baseline.journal);
    expect(sub.percept).toBeInstanceOf(AttentionBid);
    expect(AttentionBid.evidenceOf(sub.percept)).toBeInstanceOf(Percept);
});
