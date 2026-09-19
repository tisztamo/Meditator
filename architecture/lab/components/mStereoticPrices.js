import A from "amanita"
import { MSense } from "../../../src/mindComponents/mind/mSense.js"
import { logger } from "../../../src/infrastructure/logger.js"
import { parseTime } from "../../../src/config/timeParser.js"
import { fetchStereoticText } from "./stereoticFeed.js"

const log = logger("mStereoticPrices.js")

/**
 * m-stereotic-prices — ONE ASSET'S price channel. The element is not "the
 * market": it is BTC, or ETH, or ZEC. You place one per asset you want the mind
 * to be able to feel, and the membrane can then soften, narrow, or close that
 * asset alone. (`watchTickers` keeps the older multi-asset mode working; see
 * below.) The news half of the pair is m-stereotic-news, and the channels share
 * one enclosing market aperture so the whole outside can be shut at once.
 *
 * WHAT IT READS — the live surface, measured. stereotic's price service (a
 * Circo actor cluster in Julia) aggregates exchange trades into per-asset
 * statistics and republishes them as static JSON under /data. The surface this
 * sense is written against is:
 *
 *     https://stereotic.com/data/stats/top100_stat.json
 *
 * 67 assets, republished on a hard ~100 second tick (measured gaps: 100, 100,
 * 100, 101 s), with 55-58 of the 67 repriced each tick. Its rows are the
 * AssetStatistics spelling:
 *
 *   {"id":67,"name":"Zcash","symbolname":"ZEC","rank":9,"price":1530.5776,
 *    "change1h":-0.997,"change4h":-1.50,"change24h":4.097,"change7d":33.05,
 *    "change30d":166.97,"change90d":250.28,"change1y":2892.4,"change3y":5158.2,
 *    "volume1h":14648.2,"volume24h":262847.4,"ath":3191.93,"drawdown":-52.05,
 *    "updated":1789823227.0}
 *
 * `updated` is epoch SECONDS. The change fields are PERCENTAGE POINTS, not
 * fractions: 4.097 means +4.097%.
 *
 * NOT `assets/top100.json`. That path is a FOSSIL — its last-modified is
 * 9 March 2023. An earlier version of this sense defaulted to it and would have
 * fed the mind a three-year-old market as if it were today. Any mention of it
 * has been removed; if you see it in an architecture, it is a bug.
 *
 * THE -100 SENTINEL — the single most important correctness rule here. In the
 * change fields, exactly -100.0 is stereotic's MISSING-DATA marker, not a
 * -100% move. Assets flip between a real value and -100 between consecutive
 * ticks (PAXG, RLUSD, WBETH and SHIB were all watched doing it). Taken
 * literally it is the largest possible move in the feed, so a sense that
 * believes it will shout "PAXG has collapsed 100%" at full salience, over and
 * over, at random. Every change field is therefore screened with a small
 * epsilon (<= -99.999) and becomes `null`, which is "unknown" and bids nothing.
 * The price of this rule, stated honestly: a genuine -100% print (a token that
 * really did go to zero) is indistinguishable from the sentinel and will be
 * silently dropped. That trade is worth taking — the sentinel is observed many
 * times a day, the real event approximately never.
 *
 * `null` vs `0`. A missing change parses to `null`, never `0`, so "flat" and
 * "we do not know" stay distinguishable to every caller. Typical real movement
 * on this surface is small: the median |delta change1h| per asset per 100 s
 * tick is 0.10-0.18 percentage points.
 *
 * THE MEMBRANE CONTRACT (tier 0, lean). Like m-feed, this sense uses the LAZY
 * candidate() path when it sits inside an aperture: before the gate admits it,
 * only MSense.perceive()'s header exists, and that header is exactly
 *   { changeMagnitude, changeKey, occurredAt }
 * — changeMagnitude is the computed salience, occurredAt is Date.now(), and
 * changeKey is the opaque token described next. No symbol, no price, no move
 * size reaches a closed gate. The first-person line is produced by the
 * materializer, which runs only after admission. Outside an aperture perceive()
 * degrades to an eager feel(), which is the compatibility path.
 *
 * CHANGE KEY (non-semantic, and it must stay that way). The key is
 * `prices:<slot>:<rev>`: `slot` is an opaque per-channel index assigned in
 * encounter order and `rev` is a counter bumped only when that asset's move
 * actually changes. It re-keys exactly when there is something new to feel and
 * is otherwise stable — and it leaks nothing, which the older
 * `prices:BTC:-1.9045` form did (it put the ticker and the move itself in the
 * header, i.e. in front of a closed gate).
 *
 * DEDUP — one bid per move. There is exactly one guard: the remembered move for
 * this asset. If the freshly parsed move equals the remembered one, the round
 * returns without bidding; otherwise the move is remembered, the revision is
 * bumped, and a bid goes out. Because remembering and bidding are the same
 * branch, the same move cannot be felt twice. (The previous implementation
 * remembered the move BEFORE checking a separate `_lastOffered` map, so the
 * first poll offered `prices:BTC:-1.9045` and the second offered `prices:BTC`
 * for the identical move — different keys, dedup missed, every move felt twice.
 * That was confirmed live: the same BTC -1.90% line at 13:08:09 and 13:08:34.)
 *
 * DEDUP IS NOT ENOUGH — `moveEpsilon`. "Bid whenever the move actually changed"
 * is still a barrage when the window is short and the poll is fast. With
 * moveWindow="1h" against a 100 s tick, an asset's 1h figure changes by a hair
 * on essentially every tick (the median |delta change1h| is 0.10-0.18
 * percentage points), so the mind would hear "BTC has moved -3.01%... -3.02%...
 * -3.03%" every hundred seconds forever — the same barrage the membrane exists
 * to prevent, merely slower. So a move re-keys only when it has travelled at
 * least `moveEpsilon` percentage points from the REMEMBERED move (default 0.25,
 * comfortably above that median drift). Below that the round is silent AND the
 * remembered move is left alone, so drift cannot creep past the epsilon one
 * hundredth of a point at a time: the comparison is always against the last
 * thing actually said, never against the last thing seen.
 *
 * SALIENCE — why these numbers.
 *
 *     salience = clamp(0.30 + 0.45 * min(1, |movePct/100| / refMove), 0.30, 0.80)
 *
 * The old formula was `0.4 + magnitude * 0.5`, and it made prices literally
 * INAUDIBLE. The bid crosses two nested arbiter gains (0.85 * 0.9 = 0.765) on
 * the way to an attention threshold of ~0.35, so it needed a raw salience of
 * 0.35 / 0.765 = 0.457, i.e. `magnitude > 0.115` — a move of more than 11.5% in
 * 24h. The market essentially never said anything.
 *
 * The new formula is anchored so that the two declared numbers mean what they
 * say. Under a single channel gain of ~0.9 against a ~0.35 threshold, a bid is
 * audible from 0.35 / 0.9 = 0.389 raw. At the default `moveThreshold` of 0.015
 * (1.5%) with the default `refMove` of 0.06 (6%):
 *     0.30 + 0.45 * (0.015 / 0.06) = 0.30 + 0.1125 = 0.4125   ->  * 0.9 = 0.371
 * which clears 0.35. So `moveThreshold` is not only the bid floor, it is also
 * the AUDIBILITY floor: everything this sense chooses to say can actually be
 * heard, and everything quieter is not said at all. A move at or beyond
 * `refMove` saturates at 0.75 (the 0.80 clamp is a guard rail that the default
 * `refMove` never reaches), so one violent candle cannot capture the mind.
 * Raising `refMove` makes the channel calmer; lowering it makes every move
 * shout. If you change the enclosing gains, redo the arithmetic above.
 *
 * NO `salienceShift`. MSense's `salienceShift` is dead for this sense and the
 * attribute is deliberately not offered: perceive() is always called with an
 * explicit `salience`, and MSense._salienceFor returns an explicit salience
 * untouched (mSense.js:297), skipping both the shift and the jitter. Advertising
 * an attribute that cannot do anything is a lie in the interface.
 *
 * HONESTY. A price is a real measurement of the shared world
 * (provenance="physical"), not a simulation and not a substrate metric. The
 * felt line faces the world — never "I polled an endpoint", never "I fetched
 * JSON". Numbers do appear in the line, as they always have.
 *
 * @interface  (plus MSense's timeout/sigma/name/provenance/tier)
 *   - url: the stereotic price stats JSON surface (required; the element stays
 *     dormant with a warning if absent). The architecture passes
 *     https://stereotic.com/data/stats/top100_stat.json.
 *   - ticker: THE asset this element is the channel for, e.g. "BTC". Preferred.
 *   - watchTickers: comma-separated fallback for the multi-asset mode, e.g.
 *     "BTC,ETH,SOL". Ignored when `ticker` is given. With neither, every asset
 *     on the surface is watched (noisy; for exploration).
 *   - moveWindow: which change field to read — "1h" | "4h" | "24h" | "7d" |
 *     "30d" | "90d" | "1y" | "3y" (default "24h").
 *   - moveThreshold: minimum |move| as a fraction (default 0.015 = 1.5%) to bid
 *     at all. Also the audibility floor; see SALIENCE.
 *   - moveEpsilon: how far (in PERCENTAGE POINTS, default 0.25) a move must
 *     travel from the last one spoken before it counts as a new move. See
 *     DEDUP IS NOT ENOUGH.
 *   - refMove: the move size (fraction, default 0.06 = 6%) at which salience
 *     saturates. See SALIENCE.
 *   - pollCache: how long one fetch of the surface is reused across all
 *     stereotic senses (default "100s", the measured publish tick).
 *   - maxBids: at most this many assets may bid in one round in multi-asset
 *     mode (default 3). A single-`ticker` element bids at most once anyway.
 *   - bypassAperture / bypassAdmission / preempt: false (the market is ambient)
 */
