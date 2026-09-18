import { MBaseComponent } from "../shared/mBaseComponent.js"
import { InterruptRecord } from '../../infrastructure/interruptRecord.js';
import { ControlRequest, EdgeEvidence, fireEdgeEvidence } from '../../infrastructure/perceptionContracts.js';
import { decide } from '../../modelAccess/decide.js';
import { logger } from '../../infrastructure/logger.js';
import { parseTime } from '../../config/timeParser.js';

const log = logger('mSense.js');

/**
 * Base class for SENSES — world-facing afferent generators (lifecycle.md §Phase 5).
 * Abstract, like m-observer / m-base-component: never used as a tag directly, only
 * subclassed (m-daylight, m-weather, m-feed).
 *
 * The mirror of m-observer. Where an observer watches the inner stream and bids
 * for attention from WITHIN, a sense watches the OUTSIDE and bids from WITHOUT:
 * it runs on its own clock (`timeout` ± normal `sigma`), reads some real
 * exteroceptive source, and raises a first-person sensation as a bubbling
 * `interrupt-request`. Senses are what give the mind an outside that is neither
 * itself nor the human it waits on, so the stream is not alone in the dark.
 *
 * A sense faces the WORLD, never the SUBSTRATE. It must never grow toward host
 * metrics, token counts, latency, the cursor, or the process itself — that
 * mechanistic interoception is exactly what grew the §1 "cursor/pause/void"
 * attractor. A felt outside, yes; the implementation, never.
 *
 * Subclass contract:
 *   - override `onSense(request)` (may be async; `request` is an optional ControlRequest
 *     from the region's sample door — existing subclasses may ignore it); inside it
 *     call `this.feel(reason, …)`;
 *   - pass a `key` to `feel` when the sense has discrete states (a part of the day,
 *     a kind of weather): the base scores a CHANGE of key at `salienceShift` and an
 *     unchanged key at the ambient `salience` (jittered, so it is peripheral — the
 *     way the light is when you are not looking at it). Pass neither key nor
 *     salience for a plain ambient reading; pass an explicit `salience` to override;
 *   - return from `onSense()` without calling `feel` to stay quiet this round;
 *   - override `ready()` to stay dormant when unconfigured (e.g. no location/url);
 *   - override the `defaultTimeout` / `defaultSigma` getters for the natural cadence.
 *   - new lazy sources call candidate(header, () => archivalText) inside an
 *     enclosing aperture (found by role, not tag). The header is non-semantic;
 *     text is produced only after aperture admission.
 *     If a control request is in flight, its id rides the candidate as requestId —
 *     acquisition lineage, not causal attribution. Existing feel() sources remain
 *     the eager compatibility path. Migrated senses call perceive() instead: lazy
 *     under an enclosing aperture, eager feel() otherwise. Sources declare `tier`
 *     on the element (default 0; tier 1 needs a `decider` model and grounds
 *     candidates with ground(); tier 2 is still refused by the region).
 *
 * Errors in `onSense()` (e.g. a network blip) are swallowed and logged — a sense
 * going quiet must never crash the mind.
 *
 * @interface
 * Attributes:
 *   - timeout: base interval between readings (subclass default)
 *   - sigma: normal-distributed jitter on the interval (subclass default)
 *   - salience: centre salience of an ambient reading (jittered ±0.08)
 *   - salienceShift: salience when a keyed sense changes state
 *   - name, provenance, tier (default 0), bypassAperture / bypassAdmission / preempt:
 *     architecture-owned source contract when inside an aperture; tier 2 throws,
 *     and so does tier 1 without a decider
 *   - decider: the decision model (a ref like `jev`) a tier-1 source grounds with
 *   - groundBatch: how many candidates one grounding call set may score (default 5)
 *
 * Events dispatched (bubbling): "interrupt-request" with an InterruptRecord
 * (source "External", never urgent). Lazy candidate() lineage is requestId on the
 * header, not a second event.
 */
export class MSense extends MBaseComponent {
    static provides = { source: true }

    _timer = null
    _lastKey = null

    get defaultTimeout() { return "8m" }
    get defaultSigma() { return "2m" }

