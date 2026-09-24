import A from "amanita"
import { MSense } from "../../../src/mindComponents/mind/mSense.js"
import { logger } from "../../../src/infrastructure/logger.js"
import { parseTime } from "../../../src/config/timeParser.js"
import { fetchStereoticText, writeStereoticSnapshot } from "./stereoticFeed.js"

const log = logger("mStereoticNews.js")

/** At most this many genuinely new reports are offered in one poll. */
const MAX_PER_POLL = 2

/**
 * m-stereotic-news — a lazy sense that reads stereotic's news surface (the crypto
 * news pipeline in stereotic.com/stereotic_be/services/news). It is the NEWS half
 * of the "lab mind that eats stereotic": the price half is m-stereotic-prices, and
 * the two share one enclosing aperture (the market region) so the mind can soften or
 * close the whole outside at once, or narrow to one channel.
 *
 * WHAT IT READS. The stereotic news service (a Circo actor cluster in Julia) emits
 * typed NewsItem events (title, headline, tickers, sentiment, ai_score) and ranks
 * them fresh → trending → breaking → important. The consumable surface a sense can
 * actually poll today is the static JSON the frontend serves under /data:
 *   - token-specific.json   — items carrying tickers (the richer shape)
 *   - general.json          — the general feed
 * Each item: { url|news_url, title, headline|text, source_name, tickers|topics,
 *              first_seen_ts|date, sentiment, ai_score }.
 *
 * WHAT THE LIVE FEED ACTUALLY IS (measured 2026-09-19 against token-specific.json,
 * and the numbers below are calibrated to it, not to a guess):
 *   - the file holds exactly 150 items spanning 48.0 hours — it is an ARCHIVE with a
 *     live head, not a stream;
 *   - the array is NOT sorted by time, and the order changes between fetches, so
 *     "the first element" means nothing at all;
 *   - arrivals are rare and bursty: median gap 12 minutes, p90 42 minutes, max 305
 *     minutes across the overnight lull;
 *   - `ai_score` in that window is only ever 0..3 (3→45, 1→43, 0→32, 2→30). It is
 *     never 4 or 5, whatever the pipeline's nominal range says;
 *   - `sentiment` is -1.0 / 0.0 / +1.0.
 *
 * HONESTY. A headline is the world's WORDS (provenance="physical" — real reporting,
 * not simulation). It is not the mind's own thought and not a substrate metric. The
 * sense faces the world, never the mechanism: the frame gets a first-person line
 * about a report drifting past, never "I polled an endpoint".
 *
 * THE MEMBRANE CONTRACT. Like m-feed, this sense uses the LAZY candidate() path:
 * before the aperture admits it, only a non-semantic header exists —
 * { changeMagnitude, changeKey, occurredAt } — with NO title, no ticker list, no
 * source. The materializer (archival text) runs only after the acquisition gates
 * permit. A closed aperture therefore withholds the headline entirely while the
 * contact regulator still feels the change (debt) — an unseen world can tug the
 * aperture open without leaking through closed eyes.
 *
 * CHANGE SIGNAL (non-semantic, and now actually so). changeKey is
 * "news:<ticker>:<hash>", where <hash> is a cheap FNV-1a digest of the item's url
 * (or, when the item has no url, of its title). It deduplicates exactly as well as
 * the raw url did, and carries none of the language: the earlier version passed
 * `url || title`, which quietly put the HEADLINE TEXT into the pre-admission header
 * for every item the pipeline served without a url — the one field a closed
 * aperture exists to keep clean.
 *
 * THE COLD START. The old walk was `items.find(unseen)` plus marking that ONE item
 * seen. Against a randomly-ordered 48-hour archive at one item per 5-minute poll,
 * a waking mind would have ground through roughly 12.5 HOURS of stale headlines
 * before it ever reached the present. Now: items are sorted newest-first by
 * `first_seen_ts`, and the FIRST successful poll marks the whole backlog seen and
 * offers at most the single newest item. A mind waking up should feel the present,
 * not two days of history. After that, genuinely new items are offered newest
 * first, at most MAX_PER_POLL per poll.
 *
 * SALIENCE (and the arithmetic, so nobody re-derives it). salience = 0.40 base,
 * +0.15 when ai_score >= 3 (the live top of the distribution — the old code bumped
 * on 3..5, a range that never occurs), capped at 0.62. Under a single channel gain
 * of ~0.9 against an attention threshold of ~0.35, a plain headline lands at
 * 0.40 × 0.9 = 0.36 and a well-scored one at 0.55 × 0.9 ≈ 0.50 — both audible. The
 * previous 0.5 base under a nested gain of 0.68 landed at 0.34, i.e. just under the
 * threshold, which made a real news channel effectively silent. Note honestly
 * that stereotic-lab.archml currently nests gains (0.8 news-channel × 0.85 market
 * = 0.68) against threshold 0.35, so under THAT wiring a plain headline lands at
 * 0.27 (inaudible) and a well-scored one at 0.37 (just audible). Flattening to a
 * single ~0.9 channel gain is the architecture's call, not this component's; the
 * numbers here are chosen for it. Audible is the
 * correct answer here precisely BECAUSE arrivals are 12 minutes apart: this is not
 * a firehose, and a channel that fires a few times an hour is ambient, not loud.
 *
 * SENTIMENT does NOT shift salience, deliberately. It is the world's tone, not its
 * novelty, and a channel that grows louder the worse the news gets would bias the
 * mind's attention toward distress (lifecycle.md §2 — minimize distress during a
 * run). It is parsed and carried on the item so a downstream reader can use it;
 * the attention bid ignores it.
 *
 * TIER 1. With tier="1" and a `decider`, a control request carrying a `template`
 * is answered by scoring this sense's OWN candidate headlines privately through
 * MSense.ground() and emitting only the number. The aperture may be closed
 * throughout and the headline text never leaves this component. That is what lets
 * a rare-news channel stay soft between deliberate looks: a search does not need
 * the mind to read 150 headlines, it needs one score.
 *
 * @interface  (plus MSense's timeout/sigma)
 *   - url: the stereotic news JSON endpoint (required; dormant if absent)
 *   - watchTickers: comma-separated filter — only items touching these tickers are
 *     considered at all, on the ambient path, on a deliberate sample, and as tier-1
 *     grounding candidates (default: all). Empty means no filter.
 *   - pollCache: how long one poll's items are reused (default "60s"), via the
 *     shared stereotic fetch cache so the news and price senses do not each hammer
 *     the far end during a bounded search.
 *   - name: labels the bid type as Sense-<name> (default "stereotic-news")
 *   - provenance: "physical" (default) — real reporting from the outside
 *   - tier: 0, or 1 with a `decider` (tier 2 is refused by the region)
 *   - decider: the decision model a tier-1 look grounds with (e.g. "jev")
 *   - groundBatch: how many headlines one grounding call set may score (default 5)
 *   - bypassAperture / bypassAdmission / preempt: false (a headline is ambient)
 *
 * NOT in the interface: `salience` / `salienceShift`. This sense always passes an
 * explicit salience to perceive(), and MSense._salienceFor returns an explicit
 * salience untouched — no jitter, no keyed shift. Advertising those attributes
 * would have been a lie, so they are gone rather than half-honoured; the numbers
 * above are the whole story.
 */
