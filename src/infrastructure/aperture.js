import { clamp01 } from './percept.js';

/** Deterministic, afferent-only regulator. No timers, thought inspection, or model calls.
 * Call advance at awake burst boundaries and observe with private detector headers.
 * Constants are deliberately provisional experiment settings, not a tuning framework.
 */
export class Aperture {
    constructor({ state = 'open', now = Date.now(), dwellMs = 30000, horizonMs = 600000 } = {}) {
        if (!['open', 'soft', 'closed'].includes(state)) throw new Error('Initial aperture must be open, soft, or closed');
        if (!(dwellMs > 0) || !(horizonMs > 0)) throw new Error('Aperture intervals must be positive');
        this.state = state;
        this.focus = null;
        this.deficit = 0;
        this.changedAt = this.updatedAt = now;
        this.dwellMs = dwellMs;
        this.horizonMs = horizonMs;
        this.version = 0;
        this.sources = new Map();
        this.lastCreditAt = -Infinity;
        this.lastContactAt = -Infinity;
    }

    get gain() { return this.state === 'soft' ? 0.5 : 1; }

    allows(source, policy = {}) {
        return policy.bypassAperture || (this.state !== 'closed'
            && (this.state !== 'narrow' || source === this.focus));
    }

    orient(state, { source = null, now = Date.now() } = {}) {
        if (!['open', 'soft', 'narrow', 'closed'].includes(state)) throw new Error('Invalid aperture state');
        if (state === 'narrow' && !source) throw new Error('Narrow attention needs a source');
        if (state !== 'narrow') source = null;
        if (state === this.state && source === this.focus) return false;
        if (now - this.changedAt < this.dwellMs) return false;
        this.state = state;
        this.focus = state === 'narrow' ? source : null;
        this.changedAt = now;
        this.version++;
        // Opening is an opportunity for contact, not contact itself.
        return true;
    }

    advance(now, { awake = true, arousal = 1 } = {}) {
        const elapsed = Math.max(0, now - this.updatedAt);
        this.updatedAt = now;
        if (!awake) return false;
        this.deficit = clamp01(this.deficit + elapsed / this.horizonMs * (0.25 + 0.75 * clamp01(arousal)));
        if (this.deficit >= 0.65 && ['closed', 'narrow'].includes(this.state)) {
            return this.orient('soft', { now });
        }
        if (this.deficit >= 0.9 && this.state === 'soft') return this.orient('open', { now });
        return false;
    }

    /** At most one credit per second across the region, with per-source habituation.
     * Missed bids remain debt until attended, including those later rejected by attention.
     */
    observe(source, header, now = Date.now()) {
        let prior = this.sources.get(source);
        if (!prior && this.sources.size >= 32) return;
        if (prior && now - prior.at < 1000) return;
        const repeated = prior && prior.key === header.changeKey
            && Math.abs(prior.magnitude - header.changeMagnitude) < 0.25;
        const repeats = repeated ? Math.min(prior.repeats + 1, 8) : 0;
        this.sources.set(source, { at: now, key: header.changeKey, magnitude: header.changeMagnitude, repeats });
        if (now - this.lastCreditAt < 1000) return;
        this.lastCreditAt = now;
        this.deficit = clamp01(this.deficit + 0.2 * header.changeMagnitude / (2 ** repeats));
    }

    attended(occurredAt, now = Date.now()) {
        // Old queues and replayed receipts do not stand in for fresh observation.
        if (!Number.isFinite(occurredAt) || occurredAt <= this.lastContactAt
            || occurredAt > now || now - occurredAt > 30000) return false;
        this.lastContactAt = occurredAt;
        this.deficit *= 0.1;
        return true;
    }
}
