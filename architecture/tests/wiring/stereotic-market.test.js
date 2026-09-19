// m-stereotic-market — the cross-sectional arithmetic, and the one-percept-per-poll
// membrane wiring. No network: `globalThis.fetch` is stubbed the way
// stereotic-senses.test.js stubs it, and the shared feed cache is reset between
// tests so one test's bytes cannot become another's market.
//
// The thing most worth protecting here is the -100 sentinel rule. -100.0 in a change
// field is stereotic's missing-data marker, and assets flip in and out of it between
// ticks. If it were ever read as a move, every median, every breadth count and every
// z-score in this file would be poisoned, and the mind would feel a fake crash on a
// hundred-second clock.
import './setup.js';
import { test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { delay } from './setup.js';
import { loadMindComponents } from '../../../src/startup/loadMindComponents.js';
import {
    parseStats, marketWeather, selectOffer, WEATHER_DEFAULTS, DEFAULT_COOLDOWN_MS,
    SALIENCE_MIN, SALIENCE_MAX,
} from '../../lab/components/mStereoticMarket.js';
import { resetStereoticCache } from '../../lab/components/stereoticFeed.js';

// --- fixture helpers -------------------------------------------------------

/** One row in the live AssetStatistics spelling. */
const row = (symbol, over = {}) => ({
    id: 1, name: symbol, symbolname: symbol, rank: 1, price: 100,
    change1h: 0, change4h: 0, change24h: 0, change7d: 0, change30d: 0, change90d: 0,
    volume1h: 1000, volume4h: 4000, volume24h: 24000, volume7d: 168000,
    ath: 200, drawdown: -50, updated: 1789823227.0,
    ...over,
});

/** A quiet field of `n` assets, `green` of them barely up on the day. */
function flatField(n = 20, green = 10) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const up = i < green;
        out.push(row(`A${i}`, {
            change1h: up ? 0.05 : -0.05,
            change24h: up ? 0.2 : -0.2,
        }));
    }
    return out;
}

/** A field with exactly `green`/`n` assets up on the day, moving with the pack. */
function fieldWithBreadth(n, green) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const up = i < green;
        out.push(row(`B${i}`, {
            change1h: up ? 0.1 : -0.1,
            change24h: up ? 3.5 + (i % 5) * 0.2 : -3.5 - (i % 5) * 0.2,
        }));
    }
    return out;
}

const parsed = raws => parseStats(JSON.stringify(raws));
const kinds = signals => signals.map(s => s.kind);
const ofKind = (signals, kind) => signals.filter(s => s.kind === kind);

let market, global;

beforeAll(async () => {
    document.body.innerHTML = `
      <m-mind name="stereotic-market-test">
        <m-stream name="stream"></m-stream>
        <m-interrupts name="attention" threshold="0" rateLimit="0s" keep="9"></m-interrupts>
        <m-region name="market" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
          <m-interrupts name="local" threshold="0" rateLimit="0s"></m-interrupts>
          <m-stereotic-market name="weather"></m-stereotic-market>
        </m-region>
      </m-mind>`;
    await loadMindComponents(document);
    await delay(50);
    market = document.querySelector('m-stereotic-market');
    global = document.querySelector('m-mind');
});

afterAll(async () => {
    document.body.replaceChildren();
    await delay(20);
});

beforeEach(() => resetStereoticCache());

// --- the sentinel ----------------------------------------------------------

test('the -100 sentinel parses as absent, never as a move', () => {
    const assets = parsed([
        row('PAXG', { change1h: -100.0, change24h: -100.0, change7d: -100 }),
        row('ZEC', { change1h: -0.997, change24h: 4.097 }),
    ]);
    expect(assets[0].change1h).toBeNull();
    expect(assets[0].change24h).toBeNull();
    expect(assets[0].change7d).toBeNull();
    expect(assets[1].change1h).toBeCloseTo(-0.997, 5);
    // Absent is NOT zero: "flat" and "unknown" must stay distinguishable.
    expect(assets[0].change24h).not.toBe(0);
});

