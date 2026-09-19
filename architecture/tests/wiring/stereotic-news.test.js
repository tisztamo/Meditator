// m-stereotic-news — parsing, the cold start, the ticker filter, the non-semantic
// header, the salience arithmetic, and tier-1 grounding.
//
// The live surface this sense reads is an ARCHIVE with a live head: 150 items
// spanning 48 hours, in no particular order, republished continuously. Most of
// what is asserted here is about not drowning in that archive — a waking mind
// should feel the present, not two days of history — and about what is allowed to
// exist before the aperture admits anything.
//
// No network: `globalThis.fetch` is stubbed and the shared stereotic fetch cache
// is reset between tests, so one test's bytes never become another's.
import './setup.js';
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { delay } from './setup.js';
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js';
import { ControlRequest, EDGE_EVIDENCE_EVENT } from '../../../src/infrastructure/perceptionContracts.js';
import { resetStereoticCache } from '../../lab/components/stereoticFeed.js';
import {
    parseStereoticNews, sortNewestFirst, changeKeyFor,
} from '../../lab/components/mStereoticNews.js';

const URL = 'https://stereotic.test/news/token-specific.json';
const T0 = 1789822231789;          // an epoch-MILLISECONDS first_seen_ts, as the live feed serves

const TOKEN_JSON = JSON.stringify([
    { url: 'https://x.example/a', title: 'Bitcoin ETF inflows hit $200M', headline: 'Inflows rose.',
      source_name: 'Zycrypto', tickers: ['BTC'], first_seen_ts: T0, source_ts: T0 - 400000,
      sentiment: 1.0, ai_score: 3, type: 'article' },
    { url: 'https://x.example/b', title: 'Stablecoin reserves climb', source_name: 'Y',
      tickers: ['USDT'], first_seen_ts: T0 - 60000, sentiment: 0.0, ai_score: 1 },
    { url: 'https://x.example/c', title: 'Ethereum upgrade nears', source_name: 'Z',
      tickers: ['ETH'], first_seen_ts: T0 - 120000, sentiment: -1.0, ai_score: null },
]);

const GENERAL_JSON = JSON.stringify([
    { news_url: 'https://y.example/1', title: 'A general market report', text: '...',
      source_name: 'AMBCrypto', date: 'Wed, 15 Dec 2021 10:00:38 -0500', topics: ['regulations'] },
]);

/** A 150-item, 48-hour archive in deliberately scrambled order — the live shape. */
function archive(count = 150) {
    const items = [];
    for (let i = 0; i < count; i++) {
        items.push({
            url: `https://archive.example/${i}`,
            title: `Archive report number ${i}`,
            source_name: 'Zycrypto',
            tickers: ['BTC'],
            // i = 0 is the newest; each step back is ~19 minutes, so 150 items ≈ 48h.
            first_seen_ts: T0 - i * 19 * 60 * 1000,
            sentiment: 0.0,
            ai_score: i % 4,
        });
    }
    // Scramble: the live file's index 0 was 12:50, index 1 was 12:05, index 2 13:02.
    const scrambled = [];
    for (let i = 0; i < items.length; i += 7) scrambled.push(items[i]);
    for (const item of items) if (!scrambled.includes(item)) scrambled.push(item);
    return scrambled;
}

let served = TOKEN_JSON;
let realFetch;

function serve(json) {
    served = typeof json === 'string' ? json : JSON.stringify(json);
    resetStereoticCache();
}

/** Mount one mind with the news sense configured as the test needs it. */
async function mount(attrs = {}, { aperture = 'open' } = {}) {
    const declared = Object.entries({ name: 'news', url: URL, ...attrs })
        .map(([k, v]) => `${k}="${v}"`).join(' ');
    document.body.innerHTML = `
      <m-mind name="stereotic-news-test">
        <m-stream name="stream"></m-stream>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-region name="market" modality="text" aperture="${aperture}" dwell="1ms" contactHorizon="10s">
          <m-interrupts name="local" threshold="0" rateLimit="0s" gain="1"></m-interrupts>
          <m-stereotic-news ${declared}></m-stereotic-news>
        </m-region>
      </m-mind>`;
    await loadMindComponents(document);
    await delay(40);
    const mind = document.querySelector('m-mind');
    const region = mind.querySelector('m-region');
    const news = mind.querySelector('m-stereotic-news');
    if (region.aperture) region.aperture.changedAt = Date.now() - 1000;

    const bids = [];
    mind.addEventListener('interrupt-request', e => bids.push(e.detail));

    // The pre-admission header, captured exactly as the aperture would see it.
    const headers = [];
    const realCandidate = news.candidate.bind(news);
    news.candidate = (header, materialize) => {
        headers.push(header);
        return realCandidate(header, materialize);
    };
    return { mind, region, news, bids, headers };
}

