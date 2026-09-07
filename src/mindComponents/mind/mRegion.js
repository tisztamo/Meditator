import { MBaseComponent } from "../shared/mBaseComponent.js"
import { enclosingOf, enclosingAllOf, isMembrane, providesOf, isCustomElementDefined } from "../shared/enclosure.js"
import { Aperture } from '../../infrastructure/aperture.js'
import { Percept, PerceptCandidate } from '../../infrastructure/percept.js'
import { AttentionBid } from '../../infrastructure/attentionBid.js'
import { SourceContract, AnnotatedCandidate, decideGate, GateVerdict, ControlRequest, RenditionRequest, PerceptReceipt, pushGainTrail } from '../../infrastructure/perceptionContracts.js'
import { InterruptRecord } from '../../infrastructure/interruptRecord.js'
import { parseTime } from '../../config/timeParser.js'

/** Stable id for a gate: `name` attribute, else the tag. Unique among apertures in a membrane. */
export function gateIdOf(el) {
    return el?.getAttribute?.('name') || el?.localName
}

/**
 * A FACULTY boundary inside a mind: a structural grouping of observers (and an
 * optional region-local m-interrupts) so that attention can be arbitrated in
 * LAYERS rather than as one flat fan-in.
 *
 * Observers placed inside a region compete at the region's local arbiter; only
 * the survivors bubble up — re-weighted by the region's `gain` — to the mind's
 * global arbiter. This is Global-Workspace-Theory in miniature: parallel local
 * competition, a single global broadcast.
 *
 * Without `modality`, the region is a structural boundary. It is an Amanita component so
 * that it can serve as a clean DOM bubbling boundary: a child arbiter binds to
 * its enclosing faculty (via enclosing('faculty'), which reads the derived
 * `provides` attribute and so works before this region has upgraded) and promotes
 * survivors to the region's parent, so the very same arbiter code works at any depth.
 *
 * Observers inside a region still see the MIND's stream — their default source
 * is the mind-relative "..m-mind/stream/chunk", which skips the region. Only
 * attention (interrupt-request events) is scoped to the region.
 *
 * See doc/architecture/deep-structure.md → "Nested attention".
 *
 * @interface
 * Attributes:
 *   - name: optional label for the faculty (observability only)
 *   - (the re-weighting `gain` lives on the region's child m-interrupts)
 *   - modality: opt into the text-first perceptual membrane
 *   - aperture: initial open (default), soft, or closed; wake uses this declared default
 *   - dwell: minimum time between aperture changes (default 30s)
 *   - contactHorizon: weak time-only pressure reaches 1 after this awake interval (10m)
 *   - requestedFloor: salience floor for observations that answer a control request
 *     the mind issued (acquisition lineage, not a prediction). Default 0 — the
 *     route exists; the default preserves today's numbers. This is not a chosen
 *     confirmation policy. The issuing (nearest) provider owns the floor; nested
 *     apertures do not fold or max it.
 * Interior role: `regulator` — contact dynamics (debt, habituation, reflex).
 *   Resolved at connect via part('regulator'), then kept only if
 *   enclosingOf(el, 'aperture') === this, so a nested aperture's regulator is
 *   not stolen. Zero → constructed Aperture (the reference policy, not a tag).
 *   More than one for this aperture throws. A substitute is validated as a port
 *   before any other onConnect work that uses this.aperture; a missing method
 *   throws naming the method and the role (`regulator is missing attended`).
 *   A child whose tag is not yet defined waits for `whenDefined` — `upgrade()`
 *   cannot define a tag, so the port check must not run on a plain HTMLElement.
 *   Gate policy (decideGate, percept-candidate) is not this port. Substituting
 *   the aperture provider is a class that `provides` `aperture`; C1 is the
 *   contract (architecture/tests/wiring/aperture-conformance.test.js).
 * Methods: registerSource(element, sample) → offer(header, lazyText); orient(state, source);
 *   requestControl(ControlRequest) is the one door for sample / focus / detail —
 *   focus is accepted and changes no policy. Untargeted requests fan out to child
 *   providers; a named target is delivered once by the nearest owner (first in
 *   tree order if two siblings own the same name).
 *   permitAcquisition(annotated) and permitAwareness(annotated) each return a
 *   GateVerdict from decideGate — acquisition then awareness; at tier 0 awareness is a
 *   real verdict with reason 'tier-0-mirror'.
 * A source may declare name, provenance, tier (default 0), and the three independent
 * bypass powers on the element. It may never assert those from a payload; the frozen
 * SourceContract is the only policy the offer path reads. tier 1 and 2 are refused
 * at registration.
 * Topics: contactPressure, apertureState (retained); perceptDecision (non-semantic
 *   gate verdicts); events: aperture-change (backstage); percept-candidate (cancelable,
 *   bubbling, twice — acquisition then awareness — conjunction of every aperture on
 *   the path, stopped at the membrane); aperture-register (bubbling, nearest aperture
 *   stops it — not conjunction). Credits `percepts-attended` by percept id
 *   against a bounded issued-id map — never by object identity. Awareness is the
 *   second pass of the same event after materialization, not a capture-phase veto
 *   on interrupt-request. The offer path issues an AttentionBid wrapping a frozen
 *   Percept; aperture gain lives on the bid's trail, not on the evidence. decideBid
 *   reads { changeMagnitude, requested, novelty } separately — the floor is applied
 *   there, not merged upstream.
 * Aperture providers form a tree (`_children`), not a graph: each source and each
 * child provider registers with the nearest enclosing aperture only, in both
 * directions (announce on connect, plus an interior scan so connect order does
 * not matter). Fold termination depends on that. Published `contactPressure` is
 * `fold(ownDeficit, ...childPressures)` — default `max`, so an outer boundary
 * feels its most-starved interior channel. A mean would hide the channel the
 * reflex exists to rescue. The fold is not fed into `Aperture.advance`: the
 * regulator's deficit stays own dynamics. Nested and global arbiters consume
 * the published signal. Mind-level combination of top-level folded pressures
 * is the `aggregator` role, not a second contact regulator on this provider.
 * Only registered lazy sources pass through this aperture; legacy interrupts are unchanged.
 */