test('sentinel rows are excluded from every statistic and never produce a percept', () => {
    // 20 assets up ~+4% on the day, plus four sentinel rows. If the sentinels were
    // read as moves they would be the four largest outliers in the field AND would
    // drag breadth from 100% green to 83%.
    const assets = parsed([
        ...fieldWithBreadth(20, 20),
        row('PAXG', { change1h: -100, change24h: -100 }),
        row('RLUSD', { change1h: -100, change24h: -100 }),
        row('WBETH', { change1h: -100, change24h: -100 }),
        row('SHIB', { change1h: -100, change24h: -100 }),
    ]);
    const weather = marketWeather(assets, { prevBreadth: 'down' });
    expect(weather.breadth).toBe(1);                 // 20 of 20 known rows, not 20 of 24
    const text = JSON.stringify(weather.signals);
    for (const sentinel of ['PAXG', 'RLUSD', 'WBETH', 'SHIB']) {
        expect(text).not.toContain(sentinel);
    }
    // Only the honest breadth flip is felt.
    expect(kinds(weather.signals)).toEqual(['breadth']);
});

// --- 1. breadth ------------------------------------------------------------

test('the first reading records breadth without firing — no startup flare', () => {
    const weather = marketWeather(parsed(fieldWithBreadth(20, 18)), { prevBreadth: null });
    expect(weather.breadthState).toBe('up');
    expect(ofKind(weather.signals, 'breadth').length).toBe(0);
});

test('a breadth flip fires once and does not chatter across the band', () => {
    // Default band is 0.06 wide: a flip up needs >= 0.53 green, a flip down <= 0.47.
    // The field is 40 assets so one asset is 0.025 of it — fine enough to walk the
    // boundary without stepping over it.
    let state = null;
    const fire = green => {
        const w = marketWeather(parsed(fieldWithBreadth(40, green)), { prevBreadth: state });
        state = w.breadthState;
        return ofKind(w.signals, 'breadth');
    };
    expect(fire(30).length).toBe(0);               // 0.75 — first sighting, silent
    expect(state).toBe('up');
    expect(fire(21).length).toBe(0);               // 0.525 — inside the band
    expect(fire(19).length).toBe(0);               // 0.475 — still inside the band
    expect(fire(20).length).toBe(0);               // 0.50  — dead centre, still nothing
    expect(state).toBe('up');                      // the band holds the old state

    const down = fire(18);                         // 0.45 — below 0.47: a real flip
    expect(down.length).toBe(1);
    expect(state).toBe('down');
    expect(down[0].changeKey).toBe('market:breadth:down');
    expect(down[0].line).toContain('drained');

    expect(fire(18).length).toBe(0);               // same state again: silent
    expect(fire(20).length).toBe(0);               // back inside the band: still silent
    const up = fire(30);                           // 0.75 — flips back, once
    expect(up.length).toBe(1);
    expect(up[0].changeKey).toBe('market:breadth:up');
    expect(up[0].salience).toBe(0.75);
});

// --- 2. standing out -------------------------------------------------------

test('a genuine outlier stands out; an asset moving with the pack does not', () => {
    const pack = fieldWithBreadth(20, 20);         // everything near +3.5..+4.3%
    const withOutlier = parsed([...pack, row('ENA', { change24h: 22.7, change1h: 0.1 })]);
    const out = ofKind(marketWeather(withOutlier, { prevBreadth: 'up' }).signals, 'standout');
    expect(out.length).toBe(1);
    expect(out[0].changeKey).toBe('market:standout:ENA');
    expect(out[0].detail.symbol).toBe('ENA');
    expect(out[0].line).toContain('ENA');
    expect(out[0].line).toContain('on its own');

    // +5.0% when the median is ~3.9% is weather, not news: inside standoutMinMove.
    const withPackMember = parsed([...pack, row('ENA', { change24h: 5.0, change1h: 0.1 })]);
    expect(ofKind(marketWeather(withPackMember, { prevBreadth: 'up' }).signals, 'standout').length).toBe(0);
});

test('a lone faller stands out downward', () => {
    const assets = parsed([...fieldWithBreadth(20, 20), row('XYZ', { change24h: -14.0, change1h: -0.1 })]);
    const out = ofKind(marketWeather(assets, { prevBreadth: 'up' }).signals, 'standout');
    expect(out.length).toBe(1);
    expect(out[0].line).toContain('falling out from under');
});