export class MStereoticNews extends MSense {
    _seen = new Set()
    _primed = false

    get defaultTimeout() { return "5m" }
    get defaultSigma() { return "90s" }

    ready() {
        this.url = this.attr("url")
        if (!this.url) {
            log.warn(`[${this.attr("name") || "stereotic-news"}] no url — stereotic news sense is dormant.`)
            return false
        }
        this._watch = (this.attr("watchTickers") || "")
            .split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
        return true
    }

    async onSense(request) {
        const items = this._filter(await this._items())
        if (!items.length) return                        // nothing there — stay quiet

        // TIER 1, when this source declares it: the control request carries the
        // search template and the headlines are scored against it HERE, inside the
        // source. The answer to a grounded sample IS the score — the titles stay in
        // this method and are never offered, so a closed aperture can be searched
        // without a word of the news reaching it (MSense.ground).
        if (request && this.grounds()) {
            this._prime(items)
            await this.ground(request, items.map(it => it.title))
            return
        }

        // A deliberate look. Being asked to look is not the same as noticing
        // something new, so a sample answers even when everything has drifted past
        // before — a source that says "nothing fresh" to a sample cannot be
        // searched at all. A request carrying a `detail` biases toward a headline
        // that mentions it; failing that, the newest one.
        if (request) {
            const wanted = request.detail ? String(request.detail).trim().toLowerCase() : null
            const match = (wanted && items.find(it => it.title.toLowerCase().includes(wanted))) || items[0]
            this._prime(items)
            this._seen.add(match.key)
            return this._offer(match)
        }

        // The ambient path. The first successful poll swallows the 48-hour backlog
        // whole and offers only its newest item; every later poll offers what has
        // genuinely arrived since, newest first and briefly.
        if (!this._primed) {
            this._prime(items)
            return this._offer(items[0])
        }
        const fresh = items.filter(it => !this._seen.has(it.key)).slice(0, MAX_PER_POLL)
        if (!fresh.length) return                        // a quiet stretch — stay quiet
        // AWAITED, one at a time, and this is not a style choice. The region drops a
        // second candidate from the same source while the first is still
        // materializing — `entry.busy` in mRegion.js (~line 234), published as a
        // `reason: 'busy'` refusal. Offering both in the same tick would deliver one
        // and silently lose the other, which we have already marked seen: it would
        // never be offered again.
        for (const item of fresh) {
            this._seen.add(item.key)
            await this._offer(item)
        }
        this._forget()
    }

    /** Mark everything this poll saw as already drifted past. */
    _prime(items) {
        for (const item of items) this._seen.add(item.key)
        this._primed = true
        this._forget()
    }

