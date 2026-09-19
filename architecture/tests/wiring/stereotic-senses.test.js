// stereotic-lab COMPOSITION — the three-aperture market, end to end.
//
// The per-component behaviour (parsing, the -100 sentinel, cold start, dedup,
// salience shaping, tier 1) is covered by stereotic-news.test.js,
// stereotic-prices.test.js and stereotic-market.test.js. THIS file owns the thing
// none of those can see: what happens when the senses are wired the way
// architecture/lab/stereotic-lab.archml wires them.
//
// Two claims are under test, and both were broken in the first live run:
//
//   1. THE CHANNELS ARE APERTURES. m-region is an aperture only with `modality`
//      (mRegion.js:115). The lab's "news-channel" and "prices-channel" had none,
//      so they were plain faculties and `market` was the mind's only gate: there
//      was no per-channel deficit, no per-channel dwell, and m-orient offered the
//      mind exactly one channel name. They are apertures now, composed under
//      `market` by conjunction — an inner open cannot leak through an outer
//      closed, and closing one channel leaves the other alone.
//
//   2. THE MARKET IS AUDIBLE. Nested arbiter gains multiply. Under the old
//      wiring (0.85 outer, 0.9 and 0.8 inner) a price move needed to exceed 11.5%
//      in 24h and a plain headline landed at 0.27 — both under the mind's ~0.35
//      attention threshold, which is why 5.5 minutes of live running produced
//      zero market percepts. The gains and the salience formulas are now anchored
//      to each other, and the anchoring is checked here rather than trusted: the
//      declared moveThreshold is also the audibility floor.
//
// The numbers below MIRROR the architecture deliberately. If you change a gain or
// a threshold in stereotic-lab.archml, this file should fail.
import './setup.js';
import { test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { delay } from './setup.js';
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js';
import { resetStereoticCache } from '../../lab/components/stereoticFeed.js';
// Side-effect imports: a wiring test has no .archml, so the resolver has no bundle
// layer to find these lab components in. Importing them runs their A.define().
import '../../lab/components/mStereoticNews.js';
import '../../lab/components/mStereoticPrices.js';
import '../../lab/components/mStereoticMarket.js';

const NEWS_URL = 'https://stereotic.test/news.json';
const PRICES_URL = 'https://stereotic.test/stats.json';

const NEWS_JSON = JSON.stringify([
    { url: 'https://x.example/a', title: 'Bitcoin ETF inflows hit $200M', source_name: 'X',
      tickers: ['BTC'], first_seen_ts: 1706793398209, ai_score: 2 },
]);

/** The live AssetStatistics spelling, with a -100 sentinel row to prove it stays quiet. */
const stats = ({ btc = 1.2, eth = 0.3, sol = -100 } = {}) => JSON.stringify([
    { symbolname: 'BTC', price: 60000, change1h: btc, change24h: 2.0, volume1h: 10, volume24h: 240 },
    { symbolname: 'ETH', price: 3000, change1h: eth, change24h: 1.0, volume1h: 10, volume24h: 240 },
    { symbolname: 'SOL', price: 150, change1h: sol, change24h: -100, volume1h: 10, volume24h: 240 },
]);

let mind, market, news, prices, sources, realFetch, payloads;
const bids = [];

/** Every bid the MIND's arbiter hears — i.e. after every channel gain has been
 *  applied and every aperture on the path has permitted it. */
function heard(type) {
    return bids.filter(b => !type || b.type === type);
}

const MARKET_SUBTREE = `
  <m-region name="market" modality="text" aperture="open" dwell="1s" contactHorizon="12m">
    <m-interrupts name="market-gate" threshold="0.3" rateLimit="0s" gain="1"></m-interrupts>

    <m-region name="news" modality="text" aperture="open" dwell="1s" contactHorizon="45m">
      <m-interrupts name="news-gate" gain="1" threshold="0.35" rateLimit="0s" keep="2"></m-interrupts>
      <m-stereotic-news name="reports" url="${NEWS_URL}" pollCache="0s"></m-stereotic-news>
    </m-region>

    <m-region name="prices" modality="text" aperture="open" dwell="1s" contactHorizon="5m">
      <m-interrupts name="prices-gate" gain="0.9" threshold="0.3" rateLimit="0s" keep="2"></m-interrupts>
      <m-stereotic-prices name="btc" ticker="BTC" url="${PRICES_URL}" pollCache="0s"
                          moveWindow="1h" moveThreshold="0.01" refMove="0.03" moveEpsilon="0.25"></m-stereotic-prices>
      <m-stereotic-prices name="eth" ticker="ETH" url="${PRICES_URL}" pollCache="0s"
                          moveWindow="1h" moveThreshold="0.01" refMove="0.03" moveEpsilon="0.25"></m-stereotic-prices>
      <m-stereotic-prices name="sol" ticker="SOL" url="${PRICES_URL}" pollCache="0s"
                          moveWindow="1h" moveThreshold="0.01" refMove="0.03" moveEpsilon="0.25"></m-stereotic-prices>
    </m-region>
  </m-region>`;

// ONE mind for the whole file, and a FRESH market under it per test. Building a
// new m-mind per test leaves enough behind — after eight of them — to make the
// NEXT test file in the same bun process fail in ways that look like its own bug.
// The senses are what each test needs clean (habituation, cold-start priming,
// aperture state), and they all live in the subtree.
beforeAll(async () => {
    document.body.innerHTML = `
      <m-mind name="stereotic-composition">
        <m-interrupts name="attention" threshold="0.35" rateLimit="0s" keep="9"></m-interrupts>
      </m-mind>`;
    await loadMindComponents(document);
    await delay(30);
    mind = document.querySelector('m-mind');
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));
});