export class MRegion extends MBaseComponent {
    // Always an attention scope; with `modality` it is also a sensory gate.
    // Predicates see the raw element and may read only attributes (they exist
    // before upgrade). Nearest aperture still owns registration and observe();
    // every aperture on the path gates acquisition and awareness via percept-candidate.
    static provides = { faculty: true, aperture: el => el.hasAttribute('modality') }

    onConnect() {
        super.onConnect()
        // Role, not the `modality` attribute: a substitute provider binds without it.
        if (!this._bindsAsAperture()) return
        this._sources = new Map()
        // Child aperture providers. A tree, not a graph: nearest-only in both
        // directions. The pressure fold notifies only this parent pointer.
        this._children = []
        // At most 32 issued percept ids awaiting credit — same order as the
        // per-region source cap. WeakSet was wrong: a rebuilt record with the
        // same id must still credit. Evict the oldest issuedAt if the map is full.
        this._issued = new Map()
        this._arousal = 1
        const mind = this._mind()
        mind?.addEventListener('percepts-attended', this._onPerceptsAttended)
        // closest() is empty after removal; remember the connect-time host for unlisten.
        this._unlistenPercepts = () => mind?.removeEventListener('percepts-attended', this._onPerceptsAttended)
        if (mind?.querySelector('m-stream')) {
            this.sub('..m-mind/stream/@boundary', () => this.onBoundary()).catch(() => {})
        }
        if (mind?.querySelector('m-economy')) {
            this.sub('..m-mind/economy/arousal', value => { this._arousal = value }).catch(() => {})
        }
        this._requestedFloor()
        this.addEventListener('percept-candidate', this._onPerceptCandidate)
        this.addEventListener('aperture-register', this._onApertureRegister)
        this._bindAperture()
    }

    onDisconnect() {
        this._bindGen = (this._bindGen || 0) + 1
        this._unlistenPercepts?.()
        this.removeEventListener('percept-candidate', this._onPerceptCandidate)
        this.removeEventListener('aperture-register', this._onApertureRegister)
        if (this.aperture) this.aperture.version++
        this._sources?.clear()
        this._children = []
        this._issued?.clear()
        this.aperture = null
        // parentElement is already null here; the host pointer was set at link.
        const host = this._hostAperture
        this._hostAperture = null
        host?._unlinkChild?.(this)
    }

