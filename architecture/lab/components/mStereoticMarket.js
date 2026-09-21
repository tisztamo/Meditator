import A from "amanita"
import { MSense } from "../../../src/mindComponents/mind/mSense.js"
import { fetchStereoticText } from "./stereoticFeed.js"
import { parseTime } from "../../../src/config/timeParser.js"
import { logger } from "../../../src/infrastructure/logger.js"

const log = logger("mStereoticMarket.js")

/**
 * m-stereotic-market — the AMBIENT WEATHER of the stereotic price surface.
 *
 * WHY THIS EXISTS. A lab mind was run live for 5.5 minutes against the stereotic
 * market and received ZERO percepts. Starved of an outside, it fell straight into
 * the substrate-introspection attractor the sense contract exists to prevent — it
 * began writing about the Chinese Room and a blinking cursor. The obvious repair is
 * "poll faster". The measurement says that repair is wrong:
 *
 *   - the surface publishes on a HARD ~100 second tick (measured inter-publish gaps
 *     100, 100, 100, 101 s), repricing 55-58 of its 67 assets each time. Polling at
 *     10 s buys ten identical documents, not ten observations;
 *   - per tick, the MEDIAN asset moves 0.10-0.18 percentage points on `change1h`.
 *     One asset's tick is genuinely, honestly thin. There is nothing there to feel.
 *
 * But the CROSS-SECTION is not thin. In one measured snapshot the 24h dispersion had
 * a stdev of 14.4pp; ENA was +22.7% while the median asset was +3.9%; NEAR was +52%
 * on 7d; 70% of the assets were green. The information that actually arrives at a
 * 100-second cadence is RELATIONAL — it lives between the rows, not inside one of
 * them — and every bit of it is free arithmetic over 67 rows we already fetch. No
 * model, no faster feed, no extra request.
 *
 * So: per-ticker senses (m-stereotic-prices and its kin) are what the mind can
 * NARROW to, one element per asset, each closable on its own. THIS component is what
 * the mind stands in the middle of: the weather, read from a hill.
 *
 * THE FOUR SIGNALS. Each is a distinct percept kind with its own stable,
 * non-semantic changeKey, so a repeat habituates in the membrane and a genuine
 * change re-keys:
 *
 *   1. BREADTH FLIP (`market:breadth:up` / `:down`) — the fraction of assets with
 *      change24h > 0 crossing 0.5, with a hysteresis band so it cannot chatter along
 *      the boundary. One number per tick, and it is what a market feels like from a
 *      hill: not a price, a direction the whole field is leaning.
 *   2. STANDING OUT (`market:standout:<SYMBOL>`) — an asset whose move is far out of
 *      line with the cross-section of the SAME horizon. "ENA is moving when nothing
 *      else is" is news; "ENA is up 2% with everything else" is weather that the
 *      breadth signal already carries.
 *   3. HORIZON DISAGREEMENT (`market:turn:<SYMBOL>`, `market:turn:field:<dir>`) — a
 *      change1h sign opposing a change24h sign, for one asset or for the field's
 *      median. A flip is a TURN, and it is the honest basis for a prediction the
 *      mind can later be found wrong about.
 *   4. VOLUME/PRICE DIVERGENCE (`market:pressure:<SYMBOL>`) — volume1h elevated
 *      against the asset's own 24h rate (volume24h/24) while the price is flat:
 *      pressure building, nothing given yet.
 *
 * ONE PERCEPT PER POLL, AT MOST. The candidates are ranked by salience and only the
 * strongest ADMISSIBLE one is offered. Four simultaneous observations is exactly the
 * barrage the membrane exists to prevent; a mind on a hill notices the one thing that
 * changed, not four things at once.
 *
 * A STABLE changeKey IS NOT ENOUGH — `signalCooldown` and the epsilons. This was
 * found live and it was bad. Across 25 minutes against the real feed this sense
 * produced 35 offers and every single one was the SAME fact — "ENA is going somewhere
 * on its own, +19.9% across the day while everything around it sits near +1.6%" —
 * with only the decimals drifting between +19.1 and +20.3. Thirty were swallowed by
 * downstream rate limits and five reached the mind, so in 25 minutes the entire
 * outside said one sentence five times. ENA was ~20% up on the day for the whole
 * window: that is precisely the case a standout detector should announce ONCE and
 * then treat as the new normal.
 *
 * The stable `market:standout:ENA` key habituates the region's CONTACT signal, but
 * the bid still went out every poll and the arbiters still had to absorb it. The
 * repair belongs here, at the source: the sense must not offer it in the first place.
 * So every non-edge signal remembers the VALUE that justified the last thing actually
 * OFFERED under its key, and re-offers only when
 *
 *     |value - remembered| >= that signal's epsilon      (a materially new fact)
 *     OR now - remembered.at >= signalCooldown           (a persistent condition,
 *                                                         re-felt occasionally)
 *
 * The memory is written on the SAME BRANCH as the offer and nowhere else — the
 * comparison is always against the last thing said, never against the last thing
 * seen. (The prices sense had exactly the opposite bug: it remembered before
 * checking, so drift could creep past the epsilon one hundredth of a point at a
 * time.) Under this rule the observed 25-minute window yields ONE offer instead of
 * 35, and a suppressed leader no longer silences the poll: the ranking falls through
 * to the strongest signal that is still allowed to speak, so a fresh turn or a fresh
 * pressure can be heard while a stale standout stays quiet.
 *
 * BREADTH IS EXEMPT FROM ALL OF THIS (`edge: true`). It is already edge-triggered by
 * the hysteresis state and cannot repeat without a genuine crossing; running it
 * through a value epsilon would suppress a REAL re-flip that happened to land near
 * the last one, which is the opposite of what this sense is for.
 *
 * AN ENDING IS NEWS TOO. A standout that stops standing out is a real event, so it
 * is implemented: once a remembered standout is visible again and no longer clears
 * the z and absolute-move floors, the sense says so once (`market:standout:<SYM>:over`)
 * and forgets the standout, so a recurrence may speak again. It is deliberately
 * implemented for the STANDOUT ONLY. A turn resolving and pressure releasing are the
 * ordinary condition of a market — announcing the end of each would exactly double
 * the traffic this section exists to cut. And the end is announced only while the
 * asset is VISIBLE with a real reading: an asset that fell into the -100 sentinel has
 * not come back into line, it has merely stopped being reported, and the difference
 * matters.
 *
 * SALIENCE BAND [0.45, 0.75]. These events are rarer and carry more than a single
 * ticker's tick, so the floor is higher than an ordinary ambient reading — but
 * nothing ambient may capture the mind, so the ceiling is hard at 0.8 and nothing
 * here reaches it. The arithmetic: under a single channel gain of ~0.9 against an
 * attention threshold of ~0.35, the quietest signal lands at 0.45 * 0.9 = 0.405 —
 * audible — and the loudest at 0.75 * 0.9 = 0.675, well short of anything that
 * preempts. Salience is passed explicitly, so it is NOT jittered: the band is exact.
 *
 * THE -100 SENTINEL. In this surface, -100.0 in a change field is the MISSING-DATA
 * sentinel, not a -100% move. Assets flip between a real value and -100 between
 * ticks (observed live on PAXG, RLUSD, WBETH, SHIB). Any change field <= -99.999 is
 * therefore treated as ABSENT: the asset is EXCLUDED from that horizon's statistics
 * rather than folded in as zero. Substituting zero would drag every median and every
 * breadth count; reading it as a move would make the mind feel a fake crash every
 * tick. This is the single most important line of arithmetic in the file.
 *
 * QUIET IS ALLOWED. Every signal has a declared floor — a robust z minimum, a
 * divergence ratio, a hysteresis band, an absolute-move minimum. When the market is
 * genuinely flat this component says NOTHING, and that is the designed behaviour,
 * not a fallback.
 *
 * THE FELT LINE FACES THE WORLD. Never "I computed a z-score", never "I fetched
 * JSON". First person, present tense, the way weather is read from a hill. Numbers
 * may appear in the line because they are part of the experience of looking at a
 * market, but the line is an experience, not a report.
 *
 * LIMITATIONS, honestly:
 *   - the breadth flip needs TWO readings to fire. A mind that wakes with the field
 *     already green records the state and stays silent, because it did not witness a
 *     crossing. That is a deliberate loss: a startup flare would be a lie.
 *   - the standout z is ROBUST (median / MAD), not the textbook mean/stdev one. With
 *     mean and stdev, the measured ENA outlier (+22.7 against a 3.9 median, 14.4pp
 *     stdev) scores only ~1.3 sigma — the outliers inflate the very scale meant to
 *     detect them, so a plain z-test would never fire on the clearest event in the
 *     snapshot. See the note on `standoutZ`.
 *   - the horizons compared in signal 3 are 1h against 24h, so a "turn" is at best
 *     an hour old. There is no intra-tick series here to do better with.
 *   - the volume divergence cannot distinguish accumulation from a single large
 *     wash trade. It reports pressure, and says nothing about who is pressing.
 *   - no state is persisted across a restart: breadth begins unknown again, and so is
 *     every suppression memory, so the first poll after a restart may repeat a fact
 *     the mind already heard before it went down.
 *   - the suppression memory is an unbounded Map, keyed by changeKey. Its key space
 *     is (kinds x the ~67 symbols on the surface), so it cannot actually grow; there
 *     is deliberately no eviction to go wrong.
 *
 * @interface  (plus MSense's timeout/sigma/salience/salienceShift)
 *   - url: the stereotic stats JSON endpoint (required; dormant if absent), e.g.
 *     https://stereotic.com/data/stats/top100_stat.json
 *   - pollCache: how long one fetched document is reused across all stereotic senses
 *     (default "100s", matched to the measured publish tick)
 *   - minAssets: how many rows a horizon needs before its statistics mean anything
 *     (default 12)
 *   - breadthBand: full width of the hysteresis band around 0.5 (default 0.06 — a
 *     flip up needs >= 53% green, a flip down <= 47%)
 *   - standoutWindow: the horizon the cross-section is taken over (default "24h")
 *   - standoutZ: minimum robust z, |x - median| / (1.4826 * MAD) (default 3)
 *   - standoutMinMove: minimum absolute distance from the median, in percentage
 *     points (default 3) — an outlier must be far out of line AND actually moving
 *   - standoutFloor: floor on the robust scale, in percentage points (default 0.5),
 *     so a dead-flat field cannot make a 1pp move look like eight sigma
 *   - turn1h / turn24h: minimum |change1h| / |change24h| for an asset's opposing
 *     signs to count as a turn (defaults 0.5 and 2 pp; 0.5pp is 3-5x the measured
 *     median per-tick 1h move, so it is a turn and not tick noise)
 *   - fieldTurn1h: the same floor for the FIELD's median 1h leg (default 0.3 pp —
 *     a median that moves at all is already a consensus)
 *   - volumeRatio: minimum volume1h / (volume24h/24) to call it pressure (default 2)
 *   - volumeFlat: maximum |change1h| for the price to count as flat (default 0.4 pp)
 *   - signalCooldown: how long a persistent, unchanged condition stays unspoken
 *     before it may be felt again (default "30m" — eighteen polls of silence on one
 *     standing fact, then one reminder)
 *   - standoutEpsilon: how far the standout's own move must travel, in percentage
 *     points, before it is a new fact (default 3). The live ENA window drifted 1.2pp
 *     across 25 minutes, so it sits comfortably above the observed drift.
 *   - turnEpsilon: the same, on the turn's fresh 1h leg (default 1 pp)
 *   - pressureEpsilon: the same, on the divergence RATIO (default 1.5 — from 3.4x
 *     the ordinary hour to 4.9x, or back down to 1.9x)
 *   - name: labels the bid type as Sense-<name> (default "stereotic-market")
 *   - provenance: "physical" (default) — a real measurement of the shared world
 *   - tier: 0 (lean); 1 and 2 are refused by the region
 *   - bypassAperture / bypassAdmission / preempt: false (weather is ambient)
 */