test('a dead-flat field cannot manufacture an outlier out of noise', () => {
    // Every asset within a tenth of a point of zero. Without the scale floor the MAD
    // would be ~0.05 and a 0.2pp move would read as four sigma.
    const assets = parsed(flatField(20, 10));
    expect(ofKind(marketWeather(assets, { prevBreadth: 'up' }).signals, 'standout').length).toBe(0);
});

// --- 3. horizon disagreement ----------------------------------------------

test('an asset whose hour opposes its day is felt as a turn', () => {
    const assets = parsed([
        ...fieldWithBreadth(20, 20),
        row('TURN', { change24h: 9.0, change1h: -1.4 }),
    ]);
    const turns = ofKind(marketWeather(assets, { prevBreadth: 'up' }).signals, 'turn');
    expect(turns.length).toBe(1);
    expect(turns[0].changeKey).toBe('market:turn:TURN');
    expect(turns[0].line).toContain('the hour is the newer news');

    // The same opposition below the floors is tick noise, not a turn.
    const noise = parsed([
        ...fieldWithBreadth(20, 20),
        row('TURN', { change24h: 9.0, change1h: -0.2 }),
    ]);
    expect(ofKind(marketWeather(noise, { prevBreadth: 'up' }).signals, 'turn').length).toBe(0);
});

test('the field itself can turn: the median hour against the median day', () => {
    const assets = parsed(fieldWithBreadth(20, 20).map(a => ({ ...a, change1h: -0.6 })));
    const turns = ofKind(marketWeather(assets, { prevBreadth: 'up' }).signals, 'turn');
    const fieldTurn = turns.find(t => t.changeKey.startsWith('market:turn:field'));
    expect(fieldTurn).toBeTruthy();
    expect(fieldTurn.changeKey).toBe('market:turn:field:down');
    expect(fieldTurn.line).toContain('coming apart');
});

test('a zero leg is a standstill, not a disagreement', () => {
    const assets = parsed([...fieldWithBreadth(20, 20), row('ZERO', { change24h: 9.0, change1h: 0 })]);
    const turns = ofKind(marketWeather(assets, { prevBreadth: 'up' }).signals, 'turn');
    expect(turns.filter(t => t.changeKey === 'market:turn:ZERO').length).toBe(0);
});

// --- 4. volume / price divergence -----------------------------------------

test('volume elevated against its own 24h rate, with the price flat, is pressure', () => {
    const assets = parsed([
        ...fieldWithBreadth(20, 20),
        // 24h rate is 24000/24 = 1000/h; this hour is 3400 -> 3.4x, price flat.
        row('PRESS', { change24h: 0.0, change1h: 0.05, volume1h: 3400, volume24h: 24000 }),
    ]);
    const press = ofKind(marketWeather(assets, { prevBreadth: 'up' }).signals, 'pressure');
    expect(press.length).toBe(1);
    expect(press[0].changeKey).toBe('market:pressure:PRESS');
    expect(press[0].detail.ratio).toBeCloseTo(3.4, 5);
    expect(press[0].line).toContain('nothing has given way');
});

test('heavy volume WITH a price move is not pressure — it is just a move', () => {
    const assets = parsed([
        ...fieldWithBreadth(20, 20),
        row('MOVED', { change24h: 8.0, change1h: 2.5, volume1h: 3400, volume24h: 24000 }),
    ]);
    expect(ofKind(marketWeather(assets, { prevBreadth: 'up' }).signals, 'pressure').length).toBe(0);
});

test('ordinary volume is not pressure', () => {
    const assets = parsed(flatField(20, 10));      // every row at exactly 1x its rate
    expect(ofKind(marketWeather(assets, { prevBreadth: 'up' }).signals, 'pressure').length).toBe(0);
});

// --- quiet, ranking, and the contract -------------------------------------

test('a flat, boring market produces nothing at all', () => {
    const weather = marketWeather(parsed(flatField(20, 10)), { prevBreadth: 'up' });
    expect(weather.signals).toEqual([]);
});

test('too few rows for a statistic to mean anything means silence', () => {
    const weather = marketWeather(parsed(fieldWithBreadth(6, 6)), { prevBreadth: 'down' });
    expect(weather.signals).toEqual([]);
    expect(weather.breadth).toBeNull();
});