    _mind() { return this.membrane() }
    _modalityRegion(el) { return enclosingOf(el, 'aperture') }

    /** Built-in `m-region` is an aperture only with `modality`. A substitute
     * overrides this (or declares `static provides.aperture = true`) so the
     * offer path is reused rather than copied. */
    _bindsAsAperture() { return this.provides('aperture') }

    /** SourceContract needs a modality string from the provider, not the source.
     * Absent `modality`, the only implemented kind is text. */
    _sourceModality() { return this.attr('modality') || 'text' }

    /** Architecture-owned adapter: payloads cannot choose identity or policy. */
    registerSource(element, sample) {
        if (!this.aperture || this._modalityRegion(element) !== this) throw new Error('Source needs its modality region')
        if (this._sources.has(element)) return this._sources.get(element).offer
        if (this._sources.size >= 32) throw new Error('Too many sources in one modality region')
        const contract = SourceContract.fromElement(element, { modality: this._sourceModality() })
        if ([...this._sources.values()].some(s => s.source === contract.name)) throw new Error('Sensory source names must be unique within a region')
        const entry = { source: contract.name, sample, busy: false, contract, control: null, controlStack: [] }
        entry.offer = async (header, materialize) => {
            const attached = () => this.isConnected && element.isConnected
                && this._modalityRegion(element) === this && this._sources.get(element) === entry
            if (!attached() || this._mind()?._sleeping) return null
            const control = entry.controlStack[entry.controlStack.length - 1] ?? entry.control ?? null
            const requestId = control?.id ?? header.requestId ?? null
            const candidate = new PerceptCandidate({ ...header, requestId }, materialize)
            const now = Date.now()
            // Closed still observes the header (debt); composition decides materialization.
            this.aperture.observe(contract.name, candidate, now)
            this._publishAperture()

            const detail = {
                stage: 'acquisition',
                header: candidate,
                origin: element,
                contract,
                verdicts: [],
                versions: [],
                gainTrail: [],
            }
            // Snapshot the path before dispatch: a gate removed mid-flight must not
            // look like permission. Walk from the source so the issuer is included.
            const expectedGates = enclosingAllOf(element, 'aperture')
            if (!expectedGates.includes(this)) expectedGates.unshift(this)
            const event = new CustomEvent('percept-candidate', { bubbles: true, cancelable: true, detail })
            element.dispatchEvent(event)

            const annotated = new AnnotatedCandidate({
                candidate, contract,
                versions: detail.versions,
            })
            const acquisition = this._composedGate(event, expectedGates)
            // A source already materializing is dropped exactly as before, but the
            // published record must say so: a `permitted: true` acquisition with no
            // awareness verdict and no percept following it left an unterminated
            // acquisition in the decision log. Publish the honest refusal instead of
            // the verdict decideGate actually reached.
            if (acquisition.permitted && entry.busy) {
                this._publishDecision(new GateVerdict({
                    stage: 'acquisition', permitted: false, reason: 'busy',
                    bypass: acquisition.bypass, apertureState: acquisition.apertureState, gate: acquisition.gate,
                }), annotated)
                return null
            }
            this._publishDecision(acquisition, annotated)
            if (!acquisition.permitted) return null
            entry.busy = true
            try {
                let text
                try {
                    text = await candidate.materialize(new RenditionRequest({
                        kinds: ['text'],
                        requestId: candidate.requestId,
                        detail: control?.kind === 'detail' ? control.detail : null,
                    }))
                } catch {
                    // A failed renderer is not a sensation; errors can themselves contain private payloads.
                    this.pub('materializationFailure', { source: contract.name, candidateId: candidate.id })
                    return null
                }
                if (!attached() || this._mind()?._sleeping
                    || !this._versionsHold(annotated)) return null
                // Awareness is the second pass of the same event, after materialization
                // and the version re-check, before interrupt-request. bypassAperture is
                // an acquisition privilege; tier 0 awareness mirrors decideGate's permitted
                // bit, including that bypass. Fresh verdicts; do not rewrite acquisition
                // versions or push the gain trail again.
                const awarenessDetail = {
                    stage: 'awareness',
                    header: candidate,
                    origin: element,
                    contract,
                    verdicts: [],
                }
                const awarenessEvent = new CustomEvent('percept-candidate', {
                    bubbles: true, cancelable: true, detail: awarenessDetail,
                })
                element.dispatchEvent(awarenessEvent)
                const awareness = this._composedGate(awarenessEvent, expectedGates)
                if (awareness.permitted && (!attached() || this._mind()?._sleeping
                    || !this._versionsHold(annotated))) {
                    this._publishDecision(this._gateMissingVerdict(awarenessDetail), annotated)
                    return null
                }
                const percept = new Percept({
                    id: candidate.id, sourceId: contract.name, modality: contract.modality,
                    provenance: contract.provenance, tier: contract.tier, policy: contract.powers,
                    requestId: candidate.requestId,
                    occurredAt: new Date(Math.min(now, candidate.occurredAt)).toISOString(),
                    record: new InterruptRecord({ source: 'External', type: `Sense-${contract.name}`, reason: text,
                        // Raw change magnitude. The requested floor is applied inside
                        // decideBid, not merged into evidence salience here.
                        salience: candidate.changeMagnitude }),
                    gateTrail: [acquisition, awareness],
                })
                this._publishDecision(awareness, annotated)
                if (!awareness.permitted) return null
                const issuedAt = Date.parse(percept.dateTime)
                this._recordIssued(percept.id, Number.isFinite(issuedAt) ? issuedAt : Date.now())
                const bid = new AttentionBid({
                    evidence: percept,
                    gainTrail: detail.gainTrail,
                    signals: {
                        changeMagnitude: candidate.changeMagnitude,
                        requested: candidate.requestId != null,
                        novelty: null,
                    },
                    requestedFloor: this._requestedFloor(),
                })
                element.dispatchEvent(new CustomEvent('interrupt-request', { bubbles: true, detail: bid }))
                return bid
            } finally { entry.busy = false }
        }
        this._sources.set(element, entry)
        return entry.offer
    }