export class MStereoticMarket extends MSense {
    /** "up" | "down" | null — the last breadth state we actually witnessed. */
    _breadth = null

    /** changeKey -> { value, at } for the last thing actually OFFERED under it. */
    _offers = new Map()

    get defaultTimeout() { return "100s" }
    get defaultSigma() { return "20s" }

    ready() {
        this.url = this.attr("url")
        if (!this.url) {
            log.warn(`[${this._name()}] no url — stereotic market sense is dormant.`)
            return false
        }
        this._pollCacheMs = parseTime(this.attr("pollCache") || "100s")
        this._opts = {
            minAssets: this._num("minAssets", WEATHER_DEFAULTS.minAssets),
            breadthBand: this._num("breadthBand", WEATHER_DEFAULTS.breadthBand),
            standoutWindow: (this.attr("standoutWindow") || WEATHER_DEFAULTS.standoutWindow).trim(),
            standoutZ: this._num("standoutZ", WEATHER_DEFAULTS.standoutZ),
            standoutMinMove: this._num("standoutMinMove", WEATHER_DEFAULTS.standoutMinMove),
            standoutFloor: this._num("standoutFloor", WEATHER_DEFAULTS.standoutFloor),
            turn1h: this._num("turn1h", WEATHER_DEFAULTS.turn1h),
            turn24h: this._num("turn24h", WEATHER_DEFAULTS.turn24h),
            fieldTurn1h: this._num("fieldTurn1h", WEATHER_DEFAULTS.fieldTurn1h),
            volumeRatio: this._num("volumeRatio", WEATHER_DEFAULTS.volumeRatio),
            volumeFlat: this._num("volumeFlat", WEATHER_DEFAULTS.volumeFlat),
            standoutEpsilon: this._num("standoutEpsilon", WEATHER_DEFAULTS.standoutEpsilon),
            turnEpsilon: this._num("turnEpsilon", WEATHER_DEFAULTS.turnEpsilon),
            pressureEpsilon: this._num("pressureEpsilon", WEATHER_DEFAULTS.pressureEpsilon),
        }
        this._cooldownMs = parseTime(this.attr("signalCooldown") || "30m")
        if (!CHANGE_FIELDS.includes(`change${this._opts.standoutWindow}`)) {
            throw new Error(`unsupported standoutWindow "${this._opts.standoutWindow}" (want 1h|4h|24h|7d|30d|90d)`)
        }
        return true
    }