beforeEach(() => {
    realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => served });
    serve(TOKEN_JSON);
});

afterEach(async () => {
    globalThis.fetch = realFetch;
    resetStereoticCache();
    document.body.replaceChildren();
    await delay(20);
});

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

test('the parser reads both stereotic shapes and carries sentiment and source', () => {
    const token = parseStereoticNews(TOKEN_JSON);
    expect(token.length).toBe(3);
    expect(token[0]).toMatchObject({
        title: 'Bitcoin ETF inflows hit $200M',
        source: 'Zycrypto',
        tickers: ['BTC'],
        aiScore: 3,
        sentiment: 1,
        firstSeen: T0,
    });
    expect(token[2].sentiment).toBe(-1);
    expect(token[2].aiScore).toBeNull();

    const general = parseStereoticNews(GENERAL_JSON);
    expect(general.length).toBe(1);
    expect(general[0].tickers).toEqual(['REGULATIONS']);
    expect(general[0].key).toBe('https://y.example/1');
    expect(general[0].firstSeen).toBe(Date.parse('Wed, 15 Dec 2021 10:00:38 -0500'));
    expect(general[0].sentiment).toBeNull();
});

test('the parser tolerates junk quietly', () => {
    expect(parseStereoticNews('not json')).toEqual([]);
    expect(parseStereoticNews('{"a":1}')).toEqual([]);
    expect(parseStereoticNews('[{"title":""}]')).toEqual([]);
    expect(parseStereoticNews('[null,7,"x"]')).toEqual([]);
    expect(parseStereoticNews('')).toEqual([]);
});

test('an item with no url falls back to its title as the internal dedup key only', () => {
    const [item] = parseStereoticNews(JSON.stringify([{ headline: 'A quiet report', tickers: ['BTC'] }]));
    expect(item.key).toBe('A quiet report');
    expect(item.title).toBe('A quiet report');
});

// ---------------------------------------------------------------------------
// Ordering — the live file is not sorted
// ---------------------------------------------------------------------------

test('unsorted input is ordered newest first, and undated items sink', () => {
    const items = parseStereoticNews(JSON.stringify([
        { url: 'u/mid', title: 'mid', first_seen_ts: T0 - 60000 },
        { url: 'u/new', title: 'new', first_seen_ts: T0 },
        { url: 'u/none', title: 'none' },
        { url: 'u/old', title: 'old', first_seen_ts: T0 - 999999 },
    ]));
    expect(sortNewestFirst(items).map(i => i.title)).toEqual(['new', 'mid', 'old', 'none']);
});

// ---------------------------------------------------------------------------
// The cold start
// ---------------------------------------------------------------------------

test('a cold start swallows the 48-hour archive and offers only its newest item', async () => {
    serve(archive(150));
    const { news, bids } = await mount();
    await news.onSense();
    await delay(40);

    expect(bids.length).toBe(1);                       // not 150, and not a slow walk through 150
    expect(bids[0].reason).toContain('Archive report number 0');
    expect(bids[0].source).toBe('External');
    expect(bids[0].type).toBe('Sense-news');
    expect(bids[0].urgent).toBe(false);
    expect(news._seen.size).toBe(150);                 // the backlog is remembered as already past
});

test('after the cold start, exactly the genuinely new item is offered', async () => {
    const items = archive(150);
    serve(items);
    const { news, bids } = await mount();
    await news.onSense();
    await delay(40);
    expect(bids.length).toBe(1);

    // A second poll of the same bytes: nothing has arrived, so nothing is felt.
    serve(items);
    await news.onSense();
    await delay(40);
    expect(bids.length).toBe(1);

    // One genuinely new report, dropped into the middle of the scrambled array.
    const arrival = {
        url: 'https://archive.example/fresh',
        title: 'A fresh report arrives',
        source_name: 'Zycrypto',
        tickers: ['BTC'],
        first_seen_ts: T0 + 60000,
        ai_score: 1,
    };
    serve([...items.slice(0, 40), arrival, ...items.slice(40)]);
    await news.onSense();
    await delay(40);

    expect(bids.length).toBe(2);
    expect(bids[1].reason).toContain('A fresh report arrives');
});

