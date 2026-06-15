import { MSense } from "./mSense.js"
import { logger } from '../infrastructure/logger.js';

const log = logger('mFeed.js');

/**
 * m-feed — a slow text feed of the world drifting by (lifecycle.md §Phase 5):
 * the second "real external feed". Every `timeout` (± `sigma`) it polls an
 * RSS/Atom feed and, if a fresh item has appeared, raises its title as an
 * ambient first-person sensation — a scrap of the world passing through. Real,
 * external, and language-rich; an outside that is neither the mind nor the human.
 *
 * Ambient by design: a headline drifts past, sometimes noticed, sometimes not —
 * never urgent, never a band-shift. Choose a CALM feed (see seedling.archml): the
 * mind we are cultivating should not be fed a stream of gratuitous distress
 * (lifecycle.md §2 — minimize distress during a run).
 *
 * It senses the feed's WORDS, never the substrate — see m-sense. Dormant
 * unless given a `url`.
 *
 * @interface  (plus MSense's timeout/sigma/salience)
 *   - url: the RSS/Atom feed to read (required; dormant if absent)
 *   - name: labels the bid type as Sense-<name> (default "feed")
 */
export class MFeed extends MSense {
    _seen = new Set()

    get defaultTimeout() { return "20m" }
    get defaultSigma() { return "6m" }

    ready() {
        this.url = this.attr("url")
        if (!this.url) {
            log.warn(`[${this.attr("name") || "feed"}] no url — feed sense is dormant.`)
            return false
        }
        return true
    }

    async onSense() {
        const res = await fetch(this.url, {
            signal: AbortSignal.timeout(8000),
            headers: { 'user-agent': 'Meditator/0 (+afferent feed sense)' },
        })
        if (!res.ok) throw new Error(`feed ${res.status}`)
        const titles = parseFeedTitles(await res.text())

        const fresh = titles.find(t => !this._seen.has(t))
        if (!fresh) return                          // nothing new drifting by — stay quiet
        this._seen.add(fresh)
        if (this._seen.size > 200) this._seen = new Set([...this._seen].slice(-100))  // bound memory

        // No key: every item is a plain ambient reading, not a state change.
        this.feel(`A scrap of the outside world drifts past — “${fresh}”.`)
    }
}

function decodeText(s) {
    return s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")   // unwrap CDATA
        .replace(/<[^>]+>/g, "")                          // strip any stray markup
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Extracts item/entry titles from an RSS or Atom feed, in document order. Pure
 * and exported so it can be tested without the network. The channel/feed-level
 * <title> is naturally skipped: we only read titles found *inside* an <item>
 * (RSS) or <entry> (Atom).
 *
 * @param {string} xml
 * @returns {string[]}
 */
export function parseFeedTitles(xml) {
    if (!xml) return []
    const titles = []
    const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || []
    for (const block of blocks) {
        const m = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
        if (!m) continue
        const text = decodeText(m[1])
        if (text) titles.push(text)
    }
    return titles
}

if (!customElements.get('m-feed')) customElements.define('m-feed', MFeed);