    _num(attr, fallback) {
        const raw = this.attr(attr)
        if (raw == null || String(raw).trim() === "") return fallback
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0) {
            throw new Error(`${attr} must be a non-negative number, got ${JSON.stringify(raw)}`)
        }
        return n
    }

    async onSense(request) {
        const text = await fetchStereoticText(this.url, {
            ttlMs: this._pollCacheMs,
            agent: "Meditator/0 (+stereotic market sense)",
        })
        const assets = parseStats(text)
        if (assets.length < (this._opts?.minAssets ?? WEATHER_DEFAULTS.minAssets)) return

        const weather = marketWeather(assets, {
            ...this._opts,
            prevBreadth: this._breadth,
            offers: this._offers,                 // read-only here: only for spotting an ENDING
        })
        this._breadth = weather.breadthState      // remembered whether or not it fired

        // The strongest thing that is still ALLOWED to be said. selectOffer writes the
        // memory on the same branch it returns on, and nowhere else.
        const offer = selectOffer(weather.signals, this._offers, { cooldownMs: this._cooldownMs })
        if (!offer) return                        // quiet, or already said: either way, silence
        this.perceive(offer.line, {
            key: offer.kind,
            salience: offer.salience,
            changeKey: offer.changeKey,
        })
    }
}

// ---------------------------------------------------------------------------
// The arithmetic. Pure, exported, and exercised by the test with no network and
// no DOM. Nothing below touches `this`, `fetch`, or an element.
// ---------------------------------------------------------------------------