test('signals are ranked strongest first and stay inside the salience band', () => {
    const assets = parsed([
        ...fieldWithBreadth(20, 20).map(a => ({ ...a, change1h: -0.6 })),
        row('ENA', { change24h: 22.7, change1h: -1.4 }),
        row('PRESS', { change24h: 0.0, change1h: 0.05, volume1h: 3400, volume24h: 24000 }),
    ]);
    const { signals } = marketWeather(assets, { prevBreadth: 'down' });
    expect(new Set(kinds(signals))).toEqual(new Set(['breadth', 'standout', 'turn', 'pressure']));
    for (let i = 1; i < signals.length; i++) {
        expect(signals[i - 1].salience).toBeGreaterThanOrEqual(signals[i].salience);
    }
    for (const s of signals) {
        expect(s.salience).toBeGreaterThanOrEqual(SALIENCE_MIN);
        expect(s.salience).toBeLessThanOrEqual(SALIENCE_MAX);
        expect(s.salience).toBeLessThan(0.8);       // nothing ambient may capture the mind
    }
    expect(signals[0].kind).toBe('breadth');
});

test('changeKeys carry no semantic content', () => {
    const assets = parsed([
        ...fieldWithBreadth(20, 20).map(a => ({ ...a, change1h: -0.6 })),
        row('ENA', { change24h: 22.7, change1h: -1.4 }),
        row('PRESS', { change24h: 0.0, change1h: 0.05, volume1h: 3400, volume24h: 24000 }),
    ]);
    const { signals } = marketWeather(assets, { prevBreadth: 'down' });
    expect(signals.length).toBeGreaterThan(3);
    for (const s of signals) {
        // Shape only: a kind, and an opaque subject. No move, no price, no prose.
        expect(s.changeKey).toMatch(/^market:(breadth|standout|turn|pressure):[A-Za-z0-9_-]+(:[a-z]+)?$/);
        expect(s.changeKey).not.toContain('%');
        expect(s.changeKey).not.toContain('.');
        expect(s.changeKey).not.toContain(' ');
        expect(s.changeKey.length).toBeLessThan(40);
        // The key must not be derivable into the felt line.
        expect(s.line).not.toContain(s.changeKey);
    }
});

test('the felt lines face the world, never the mechanism', () => {
    const assets = parsed([
        ...fieldWithBreadth(20, 20).map(a => ({ ...a, change1h: -0.6 })),
        row('ENA', { change24h: 22.7, change1h: -1.4 }),
        row('PRESS', { change24h: 0.0, change1h: 0.05, volume1h: 3400, volume24h: 24000 }),
    ]);
    const { signals } = marketWeather(assets, { prevBreadth: 'down' });
    const forbidden = ['z-score', 'z score', 'JSON', 'fetch', 'poll', 'endpoint', 'median',
        'stdev', 'sigma', 'compute', 'cache', 'token', 'cursor'];
    for (const s of signals) {
        for (const word of forbidden) {
            expect(s.line.toLowerCase()).not.toContain(word.toLowerCase());
        }
        expect(s.line.length).toBeGreaterThan(40);
    }
});

test('parser tolerates rubbish quietly', () => {
    expect(parseStats('not json')).toEqual([]);
    expect(parseStats('{"a":1}')).toEqual([]);
    expect(parseStats('[{"name":"nameless"}]')).toEqual([]);
    expect(parseStats(JSON.stringify([null, 3, 'x']))).toEqual([]);
});

test('defaults are the documented ones', () => {
    expect(WEATHER_DEFAULTS).toMatchObject({
        minAssets: 12, breadthBand: 0.06, standoutWindow: '24h', standoutZ: 3,
        standoutMinMove: 3, standoutFloor: 0.5, turn1h: 0.5, turn24h: 2,
        fieldTurn1h: 0.3, volumeRatio: 2, volumeFlat: 0.4,
        standoutEpsilon: 3, turnEpsilon: 1, pressureEpsilon: 1.5,
    });
    expect(DEFAULT_COOLDOWN_MS).toBe(30 * 60 * 1000);
});

// --- suppression: the live defect -----------------------------------------
//
// The regression these cover, verbatim from the live run: 25 minutes against the
// real feed produced 35 offers, all of them the same ENA standout, the move drifting
// only between +19.1% and +20.3%. Under these rules that window is ONE offer.

