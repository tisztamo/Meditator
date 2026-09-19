// m-stereotic-prices — the per-ticker price channel, and the fetch cache it
// shares with every other stereotic sense.
//
// No network: `globalThis.fetch` is stubbed for every test that touches the
// wire, exactly as the older stereotic wiring test does, and the module-level
// cache is cleared between tests so one test's bytes cannot answer another's
// poll.
import './setup.js';
import { test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { delay } from './setup.js';
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js';
import {
    parseStereoticPrices, fieldForWindow,
} from '../../lab/components/mStereoticPrices.js';
import { resetStereoticCache } from '../../lab/components/stereoticFeed.js';

// The live surface (https://stereotic.com/data/stats/top100_stat.json), in its
// AssetStatistics spelling. ZEC is the row measured live. PAXG carries the
// -100 missing-data sentinel in every change field, which is exactly how it
// appears in the wild between ticks.
const LIVE_JSON = JSON.stringify([
    { id: 67, name: 'Zcash', symbolname: 'ZEC', rank: 9, price: 1530.5776,
      change1h: -0.997, change4h: -1.50, change24h: 4.097, change7d: 33.05,
      change30d: 166.97, change90d: 250.28, change1y: 2892.4, change3y: 5158.2,
      volume1h: 14648.2, volume24h: 262847.4, ath: 3191.93, drawdown: -52.05,
      updated: 1789823227.0 },
    { id: 1, name: 'Bitcoin', symbolname: 'BTC', rank: 1, price: 64210.5,
      change1h: 0.02, change24h: -3.0, volume24h: 12345.6, updated: 1789823227.0 },
    { id: 2, name: 'PAX Gold', symbolname: 'PAXG', rank: 40, price: 2650.0,
      change1h: -100.0, change24h: -100.0, change7d: -100.0, updated: 1789823227.0 },
    { id: 3, name: 'Solana', symbolname: 'SOL', rank: 5, price: 20.0,
      change24h: 0.001, updated: 1789823227.0 },
]);

// The older coingecko-markets spelling must keep parsing.
const GECKO_JSON = JSON.stringify([
    { symbol: 'BTC', current_price: 17484.12, market_cap_rank: 1,
      price_change_percentage_24h: -10.45315,
      price_change_percentage_7d_in_currency: 3.2,
      price_change_percentage_1h_in_currency: 0.4, total_volume: 999 },
    { symbol: 'ETH', current_price: 1203.98, price_change_percentage_24h: 2.1 },
]);

const URL_LIVE = 'https://stereotic.test/stats/top100_stat.json';

let global, btc, paxg, sol, second;

/** Stub the wire and count how often it is actually reached. */
function stubFetch(body = LIVE_JSON) {
    const calls = { n: 0, urls: [] };
    const real = globalThis.fetch;
    globalThis.fetch = async url => {
        calls.n += 1;
        calls.urls.push(String(url));
        return { ok: true, status: 200, text: async () => body };
    };
    calls.restore = () => { globalThis.fetch = real; };
    return calls;
}

beforeAll(async () => {
    document.body.innerHTML = `
      <m-mind name="stereotic-prices-test">
        <m-stream name="stream"></m-stream>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-region name="market" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
          <m-interrupts name="local" threshold="0" rateLimit="0s"></m-interrupts>
          <m-region name="btc-channel">
            <m-interrupts name="btc-local" threshold="0" rateLimit="0s"></m-interrupts>
            <m-stereotic-prices name="btc" ticker="BTC"></m-stereotic-prices>
          </m-region>
          <m-region name="paxg-channel">
            <m-interrupts name="paxg-local" threshold="0" rateLimit="0s"></m-interrupts>
            <m-stereotic-prices name="paxg" ticker="PAXG"></m-stereotic-prices>
          </m-region>
          <m-region name="sol-channel">
            <m-interrupts name="sol-local" threshold="0" rateLimit="0s"></m-interrupts>
            <m-stereotic-prices name="sol" ticker="SOL"></m-stereotic-prices>
          </m-region>
          <m-region name="second-channel">
            <m-interrupts name="second-local" threshold="0" rateLimit="0s"></m-interrupts>
            <m-stereotic-prices name="second" ticker="ZEC"></m-stereotic-prices>
          </m-region>
        </m-region>
      </m-mind>`;
    await loadMindComponents(document);
    await delay(50);
    global = document.querySelector('m-mind');
    btc = document.querySelector('m-stereotic-prices[name="btc"]');
    paxg = document.querySelector('m-stereotic-prices[name="paxg"]');
    sol = document.querySelector('m-stereotic-prices[name="sol"]');
    second = document.querySelector('m-stereotic-prices[name="second"]');
});

afterAll(async () => {
    document.body.replaceChildren();
    await delay(20);
});

beforeEach(() => {
    resetStereoticCache();
});

/** Wake one sense against the stubbed surface and collect its bids. */
async function poll(el, { url = URL_LIVE, body = LIVE_JSON, rounds = 1 } = {}) {
    el.setAttribute('url', url);
    el.ready();
    const bids = [];
    const listener = e => bids.push(e.detail);
    global.addEventListener('interrupt-request', listener);
    const calls = stubFetch(body);
    try {
        for (let i = 0; i < rounds; i++) await el.onSense();
    } finally {
        calls.restore();
        await delay(200);
        global.removeEventListener('interrupt-request', listener);
    }
    return { bids: bids.filter(b => b.type === `Sense-${el.attr('name')}`), calls };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

test('the live AssetStatistics shape parses', () => {
    const assets = parseStereoticPrices(LIVE_JSON);
    expect(assets.length).toBe(4);
    const zec = assets[0];
    expect(zec).toMatchObject({
        symbol: 'ZEC',
        name: 'Zcash',
        rank: 9,
        price: 1530.5776,
        change1h: -0.997,
        change4h: -1.50,
        change24h: 4.097,
        change7d: 33.05,
        change30d: 166.97,
        change90d: 250.28,
        change1y: 2892.4,
        change3y: 5158.2,
        volume1h: 14648.2,
        volume24h: 262847.4,
    });
    // `updated` is epoch SECONDS on the wire; the ms form is derived, not assumed.
    expect(zec.updated).toBe(1789823227);
    expect(zec.updatedAt).toBe(1789823227000);
});

test('the coingecko shape still parses', () => {
    const assets = parseStereoticPrices(GECKO_JSON);
    expect(assets.length).toBe(2);
    expect(assets[0]).toMatchObject({
        symbol: 'BTC',
        price: 17484.12,
        rank: 1,
        change24h: -10.45315,
        change7d: 3.2,
        change1h: 0.4,
        volume24h: 999,
    });
    expect(assets[1].change24h).toBe(2.1);
    // Absent is unknown, not flat.
    expect(assets[1].change7d).toBeNull();
});

test('-100 is the missing-data sentinel, not a -100% move', () => {
    const paxgRow = parseStereoticPrices(LIVE_JSON).find(a => a.symbol === 'PAXG');
    expect(paxgRow.change1h).toBeNull();
    expect(paxgRow.change24h).toBeNull();
    expect(paxgRow.change7d).toBeNull();
    // The price itself is real and survives the screen.
    expect(paxgRow.price).toBe(2650.0);
});

test('bad input parses quietly', () => {
    expect(parseStereoticPrices('not json')).toEqual([]);
    expect(parseStereoticPrices('{"a":1}')).toEqual([]);
    expect(parseStereoticPrices('[{"price":1}]')).toEqual([]);
});

test('fieldForWindow maps windows and rejects unknown', () => {
    expect(fieldForWindow('1h')).toBe('change1h');
    expect(fieldForWindow('4h')).toBe('change4h');
    expect(fieldForWindow('24h')).toBe('change24h');
    expect(fieldForWindow('3y')).toBe('change3y');
    expect(fieldForWindow('1y')).toBe('change1y');
    expect(() => fieldForWindow('2d')).toThrow();
    expect(() => fieldForWindow('')).toThrow();
});

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

test('a move above threshold bids once, as this ticker only', async () => {
    const { bids } = await poll(btc);
    expect(bids.length).toBe(1);
    const bid = bids[0];
    expect(bid.source).toBe('External');
    expect(bid.urgent).toBe(false);
    expect(bid.reason).toContain('BTC');
    expect(bid.reason).toContain('-3.00%');
    // The world, never the mechanism.
    expect(bid.reason).not.toMatch(/fetch|poll|JSON|endpoint/i);
});

test('the -100 sentinel never produces a bid', async () => {
    const { bids } = await poll(paxg, { rounds: 3 });
    expect(bids.length).toBe(0);
});

test('a sub-threshold move is silent', async () => {
    const { bids } = await poll(sol, { rounds: 2 });
    expect(bids.length).toBe(0);
});

test('three identical polls bid exactly once', async () => {
    const fresh = document.createElement('m-stereotic-prices');
    fresh.setAttribute('name', 'dedup');
    fresh.setAttribute('ticker', 'BTC');
    document.querySelector('m-region[name="btc-channel"]').appendChild(fresh);
    await delay(30);
    const { bids } = await poll(fresh, { rounds: 3 });
    expect(bids.length).toBe(1);
    fresh.remove();
    await delay(10);
});

test('drift below moveEpsilon is silent; crossing it speaks again', async () => {
    const el = document.createElement('m-stereotic-prices');
    el.setAttribute('name', 'drift');
    el.setAttribute('ticker', 'BTC');
    el.setAttribute('moveWindow', '1h');
    el.setAttribute('moveThreshold', '0.01');
    document.querySelector('m-region[name="btc-channel"]').appendChild(el);
    await delay(30);

    // 1h figures on successive ~100s ticks: -3.00, -3.05, -3.10 (drift well
    // under the 0.25pp default epsilon), then -3.40 (0.40pp away: a real move).
    const tick = change1h => JSON.stringify([
        { name: 'Bitcoin', symbolname: 'BTC', price: 64210.5, change1h, updated: 1789823227.0 },
    ]);
    const bids = [];
    const listener = e => { if (e.detail.type === 'Sense-drift') bids.push(e.detail); };
    global.addEventListener('interrupt-request', listener);
    el.setAttribute('url', URL_LIVE);
    el.ready();
    const real = globalThis.fetch;
    let body = tick(-3.00);
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => body });
    try {
        for (const v of [-3.00, -3.05, -3.10]) {
            body = tick(v);
            resetStereoticCache();
            await el.onSense();
        }
        await delay(50);
        expect(bids.length).toBe(1);            // one move spoken, drift swallowed
        expect(bids[0].reason).toContain('-3.00%');

        body = tick(-3.40);
        resetStereoticCache();
        await el.onSense();
        await delay(50);
        expect(bids.length).toBe(2);            // crossing the epsilon is a new move
        expect(bids[1].reason).toContain('-3.40%');
    } finally {
        globalThis.fetch = real;
        global.removeEventListener('interrupt-request', listener);
        el.remove();
        await delay(10);
    }
});