const CHANGE_FIELDS = ["change1h", "change4h", "change24h", "change7d", "change30d", "change90d"]

/** The missing-data sentinel: -100.0 in a change field means ABSENT, not -100%. */
const ABSENT = -99.999

export const WEATHER_DEFAULTS = {
    minAssets: 12,
    breadthBand: 0.06,
    standoutWindow: "24h",
    standoutZ: 3,
    standoutMinMove: 3,
    standoutFloor: 0.5,
    turn1h: 0.5,
    turn24h: 2,
    fieldTurn1h: 0.3,
    volumeRatio: 2,
    volumeFlat: 0.4,
    standoutEpsilon: 3,
    turnEpsilon: 1,
    pressureEpsilon: 1.5,
    prevBreadth: null,
    offers: null,
}

/** How long an unchanged, persistent condition stays unspoken. */
export const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000

/** The hard salience band. Nothing ambient may capture the mind. */
export const SALIENCE_MIN = 0.45
export const SALIENCE_MAX = 0.75

/**
 * Parse the stereotic stats surface (AssetStatistics spelling) into rows, with the
 * -100 sentinel mapped to null on every change field.
 *
 * @param {string} json
 * @returns {Array<{symbol:string, name:string, price:number|null,
 *   change1h:number|null, change4h:number|null, change24h:number|null,
 *   change7d:number|null, change30d:number|null, change90d:number|null,
 *   volume1h:number|null, volume24h:number|null}>}
 */