    onConnect() {
        this.timeoutMs = parseTime(this.attr("timeout") || this.defaultTimeout)
        this.sigmaMs = parseTime(this.attr("sigma") || this.defaultSigma)
        // Protocol: nearest aperture records the source. candidate() still calls
        // registerSource (idempotent) so the test/demo door and the lazy offer path
        // stay the same. No enclosing aperture → the membrane stops the event.
        if (this.enclosing('aperture')) {
            this.dispatchEvent(new CustomEvent('aperture-register', {
                bubbles: true,
                detail: { sample: request => this.onSense(request) },
            }))
        }
        if (this.ready() === false) return       // unconfigured — stay dormant (subclass warns)
        this._schedule(this._nextDelay())
    }

    onDisconnect() {
        if (this._timer) clearTimeout(this._timer)
    }

    // Nearest aperture owns registration; every gate on the path answers the event.
    _modalityRegion() { return this.enclosing('aperture') }

    /** Subclass hooks. `request` is optional; timer-driven rounds pass none. */
    ready() { return true }
    async onSense(request) {}

    candidate(header, materialize) {
        const region = this._modalityRegion()
        if (!region?.registerSource) throw new Error('A lazy sense needs an enclosing aperture')
        // The region already resolves lineage itself, from the same in-flight
        // `entry.control` it sets before calling this callback and clears once the
        // callback's returned promise settles — the same window `candidate()` runs
        // in. A parallel copy here could never supply a value the region lacks,
        // so this callback only forwards the request.
        const offer = region.registerSource(this, request => this.onSense(request))
        return offer(header, materialize)
    }