    permitAcquisition(annotated) {
        return decideGate({
            stage: 'acquisition',
            apertureState: this.aperture.state,
            focus: this.aperture.focus,
            contract: annotated.contract,
            gate: this._gateId(),
        })
    }

    permitAwareness(annotated) {
        return decideGate({
            stage: 'awareness',
            apertureState: this.aperture.state,
            focus: this.aperture.focus,
            contract: annotated.contract,
            gate: this._gateId(),
        })
    }

    _gateId() { return gateIdOf(this) }

    /** Bind the unique interior `regulator`, or the reference Aperture policy.
     * `customElements.upgrade()` cannot define a tag: a same-batch child whose
     * constructor is not registered yet stays an HTMLElement, so the port check
     * waits for `whenDefined` rather than treating that as a missing method.
     * A present regulator element is never replaced by the default while waiting. */
    _bindAperture() {
        const found = this.part('regulator').filter(el => enclosingOf(el, 'aperture') === this)
        if (found.length > 1) {
            throw new Error(`an aperture may have only one regulator (${this._gateId()})`)
        }
        const regulator = found[0]
        this._bindGen = (this._bindGen || 0) + 1
        const gen = this._bindGen
        if (!regulator) {
            this._adoptAperture(new Aperture({
                state: this.attr('aperture') || 'open',
                dwellMs: parseTime(this.attr('dwell') || '30s'),
                horizonMs: parseTime(this.attr('contactHorizon') || '10m'),
            }))
            return
        }
        const adopt = () => {
            if (!this.isConnected || gen !== this._bindGen) return
            if (enclosingOf(regulator, 'aperture') !== this) return
            customElements.upgrade(regulator)
            this._assertRegulatorPort(regulator)
            this._adoptAperture(regulator)
        }
        if (isCustomElementDefined(regulator)) adopt()
        else customElements.whenDefined(regulator.localName).then(adopt)
    }

    _adoptAperture(aperture) {
        if (this.aperture) return
        this.aperture = aperture
        this._publishAperture()
        this._assertUniqueApertureId()
        this._scanInterior()
        // Own announcement: this listener ignores target === this so the event
        // can bubble to the enclosing aperture. The membrane stops it if none.
        this.dispatchEvent(new CustomEvent('aperture-register', { bubbles: true }))
    }