test('salience follows clamp(0.30 + 0.45*min(1, move/refMove), 0.30, 0.80)', () => {
    btc.setAttribute('url', URL_LIVE);
    btc.ready();                               // refMove default 0.06
    expect(btc._salience(0.0)).toBeCloseTo(0.30, 6);
    expect(btc._salience(0.015)).toBeCloseTo(0.4125, 6);   // the audibility floor
    expect(btc._salience(0.03)).toBeCloseTo(0.525, 6);
    expect(btc._salience(0.06)).toBeCloseTo(0.75, 6);
    expect(btc._salience(0.5)).toBeCloseTo(0.75, 6);       // saturated, not captured
    btc.setAttribute('refMove', '0.12');
    btc.ready();
    expect(btc._salience(0.06)).toBeCloseTo(0.525, 6);
    btc.removeAttribute('refMove');
    btc.ready();
});

test('the declared threshold is audible: 1.5% clears a 0.9 gain against 0.35', () => {
    btc.setAttribute('url', URL_LIVE);
    btc.ready();
    expect(btc._salience(btc._threshold) * 0.9).toBeGreaterThan(0.35);
});

test('the architecture profile (1h / 0.01 / 0.03 under a 0.9 gain) stays audible', () => {
    const el = document.createElement('m-stereotic-prices');
    el.setAttribute('url', URL_LIVE);
    el.setAttribute('moveWindow', '1h');
    el.setAttribute('moveThreshold', '0.01');
    el.setAttribute('refMove', '0.03');
    el.ready();
    expect(el._salience(0.01) * 0.9).toBeGreaterThan(0.35);   // 0.45 * 0.9 = 0.405
    expect(el._salience(0.03)).toBeCloseTo(0.75, 6);
});

