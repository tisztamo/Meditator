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
 * @returns {Promise<string>} the response body
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
        if (entry.promise) return entry.promise
        if (typeof entry.text === "string") return entry.text
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
    return text
}

/** Forget everything. For tests, which must not inherit one test's bytes. */
export function resetStereoticCache() {
    cache.clear()
}