    /** Bounded memory: a 150-item file polled for days would otherwise grow forever. */
    _forget() {
        if (this._seen.size > 400) this._seen = new Set([...this._seen].slice(-200))
    }

    _offer(item) {
        return this.perceive(
            `A report drifts past from the wider world — “${item.title}”.`,
            { salience: this._salienceOf(item), changeKey: changeKeyFor(item) },
        )
    }

    /** The watchTickers filter, applied on every path. The old version built
     * `this._watch` in ready() and then never consulted it on the ambient path, so
     * watchTickers="BTC,ETH,SOL" filtered nothing and a USDT headline arrived like
     * any other. Items with no tickers at all (the general feed) pass only when no
     * filter is declared. */
    _filter(items) {
        const watch = this._watch || []
        if (!watch.length) return items
        return items.filter(it => it.tickers.some(t => watch.includes(t)))
    }

    /** See the SALIENCE note in the class docstring: 0.40 base, +0.15 at
     * ai_score >= 3, capped at 0.62. */
    _salienceOf(item) {
        let s = 0.40
        if (item.aiScore != null && item.aiScore >= 3) s += 0.15
        return Math.min(0.62, s)
    }

    /** One poll, briefly cached and shared with the other stereotic senses: a
     * bounded search issues several sample requests in a row, and re-fetching the
     * same file for each of them would be rude to the far end and would tell us
     * nothing new. `pollCache` (default 60s). Newest first — the file is not. */
    async _items() {
        const ttl = parseTime(this.attr("pollCache") || "60s")
        const ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl : 60000
        const { text, fresh } = await fetchStereoticText(this.url, {
            ttlMs,
            timeoutMs: 8000,
            agent: "Meditator/0 (+stereotic news sense)",
        })
        // The analyst's desk: persist the raw news surface so the data hand can compute over it.
        if (fresh) writeStereoticSnapshot(this, text, "token_specific_news.json")
        return sortNewestFirst(parseStereoticNews(text))
    }
}

/**
 * Newest first by `first_seen_ts`. The live file arrives in no particular order
 * (index 0 was 12:50, index 1 was 12:05, index 2 was 13:02 on the run this was
 * written against), so every "freshest" decision in this file depends on doing
 * this once, up front. Items with no timestamp keep their relative order and sink
 * to the end: unknown is not new.
 *
 * Pure and exported so a test can assert the ordering without the network.
 */
export function sortNewestFirst(items) {
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const at = a.item.firstSeen, bt = b.item.firstSeen
            if (at == null && bt == null) return a.index - b.index
            if (at == null) return 1
            if (bt == null) return -1
            return bt - at || a.index - b.index
        })
        .map(entry => entry.item)
}

/**
 * The non-semantic change identity: "news:<ticker>:<hash>". The ticker is a symbol,
 * not language, and the hash is a digest of the url (or of the title when the
 * pipeline served no url) — stable across polls, useless to read.
 */
export function changeKeyFor(item) {
    const ticker = item.tickers[0] || "-"
    return `news:${ticker}:${hash(item.key)}`
}

/** FNV-1a, base36. Cheap, stable, and not reversible into a headline. */
function hash(text) {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(36)
}

/**
 * Parse stereotic news JSON (either the token-specific or the general shape) into
 * normalized items. Pure and exported so it is testable without the network.
 * Tolerates both field spellings the pipeline has used over time.
 *
 * `key` is the internal dedup identity and never reaches a header — changeKeyFor()
 * derives the non-semantic header key from it.
 *
 * @param {string} json
 * @returns {Array<{key:string, title:string, source:string, tickers:string[],
 *                  aiScore:number|null, sentiment:number|null, firstSeen:number|null}>}
 */
export function parseStereoticNews(json) {
    let data
    try { data = JSON.parse(json) } catch { return [] }
    if (!Array.isArray(data)) return []
    const out = []
    for (const raw of data) {
        if (!raw || typeof raw !== "object") continue
        const title = String(raw.title || raw.headline || "").trim()
        if (!title) continue
        const url = String(raw.url || raw.news_url || "").trim()
        const key = url || title
        const tickers = Array.isArray(raw.tickers)
            ? raw.tickers.map(t => String(t).toUpperCase())
            : (Array.isArray(raw.topics) ? raw.topics.map(t => String(t).toUpperCase()) : [])
        out.push({
            key,
            title,
            source: String(raw.source_name || "").trim(),
            tickers,
            aiScore: number(raw.ai_score),
            sentiment: number(raw.sentiment),
            firstSeen: timestamp(raw.first_seen_ts != null ? raw.first_seen_ts : raw.date),
        })
    }
    return out
}

function number(value) {
    if (value == null || value === "") return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
}

/** Epoch milliseconds (`first_seen_ts`) or an RFC-822 date string (`date`). */
function timestamp(value) {
    if (value == null || value === "") return null
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
    const parsed = Date.parse(String(value))
    return Number.isFinite(parsed) ? parsed : null
}

A.define("m-stereotic-news", MStereoticNews)