    _assertRegulatorPort(regulator) {
        for (const name of ['state', 'focus', 'deficit', 'gain', 'version']) {
            if (!(name in regulator)) throw new Error(`regulator is missing ${name}`)
        }
        for (const name of ['allows', 'observe', 'advance', 'orient', 'attended']) {
            if (typeof regulator[name] !== 'function') throw new Error(`regulator is missing ${name}`)
        }
    }

    /**
     * Providers form a tree: nearest-only in both directions. The event is the
     * protocol; registerSource remains the implementation and the test/demo door.
     * Own announcements (target === this) are ignored here so they can bubble
     * to the enclosing aperture. Duplicate child links are ignored, not an error.
     */
    _onApertureRegister = event => {
        if (event.target === this) return
        event.stopPropagation()
        if (!this.aperture) return
        const el = event.target
        if (!el || el.nodeType !== 1) return
        if (providesOf(el, 'aperture')) {
            this._linkChild(el)
            return
        }
        if (providesOf(el, 'source') && enclosingOf(el, 'aperture') === this) {
            const sample = typeof event.detail?.sample === 'function'
                ? event.detail.sample
                : (typeof el.onSense === 'function' ? request => el.onSense(request) : undefined)
            if (typeof sample === 'function') this.registerSource(el, sample)
        }
    }

    /** Interior scan so connect order does not matter (Law 1, both directions).
     * Document-order upgrades typically connect parent before child, so this
     * scan is often empty and the child's self-register builds the tree. */
    _scanInterior() {
        for (const child of this.part('aperture')) {
            customElements.upgrade(child)
            this._linkChild(child)
        }
        for (const el of this.part('source')) {
            if (enclosingOf(el, 'aperture') !== this) continue
            customElements.upgrade(el)
            // Spans used in tests have no source role and stay on explicit
            // registerSource. Do not invent sample callbacks for them.
            if (typeof el.onSense !== 'function') continue
            this.registerSource(el, request => el.onSense(request))
        }
    }

    _linkChild(el) {
        if (!el || el === this) return
        if (this._children.includes(el)) return
        this._children.push(el)
        el._hostAperture = this
        // The child may already have published; include it now. Do not notify
        // the child (the fold walks toward the membrane, never back down).
        this._publishAperture()
    }

    _unlinkChild(el) {
        const i = this._children.indexOf(el)
        if (i >= 0) this._children.splice(i, 1)
        if (el?._hostAperture === this) el._hostAperture = null
        this._publishAperture()
    }

    /** Linked children in tree order. Stale entries (disconnected) drop out
     * because part() only walks the live interior. */
    _childProviders() {
        const linked = new Set(this._children)
        return this.part('aperture').filter(el => linked.has(el))
    }