/** The measured live window: a field near +1.6% with ENA standing out near +20%. */
function enaWindow(enaMove) {
    return parsed([
        ...Array.from({ length: 20 }, (_, i) => row(`C${i}`, {
            change1h: 0.05, change24h: 1.6 + (i % 5) * 0.1,
        })),
        row('ENA', { change24h: enaMove, change1h: 0.1 }),
    ]);
}

test('a condition that persists unchanged across many polls is offered exactly once', () => {
    const memory = new Map();
    let state = 'up';
    const offers = [];
    // The real drift, walked across fifteen polls of one hundred seconds.
    const drift = [19.9, 19.4, 19.1, 19.6, 20.0, 20.3, 20.1, 19.8,
                   19.5, 19.2, 19.7, 20.2, 19.9, 19.6, 19.3];
    drift.forEach((move, i) => {
        const w = marketWeather(enaWindow(move), { prevBreadth: state, offers: memory });
        state = w.breadthState;
        const offer = selectOffer(w.signals, memory, { now: i * 100_000 });
        if (offer) offers.push(offer);
    });
    expect(offers.length).toBe(1);                 // was 35 live
    expect(offers[0].changeKey).toBe('market:standout:ENA');
    expect(offers[0].detail.value).toBe(19.9);     // the first one, the one actually said
});

test('a materially new fact re-offers; drift below the epsilon does not', () => {
    const memory = new Map();
    const poll = (move, now) => selectOffer(
        marketWeather(enaWindow(move), { prevBreadth: 'up', offers: memory }).signals,
        memory, { now },
    );
    expect(poll(19.9, 0)?.changeKey).toBe('market:standout:ENA');
    expect(poll(21.5, 100_000)).toBeNull();        // +1.6pp from what was said: drift
    expect(poll(22.8, 200_000)).toBeNull();        // +2.9pp: still short of the epsilon
    const fresh = poll(24.5, 300_000);             // +4.6pp: a genuinely different fact
    expect(fresh?.changeKey).toBe('market:standout:ENA');
    expect(fresh.detail.value).toBe(24.5);
    expect(fresh.line).toContain('+24.5%');
});

test('the epsilon is measured from the last thing SAID, not the last thing seen', () => {
    const memory = new Map();
    const poll = (move, now) => selectOffer(
        marketWeather(enaWindow(move), { prevBreadth: 'up', offers: memory }).signals,
        memory, { now },
    );
    expect(poll(19.9, 0)?.detail.value).toBe(19.9);
    // Creeping upward in sub-epsilon steps must never accumulate into an offer...
    expect(poll(20.9, 100_000)).toBeNull();
    expect(poll(21.9, 200_000)).toBeNull();
    expect(poll(22.8, 300_000)).toBeNull();        // still 2.9pp from the spoken 19.9
    // ...until it has genuinely travelled the full epsilon from what was said.
    const fresh = poll(22.9, 400_000);
    expect(fresh?.detail.value).toBe(22.9);
    // And the yardstick moves to the new spoken value, not back to 19.9.
    expect(poll(24.0, 500_000)).toBeNull();
});

test('the cooldown re-offers a genuinely persistent condition, once it elapses', () => {
    const memory = new Map();
    const poll = (now) => selectOffer(
        marketWeather(enaWindow(19.9), { prevBreadth: 'up', offers: memory }).signals,
        memory, { now },
    );
    expect(poll(0)).toBeTruthy();
    expect(poll(DEFAULT_COOLDOWN_MS - 1)).toBeNull();
    expect(poll(DEFAULT_COOLDOWN_MS)).toBeTruthy();          // re-felt, not re-keyed
    expect(poll(DEFAULT_COOLDOWN_MS + 1)).toBeNull();        // and the clock restarts
    expect(poll(2 * DEFAULT_COOLDOWN_MS)).toBeTruthy();
});