export class MStereoticPrices extends MSense {
    _slots = new Map()       // symbol -> opaque slot index (assignment order)
    _state = new Map()       // symbol -> { move, rev } — the ONE dedup guard

    get defaultTimeout() { return "90s" }
    get defaultSigma() { return "30s" }

    ready() {
        this.url = this.attr("url")
        if (!this.url) {
            log.warn(`[${this.attr("name") || "stereotic-prices"}] no url — stereotic prices sense is dormant.`)
            return false
        }
        const ticker = (this.attr("ticker") || "").trim().toUpperCase()
        this._watch = ticker
            ? [ticker]
            : (this.attr("watchTickers") || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
        this._window = (this.attr("moveWindow") || "24h").trim().toLowerCase()
        this._moveField = fieldForWindow(this._window)
        this._threshold = Number(this.attr("moveThreshold") ?? 0.015)
        if (!Number.isFinite(this._threshold) || this._threshold < 0) {
            throw new Error(`moveThreshold must be a non-negative fraction, got ${JSON.stringify(this.attr("moveThreshold"))}`)
        }
        this._epsilon = Number(this.attr("moveEpsilon") ?? 0.25)
        if (!Number.isFinite(this._epsilon) || this._epsilon < 0) {
            throw new Error(`moveEpsilon must be a non-negative number of percentage points, got ${JSON.stringify(this.attr("moveEpsilon"))}`)
        }
        this._refMove = Number(this.attr("refMove") ?? 0.06)
        if (!Number.isFinite(this._refMove) || this._refMove <= 0) {
            throw new Error(`refMove must be a positive fraction, got ${JSON.stringify(this.attr("refMove"))}`)
        }
        this._maxBids = Math.max(1, Number(this.attr("maxBids") ?? 3))
        this._ttlMs = parseTime(this.attr("pollCache") || "100s")
        if (!Number.isFinite(this._ttlMs) || this._ttlMs <= 0) this._ttlMs = 100000
        return true
    }

    async onSense(request) {
        // Shared across every stereotic sense: N per-ticker channels cost one
        // HTTP request per publish tick, not N.
        const text = await fetchStereoticText(this.url, { ttlMs: this._ttlMs ?? 100000 })
        const assets = parseStereoticPrices(text)
        if (!assets.length) return                      // nothing there — stay quiet

        let offered = 0
        for (const asset of assets) {
            if (this._watch.length && !this._watch.includes(asset.symbol)) continue
            const movePct = asset[this._moveField]
            if (movePct == null) continue               // unknown (or the -100 sentinel) — say nothing
            const magnitude = Math.abs(movePct) / 100   // fraction
            if (magnitude < this._threshold) continue   // a quiet market stays quiet

            // THE guard. Remembering and bidding are one branch, so the same
            // move can never be felt twice however often we poll — and a move
            // that has only drifted within `moveEpsilon` of the remembered one
            // is not a new move at all.
            const prior = this._state.get(asset.symbol)
            if (prior && Math.abs(movePct - prior.move) < this._epsilon) continue
            const rev = (prior?.rev ?? 0) + 1
            this._state.set(asset.symbol, { move: movePct, rev })

            // Awaited, not fired and forgotten: the enclosing aperture drops a
            // candidate offered while the same source is still materializing
            // the previous one ("busy", mRegion.js). In multi-asset mode that
            // would silently lose every asset after the first — and because
            // the move is already remembered, it would stay lost until the
            // asset moved again. One element per ticker never meets this;
            // the fallback mode has to wait its turn.
            await this.perceive(this._line(asset, movePct), {
                salience: this._salience(magnitude),
                changeKey: `prices:${this._slot(asset.symbol)}:${rev}`,
            })
            if (++offered >= (this._maxBids ?? 3)) break
        }
    }

    /** clamp(0.30 + 0.45 * min(1, magnitude/refMove), 0.30, 0.80) — see SALIENCE. */
    _salience(magnitude) {
        const reach = Math.min(1, magnitude / this._refMove)
        return Math.max(0.30, Math.min(0.80, 0.30 + 0.45 * reach))
    }

    /** Opaque, stable, meaningless outside this element — the header must not
     * carry the ticker. */
    _slot(symbol) {
        if (!this._slots.has(symbol)) this._slots.set(symbol, this._slots.size)
        return this._slots.get(symbol)
    }

    /** The world, not the mechanism. */
    _line(asset, movePct) {
        const sign = movePct >= 0 ? "+" : ""
        return `${asset.symbol} has moved ${sign}${movePct.toFixed(2)}% over the past ${this._window} — the market is restless.`
    }
}

/** Map a window name to the field name on the parsed asset record. */
export function fieldForWindow(window) {
    switch (window) {
        case "1h": case "4h": case "24h": case "7d":
        case "30d": case "90d": case "1y": case "3y":
            return `change${window}`
        default:
            throw new Error(`unsupported moveWindow "${window}" (want 1h|4h|24h|7d|30d|90d|1y|3y)`)
    }
}

/** stereotic's missing-data marker in a change field. Not a -100% move. */
const MISSING_CHANGE = -99.999

/**
 * Parse a stereotic price-stat document into normalized assets. Pure and
 * exported so it is testable without the network.
 *
 * Tolerates both spellings seen in the wild: the live AssetStatistics shape
 * (symbolname, price, change24h, volume24h, rank, updated) and the older
 * coingecko-markets shape (symbol, current_price,
 * price_change_percentage_24h, ...).
 *
 * Every change field is screened for the -100 sentinel and returns `null` when
 * missing or unknown — never 0, so "flat" stays distinct from "no data".
 *
 * @param {string} json
 * @returns {Array<{symbol:string, name:string|null, rank:number|null,
 *   price:number|null, change1h:number|null, change4h:number|null,
 *   change24h:number|null, change7d:number|null, change30d:number|null,
 *   change90d:number|null, change1y:number|null, change3y:number|null,
 *   volume1h:number|null, volume24h:number|null,
 *   updated:number|null, updatedAt:number|null}>}
 */
export function parseStereoticPrices(json) {
    let data
    try { data = JSON.parse(json) } catch { return [] }
    if (!Array.isArray(data)) return []
    const out = []
    for (const raw of data) {
        if (!raw || typeof raw !== "object") continue
        const symbol = String(raw.symbol || raw.symbolname || "").trim().toUpperCase()
        if (!symbol) continue
        const change = (gecko, native) => screen(num(raw[gecko] ?? raw[native]))
        const updated = num(raw.updated)          // epoch SECONDS on the live surface
        out.push({
            symbol,
            name: raw.name != null ? String(raw.name) : null,
            rank: num(raw.rank ?? raw.market_cap_rank),
            price: num(raw.current_price ?? raw.price),
            change1h: change("price_change_percentage_1h_in_currency", "change1h"),
            change4h: change("price_change_percentage_4h_in_currency", "change4h"),
            change24h: change("price_change_percentage_24h", "change24h"),
            change7d: change("price_change_percentage_7d_in_currency", "change7d"),
            change30d: change("price_change_percentage_30d_in_currency", "change30d"),
            change90d: change("price_change_percentage_90d_in_currency", "change90d"),
            change1y: change("price_change_percentage_1y_in_currency", "change1y"),
            change3y: change("price_change_percentage_3y_in_currency", "change3y"),
            volume1h: num(raw.volume1h),
            volume24h: num(raw.volume24h ?? raw.total_volume),
            updated,
            updatedAt: updated == null ? null : Math.round(updated * 1000),
        })
    }
    return out
}

/** -100.0 (within epsilon) is "no data", not a move. See the -100 SENTINEL note. */
function screen(v) {
    if (v == null) return null
    return v <= MISSING_CHANGE ? null : v
}

function num(v) {
    if (v == null || v === "") return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

A.define("m-stereotic-prices", MStereoticPrices)