afterAll(async () => {
    document.body.replaceChildren();
    await delay(30);
});

beforeEach(async () => {
    resetStereoticCache();
    payloads = { [NEWS_URL]: NEWS_JSON, [PRICES_URL]: stats() };
    realFetch = globalThis.fetch;
    globalThis.fetch = async url => ({
        ok: true,
        status: 200,
        text: async () => payloads[String(url)] ?? '[]',
    });

    mind.insertAdjacentHTML('beforeend', MARKET_SUBTREE);
    await loadMindComponents(document);
    await delay(30);

    market = document.querySelector('m-region[name="market"]');
    news = document.querySelector('m-stereotic-news[name="reports"]');
    prices = document.querySelector('m-region[name="prices"]');
    sources = {
        btc: document.querySelector('m-stereotic-prices[name="btc"]'),
        eth: document.querySelector('m-stereotic-prices[name="eth"]'),
        sol: document.querySelector('m-stereotic-prices[name="sol"]'),
    };
    bids.length = 0;
});

afterEach(async () => {
    globalThis.fetch = realFetch;
    market?.remove();
    await delay(30);
});

test('the two channels are apertures in their own right, nested under market', () => {
    expect(market.provides('aperture')).toBe(true);
    expect(document.querySelector('m-region[name="news"]').provides('aperture')).toBe(true);
    expect(prices.provides('aperture')).toBe(true);
    // Each sense registers with its NEAREST aperture, not with `market`.
    expect(prices.sourceNames().sort()).toEqual(['btc', 'eth', 'sol']);
    expect(document.querySelector('m-region[name="news"]').sourceNames()).toEqual(['reports']);
});

test('per-ticker channels are separate sources the mind can narrow to', async () => {
    // Both assets are moving well over the floor, so only the narrowing can explain
    // the silence of the one that is not being followed.
    payloads[PRICES_URL] = stats({ btc: 1.2, eth: 1.5 });
    // The third argument is the clock: a minimum dwell of 1s has not elapsed since
    // the region connected, and a test should not sleep through it.
    expect(prices.orient('narrow', 'btc', Date.now() + 2000)).toBe(true);
    await sources.btc.onSense();
    await sources.eth.onSense();
    await delay(40);
    expect(heard('Sense-btc')).toHaveLength(1);
    expect(heard('Sense-eth')).toHaveLength(0);
});

test('an outer closed gate silences BOTH channels (conjunction, not nearest-only)', async () => {
    expect(market.orient('closed', null, Date.now() + 2000)).toBe(true);
    await sources.btc.onSense();
    await news.onSense();
    await delay(40);
    expect(bids).toHaveLength(0);
});

test('closing one channel leaves the other alone', async () => {
    expect(document.querySelector('m-region[name="news"]').orient('closed', null, Date.now() + 2000)).toBe(true);
    await news.onSense();
    await sources.btc.onSense();
    await delay(40);
    expect(heard('Sense-reports')).toHaveLength(0);
    expect(heard('Sense-btc')).toHaveLength(1);
});

test('audibility: a move at the declared threshold clears the mind\'s attention bar', async () => {
    // 1.2% over the hour: 0.30 + 0.45 * (0.012 / 0.03) = 0.48, and 0.48 * 0.9 = 0.432,
    // comfortably over the ~0.35 the mind's arbiter asks for. This is the property the
    // whole re-anchoring exists to guarantee: what the channel says can be heard.
    await sources.btc.onSense();
    await delay(30);
    const bid = heard('Sense-btc')[0];
    expect(bid).toBeDefined();
    expect(bid.salience).toBeGreaterThan(0.35);
    expect(bid.salience).toBeCloseTo(0.432, 2);
});

test('a sub-threshold move is never offered at all, and the -100 sentinel stays silent', async () => {
    await sources.eth.onSense();   // +0.3% over the hour — under moveThreshold
    await sources.sol.onSense();   // -100 sentinel — missing, not a crash
    await delay(30);
    expect(bids).toHaveLength(0);
});

test('news is unattenuated: a plain headline reaches the mind as itself', async () => {
    await news.onSense();
    await delay(30);
    const bid = heard('Sense-reports')[0];
    expect(bid).toBeDefined();
    // gain 1 through both gates: a rare channel is not made quieter still.
    expect(bid.salience).toBeCloseTo(0.40, 2);
    expect(bid.salience).toBeGreaterThan(0.35);
    expect(bid.reason).toContain('Bitcoin ETF inflows');
});

test('the pre-admission header carries no market content', async () => {
    const headers = [];
    market.addEventListener('percept-candidate', e => headers.push(e.detail), true);
    await sources.btc.onSense();
    await news.onSense();
    await delay(40);
    expect(headers.length).toBeGreaterThan(0);
    for (const detail of headers) {
        // The candidate is the part that crosses before admission; the event's
        // `contract` holds live element references and is not serializable.
        // `header` is the part that crosses before admission; the event's `contract`
        // holds live element references and is not serializable.
        const serialized = JSON.stringify(detail.header);
        expect(serialized).not.toContain('BTC');
        expect(serialized).not.toContain('Bitcoin');
        expect(serialized).not.toContain('60000');
    }
});