test('a suppressed leader does not silence the poll', () => {
    const memory = new Map();
    const base = () => [...Array.from({ length: 20 }, (_, i) => row(`C${i}`, {
        change1h: 0.05, change24h: 1.6 + (i % 5) * 0.1,
    })), row('ENA', { change24h: 19.9, change1h: 0.1 })];

    const first = selectOffer(
        marketWeather(parsed(base()), { prevBreadth: 'up', offers: memory }).signals,
        memory, { now: 0 },
    );
    expect(first.kind).toBe('standout');

    // Same standout, unchanged — but something new has appeared underneath it.
    const withPressure = parsed([...base(),
        row('PRESS', { change24h: 0.0, change1h: 0.05, volume1h: 3400, volume24h: 24000 })]);
    const second = selectOffer(
        marketWeather(withPressure, { prevBreadth: 'up', offers: memory }).signals,
        memory, { now: 100_000 },
    );
    expect(second.kind).toBe('pressure');          // the fall-through, not silence
    expect(second.changeKey).toBe('market:pressure:PRESS');
});

test('persistent pressure and a holding field turn do not repeat every tick', () => {
    const memory = new Map();
    const assets = () => parsed([
        ...fieldWithBreadth(20, 20).map(a => ({ ...a, change1h: -0.6 })),
        row('PRESS', { change24h: 0.0, change1h: 0.05, volume1h: 3400, volume24h: 24000 }),
    ]);
    const offers = [];
    for (let i = 0; i < 12; i++) {
        const o = selectOffer(
            marketWeather(assets(), { prevBreadth: 'up', offers: memory }).signals,
            memory, { now: i * 100_000 },
        );
        if (o) offers.push(o);
    }
    // Twelve identical polls of a market holding still. Each distinct fact in it is
    // said at most once, and then there is nothing further to say. (This fixture
    // contains several: the field's turn, an asset's turn, the standing pressure.)
    const keys = offers.map(o => o.changeKey);
    expect(new Set(keys).size).toBe(keys.length);   // nothing repeats
    expect(keys.length).toBeLessThan(6);            // and it runs out quickly
    expect(offers.map(o => o.kind)).toContain('pressure');
    expect(offers.map(o => o.kind)).toContain('turn');
});

test('a breadth flip is exempt from the epsilon: a real re-flip always speaks', () => {
    const memory = new Map();
    let state = null;
    // Only breadth is under test, so the other three floors are put out of reach:
    // this fixture is deliberately bimodal, and a bimodal field really does contain
    // outliers.
    const only = { standoutZ: 99, turn1h: 99, fieldTurn1h: 99, volumeRatio: 99 };
    const fire = (green, now) => {
        const w = marketWeather(parsed(fieldWithBreadth(40, green)), { ...only, prevBreadth: state, offers: memory });
        state = w.breadthState;
        return selectOffer(w.signals, memory, { now });
    };
    expect(fire(30, 0)).toBeNull();                          // first sighting, silent
    expect(fire(18, 100_000)?.changeKey).toBe('market:breadth:down');
    expect(fire(30, 200_000)?.changeKey).toBe('market:breadth:up');
    // Back down to nearly the same fraction as the first flip: a value epsilon would
    // have swallowed it. It is an edge, so it speaks.
    expect(fire(18, 300_000)?.changeKey).toBe('market:breadth:down');
});

test('a standout that ENDS is said once, and then the fact is forgotten', () => {
    const memory = new Map();
    const poll = (move, now) => selectOffer(
        marketWeather(enaWindow(move), { prevBreadth: 'up', offers: memory }).signals,
        memory, { now },
    );
    expect(poll(19.9, 0)?.kind).toBe('standout');

    const over = poll(1.7, 100_000);               // back among the others
    expect(over.kind).toBe('standout-over');
    expect(over.changeKey).toBe('market:standout:ENA:over');
    expect(over.line).toContain('come back in among the others');
    expect(memory.has('market:standout:ENA')).toBe(false);   // forgotten

    expect(poll(1.8, 200_000)).toBeNull();         // the ending is not re-announced
    expect(poll(1.6, 300_000)).toBeNull();
    // A recurrence is new again, because the fact was retired.
    expect(poll(19.9, 400_000)?.kind).toBe('standout');
});

test('an asset that vanishes into the sentinel is not an ending', () => {
    const memory = new Map();
    const w1 = marketWeather(enaWindow(19.9), { prevBreadth: 'up', offers: memory });
    expect(selectOffer(w1.signals, memory, { now: 0 })?.kind).toBe('standout');

    const gone = parsed([
        ...Array.from({ length: 20 }, (_, i) => row(`C${i}`, { change1h: 0.05, change24h: 1.6 })),
        row('ENA', { change24h: -100, change1h: -100 }),     // stopped being reported
    ]);
    const w2 = marketWeather(gone, { prevBreadth: 'up', offers: memory });
    expect(kinds(w2.signals)).not.toContain('standout-over');
    expect(selectOffer(w2.signals, memory, { now: 100_000 })).toBeNull();
});