// ---------------------------------------------------------------------------
// The shared cache
// ---------------------------------------------------------------------------

test('two senses polling the same tick share ONE fetch', async () => {
    btc.setAttribute('url', URL_LIVE);
    second.setAttribute('url', URL_LIVE);
    btc.ready();
    second.ready();
    const calls = stubFetch(LIVE_JSON);
    try {
        // Concurrently: the in-flight request must be shared, not raced.
        await Promise.all([btc.onSense(), second.onSense()]);
        expect(calls.n).toBe(1);
        // And again inside the same TTL window: still nothing new on the wire.
        await second.onSense();
        expect(calls.n).toBe(1);
    } finally {
        calls.restore();
        await delay(30);
    }
});

test('a failed fetch is not cached and never crashes the sense', async () => {
    btc.setAttribute('url', URL_LIVE);
    btc.ready();
    const real = globalThis.fetch;
    let attempts = 0;
    globalThis.fetch = async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('offline');
        return { ok: true, status: 200, text: async () => LIVE_JSON };
    };
    try {
        await expect(btc.onSense()).rejects.toThrow('offline');
        await btc.onSense();                   // the failure left no cache entry
        expect(attempts).toBe(2);
    } finally {
        globalThis.fetch = real;
        await delay(20);
    }
});

test('the multi-asset fallback still works', async () => {
    const multi = document.createElement('m-stereotic-prices');
    multi.setAttribute('name', 'multi');
    multi.setAttribute('watchTickers', 'BTC, ZEC, SOL');
    document.querySelector('m-region[name="btc-channel"]').appendChild(multi);
    await delay(30);
    const { bids } = await poll(multi);
    // BTC -3% and ZEC +4.097% bid; SOL 0.001% is below the floor.
    expect(bids.length).toBe(2);
    const reasons = bids.map(b => b.reason).join('\n');
    expect(reasons).toContain('BTC');
    expect(reasons).toContain('ZEC');
    expect(reasons).not.toContain('SOL');
    multi.remove();
    await delay(10);
});

test('a dormant sense warns and does not schedule', () => {
    const dormant = document.createElement('m-stereotic-prices');
    expect(dormant.ready?.()).toBe(false);
});