// ---------------------------------------------------------------------------
// watchTickers on the ambient path
// ---------------------------------------------------------------------------

test('watchTickers filters the ambient path, not just a deliberate look', async () => {
    // BTC/ETH are watched; the USDT headline must never be felt, on any poll.
    const { news, bids } = await mount({ watchTickers: 'BTC,ETH' });
    await news.onSense();                              // cold start → newest watched item
    await delay(40);
    expect(bids.length).toBe(1);
    expect(bids[0].reason).toContain('Bitcoin ETF inflows');

    // Now a USDT-only feed: watched nothing, so the sense stays quiet.
    news._primed = false;
    news._seen.clear();
    serve([{ url: 'https://x.example/usdt', title: 'Tether mints another billion',
             tickers: ['USDT'], first_seen_ts: T0 + 1000, ai_score: 3 }]);
    await news.onSense();
    await delay(40);
    expect(bids.length).toBe(1);
    expect(bids.map(b => b.reason).join('\n')).not.toContain('Tether');
});

test('with no watchTickers declared, an untickered general item still arrives', async () => {
    serve(GENERAL_JSON);
    const { news, bids } = await mount();
    await news.onSense();
    await delay(40);
    expect(bids.length).toBe(1);
    expect(bids[0].reason).toContain('A general market report');
});

// ---------------------------------------------------------------------------
// The pre-admission header
// ---------------------------------------------------------------------------

test('the changeKey carries no headline text, with or without a url', async () => {
    const { news, headers } = await mount();
    await news.onSense();
    await delay(40);

    expect(headers.length).toBe(1);
    const key = headers[0].changeKey;
    expect(key).toBe('news:BTC:' + key.split(':')[2]);
    expect(key).not.toContain('Bitcoin');
    expect(key).not.toContain('ETF');
    expect(key).not.toContain('x.example');
    expect(typeof headers[0].changeMagnitude).toBe('number');
    expect(typeof headers[0].occurredAt).toBe('number');
    expect(Object.keys(headers[0]).sort()).toEqual(['changeKey', 'changeMagnitude', 'occurredAt']);

    // The url-less case is the one the old `key = url || title` leaked.
    const bare = parseStereoticNews(JSON.stringify([{ headline: 'A secret sounding headline' }]))[0];
    expect(changeKeyFor(bare)).not.toContain('secret');
    expect(changeKeyFor(bare)).not.toContain('headline');
    expect(changeKeyFor(bare).startsWith('news:-:')).toBe(true);

    // Stable across polls: the same item is the same change, not a new one.
    expect(changeKeyFor(bare)).toBe(changeKeyFor({ ...bare }));
});

// ---------------------------------------------------------------------------
// Salience — 0.40 base, +0.15 at ai_score >= 3, capped 0.62
// ---------------------------------------------------------------------------

test('salience is 0.40 plain, 0.55 when ai_score >= 3, and never above 0.62', async () => {
    const { news, headers } = await mount();
    expect(news._salienceOf({ aiScore: null })).toBeCloseTo(0.40, 6);
    expect(news._salienceOf({ aiScore: 0 })).toBeCloseTo(0.40, 6);
    expect(news._salienceOf({ aiScore: 2 })).toBeCloseTo(0.40, 6);
    expect(news._salienceOf({ aiScore: 3 })).toBeCloseTo(0.55, 6);
    // The old code bumped on 3..5 only; the live feed never serves 4 or 5, but if it
    // ever did the cap must still hold.
    expect(news._salienceOf({ aiScore: 5 })).toBeLessThanOrEqual(0.62);

    // And it is that exact number, unjittered, that reaches the header.
    await news.onSense();
    await delay(40);
    expect(headers[0].changeMagnitude).toBeCloseTo(0.55, 6);   // the ai_score 3 item is newest
});

// ---------------------------------------------------------------------------
// Tier 1 — scoring in private, behind a closed aperture
// ---------------------------------------------------------------------------

