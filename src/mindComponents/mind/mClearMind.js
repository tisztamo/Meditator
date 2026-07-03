import A from "amanita"
import { MObserver } from "./mObserver.js"
import { makePhrasebook } from "../shared/i18n.js"
import { logger } from '../../infrastructure/logger.js';

const log = logger('mClearMind.js');

/**
 * What m-clear-mind says, as a localizable phrase (i18n.js). The English default is a
 * content-free redirect; a non-English mind overrides it with <m-phrase for="redirect">.
 * The breaker owns ONLY this continuation — the act of clearing (the prefix
 * "I realize I have been going over the same ground…") is owned by the mechanism on
 * m-mind, so every breaker shares the same clearing and supplies its own tail, with zero
 * phrase-sharing between breakers (loop-detection-redesign.md §break).
 */
const CLEAR_PHRASES = {
    en: {
        redirect: ["I'll take up one of the other threads I have been carrying, and start there."],
    },
}

/**
 * m-clear-mind — the DEFAULT breaker, the floor. It subscribes to m-loop-detector's `loop`
 * signal and, when a loop is active, bids a LOW salience to clear the mind and pick up
 * another thread. It guarantees a break is always available even when nothing is worth
 * recalling — a richer breaker (m-resurface) bids higher and wins when it has something, and
 * this floor takes the cut when it does not.
 *
 * It is a BREAKER, not a detector: it never decides whether the mind is looping (that is the
 * detector's job). It only reacts to the published signal and bids through the ordinary
 * attention arbiter — loop-recovery IS attention. Its bid carries `clearsTail`, so the
 * arbiter admits it past threshold + rate-limit (without preempting), and `episode`
 * (= the detection's timestamp), so co-bidding breakers resolve to exactly one cut.
 *
 * Wire it as a direct child of the mind alongside the detector:
 *   <m-clear-mind name="clear-mind" salience="0.5" cooldown="0ms"></m-clear-mind>
 *
 * @interface (plus MObserver's)
 * Attributes:
 *   - salience: bid salience (default 0.5 — low, so a substantive breaker outbids it)
 *   - loopSrc: the detector's loop topic (default: the mind's m-loop-detector `<name>/loop`,
 *     auto-discovered; "off" disables)
 *   - cooldown: minimum time between bids (default "0ms" — the per-episode guard is the real
 *     one, so a fresh loop is never throttled away)
 */
export class MClearMind extends MObserver {
    _lastEpisode = null

    onObserverConnect() {
        // Loop-break bids are gated per-episode (below) + deduped in m-mind, so the
        // observer cooldown only gets in the way — default it to none unless the archml
        // asks for a throttle. (MObserver's own default is 60s, too slow for a fresh loop.)
        if (this.getAttribute("cooldown") == null) this.setAttribute("cooldown", "0ms")

        const det = this.closest("m-mind")?.querySelector("m-loop-detector[name]")
        const detName = det?.getAttribute("name")
        const loopSrc = this.attr("loopSrc") || (detName ? `..m-mind/${detName}/loop` : null)
        if (loopSrc && loopSrc !== "off") this.sub(loopSrc, loop => this._onLoop(loop)).catch(() => {})
    }

    _onLoop(loop) {
        if (!loop || !loop.active) return
        // One bid per detection: `pub` replays its last value to a late subscriber, and a
        // single ongoing loop may be re-published — the episode guard keeps us from bidding
        // twice for the same cut (m-mind also dedups, but a clean bid stream is kinder).
        if (loop.at && loop.at === this._lastEpisode) return
        this._lastEpisode = loop.at || null

        const book = (this.__book ||= makePhrasebook(this, CLEAR_PHRASES))
        const raised = this.raise(book.line("redirect"), {
            salience: Number(this.attr("salience") || 0.5),
            clearsTail: true,
            episode: loop.at || null,
            kind: loop.kind || null,
        })
        if (raised) log.debug(`floor bid to clear (loop ${loop.kind} ${(loop.score * 100).toFixed(0)}%)`)
    }
}

A.define('m-clear-mind', MClearMind);
