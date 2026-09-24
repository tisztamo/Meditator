/**
 * stereoticFeed — one module-level fetch cache shared by every stereotic sense.
 *
 * WHY THIS EXISTS. The stereotic price surface is ONE document listing every
 * asset (https://stereotic.com/data/stats/top100_stat.json — 67 assets today).
 * The mind, however, wants one sense ELEMENT per watched ticker: an element per
 * asset is the honest shape, because each asset is its own channel of the
 * outside and the membrane can soften, narrow, or close BTC without touching
 * ETH. Those two facts pull against each other: N per-ticker senses polling on
 * their own jittered clocks would issue N HTTP requests for a document that is
 * byte-identical for all of them.
 *
 * So the senses do not fetch. They ask this module for the text, and it fetches
 * at most once per publish tick per URL, no matter how many senses ask.
 *
 * THE MEASURED TICK. The live surface republishes on a hard ~100 second tick
 * (measured inter-publish gaps: 100, 100, 100, 101 s), repricing 55-58 of its
 * 67 assets each time. `ttlMs` therefore defaults to 100000 ms: a second poll
 * inside one tick can only ever return the bytes we already hold, so serving it
 * from memory loses no information and costs the far end nothing.
 *
 * IN-FLIGHT DE-DUPLICATION. A TTL alone is not enough. Senses wake within
 * milliseconds of each other, so with a plain "cache after the response lands"
 * scheme every sense would start its own request before the first one returned.
 * The promise itself is therefore cached, the moment the request starts, and
 * every caller in that window awaits the SAME promise.
 *
 * FAILURE IS NOT CACHED. A failed fetch throws to the caller (MSense swallows
 * and logs it — a sense going quiet must never crash the mind) and leaves no
 * entry behind, so the next tick retries rather than serving a remembered
 * error for the rest of the TTL. The consequence is deliberate: during an
 * outage each polling sense does retry separately, because there is no shared
 * bytes to share. Rate-limiting an outage is not this module's job.
 *
 * LIMITATIONS, honestly. There is no LRU and no size bound: the key space is
 * the handful of URLs an architecture names, and entries are overwritten in
 * place, so it cannot grow. There is no conditional request (no ETag /
 * If-Modified-Since): the surface is small and the TTL already matches its
 * publish rate, so a 304 would save little and add a branch that tests cannot
 * exercise offline. Dependency-free on purpose — it is `fetch` and a Map.
 */

import fs from "node:fs"
import path from "node:path"
import { mindHome } from "../../../src/infrastructure/memoryVault.js"
import { logger } from "../../../src/infrastructure/logger.js"

const log = logger("stereoticFeed.js")

const cache = new Map()   // url -> { at: epoch ms, ttlMs, text } | { at, ttlMs, promise }

/**
 * Fetch a stereotic surface as text, at most once per `ttlMs` per URL.
 *
 * @param {string} url
 * @param {{ttlMs?: number, timeoutMs?: number, agent?: string}} [opts]
 *   - ttlMs: how long one response's bytes are reused (default 100000, the
 *     measured publish tick)
 *   - timeoutMs: abort an individual request after this long (default 8000)
 *   - agent: user-agent sent to the far end (identifies us honestly)
 * @returns {Promise<{text: string, fresh: boolean}>} the response body, and `fresh`
 *   — true when the bytes came from a network fetch this call, false when served from
 *   the in-window cache (so a caller that wants to persist the snapshot writes only on
 *   a real fetch, not once per sense per tick).
 * @throws on a network error or a non-2xx status; nothing is cached in that case
 */
export async function fetchStereoticText(url, {
    ttlMs = 100000,
    timeoutMs = 8000,
    agent = "Meditator/0 (+stereotic sense)",
} = {}) {
    if (!url) throw new Error("stereotic feed: no url")
    const window = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 100000
    const now = Date.now()

    const entry = cache.get(url)
    if (entry && now - entry.at < window) {
        // Either the bytes from this tick, or the request that is fetching them
        // right now. Both are the same answer; the second caller just waits.
        if (entry.promise) {
            const text = await entry.promise
            return { text, fresh: false }
        }
        return { text: entry.text, fresh: false }
    }

    const promise = (async () => {
        const res = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
            headers: { "user-agent": agent },
        })
        if (!res.ok) throw new Error(`stereotic feed ${res.status}`)
        return await res.text()
    })()

    // Published BEFORE the first await returns, so a sense that wakes one tick
    // of the event loop later joins this request instead of starting another.
    cache.set(url, { at: now, ttlMs: window, promise })

    let text
    try {
        text = await promise
    } catch (error) {
        // Do not poison the cache with a failure: drop the entry (unless a
        // later, successful poll has already replaced it) and let the caller see
        // the error.
        const current = cache.get(url)
        if (current && current.promise === promise) cache.delete(url)
        throw error
    }
    const current = cache.get(url)
    if (current && current.promise === promise) cache.set(url, { at: current.at, ttlMs: window, text })
    return { text, fresh: true }
}

/** Forget everything. For tests, which must not inherit one test's bytes. */
export function resetStereoticCache() {
    cache.clear()
}

/**
 * Write the raw bytes a sense just fetched into the MIND's shared workspace, so the
 * data analyst (the `data` subagent hand) can analyse them instead of re-fetching.
 *
 * WHY HERE. The senses are the only thing that touches the live feed; the analyst has
 * no business fetching (its sandbox is network-off) — it computes from what the senses
 * already pulled. `mindHome(this, "workspace")` from a sense is the MIND's workspace
 * (the senses sit directly in <m-mind>), and the agent's terminal + file tools default
 * to that SAME directory, so both sides share one desk with no path coupling.
 *
 * A pure SIDE CHANNEL: a write failure (disk, permissions) must never break the sense's
 * percept, so it logs and swallows. Best-effort, synchronous — the bytes are small and
 * the write is once per publish tick per URL, not per percept.
 *
 * @param {object} el  a sense element (resolves the enclosing mind's workspace)
 * @param {string} text the raw response body just fetched
 * @param {string} file the snapshot filename (e.g. "top100_stat.json")
 */
export function writeStereoticSnapshot(el, text, file) {
    if (!text) return
    try {
        const dir = mindHome(el, "workspace")
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, file), text)
    } catch (error) {
        log.warn(`stereotic snapshot write failed (${file}): ${error?.message || error}`)
    }
}