export function parseStats(json) {
    let data
    try { data = typeof json === "string" ? JSON.parse(json) : json } catch { return [] }
    if (!Array.isArray(data)) return []
    const out = []
    for (const raw of data) {
        if (!raw || typeof raw !== "object") continue
        const symbol = String(raw.symbolname || raw.symbol || "").trim().toUpperCase()
        if (!symbol) continue
        const row = {
            symbol,
            name: String(raw.name || symbol),
            price: num(raw.price ?? raw.current_price),
            volume1h: pos(raw.volume1h),
            volume24h: pos(raw.volume24h),
        }
        for (const field of CHANGE_FIELDS) row[field] = change(raw[field])
        out.push(row)
    }
    return out
}

/** A change reading, or null when absent (missing, unparseable, or the sentinel). */
function change(v) {
    const n = num(v)
    if (n == null) return null
    return n <= ABSENT ? null : n
}

function num(v) {
    if (v == null || v === "") return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

function pos(v) {
    const n = num(v)
    return n != null && n > 0 ? n : null
}

/**
 * Read the weather off a cross-section.
 *
 * Pure: the only state it needs is `prevBreadth`, which is passed in and handed
 * back as `breadthState`, so a caller (or a test) owns the memory.
 *
 * @param {Array} assets - rows from parseStats
 * @param {object} [opts] - WEATHER_DEFAULTS overrides plus prevBreadth
 * @returns {{breadth: number|null, breadthState: "up"|"down"|null, signals: Array}}
 *   signals are sorted strongest-first; each is
 *   { kind, changeKey, salience, line, detail }
 */
export function marketWeather(assets, opts = {}) {
    const o = { ...WEATHER_DEFAULTS, ...opts }
    const rows = Array.isArray(assets) ? assets.filter(a => a && a.symbol) : []
    const signals = []

    // --- 1. Breadth, and its flip -----------------------------------------
    const day = column(rows, "change24h")
    let breadth = null
    let breadthState = o.prevBreadth ?? null
    const dayValues = day.map(r => r.value)
    const medianDay = dayValues.length ? median(dayValues) : null
    if (day.length >= o.minAssets) {
        breadth = day.filter(r => r.value > 0).length / day.length
        const up = 0.5 + o.breadthBand / 2
        const down = 0.5 - o.breadthBand / 2
        // Inside the band nothing changes: that is the whole point of the band.
        const observed = breadth >= up ? "up" : breadth <= down ? "down" : breadthState
        if (breadthState == null) {
            breadthState = observed          // first sighting — record it, never fire
        } else if (observed !== breadthState) {
            breadthState = observed
            signals.push(breadthSignal(observed, breadth, day.length, medianDay))
        }
    }

    // --- 2. Standing out ---------------------------------------------------
    const field = `change${o.standoutWindow}`
    const cross = column(rows, field)
    if (cross.length >= o.minAssets) {
        const values = cross.map(r => r.value)
        const med = median(values)
        // ROBUST scale. With mean/stdev the outliers inflate the very yardstick
        // meant to find them (the measured ENA case scores ~1.3 sigma that way).
        const mad = median(values.map(v => Math.abs(v - med)))
        const scale = Math.max(1.4826 * mad, o.standoutFloor)
        const seen = new Map()
        let best = null
        for (const r of cross) {
            const dev = r.value - med
            const z = Math.abs(dev) / scale
            const reading = { symbol: r.symbol, value: r.value, dev, z, med }
            seen.set(r.symbol, reading)
            if (z < o.standoutZ) continue
            if (Math.abs(dev) < o.standoutMinMove) continue
            if (!best || z > best.z) best = reading
        }
        if (best) {
            // Look up the asset's price from the raw rows so the line can carry it.
            const priceRow = rows.find(r => r.symbol === best.symbol)
            signals.push(standoutSignal(best, o.standoutWindow, o.standoutEpsilon, priceRow?.price ?? null))
        }

        // An ENDING. A standout we actually spoke about, now visible again and back
        // inside the field, is its own piece of news — said once (selectOffer forgets
        // the standout when it offers this) and never repeated.
        for (const key of o.offers?.keys() ?? []) {
            if (!key.startsWith(STANDOUT_PREFIX) || key.endsWith(":over")) continue
            const reading = seen.get(key.slice(STANDOUT_PREFIX.length))
            if (!reading) continue               // cannot see it: silence, not an ending
            if (reading.z >= o.standoutZ && Math.abs(reading.dev) >= o.standoutMinMove) continue
            signals.push(standoutOverSignal(reading, o.standoutWindow, key))
        }
    }

    // --- 3. Horizon disagreement ------------------------------------------
    const hour = column(rows, "change1h")
    if (hour.length >= o.minAssets && day.length >= o.minAssets) {
        const medHour = median(hour.map(r => r.value))
        const medDay = median(day.map(r => r.value))
        if (opposed(medHour, medDay) && Math.abs(medHour) >= o.fieldTurn1h && Math.abs(medDay) >= o.turn24h) {
            signals.push(fieldTurnSignal(medHour, medDay, o.turnEpsilon))
        }
    }
    let turn = null
    for (const a of rows) {
        const h = a.change1h, d = a.change24h
        if (h == null || d == null) continue
        if (!opposed(h, d)) continue
        if (Math.abs(h) < o.turn1h || Math.abs(d) < o.turn24h) continue
        if (!turn || Math.abs(h) > Math.abs(turn.hour)) turn = { symbol: a.symbol, hour: h, day: d, price: a.price ?? null }
    }
    if (turn) signals.push(turnSignal(turn, o.turnEpsilon))

    // --- 4. Volume / price divergence --------------------------------------
    let pressure = null
    for (const a of rows) {
        if (a.volume1h == null || a.volume24h == null) continue
        const ratio = a.volume1h / (a.volume24h / 24)
        if (!Number.isFinite(ratio) || ratio < o.volumeRatio) continue
        if (a.change1h == null || Math.abs(a.change1h) > o.volumeFlat) continue
        if (!pressure || ratio > pressure.ratio) pressure = { symbol: a.symbol, ratio, move: a.change1h, price: a.price ?? null, volume1h: a.volume1h, volume24h: a.volume24h }
    }
    if (pressure) signals.push(pressureSignal(pressure, o.pressureEpsilon))

    signals.sort((a, b) => b.salience - a.salience)
    return { breadth, breadthState, signals }
}

/** The readings of one change field, sentinel rows already dropped by parseStats. */
function column(rows, field) {
    const out = []
    for (const r of rows) {
        const v = r[field]
        if (v == null || !Number.isFinite(v) || v <= ABSENT) continue
        out.push({ symbol: r.symbol, value: v })
    }
    return out
}

function median(values) {
    if (!values.length) return 0
    const s = [...values].sort((a, b) => a - b)
    const mid = s.length >> 1
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Signs genuinely oppose — a zero leg is not a disagreement, it is a standstill. */
function opposed(a, b) {
    return (a > 0 && b < 0) || (a < 0 && b > 0)
}

function band(value) {
    return Math.max(SALIENCE_MIN, Math.min(SALIENCE_MAX, value))
}

const pct = n => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`

// --- the felt lines. World-facing, first person, present tense. -------------

function breadthSignal(state, breadth, count, medianDay) {
    const green = Math.round(breadth * 100)
    // A flip of the whole field is the loudest thing this sense can feel: the top
    // of the band, and it still cannot preempt (0.75 * 0.9 = 0.675 < 1).
    const salience = band(0.75)
    const medPart = medianDay != null ? ` The middle of the field is ${pct(medianDay)} on the day.` : ""
    const line = state === "up"
        ? `Most of what I can see has turned green at once — ${green} out of every hundred are up on the day now.${medPart} The whole field is lifting, not one thing standing in it.`
        : `The green has drained out of the field while I watched — only ${green} in a hundred are still up on the day.${medPart} Everything is leaning the same way, and the way is down.`
    return {
        kind: "breadth", changeKey: `market:breadth:${state}`, salience, line,
        edge: true, value: breadth, epsilon: 0,     // edge-triggered: never value-suppressed
        detail: { breadth, count, medianDay },
    }
}

function standoutSignal(best, window, epsilon, price) {
    const horizon = HORIZON_WORDS[window] || window
    // 0.55 at the threshold, climbing with how far out of line it is.
    const salience = band(0.55 + (best.z - 3) * 0.05)
    const pricePart = price != null ? ` at $${price.toFixed(2)}` : ""
    const line = best.dev > 0
        ? `${best.symbol}${pricePart} is going somewhere on its own — ${pct(best.value)} ${horizon} while everything around it sits near ${pct(best.med)}. Whatever is happening is happening to it and to nothing else I can see.`
        : `${best.symbol}${pricePart} is falling out from under the rest — ${pct(best.value)} ${horizon} while the field around it holds near ${pct(best.med)}. It is coming apart alone.`
    return {
        kind: "standout",
        changeKey: `${STANDOUT_PREFIX}${best.symbol}`,
        salience,
        line,
        // The tracked value is the asset's own move in percentage points: that is the
        // number a reader would call "the fact", and it is what drifted 1.2pp across
        // the live window without ever being new.
        value: best.value,
        epsilon,
        detail: { symbol: best.symbol, value: best.value, median: best.med, z: best.z, window, price },
    }
}

/** The standout is over: back in the field, and said exactly once. */
function standoutOverSignal(reading, window, forKey) {
    const horizon = HORIZON_WORDS[window] || window
    const line = `${reading.symbol} has come back in among the others — ${pct(reading.value)} ${horizon}, which is about where everything else is. Whatever was carrying it has let go.`
    return {
        kind: "standout-over",
        changeKey: `${forKey}:over`,
        salience: band(0.5),
        line,
        edge: true,                 // fires once: offering it forgets `forKey`
        value: reading.value,
        epsilon: 0,
        forgets: forKey,
        detail: { symbol: reading.symbol, value: reading.value, median: reading.med, window },
    }
}

function fieldTurnSignal(medHour, medDay, epsilon) {
    const dir = medHour > 0 ? "up" : "down"
    const salience = band(0.6 + Math.min(0.1, Math.abs(medHour) / 10))
    const line = medHour > 0
        ? `The day has been going one way — the middle of the field is ${pct(medDay)} — and in the last hour it has turned and started coming back, ${pct(medHour)}. Something has changed its mind out there, and the day has not caught up yet.`
        : `The whole field is up on the day, ${pct(medDay)} through the middle of it, but the last hour is pulling the other way at ${pct(medHour)}. The lift is coming apart while I watch it.`
    return {
        kind: "turn", changeKey: `market:turn:field:${dir}`, salience, line,
        value: medHour, epsilon,                   // the fresh leg is the fact
        detail: { medHour, medDay },
    }
}

function turnSignal(turn, epsilon) {
    const salience = band(0.5 + Math.min(0.15, Math.abs(turn.hour) / 20))
    const pricePart = turn.price != null ? ` at $${turn.price.toFixed(2)}` : ""
    const line = turn.hour > 0
        ? `${turn.symbol}${pricePart} has been sinking all day, ${pct(turn.day)}, and in the last hour it has turned and started climbing, ${pct(turn.hour)}. If that holds it is a bottom; I will find out whether I was right.`
        : `${turn.symbol}${pricePart} carried the day at ${pct(turn.day)} and has spent the last hour giving it back, ${pct(turn.hour)}. The day says up and the hour says down, and the hour is the newer news.`
    return {
        kind: "turn",
        changeKey: `market:turn:${turn.symbol}`,
        salience,
        line,
        value: turn.hour,
        epsilon,
        detail: { symbol: turn.symbol, hour: turn.hour, day: turn.day, price: turn.price ?? null },
    }
}

function pressureSignal(p, epsilon) {
    // The quietest of the four: something that has NOT happened yet.
    const salience = band(0.45 + Math.min(0.15, (p.ratio - 2) * 0.03))
    const pricePart = p.price != null ? ` at $${p.price.toFixed(2)}` : ""
    const volPart = p.volume1h != null ? ` — $${(p.volume1h / 1e6).toFixed(1)}M in the last hour vs $${((p.volume24h ?? 0) / 24 / 1e6).toFixed(1)}M ordinary` : ""
    const line = `${p.symbol}${pricePart} is changing hands far harder than it usually does — something like ${p.ratio.toFixed(1)} times its ordinary hour${volPart} — and the price has barely moved, ${pct(p.move)}. Something is pressing on it and nothing has given way.`
    return {
        kind: "pressure",
        changeKey: `market:pressure:${p.symbol}`,
        salience,
        line,
        value: p.ratio,
        epsilon,
        detail: { symbol: p.symbol, ratio: p.ratio, move: p.move, price: p.price ?? null, volume1h: p.volume1h, volume24h: p.volume24h },
    }
}

/**
 * Choose the strongest signal that is still allowed to be said, and remember it.
 *
 * Pure but for one deliberate mutation: `memory` is written ONLY on the branch that
 * returns a signal. That is the whole discipline — the comparison is always against
 * the last thing actually spoken, so drift cannot creep past an epsilon in
 * hundredths, and a suppressed signal never quietly updates the yardstick.
 *
 * A suppressed leader does not silence the poll: the loop falls through to the next
 * candidate, so something genuinely new is heard even while a standing fact is quiet.
 *
 * @param {Array} signals - candidates, strongest first (marketWeather sorts them)
 * @param {Map} memory - changeKey -> { value, at }
 * @param {{cooldownMs?: number, now?: number}} [opts]
 * @returns {object|null} the signal to offer, or null for silence
 */
export function selectOffer(signals, memory, { cooldownMs = DEFAULT_COOLDOWN_MS, now = Date.now() } = {}) {
    for (const signal of signals || []) {
        if (!signal.edge) {
            const prior = memory.get(signal.changeKey)
            if (prior) {
                const moved = Math.abs(signal.value - prior.value) >= (signal.epsilon ?? 0)
                const cooled = now - prior.at >= cooldownMs
                if (!moved && !cooled) continue          // already said, still true, still recent
            }
        }
        memory.set(signal.changeKey, { value: signal.value, at: now })
        // An ending retires the fact it ended, so a recurrence is new again — and so
        // the ending itself cannot be detected a second time.
        if (signal.forgets) memory.delete(signal.forgets)
        return signal
    }
    return null
}

const STANDOUT_PREFIX = "market:standout:"

const HORIZON_WORDS = {
    "1h": "in the last hour",
    "4h": "since this morning",
    "24h": "across the day",
    "7d": "across the week",
    "30d": "across the month",
    "90d": "across the season",
}

A.define("m-stereotic-market", MStereoticMarket)