// --- the wiring ------------------------------------------------------------

test('the sense is dormant without a url', () => {
    expect(market._timer).toBeNull();
});

async function poll(json) {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => json });
    try { await market.onSense(); } finally { globalThis.fetch = realFetch; }
    await delay(30);
}

test('at most ONE percept per poll, even when everything is happening at once', async () => {
    market.setAttribute('url', 'https://stereotic.test/market.json');
    expect(market.ready()).toBe(true);
    market._breadth = 'down';                      // a witnessed prior state

    const bids = [];
    const listener = e => bids.push(e.detail);
    global.addEventListener('interrupt-request', listener);

    const loud = JSON.stringify([
        ...fieldWithBreadth(20, 20).map(a => ({ ...a, change1h: -0.6 })),
        row('ENA', { change24h: 22.7, change1h: -1.4 }),
        row('PRESS', { change24h: 0.0, change1h: 0.05, volume1h: 3400, volume24h: 24000 }),
    ]);
    await poll(loud);

    expect(bids.length).toBe(1);
    const bid = bids[0];
    expect(bid.source).toBe('External');
    expect(bid.type).toBe('Sense-weather');
    expect(bid.urgent).toBe(false);
    expect(bid.salience).toBe(0.75);               // the breadth flip, explicit, unjittered
    expect(bid.reason).toContain('turned green');

    // Second poll: the flip is spent (the state is remembered), so the strongest
    // remaining signal speaks instead — still exactly one.
    resetStereoticCache();
    await poll(loud);
    expect(bids.length).toBe(2);
    expect(bids[1].reason).toContain('ENA');
    expect(bids[1].salience).toBeLessThanOrEqual(SALIENCE_MAX);

    global.removeEventListener('interrupt-request', listener);
});

test('a quiet market makes the sense say nothing', async () => {
    market.setAttribute('url', 'https://stereotic.test/market.json');
    expect(market.ready()).toBe(true);
    market._breadth = 'up';

    const bids = [];
    const listener = e => bids.push(e.detail);
    global.addEventListener('interrupt-request', listener);
    await poll(JSON.stringify(flatField(20, 10)));
    expect(bids.length).toBe(0);
    global.removeEventListener('interrupt-request', listener);
});

test('live shape: fifteen polls of a standing ENA say it once', async () => {
    market.setAttribute('url', 'https://stereotic.test/market.json');
    expect(market.ready()).toBe(true);
    market._breadth = 'up';
    market._offers.clear();

    const bids = [];
    const listener = e => bids.push(e.detail);
    global.addEventListener('interrupt-request', listener);

    // The 25-minute window as it actually arrived: one standing fact, decimals drifting.
    const drift = [19.9, 19.4, 19.1, 19.6, 20.0, 20.3, 20.1, 19.8,
                   19.5, 19.2, 19.7, 20.2, 19.9, 19.6, 19.3];
    for (const move of drift) {
        resetStereoticCache();                     // a new publish tick
        await poll(JSON.stringify([
            ...Array.from({ length: 20 }, (_, i) => row(`C${i}`, {
                change1h: 0.05, change24h: 1.6 + (i % 5) * 0.1,
            })),
            row('ENA', { change24h: move, change1h: 0.1 }),
        ]));
    }

    global.removeEventListener('interrupt-request', listener);
    expect(bids.length).toBe(1);                   // it was 35
    expect(bids[0].reason).toContain('ENA');
    expect(bids[0].reason).toContain('+19.9%');
});

test('one document serves the whole tick: the feed is fetched once', async () => {
    market.setAttribute('url', 'https://stereotic.test/market.json');
    expect(market.ready()).toBe(true);
    market._breadth = 'up';

    let calls = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        calls++;
        return { ok: true, status: 200, text: async () => JSON.stringify(flatField(20, 10)) };
    };
    try {
        await market.onSense();
        await market.onSense();
        await market.onSense();
    } finally { globalThis.fetch = realFetch; }
    expect(calls).toBe(1);
});