    /** Default 0 so the seam does not retune. The issuing provider's value;
     * not folded across nested apertures. */
    _requestedFloor() {
        const raw = this.attr('requestedFloor')
        if (raw == null || raw === '') return 0
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0 || n > 1) {
            throw new Error(`requestedFloor must be a number in [0, 1], got ${JSON.stringify(raw)}`)
        }
        return n
    }

    /** Every aperture on the path answers. Nobody but the membrane stops this event. */
    _onPerceptCandidate = event => {
        const detail = event.detail
        if (!detail || (detail.stage !== 'acquisition' && detail.stage !== 'awareness')) return
        if (!this.aperture) return
        if (!(detail.contract instanceof SourceContract)) {
            event.preventDefault()
            return
        }
        const path = enclosingAllOf(detail.origin, 'aperture')
        if (!path.includes(this)) return

        // Call the named permit* so a test (or a later policy) can stub one stage.
        const verdict = detail.stage === 'awareness'
            ? this.permitAwareness(detail)
            : this.permitAcquisition(detail)
        if (!Array.isArray(detail.verdicts)) detail.verdicts = []
        detail.verdicts.push(verdict)
        if (detail.stage === 'acquisition') {
            detail.versions.push({ gate: verdict.gate, version: this.aperture.version })
            const factor = detail.contract.powers.bypassAperture ? 1 : this.aperture.gain
            pushGainTrail(detail.gainTrail, verdict.gate, factor)
        }
        if (!verdict.permitted) event.preventDefault()
    }

    _everyGateAnswered(detail, expectedGates) {
        const answered = new Set((detail.verdicts || []).map(v => v.gate))
        return expectedGates.every(el => answered.has(gateIdOf(el)))
    }

    _composedGate(event, expectedGates) {
        const detail = event.detail
        const refused = (detail.verdicts || []).find(v => v.permitted === false)
        const permitted = !event.defaultPrevented
            && this._everyGateAnswered(detail, expectedGates)
            && !refused
        if (permitted) {
            return detail.verdicts.find(v => v.gate === this._gateId())
                || this._gateMissingVerdict(detail)
        }
        if (refused) return refused
        return this._gateMissingVerdict(detail)
    }

    _gateMissingVerdict(detail) {
        return new GateVerdict({
            stage: detail?.stage === 'awareness' ? 'awareness' : 'acquisition',
            permitted: false,
            reason: 'gate-missing',
            bypass: detail?.contract?.powers?.bypassAperture === true,
            apertureState: this.aperture.state,
            gate: this._gateId(),
        })
    }

    _assertUniqueApertureId() {
        const id = this._gateId()
        const root = this.membrane()
        if (!root) return
        const walk = node => {
            for (const child of node.children || []) {
                if (isMembrane(child)) continue
                if (child !== this && child.aperture && gateIdOf(child) === id) {
                    throw new Error(`Aperture names must be unique within a membrane (${id})`)
                }
                walk(child)
            }
        }
        walk(root)
    }

    /**
     * Re-check every recorded `{ gate, version }` against that gate's live version.
     * Resolve by id on the current enclosing aperture path, not a provider
     * back-reference: AnnotatedCandidate freezes enumerable `{ gate, version }`
     * only, and a gate that has left the tree must be a failed hold (drop), not
     * permission — looking it up and not finding it needs no extra case.
     */
    _versionsHold(annotated) {
        const recorded = annotated.versions
        if (!recorded.length) return false
        const path = enclosingAllOf(this, 'aperture')
        if (!path.includes(this)) path.unshift(this)
        const live = new Map()
        for (const el of path) live.set(gateIdOf(el), el)
        return recorded.every(entry => {
            const gate = live.get(entry.gate)
            return gate?.aperture != null && entry.version === gate.aperture.version
        })
    }

    orient(state, source = null, now = Date.now()) {
        if (!this.aperture) return false
        if (state === 'narrow' && ![...this._sources.values()].some(s => s.source === source)) return false
        const before = this.aperture.state
        if (!this.aperture.orient(state, { source, now })) return false
        this._transition(before, 'orientation')
        return true
    }

    onBoundary(now = Date.now()) {
        if (!this.aperture) return
        const before = this.aperture.state
        const changed = this.aperture.advance(now, { awake: !this._mind()?._sleeping, arousal: this._arousal })
        if (changed) this._transition(before, 'contact-deficit')
        else this._publishAperture()
    }

    /** The one public door for sample / focus / detail. Reopening and the
     * orientation reflex use it; a later controller that is not the region can
     * too. `focus` is validated, delivered, and recorded, but must change no
     * policy: the search controller that owns focus is membrane phase 3, and a
     * region must not grow a search conclusion. Requests to a detached or
     * sleeping source are dropped; dropping is not an error.
     *
     * A named `target` reaches its source even while the aperture refuses it:
     * asking a specific source is the CONTROLLER's decision, and the acquisition
     * gate still decides whether anything it returns is disclosed. An untargeted
     * broadcast carries no such decision, so it skips sources the aperture
     * already refuses rather than spending a materializer call on content that
     * would only be discarded.
     *
     * After this provider's own `_sources`, untargeted requests fan out to every
     * registered child provider (each applies its own `allows()` skip). A named
     * target is delivered once by the nearest owner and not forwarded further.
     * If two sibling providers both own the name, first in tree order wins.
     * Owning a detached or sleeping source still claims the name — dropping is
     * not an error and must not fall through to a later sibling. */
    requestControl(request) {
        if (!(request instanceof ControlRequest)) throw new Error('requestControl requires a ControlRequest')
        if (!this.aperture) return false
        const sleeping = this._mind()?._sleeping
        const targeted = request.target != null
        let delivered = false
        let owned = false
        for (const [element, entry] of this._sources) {
            if (targeted && entry.source !== request.target) continue
            if (targeted) owned = true
            const attached = element.isConnected
                && this._modalityRegion(element) === this
                && this._sources.get(element) === entry
            if (!attached || sleeping) continue
            if (!targeted && !this.aperture.allows(entry.source, entry.contract.powers)) continue
            delivered = true
            this._armControl(entry, request)
            if (targeted) break
        }
        if (targeted && owned) return true
        for (const child of this._childProviders()) {
            if (!child.isConnected) continue
            customElements.upgrade(child)
            if (typeof child.requestControl !== 'function') continue
            if (child.requestControl(request)) {
                delivered = true
                if (targeted) return true
            }
        }
        return delivered
    }

    /** Snapshot this request around the sample callback so a second control in
     * the same turn cannot overwrite A's lineage with B's. `offer` reads the
     * stack top, not a single shared slot. */
    _armControl(entry, request) {
        Promise.resolve().then(async () => {
            entry.controlStack.push(request)
            entry.control = request
            try {
                await entry.sample?.(request)
            } finally {
                const i = entry.controlStack.lastIndexOf(request)
                if (i >= 0) entry.controlStack.splice(i, 1)
                entry.control = entry.controlStack[entry.controlStack.length - 1] ?? null
            }
        }).catch(() => {})
    }

    _transition(from, reason) {
        this._publishAperture()
        this.fire('aperture-change', { from, to: this.aperture.state, reason })
        // Ask the sources for the present. No candidate or suppressed content is queued.
        this.requestControl(new ControlRequest({
            kind: 'sample',
            issuedBy: this.attr('name') || this.localName,
            reason: reason === 'orientation' ? 'orientation' : 'reopening',
        }))
    }

    _recordIssued(id, issuedAt) {
        if (this._issued.size >= 32 && !this._issued.has(id)) {
            let oldestId = null
            let oldestAt = Infinity
            for (const [issuedId, at] of this._issued) {
                if (at < oldestAt) {
                    oldestAt = at
                    oldestId = issuedId
                }
            }
            if (oldestId != null) this._issued.delete(oldestId)
        }
        this._issued.set(id, issuedAt)
    }

    _onPerceptsAttended = e => {
        if (!Array.isArray(e.detail) || !this._issued) return
        for (const item of e.detail) {
            if (!(item instanceof PerceptReceipt)) continue
            const id = item.perceptId
            if (!this._issued.has(id)) continue
            const occurredAt = typeof item.occurredAt === 'number' ? item.occurredAt : Date.parse(item.occurredAt)
            this.aperture.attended(occurredAt)
            this._issued.delete(id)
        }
        this._publishAperture()
    }

    /**
     * Default fold is max: an outer boundary should feel its most-starved
     * interior channel. A mean hides exactly the channel the reflex exists
     * to rescue. Replaceable on the provider; the mind-level mix is aggregator.
     * `advance` still reads own deficit — do not feed this result into the
     * regulator, or an outer reflex would fire for an inner channel the mind
     * may be deliberately narrow on.
     */
    fold(own, childPressures = []) {
        let pressure = Number(own)
        if (!Number.isFinite(pressure)) pressure = 0
        for (const child of childPressures) {
            const n = Number(child)
            if (Number.isFinite(n) && n > pressure) pressure = n
        }
        return pressure
    }

    _publishAperture() {
        if (!this.aperture) return
        const own = this.aperture.deficit
        const childPressures = this._childProviders().map(el => el.contactPressure)
        const pressure = this.fold(own, childPressures)
        this.contactPressure = pressure
        this.pub('contactPressure', pressure)
        this.pub('apertureState', { state: this.aperture.state, focus: this.aperture.focus,
            contactPressure: pressure, gain: this.aperture.gain })
        // Tree, not graph: notify the nearest enclosing aperture only.
        const parent = this.enclosing('aperture')
        if (parent && typeof parent._publishAperture === 'function') parent._publishAperture()
    }

    _publishDecision(verdict, annotated) {
        this.pub('perceptDecision', {
            stage: verdict.stage,
            source: annotated.contract.name,
            permitted: verdict.permitted,
            reason: verdict.reason,
            changeMagnitude: annotated.candidate.changeMagnitude,
            apertureState: verdict.apertureState,
        })
    }
}