test('tier 1 emits a score and no headline text, with the aperture closed throughout', async () => {
    const { mind, region, news, bids, headers } = await mount(
        { tier: '1', decider: 'jev', groundBatch: '4' }, { aperture: 'closed' },
    );

    const calls = [];
    news._decide = async opts => {
        calls.push(opts);
        const noul = opts.state.candidate.includes('Ethereum') ? 0.93 : 0.08;
        return {
            answers: { targetMatch: { type: 'noul', noul } },
            usage: { prompt_tokens: 40, cost: 0.0000017 },
            latencyMs: 12,
            model: 'jev-1.13.0-test',
        };
    };

    const scores = [];
    mind.addEventListener(EDGE_EVIDENCE_EVENT, e => scores.push(e.detail));

    await news.onSense(new ControlRequest({
        kind: 'focus', issuedBy: 'search', reason: 'search',
        targetId: 'st-1', template: 'an Ethereum protocol upgrade',
    }));
    await delay(40);

    expect(region.aperture.state).toBe('closed');
    expect(scores.length).toBe(1);
    expect(scores[0].score).toBeCloseTo(0.93, 5);
    expect(scores[0].tier).toBe(1);
    expect(scores[0].sourceName).toBe('news');
    expect(scores[0].provenance.decider).toBe('jev');
    expect(scores[0].provenance.questions).toEqual(['targetMatch']);
    expect(scores[0].provenance.apertureState).toBe('closed');

    // The headlines went into the decision calls and nowhere else: no bid, no
    // candidate offered, and nothing readable in what crossed.
    expect(calls.map(c => c.state.candidate)).toContain('Ethereum upgrade nears');
    expect(calls[0].state.target).toBe('an Ethereum protocol upgrade');
    expect(bids.length).toBe(0);
    expect(headers.length).toBe(0);
    expect(JSON.stringify(scores)).not.toContain('Ethereum');
    expect(JSON.stringify(scores)).not.toContain('Bitcoin');
});

test('a grounded look primes the backlog too, so it cannot flood a later ambient poll', async () => {
    serve(archive(150));
    const { news } = await mount({ tier: '1', decider: 'jev' }, { aperture: 'closed' });
    news._decide = async () => ({
        answers: { targetMatch: { type: 'noul', noul: 0.2 } },
        usage: { prompt_tokens: 10 }, latencyMs: 1, model: 'jev-test',
    });
    await news.onSense(new ControlRequest({
        kind: 'focus', issuedBy: 'search', reason: 'search', template: 'anything at all',
    }));
    expect(news._primed).toBe(true);
    expect(news._seen.size).toBe(150);
});

test('a sample request with a detail biases toward a matching headline', async () => {
    const { news, bids } = await mount();
    await news.onSense(new ControlRequest({
        kind: 'sample', issuedBy: 'orient', reason: 'a deliberate look', detail: 'ethereum',
    }));
    await delay(40);
    expect(bids.length).toBe(1);
    expect(bids[0].reason).toContain('Ethereum upgrade nears');

    // And a sample answers again even though everything has drifted past before —
    // being asked to look is not the same as noticing something new.
    await news.onSense(new ControlRequest({
        kind: 'sample', issuedBy: 'orient', reason: 'a deliberate look',
    }));
    await delay(40);
    expect(bids.length).toBe(2);
    expect(bids[1].reason).toContain('Bitcoin ETF inflows');   // no detail → the newest
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

test('the sense is dormant without a url and uses the shared cache with pollCache', async () => {
    const { news } = await mount({ pollCache: '30s' });
    expect(news.attr('pollCache')).toBe('30s');

    document.body.innerHTML = `<m-mind name="dormant"><m-stream name="stream"></m-stream>
      <m-interrupts name="attention" threshold="0" rateLimit="0s"></m-interrupts>
      <m-region name="market" modality="text" aperture="open" dwell="1ms" contactHorizon="10s">
        <m-interrupts name="local" threshold="0" rateLimit="0s"></m-interrupts>
        <m-stereotic-news name="quiet"></m-stereotic-news>
      </m-region></m-mind>`;
    await loadMindComponents(document);
    await delay(40);
    expect(document.querySelector('m-stereotic-news')._timer).toBeNull();
});

test('one poll is fetched once and shared: a burst of samples does not re-fetch', async () => {
    let fetches = 0;
    globalThis.fetch = async () => { fetches++; return { ok: true, status: 200, text: async () => served }; };
    const { news } = await mount();
    await news.onSense();
    await news.onSense();
    await news.onSense();
    await delay(40);
    expect(fetches).toBe(1);
});