    _nextDelay() {
        const normal = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random())
        return Math.max(500, this.timeoutMs + normal * this.sigmaMs)
    }

    _schedule(delayMs) {
        if (this._timer) clearTimeout(this._timer)
        this._timer = setTimeout(this._onTimer, delayMs)
    }

    _onTimer = async () => {
        try { await this.onSense() }
        catch (e) { log.debug(`[${this.attr("name") || this.localName}] sense quiet (${e?.message || e})`) }
        this._schedule(this._nextDelay())
    }

    /**
     * Raise a sensation into the attention bus.
     * @param {string} reason - first-person experience line for the frame
     * @param {{key?: string, salience?: number, type?: string}} [opts]
     * @returns {InterruptRecord}
     */
    feel(reason, { key = null, salience = null, type = null } = {}) {
        const sal = this._salienceFor(key, salience)
        if (key != null) this._lastKey = key

        const record = new InterruptRecord({
            source: 'External',                 // the world reaching in, not the mind reaching down
            type: type || `Sense-${this.attr("name") || this.localName}`,
            reason,
            salience: sal,
            urgent: false,                      // a sense is ambient, never commandeers a burst
        })
        log.debug(`[${this.attr("name") || this.localName}]${key != null ? ` ${key}` : ""}: ${record}`)
        this.fire("interrupt-request", record)
        return record
    }

    /**
     * The same first-person line `feel()` would fire, under aperture control when
     * enclosed and eagerly otherwise. Salience is `feel()`'s computation exactly,
     * including the jitter, so an open gate at gain 1 with explicit salience
     * matches the eager record.
     */
    perceive(reason, { key = null, salience = null, type = null, changeKey = null } = {}) {
        if (!this.enclosing('aperture')) return this.feel(reason, { key, salience, type })
        const sal = this._salienceFor(key, salience)
        if (key != null) this._lastKey = key
        return this.candidate(
            {
                changeMagnitude: sal,
                changeKey: changeKey ?? key ?? reason,
                occurredAt: Date.now(),
            },
            () => reason,
        )
    }

    // -----------------------------------------------------------------------
    // Tier 1 — edge grounding
    // -----------------------------------------------------------------------

    /** True when this source is declared edge-grounded: `tier="1"` and a
     * `decider` model to ground it with. Both, or neither: the region refuses a
     * tier-1 source with no decider at registration. */
    grounds() {
        return this.attr('tier') === '1' && !!(this.attr('decider') || '').trim()
    }

    /** Seam for tests: the decision transport, stubbed exactly as m-judge stubs
     * `_complete`. */
    async _decide(opts) { return decide(opts) }

    /**
     * TIER 1: score private candidate text against the control request's
     * template and let only the number out.
     *
     * One `noul` per candidate ("this candidate is the thing being looked for"),
     * a real probability in [0,1] from a System-One model, and one EdgeEvidence
     * carrying the best of them to whoever issued the request. The candidate
     * text never leaves this method: it goes into the decision call's state and
     * into nothing else — not the event, not the provenance, not the log. The
     * aperture may be closed throughout; grounding is a processing permission,
     * not an awareness one (perceptual-membrane.md#processing-tiers).
     *
     * `noul` carries no confidence of its own, so the reported strength is the
     * derived `|p − 0.5| · 2`, and `provenance.strengthFrom` says so.
     *
     * @param {ControlRequest} request - must carry a `template`; anything else is a no-op
     * @param {string|string[]} candidates - private text, one entry per candidate
     * @returns {Promise<EdgeEvidence|null>}
     */
    async ground(request, candidates) {
        if (!(request instanceof ControlRequest)) return null
        const template = typeof request.template === 'string' ? request.template.trim() : ''
        if (!template) return null
        if (!this.grounds()) return null
        const texts = (Array.isArray(candidates) ? candidates : [candidates])
            .filter(text => typeof text === 'string' && text.trim())
        if (!texts.length) return null
        const limit = Math.max(1, Number(this.attr('groundBatch') || 5))
        const batch = texts.slice(0, limit)

        // The ref goes to decide() as written: it resolves the profile and
        // refuses a provider that generates text rather than answering
        // questions. That refusal is a config bug and throws, so it is caught
        // here and reported once — a sense must never crash the mind.
        const deciderRef = (this.attr('decider') || '').trim()
        const deadline = Number.isFinite(request.deadline) ? request.deadline : null

        let best = 0
        let latencyMs = 0
        let promptTokens = 0
        let cost = 0
        let calls = 0
        let version = null
        for (const text of batch) {
            if (deadline != null && Date.now() >= deadline) break
            let answer
            try {
                answer = await this._decide({
                    model: deciderRef,
                    state: { target: template, candidate: text },
                    questions: { targetMatch: targetMatchQuestion() },
                    deadline,
                    debugTag: 'tier1-target-match',
                    debugEl: this,
                })
            } catch (error) {
                log.warn(`[${this._name()}] tier-1 decider "${deciderRef}" is not usable: ${error?.message || error}`)
                return null
            }
            if (!answer) continue
            calls += 1
            latencyMs += Number(answer.latencyMs) || 0
            promptTokens += Number(answer.usage?.prompt_tokens) || 0
            cost += Number(answer.usage?.cost) || 0
            version = answer.model || version
            const p = Number(answer.answers?.targetMatch?.noul)
            if (Number.isFinite(p)) best = Math.max(best, Math.max(0, Math.min(1, p)))
        }
        if (!calls) return null

        const evidence = new EdgeEvidence({
            targetId: request.targetId || request.id,
            score: best,
            sourceName: this._name(),
            tier: 1,
            requestId: request.id,
            provenance: {
                tier: 1,
                engine: 'decide',
                decider: deciderRef,
                model: version,
                questions: ['targetMatch'],
                strength: Math.abs(best - 0.5) * 2,
                strengthFrom: '|p-0.5|*2 (noul carries no confidence)',
                candidates: batch.length,
                calls,
                latencyMs,
                promptTokens,
                cost,
                apertureState: this._apertureState(),
            },
        })
        fireEdgeEvidence(this, evidence)
        log.debug(`[${this._name()}] tier-1 score ${best.toFixed(3)} over ${batch.length} candidate(s) in ${latencyMs}ms`)
        return evidence
    }

    _name() { return this.attr('name') || this.localName }

    /** For the record only: which gate this score was made behind. */
    _apertureState() {
        const region = this._modalityRegion()
        const state = region?.aperture?.state
        return typeof state === 'string' ? state : null
    }

    /** `feel()`'s salience computation, factored so `perceive()` agrees. */
    _salienceFor(key, salience) {
        if (salience != null) return salience
        const base = Number(this.attr("salience") || 0.4)
        const shift = Number(this.attr("salienceShift") || 0.6)
        const shifted = key != null && key !== this._lastKey
        return shifted ? shift : base + (Math.random() * 2 - 1) * 0.08
    }
}

/**
 * The tier-1 grounding question: one `noul` over a target/candidate pair.
 *
 * Pure and exported so a study can ask the endpoint the same thing the mind
 * asks. Prose goes in `instructions` (a question with neither `criteria` nor
 * `instructions` is rejected by the endpoint), and the two `criteria` glosses
 * say what yes and no mean, the way the judge's verdict glosses do.
 */
export function targetMatchQuestion() {
    return {
        type: 'noul',
        instructions: 'The candidate observation is the thing described by the target: it is about the same subject and would satisfy someone looking for the target.',
        criteria: {
            true: 'the candidate is about the target subject — someone looking for the target would stop here',
            false: 'the candidate is about something else, or is too unrelated to satisfy the target',
        },
    }
}
