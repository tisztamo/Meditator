// m-market-outcome — extraction, settlement, and the felt consequence of being wrong.
//
// The component under test is the first thing in this repo that settles a market
// prediction against the market. Two halves are tested separately, because they
// fail differently:
//
//   THE EXTRACTOR is pure and is mostly tested on what it REFUSES. Its value is
//   that it says no visibly — every refusal below is a prediction a live mind
//   would produce that this component will never pretend to have settled.
//
//   THE COMPONENT is tested wired into a real mind, with globalThis.fetch stubbed
//   and the shared stereotic cache reset, so no test touches the network. It gets
//   its own memory home, which is removed afterwards.
import './setup.js';
import { test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { delay } from './setup.js';
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js';
import { resetStereoticCache } from '../../lab/components/stereoticFeed.js';
import {
    extractMarketClaim, parseMarketPrices, indexMarketPrices, settleWatch,
    parseAliases, feltLine,
} from '../../lab/components/mMarketOutcome.js';

const HOME = path.join(process.cwd(), 'memory', 'market-outcome-test');
const SYMBOLS = ['BTC', 'ETH', 'SOL'];
const ALIASES = parseAliases('BTC=bitcoin; ETH=ether,ethereum');

const claim = (text, opts = {}) => extractMarketClaim(text, {
    symbols: SYMBOLS, aliases: ALIASES, maxHorizonMs: 86400000, ...opts,
});

// The live AssetStatistics spelling, including the -100 sentinel on PAXG.
const priceDoc = (over = {}) => JSON.stringify([
    { symbolname: 'BTC', price: 63000, change1h: 0.4, change4h: -1.2, change24h: 3.1,
      change7d: 12.0, updated: Math.round(Date.now() / 1000), ...over.BTC },
    { symbolname: 'ETH', price: 2500, change1h: -0.8, change4h: 0.2, change24h: -2.0,
      change7d: 4.0, updated: Math.round(Date.now() / 1000), ...over.ETH },
    { symbolname: 'PAXG', price: 2650, change1h: -100.0, change4h: -100.0,
      change24h: -100.0, change7d: -100.0, updated: Math.round(Date.now() / 1000) },
]);

let fetched = 0;
let body = priceDoc();
function stubFetch() {
    fetched = 0;
    globalThis.fetch = async () => {
        fetched++;
        return { ok: true, status: 200, text: async () => body };
    };
}

// ---------------------------------------------------------------------------
// Extraction — what it reads
// ---------------------------------------------------------------------------

test('extracts symbol, direction and horizon from a plain claim', () => {
    const c = claim('I think BTC will rise over the next hour.');
    expect(c).toMatchObject({ ok: true, symbol: 'BTC', direction: 'up', horizonMs: 3600000 });
    expect(c.hedged).toBe(true);          // "I think" is a hedge, recorded, not refused
    expect(c.horizonAssumed).toBe(false);
});

test('reads the three horizon spellings it supports', () => {
    expect(claim('ETH falls within 30 minutes').horizonMs).toBe(1800000);
    expect(claim('ETH falls over the next 2 days', { maxHorizonMs: 604800000 }).horizonMs).toBe(172800000);
    expect(claim('ETH falls in 15m').horizonMs).toBe(900000);
});

test('a declared alias lets a lowercase name through; an undeclared one does not', () => {
    expect(claim('bitcoin should climb in an hour')).toMatchObject({ ok: true, symbol: 'BTC' });
    expect(claim('solana should climb in an hour')).toMatchObject({ ok: false, reason: 'no-symbol' });
});

test('flat claims are directional too', () => {
    expect(claim('BTC stays flat for the next 4 hours'))
        .toMatchObject({ ok: true, direction: 'flat', horizonMs: 14400000 });
});

// ---------------------------------------------------------------------------
// Extraction — what it REFUSES. This is the honest half.
// ---------------------------------------------------------------------------

test('refuses the kind of prediction a live run actually produced', () => {
    // The single prediction row in memory/stereotic-lab-1/predictions/ledger.jsonl.
    // It is an expectation about an ACT, not about a market, and nothing here
    // should ever turn it into a settleable claim.
    const c = claim('to stand on the hill and watch the wind, not be the anemometer');
    expect(c.ok).toBe(false);
    expect(c.reason).toBe('no-symbol');
});

test.each([
    ['no-symbol', 'The market will rise in an hour'],
    ['ambiguous-symbol', 'BTC will rise and ETH will rise in an hour'],
    ['no-direction', 'BTC will do something in an hour'],
    ['ambiguous-direction', 'BTC may rise or fall within an hour'],
    ['negated-direction', 'BTC will not rise in the next hour'],
    ['conditional', 'If the news holds, BTC will rise in an hour'],
    ['no-horizon', 'BTC will rise'],
    ['no-horizon', 'BTC will rise today'],
    ['no-horizon', 'BTC will rise soon'],
    ['horizon-too-long', 'BTC will rise over the next 2 weeks'],
    ['ambiguous-horizon', 'BTC will rise in an hour, maybe in 2 days'],
    ['no-text', '   '],
])('refuses with reason %s: "%s"', (reason, text) => {
    expect(claim(text)).toMatchObject({ ok: false, reason });
});

test('a negated direction is refused, never flipped to its opposite', () => {
    // "will not rise" leaves both "falls" and "stays flat" open. Inferring "down"
    // would be the extractor authoring a claim the mind did not make.
    const c = claim('BTC will not rise in the next hour');
    expect(c.ok).toBe(false);
    expect(c.direction).toBeUndefined();
});

test('lowercase prose cannot be mistaken for a ticker', () => {
    // Without case-sensitive ticker matching, a mind watching SOL extracts a claim
    // out of any sentence containing the Spanish word for sun.
    expect(claim('the sol is up in an hour of quiet thought')).toMatchObject({ ok: false, reason: 'no-symbol' });
});

test('defaultHorizon is opt-in and marks the claim as assumed', () => {
    expect(claim('BTC will rise')).toMatchObject({ ok: false, reason: 'no-horizon' });
    const c = claim('BTC will rise', { defaultHorizonMs: 3600000 });
    expect(c).toMatchObject({ ok: true, horizonMs: 3600000, horizonAssumed: true });
});

// ---------------------------------------------------------------------------
// The -100 sentinel
// ---------------------------------------------------------------------------

test('-100 in a change field is missing data, not a collapse', () => {
    const map = indexMarketPrices(parseMarketPrices(priceDoc()));
    const paxg = map.get('PAXG');
    expect(paxg.change1h).toBeNull();
    expect(paxg.change24h).toBeNull();
    expect(paxg.price).toBe(2650);        // the price itself is real
    expect(map.get('BTC').change1h).toBe(0.4);
});

test('the sentinel does not settle a rise as a 100% collapse', () => {
    // A 1h horizon lands exactly on the change1h window, so "auto" would prefer the
    // change field. PAXG's is the sentinel, so auto falls back to basis-vs-price and
    // reads the real +2% rise. Taken literally the sentinel would say "wrong, it
    // fell 100%" — the single most damaging possible false report from this component.
    const entry = { symbol: 'PAXG', direction: 'up', horizonMs: 3600000, basisPrice: 2598.04,
                    settleAt: Date.now() - 1000, horizonText: 'in an hour' };
    const asset = indexMarketPrices(parseMarketPrices(priceDoc())).get('PAXG');
    const out = settleWatch(entry, asset, { now: Date.now() });
    expect(out.verdict).toBe('right');
    expect(out.settleBy).toBe('price');
    expect(out.movePct).toBeCloseTo(2.0, 1);
});

test('settleBy="change" refuses rather than falling back when the field is absent', () => {
    const entry = { symbol: 'PAXG', direction: 'up', horizonMs: 3600000, basisPrice: 2598.04,
                    settleAt: Date.now() - 1000, horizonText: 'in an hour' };
    const asset = indexMarketPrices(parseMarketPrices(priceDoc())).get('PAXG');
    const out = settleWatch(entry, asset, { now: Date.now(), settleBy: 'change' });
    expect(out).toMatchObject({ verdict: 'unsettleable', reason: 'change-field-absent' });
});

// ---------------------------------------------------------------------------
// Settlement verdicts
// ---------------------------------------------------------------------------

const watchOf = (over = {}) => ({
    predictionId: 'p1', actId: null, symbol: 'BTC', direction: 'up',
    horizonMs: 900000, horizonText: 'in 15m', basisPrice: 60000,
    settleAt: Date.now() - 1000, ...over,
});

test('right, wrong, and the band where the market said nothing', () => {
    const assets = indexMarketPrices(parseMarketPrices(priceDoc()));
    const btc = assets.get('BTC');   // price 63000

    expect(settleWatch(watchOf({ direction: 'up' }), btc).verdict).toBe('right');
    expect(settleWatch(watchOf({ direction: 'down' }), btc).verdict).toBe('wrong');
    expect(settleWatch(watchOf({ direction: 'flat' }), btc).verdict).toBe('wrong');

    // Inside the flat band: a 0.05% drift is not evidence either way.
    const flat = settleWatch(watchOf({ direction: 'up', basisPrice: 63000 * (1 - 0.0005) }), btc);
    expect(flat).toMatchObject({ verdict: 'unsettleable', reason: 'inside-flat-band' });
    expect(settleWatch(watchOf({ direction: 'flat', basisPrice: 63000 * (1 - 0.0005) }), btc).verdict)
        .toBe('right');
});

test('a 1h horizon settles off the feed window, not the basis price', () => {
    const btc = indexMarketPrices(parseMarketPrices(priceDoc())).get('BTC');
    const out = settleWatch(watchOf({ horizonMs: 3600000, direction: 'up', basisPrice: 1 }), btc);
    expect(out.settleBy).toBe('change1h');
    expect(out.movePct).toBe(0.4);      // the feed's own +0.40%, not a 6299900% "rise"
});

test('a missing symbol, a stale surface, and a missed horizon are all unsettleable', () => {
    const assets = indexMarketPrices(parseMarketPrices(priceDoc()));
    expect(settleWatch(watchOf({ symbol: 'DOGE' }), assets.get('DOGE') ?? null).reason)
        .toBe('symbol-not-on-surface');

    const stale = { symbol: 'BTC', price: 63000, updatedAt: Date.now() - 3600000 };
    expect(settleWatch(watchOf(), stale).reason).toBe('stale-settle-price');

    // Down for an hour past a 15-minute horizon: the predicted window cannot be
    // reconstructed from a surface that only offers windows ending now.
    const late = settleWatch(watchOf({ settleAt: Date.now() - 3600000 }), assets.get('BTC'));
    expect(late).toMatchObject({ verdict: 'unsettleable', reason: 'missed-horizon', late: true });
});

// ---------------------------------------------------------------------------
// The felt line
// ---------------------------------------------------------------------------

test('the felt line is first-person and world-facing, never about the mechanism', () => {
    const btc = indexMarketPrices(parseMarketPrices(priceDoc())).get('BTC');
    const wrong = feltLine(watchOf({ direction: 'down' }), settleWatch(watchOf({ direction: 'down' }), btc));
    const right = feltLine(watchOf(), settleWatch(watchOf(), btc));

    expect(wrong).toContain('I was wrong about BTC');
    expect(right).toContain('as I thought it would');
    for (const line of [wrong, right]) {
        expect(line).not.toMatch(/ledger|row|comparator|prediction id|settle|horizon elapsed|json|fetch/i);
    }
});

// ---------------------------------------------------------------------------
// Wired into a mind
// ---------------------------------------------------------------------------

let mind, outcome, attention;

beforeAll(async () => {
    stubFetch();
    resetStereoticCache();
    fs.rmSync(HOME, { recursive: true, force: true });
    document.body.innerHTML = `
      <m-mind name="market-outcome-test" stage="experimental">
        <m-stream name="stream"></m-stream>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-region name="outcome-channel" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
          <m-interrupts name="local" threshold="0" rateLimit="0s"></m-interrupts>
          <m-market-outcome name="outcome" watchTickers="BTC,ETH"
                            aliases="BTC=bitcoin" maxStale="30m"
                            url="https://stereotic.example/top100_stat.json"></m-market-outcome>
        </m-region>
      </m-mind>`;
    await loadMindComponents(document);
    await delay(60);
    mind = document.querySelector('m-mind');
    outcome = document.querySelector('m-market-outcome');
    attention = document.querySelector('m-interrupts[name="attention"]');
});

afterAll(async () => {
    document.body.replaceChildren();
    await delay(20);
    fs.rmSync(HOME, { recursive: true, force: true });
});

beforeEach(() => {
    resetStereoticCache();
    stubFetch();
    body = priceDoc();
});

/** Fire a prediction-shaped event the way m-act's firePrediction does. */
function predict(id, expectText, basisText = 'thinking about the market') {
    outcome._onPrediction({
        detail: {
            id, actId: null,
            representation: { kind: 'text', value: expectText },
            basis: { kind: 'realize', text: basisText },
        },
    });
}

const ledgerRows = () => fs.readFileSync(path.join(HOME, 'predictions', 'ledger.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

test('an unconfigured element is dormant: no listener, no file, no fetch', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.innerHTML = `<m-mind name="dormant-test"><m-market-outcome name="idle"></m-market-outcome></m-mind>`;
    await loadMindComponents(host);
    await delay(30);
    const idle = host.querySelector('m-market-outcome');
    // No stage="experimental" on that mind, and it did NOT throw: dormant wins over
    // the lab gate, so an unconfigured element is harmless anywhere.
    expect(idle._active).toBe(false);
    expect(idle._watch.size).toBe(0);
    host.remove();
    await delay(20);
});

test('a settleable claim is watched; an unsettleable one is recorded with its reason', async () => {
    predict('p-watch', 'BTC will rise over the next 15 minutes');
    predict('p-refuse', 'to stand on the hill and watch the wind, not be the anemometer');
    await delay(60);

    expect(outcome._watch.has('p-watch')).toBe(true);
    expect(outcome._watch.get('p-watch')).toMatchObject({
        symbol: 'BTC', direction: 'up', horizonMs: 900000, basisPrice: 63000,
    });
    expect(outcome._watch.has('p-refuse')).toBe(false);

    const rows = ledgerRows();
    expect(rows.find(r => r.predictionId === 'p-watch')).toMatchObject({
        kind: 'market-watch', symbol: 'BTC', direction: 'up',
    });
    expect(rows.find(r => r.predictionId === 'p-refuse')).toMatchObject({
        kind: 'market-unsettleable', stage: 'extract', reason: 'no-symbol',
    });
    // Every row carries `at` first, the m-expect-ledger convention.
    for (const row of rows) expect(typeof row.at).toBe('string');
});

test('nothing is due, so the settling tick does not touch the network', async () => {
    fetched = 0;
    await outcome.onSense();
    expect(fetched).toBe(0);
});

test('the horizon elapses and the prediction settles against the live price', async () => {
    outcome._watch.clear();
    predict('p-up', 'BTC will rise over the next 15 minutes');
    await delay(40);
    expect(outcome._watch.size).toBe(1);

    // Nothing due yet.
    await outcome.onSense();
    expect(outcome._watch.size).toBe(1);

    // The horizon passes, and BTC has risen.
    outcome._watch.get('p-up').settleAt = Date.now() - 1000;
    body = priceDoc({ BTC: { price: 64000 } });
    resetStereoticCache();
    await outcome.onSense();
    await delay(40);

    expect(outcome._watch.size).toBe(0);
    const settled = ledgerRows().filter(r => r.kind === 'market-settled' && r.predictionId === 'p-up');
    expect(settled.length).toBe(1);
    expect(settled[0]).toMatchObject({ verdict: 'right', symbol: 'BTC', settleBy: 'price' });
});

test('being wrong is felt, and felt louder than being right', async () => {
    const seen = [];
    const listen = event => seen.push(event.detail);
    mind.addEventListener('interrupt-request', listen);
    try {
        // Settled one tick apart, which is also the realistic case: two horizons
        // rarely elapse in the same 60-second tick.
        outcome._watch.clear();
        predict('p-wrong', 'ETH will rise over the next 15 minutes');
        await delay(60);
        outcome._watch.get('p-wrong').settleAt = Date.now() - 1000;
        body = priceDoc({ ETH: { price: 2400 } });     // it fell instead
        resetStereoticCache();
        seen.length = 0;
        await outcome.onSense();
        await delay(60);
        const wrong = seen.find(d => /I was wrong about ETH/.test(String(d?.reason ?? '')));

        predict('p-right', 'BTC will rise over the next 15 minutes');
        await delay(60);
        outcome._watch.get('p-right').settleAt = Date.now() - 1000;
        body = priceDoc({ BTC: { price: 64000 } });    // it did rise
        resetStereoticCache();
        seen.length = 0;
        await outcome.onSense();
        await delay(60);
        const right = seen.find(d => /BTC did rise/.test(String(d?.reason ?? '')));

        expect(wrong).toBeTruthy();
        expect(right).toBeTruthy();
        expect(wrong.salience).toBeGreaterThan(right.salience);
        expect(wrong.salience).toBeGreaterThan(0.8);   // above every ambient price move (<= 0.80)
        expect(right.salience).toBeLessThan(0.5);      // quieter than a typical ambient move
        expect(wrong.salience).toBeLessThanOrEqual(1);
        // The header that crosses before admission carries no ticker and no verdict.
        expect(String(wrong.changeKey ?? '')).not.toMatch(/ETH|wrong/);
    } finally {
        mind.removeEventListener('interrupt-request', listen);
    }
});

test('when a right and a wrong settle in the same tick, the wrong one is the one felt', async () => {
    // Measured: a region admits the FIRST candidate offered in a burst and drops
    // the rest. Without an explicit order, a Map's iteration order would decide
    // which settlement the mind experiences — and would throw away the wrong one
    // half the time. Both are still recorded; only one is offered.
    const seen = [];
    const listen = event => seen.push(event.detail);
    mind.addEventListener('interrupt-request', listen);
    try {
        outcome._watch.clear();
        predict('p-a-right', 'BTC will rise over the next 15 minutes');
        await delay(50);
        predict('p-b-wrong', 'ETH will rise over the next 15 minutes');
        await delay(50);
        expect([...outcome._watch.keys()]).toEqual(['p-a-right', 'p-b-wrong']);

        for (const entry of outcome._watch.values()) entry.settleAt = Date.now() - 1000;
        body = priceDoc({ BTC: { price: 64000 }, ETH: { price: 2400 } });
        resetStereoticCache();
        seen.length = 0;
        await outcome.onSense();
        await delay(60);

        expect(seen).toHaveLength(1);
        expect(seen[0].reason).toContain('I was wrong about ETH');
        const rows = ledgerRows().filter(r => r.kind === 'market-settled');
        expect(rows.find(r => r.predictionId === 'p-b-wrong')).toMatchObject({ verdict: 'wrong', felt: true });
        // Recorded, but honestly marked as never experienced.
        expect(rows.find(r => r.predictionId === 'p-a-right')).toMatchObject({ verdict: 'right', felt: false });
    } finally {
        mind.removeEventListener('interrupt-request', listen);
    }
});

test('an unsettleable outcome is recorded and never felt', async () => {
    const seen = [];
    const listen = event => seen.push(event.detail);
    mind.addEventListener('interrupt-request', listen);
    try {
        outcome._watch.clear();
        predict('p-quiet', 'BTC will rise over the next 15 minutes');
        await delay(40);
        const entry = outcome._watch.get('p-quiet');
        entry.settleAt = Date.now() - 1000;
        body = priceDoc({ BTC: { price: 63000 * 1.0005 } });   // inside the flat band
        resetStereoticCache();
        seen.length = 0;
        await outcome.onSense();
        await delay(40);

        const row = ledgerRows().find(r => r.kind === 'market-settled' && r.predictionId === 'p-quiet');
        expect(row).toMatchObject({ verdict: 'unsettleable', reason: 'inside-flat-band' });
        expect(seen.length).toBe(0);
    } finally {
        mind.removeEventListener('interrupt-request', listen);
    }
});

test('an open watch survives a restart', async () => {
    outcome._watch.clear();
    predict('p-restart', 'BTC will rise over the next 15 minutes');
    await delay(40);
    expect(JSON.parse(fs.readFileSync(path.join(HOME, 'predictions', 'market-outcome.json'), 'utf8')).watch)
        .toHaveLength(1);

    // A fresh element in a fresh mind with the same home — i.e. the process
    // restarted — picks the open prediction back up.
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.innerHTML = `
      <m-mind name="market-outcome-test" stage="experimental">
        <m-market-outcome name="reborn" watchTickers="BTC,ETH"
                          url="https://stereotic.example/top100_stat.json"></m-market-outcome>
      </m-mind>`;
    await loadMindComponents(host);
    await delay(60);
    const reborn = host.querySelector('m-market-outcome');
    expect(reborn._watch.has('p-restart')).toBe(true);
    expect(reborn._watch.get('p-restart').basisPrice).toBe(63000);
    host.remove();
    await delay(20);
});
