import { MBaseComponent } from "../shared/mBaseComponent.js"
import { enclosingOf, enclosingAllOf, isMembrane, providesOf } from "../shared/enclosure.js"
import { Aperture } from '../../infrastructure/aperture.js'
import { Percept, PerceptCandidate } from '../../infrastructure/percept.js'
import { SourceContract, AnnotatedCandidate, decideGate, GateVerdict, ControlRequest, RenditionRequest, receiptsFrom, pushGainTrail, fireControlResult } from '../../infrastructure/perceptionContracts.js'
import { InterruptRecord } from '../../infrastructure/interruptRecord.js'
import { bidData } from '../../infrastructure/attentionBid.js'
import { dispatchOnBehalf, sentByComponent } from '../../infrastructure/messageOrigin.js'
import { parseTime } from '../../config/timeParser.js'
import { projectEvidenceView } from '../../infrastructure/evidenceView.js'
import { CompareBudget, CommitOrder, evaluationIdsOf, verdictsOf } from '../../infrastructure/compareContinuation.js'
import { runEvidenceCase } from '../../infrastructure/evidenceCase.js'
import { comparatorOf, askComparator } from '../shared/comparators.js'
import { bidderOf, issueBid } from '../shared/bidders.js'
import { serveApertureRequests, apertureRef, askControl, askOrientation } from '../shared/apertureRequests.js'
import { REGULATOR_UP, RegulatorMirror, askRegulator, changeHeader } from '../shared/regulators.js'
import { evaluationCommitPayload, fireEvaluationCommit } from '../../infrastructure/predictionContracts.js'
import { OrientationRequest } from '../../infrastructure/predictionContracts.js'
import { logger } from '../../infrastructure/logger.js'
import { respond, responderName } from '../../infrastructure/requestReply.js'
import { OFFER_REQUEST, askSample, askMaterialize } from '../shared/sources.js'

const log = logger('mRegion.js')

/** Stable id for a gate: `name` attribute, else the tag. Unique among apertures in a membrane. */
const DEFAULT_GATE_DEADLINE_MS = 500

export function gateIdOf(el) {
    return el?.getAttribute?.('name') || el?.localName
}

/** A value, or a Promise of one: `f` runs on it either way. The built-in policy
 * answers in place; a substituted regulator answers by message (a Promise). */
function andThen(value, f) {
    return value && typeof value.then === 'function' ? value.then(f) : f(value)
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
 * is the mind-relative "!scope/stream/chunk", which skips the region. Only
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
 *   - compareDeadline: wall-clock budget for a live comparison (default "2s")
 *   - gateDeadline: how long an issued candidate waits for every gate on its path
 *     (default "500ms"); a gate that has not answered by then denies (gate-missing)
 *   - regulateDeadline: how long a substituted regulator may take to answer one
 *     op (default "2s"); a silent one changes nothing
 *   - boundarySrc / arousalSrc: the burst boundary that advances the aperture and
 *     the arousal it is advanced with (defaults "!scope/stream/@boundary" and
 *     "!scope/economy/arousal", bound only when the membrane has a part of that
 *     name); "off" unbinds
 * Interior role: `regulator` — contact dynamics (debt, habituation, reflex).
 *   Resolved at connect via part('regulator'), then kept only if
 *   enclosingOf(el, 'aperture') === this, so a nested aperture's regulator is
 *   not stolen. Zero → constructed Aperture (the reference policy, not a tag),
 *   run in place: `this.aperture` is that object and every op is synchronous.
 *   More than one for this aperture throws. A substitute is a message peer
 *   (MRegulator, shared/regulators.js): the region binds once it hears the
 *   regulator's `regulator-up` (or its answer to a `snapshot` ask), keeps its
 *   answers as a RegulatorMirror in `this.aperture`, and asks `regulate` for
 *   observe / advance / orient / attended; orient() and onBoundary() then return
 *   a Promise. The regulator checks its own port at connect (`regulator is
 *   missing attended`). A child whose tag is never defined never comes up, and
 *   the aperture stays unbound (gate-missing on its path).
 *   Gate policy (decideGate, percept-candidate) is not this port. Substituting
 *   the aperture provider is a class that `provides` `aperture`; C1 is the
 *   contract (architecture/tests/wiring/aperture-conformance.test.js).
 * Sources are messages (shared/sources.js): a plain `aperture-register`, then
 *   `sample {source, request}` asked of the source, `offer {offerId, controlId,
 *   header}` from it (answered with the bid as data), and `materialize {source,
 *   offerId, rendition}` asked after acquisition. Attributes sampleDeadline (30s)
 *   and materializeDeadline (10s): a silent source sampled or rendered nothing.
 * Methods: registerSource(element, sample?) → offer(header, lazyText) is the
 *   in-process test/demo door (a callback sample is called, not asked); orient(state, source);
 *   requestControl(ControlRequest) is the one door for sample / focus / detail —
 *   focus is accepted and changes no policy. Untargeted requests fan out to child
 *   providers; a named target is delivered once by the nearest owner (first in
 *   tree order if two siblings own the same name).
 *   permitAcquisition(annotated) and permitAwareness(annotated) each return a
 *   GateVerdict from decideGate — acquisition then awareness; at tier 0 awareness is a
 *   real verdict with reason 'tier-0-mirror'.
 * A source may declare name, provenance, tier (default 0), and the three independent
 * bypass powers on the element. It may never assert those from a payload; the frozen
 * SourceContract is the only policy the offer path reads. Tier 2 is refused at
 * registration, and so is tier 1 without a `decider` model; a tier-1 source with
 * one is registered and grounds its own candidates (see MSense.ground). Its
 * scores never enter this provider: they are not candidates and never become
 * change headers.
 * Topics: contactPressure, apertureState, gateVersions (retained: this gate's
 *   version and every enclosing gate's, as last heard, for a child's version hold);
 *   perceptDecision (non-semantic
 *   gate verdicts); events: aperture-change (+ its backstage trail); percept-candidate (a request,
 *   message-rule.md: plain data {stage, candidateId, contract, gates}, sent twice by
 *   the issuing aperture — acquisition then awareness — bubbling through every aperture
 *   on the path and stopped at the membrane; each gate replies {verdict, version?, gain?},
 *   and the issuer composes the conjunction: every gate answered and none refused, else
 *   the refusal, else gate-missing); aperture-register (bubbling, nearest aperture
 *   stops it — not conjunction). Credits `percepts-attended` by percept id
 *   against a bounded issued-id map — never by object identity. Awareness is the
 *   second pass of the same event after materialization, not a capture-phase veto
 *   on interrupt-request. The offer path issues an AttentionBid wrapping a frozen
 *   Percept; aperture gain lives on the bid's trail, not on the evidence. decideBid
 *   reads independent signals separately — floors are applied there, not merged
 *   upstream. Interior role `bidder` is owner-local, and asked with a `bid`
 *   request (shared/bidders.js); absent one, prediction slots stay null and new
 *   weights stay 0.
 * Aperture providers form a tree (`_children`), not a graph: each source and each
 * child provider registers with the nearest enclosing aperture only, in both
 * directions (announce on connect, plus an interior scan so connect order does
 * not matter). Fold termination depends on that. Published `contactPressure` is
 * `fold(ownDeficit, ...childPressures)`, each child's pressure heard from its
 * retained `contactPressure` topic (subscribed by id at link; a leaving child
 * publishes null and is unlinked) — default `max`, so an outer boundary
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
    // every aperture on the path gates acquisition and awareness: it answers the
    // issuer's percept-candidate request with its verdict (_askGates / _gateAnswer).
    static provides = { faculty: true, aperture: el => el.hasAttribute('modality') }

    onConnect() {
        super.onConnect()
        // Role, not the `modality` attribute: a substitute provider binds without it.
        if (!this._bindsAsAperture()) return
        this._sources = new Map()
        this._compareBudget = new CompareBudget()
        this._sourceCommit = new Map()
        this._compareAborts = new Set()
        // Child aperture providers. A tree, not a graph: nearest-only in both
        // directions. The fold hears each child's retained `contactPressure`
        // (subscribed by id when the child links); a child never calls up.
        this._children = []
        this._childPressure = new Map()
        this._childSubs = new Map()
        // The enclosing gates' versions, heard from the nearest enclosing aperture's
        // retained `gateVersions` (its own and its ancestors'): what a version hold
        // compares against, never another gate's element.
        this._pathVersions = new Map()
        // At most 32 issued percept ids awaiting credit — same order as the
        // per-region source cap. WeakSet was wrong: a rebuilt record with the
        // same id must still credit. Evict the oldest issuedAt if the map is full.
        this._issued = new Map()
        this._arousal = 1
        const mind = this._mind()
        mind?.addEventListener('percepts-attended', this._onPerceptsAttended)
        // closest() is empty after removal; remember the connect-time host for unlisten.
        this._unlistenPercepts = () => {
            mind?.removeEventListener('percepts-attended', this._onPerceptsAttended)
        }
        // Sleep arrives as the membrane's retained `sleeping` topic (message-rule.md):
        // mirrored, never read off the mind; a compare in flight is aborted on it.
        this._membraneSleeping = false
        this.sub('!scope/sleeping', sleeping => {
            this._membraneSleeping = !!sleeping
            if (sleeping) this._onMindSleeping()
        }).catch(() => {})
        // The stream's boundaries and the economy's arousal are heard by name. A
        // default ref is bound only when the membrane has a part of that name (what
        // `!scope/<name>` resolves to), so a mind without one starts no retry.
        const named = name => !!mind?.querySelector(`[name="${name}"]`)
        const boundarySrc = this.attr('boundarySrc') || (named('stream') ? '!scope/stream/@boundary' : 'off')
        if (boundarySrc !== 'off') this.sub(boundarySrc, () => this.onBoundary()).catch(() => {})
        const arousalSrc = this.attr('arousalSrc') || (named('economy') ? '!scope/economy/arousal' : 'off')
        if (arousalSrc !== 'off') {
            this.sub(arousalSrc, value => { if (typeof value === 'number') this._arousal = value }).catch(() => {})
        }
        this._requestedFloor()
        // Every aperture on a candidate's path answers the issuer's request with its
        // verdict (message-rule.md). respond() returns the listener, kept so a test can
        // re-attach it in another phase and so disconnect can remove it.
        this._onPerceptCandidate = respond(this, 'percept-candidate', (detail, event) => this._gateAnswer(detail, event))
        this.addEventListener('aperture-register', this._onApertureRegister)
        // A source's candidate arrives as an `offer` (shared/sources.js): the nearest
        // aperture answers it with the issued bid, as data.
        this._onOffer = respond(this, OFFER_REQUEST, (detail, event) => this._offerAnswer(detail, event))
        this.addEventListener(REGULATOR_UP, this._onRegulatorUp)
        // Controllers (m-orient, m-search) ask this aperture by name, through the
        // membrane (shared/apertureRequests.js).
        this._unserveApertureRequests = serveApertureRequests(this, mind)
        this._bindAperture()
    }

    onDisconnect() {
        this._bindGen = (this._bindGen || 0) + 1
        for (const controller of this._compareAborts || []) {
            try { controller.abort() } catch { /* cooperative */ }
        }
        this._compareAborts?.clear()
        this._unlistenPercepts?.()
        this._unserveApertureRequests?.()
        this._unserveApertureRequests = null
        if (this._onPerceptCandidate) this.removeEventListener('percept-candidate', this._onPerceptCandidate)
        this.removeEventListener('aperture-register', this._onApertureRegister)
        if (this._onOffer) this.removeEventListener(OFFER_REQUEST, this._onOffer)
        this.removeEventListener(REGULATOR_UP, this._onRegulatorUp)
        if (this.aperture) this.aperture.version++
        this._sources?.clear()
        this._sourceCommit?.clear()
        this._children = []
        this._childPressure?.clear()
        this._childSubs?.clear()
        this._pathVersions?.clear()
        this._issued?.clear()
        // The enclosing aperture and the arbiter hear this as "no pressure here now"
        // (a moved aperture publishes again when it binds). Amanita drops this
        // element's own subscriptions after onDisconnect.
        if (this.aperture) this.pub('contactPressure', null)
        this.aperture = null
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

    /** Architecture-owned adapter: payloads cannot choose identity or policy.
     * Without `sample` the source is asked by message (`sample`, shared/sources.js),
     * as every registered sense is; a callback is the test/demo door. The returned
     * `offer(header, materialize)` is the in-process door to the offer path. */
    registerSource(element, sample = null) {
        if (!this.aperture || this._modalityRegion(element) !== this) throw new Error('Source needs its modality region')
        if (this._sources.has(element)) return this._sources.get(element).offer
        if (this._sources.size >= 32) throw new Error('Too many sources in one modality region')
        const contract = SourceContract.fromElement(element, { modality: this._sourceModality() })
        if ([...this._sources.values()].some(s => s.source === contract.name)) throw new Error('Sensory source names must be unique within a region')
        const entry = {
            source: contract.name, sample: typeof sample === 'function' ? sample : null,
            busy: false, contract, control: null, controlStack: [], armed: new Map(),
        }
        // `control` is given by the `offer` message path (a control this region armed,
        // or none); the door reads the stack of callback samples in flight.
        entry.offer = async (header, materialize, { control: given } = {}) => {
            const attached = () => this.isConnected && element.isConnected
                && this._modalityRegion(element) === this && this._sources.get(element) === entry
            if (!attached() || this._membraneSleeping) return null
            const control = given !== undefined ? given
                : entry.controlStack[entry.controlStack.length - 1] ?? entry.control ?? null
            const requestId = control?.id ?? header.requestId ?? null
            // Act lineage comes only from a trusted ControlRequest, never a source header.
            const actId = control?.actId ?? null
            const candidate = new PerceptCandidate({ ...header, requestId, actId }, materialize)
            const now = Date.now()
            // Closed still observes the header (debt); composition decides materialization.
            // A substituted regulator hears the change header; the offer does not wait for it.
            andThen(this._regulate('observe', { source: contract.name, change: changeHeader(candidate), now },
                aperture => aperture.observe(contract.name, candidate, now)), () => this._publishAperture())

            // Snapshot the path before asking: a gate removed mid-flight must not look
            // like permission. Walk from the source so the issuer is included.
            const expectedGates = enclosingAllOf(element, 'aperture')
            if (!expectedGates.includes(this)) expectedGates.unshift(this)
            const gates = expectedGates.map(gateIdOf)
            const asked = await this._askGates('acquisition', candidate, contract, gates)
            const annotated = new AnnotatedCandidate({
                candidate, contract,
                versions: asked.versions,
            })
            const acquisition = asked.verdict
            if (!attached() || this._membraneSleeping) return null
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
                if (candidate.requestId) {
                    fireControlResult(this, {
                        requestId: candidate.requestId,
                        candidateId: candidate.id,
                        accepted: false,
                        reason: 'busy',
                    })
                }
                return null
            }
            this._publishDecision(acquisition, annotated)
            if (candidate.requestId) {
                fireControlResult(this, {
                    requestId: candidate.requestId,
                    candidateId: candidate.id,
                    accepted: acquisition.permitted,
                    reason: acquisition.permitted ? 'accepted' : acquisition.reason,
                })
            }
            if (!acquisition.permitted) return null

            const regionGen = this._bindGen
            const comparator = comparatorOf(this)

            entry.busy = true
            let text
            let failed = false
            try {
                try {
                    text = await candidate.materialize(new RenditionRequest({
                        kinds: ['text'],
                        requestId: candidate.requestId,
                        detail: control?.kind === 'detail' ? control.detail : null,
                    }))
                } catch {
                    // A failed renderer is not a sensation; errors can themselves contain private payloads.
                    this.pub('materializationFailure', { source: contract.name, candidateId: candidate.id })
                    failed = true
                }
            } finally { entry.busy = false }

            if (failed) return null
            if (!attached() || this._membraneSleeping
                || !this._versionsHold(annotated)) return null

            const occurredAt = new Date(Math.min(now, candidate.occurredAt)).toISOString()
            const view = projectEvidenceView({
                id: candidate.id,
                sourceId: contract.name,
                modality: contract.modality,
                provenance: contract.provenance,
                tier: contract.tier,
                requestId: candidate.requestId,
                actId: candidate.actId,
                occurredAt,
                archivalText: text,
                eventType: `Sense-${contract.name}`,
            })

            let evaluations = []
            if (comparator) {
                const outcome = await runEvidenceCase({
                    owner: this,
                    view,
                    comparator,
                    liveComparator: () => comparatorOf(this),
                    ask: askComparator,
                    budget: this._compareBudget,
                    order: this._orderFor(contract.name),
                    aborts: this._compareAborts,
                    revalidate: () => attached() && !this._membraneSleeping
                        && this._bindGen === regionGen && this._versionsHold(annotated),
                })
                if (outcome == null) return null
                evaluations = outcome
            }

            // Awareness is the second pass of the same event, after materialization
            // and the version re-check, before interrupt-request. bypassAperture is
            // an acquisition privilege; tier 0 awareness mirrors decideGate's permitted
            // bit, including that bypass. Fresh verdicts; do not rewrite acquisition
            // versions or push the gain trail again.
            const awareness = (await this._askGates('awareness', candidate, contract, gates)).verdict
            if (awareness.permitted && (!attached() || this._membraneSleeping
                || !this._versionsHold(annotated))) {
                this._publishDecision(this._gateMissingVerdict('awareness', contract), annotated)
                return null
            }
            const percept = new Percept({
                id: candidate.id, sourceId: contract.name, modality: contract.modality,
                provenance: contract.provenance, tier: contract.tier, policy: contract.powers,
                requestId: candidate.requestId,
                actId: candidate.actId,
                occurredAt,
                record: new InterruptRecord({ source: 'External', type: `Sense-${contract.name}`, reason: text,
                    // Raw change magnitude. The requested floor is applied inside
                    // decideBid, not merged into evidence salience here.
                    salience: candidate.changeMagnitude, actId: candidate.actId }),
                gateTrail: [acquisition, awareness],
            })
            this._publishDecision(awareness, annotated)
            if (!awareness.permitted) return null
            if (evaluations.length) this._commitEvaluations(evaluations, percept)
            // The owner-local bidder is asked (shared/bidders.js); none: the default bid.
            const issued = await issueBid(this, {
                bidder: bidderOf(this, `a region (${this._gateId()})`),
                evidence: percept,
                evaluations,
                gainTrail: asked.gainTrail,
                requestedFloor: this._requestedFloor(),
            })
            if (!issued.bid) {
                this.pub('bidRefusal', { evidenceId: percept.id, reason: issued.refused })
                return null
            }
            const bid = issued.bid
            if (!attached() || this._membraneSleeping) return null
            const issuedAt = Date.parse(percept.dateTime)
            this._recordIssued(percept.id, Number.isFinite(issuedAt) ? issuedAt : Date.now())
            dispatchOnBehalf(element, 'interrupt-request', bidData(bid))
            return bid
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
        this._bindGen = (this._bindGen || 0) + 1
        const gen = this._bindGen
        if (!found[0]) {
            this._regulator = null
            this._adoptAperture(new Aperture({
                state: this.attr('aperture') || 'open',
                dwellMs: parseTime(this.attr('dwell') || '30s'),
                horizonMs: parseTime(this.attr('contactHorizon') || '10m'),
            }))
            return
        }
        // A message peer, held by name (M4). It announces itself when it connects
        // (children usually connect after this region); a regulator already up
        // answers the ask instead. Whichever lands first binds.
        const name = responderName(found[0])
        this._regulator = name
        askRegulator(this, name, 'snapshot').then(({ snapshot }) => {
            if (snapshot && this.isConnected && gen === this._bindGen) this._adoptRegulator(snapshot)
        })
    }

    /** A substituted regulator's announcement: bind to its first snapshot. */
    _onRegulatorUp = event => {
        if (event.target === this) return
        event.stopPropagation()
        if (!this._regulator || !this.isConnected || !sentByComponent(event)) return
        if (enclosingOf(event.target, 'aperture') !== this || responderName(event.target) !== this._regulator) return
        if (event.detail?.snapshot) this._adoptRegulator(event.detail.snapshot)
    }

    _adoptRegulator(snapshot) {
        if (this.aperture) {
            if (this.aperture instanceof RegulatorMirror && this.aperture.apply(snapshot)) this._publishAperture()
            return
        }
        const mirror = new RegulatorMirror(snapshot)
        if (!Number.isFinite(mirror.seq)) return
        this._adoptAperture(mirror)
    }

    /**
     * One regulator op. With the built-in policy, `local(aperture)` runs in place and
     * its result is returned as is. With a substituted regulator, the op is asked
     * (`regulate`), the reply's snapshot updates the mirror, and the result is a
     * Promise of whether the aperture changed; a silent regulator changed nothing.
     * Ops reach the regulator in the order they were issued: each is sent once the
     * one before it is answered (two in flight could land in either order, M5).
     */
    _regulate(op, data, local) {
        if (!this._regulator) return local(this.aperture)
        const gen = this._bindGen
        const name = this._regulator
        if (this._regulateGen !== gen) { this._regulateGen = gen; this._regulateTail = null }
        const answered = (this._regulateTail || Promise.resolve())
            .then(() => gen === this._bindGen ? askRegulator(this, name, op, data) : { changed: false, snapshot: null })
        this._regulateTail = answered
        return answered.then(({ changed, snapshot }) => {
            if (gen !== this._bindGen || !(this.aperture instanceof RegulatorMirror)) return false
            if (snapshot) this.aperture.apply(snapshot)
            return changed
        })
    }

    _adoptAperture(aperture) {
        if (this.aperture) return
        this.aperture = aperture
        if (this.enclosing('aperture')) {
            // `..` leaves this element, so the closest aperture is the enclosing one.
            this.sub('../..[provides~="aperture"]/gateVersions', list => this._onPathVersions(list)).catch(() => {})
        }
        this._publishAperture()
        this._assertUniqueApertureId()
        this._scanInterior()
        // Own announcement: this listener ignores target === this so the event
        // can bubble to the enclosing aperture. The membrane stops it if none.
        this.dispatchEvent(new CustomEvent('aperture-register', { bubbles: true }))
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
        // A source is asked by message from now on (`sample`, shared/sources.js).
        if (providesOf(el, 'source') && enclosingOf(el, 'aperture') === this) this.registerSource(el)
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
            // Spans used in tests have no source role and stay on explicit
            // registerSource. A source is asked by message (shared/sources.js).
            this.registerSource(el)
        }
    }

    _linkChild(el) {
        if (!el || el === this) return
        if (!this._children.includes(el)) this._children.push(el)
        if (this._childSubs.has(el)) return
        // Subscribe to the child's folded pressure by its id (M4: a ref, not a
        // handle). The retained value replays on subscribe, so a child that
        // published first is included. Nothing is sent down to the child (the
        // fold walks toward the membrane, never back down).
        const sub = this.sub(apertureRef(gateIdOf(el), 'contactPressure'),
            value => this._onChildPressure(el, value)).catch(() => null)
        this._childSubs.set(el, sub)
    }

    /** A child's pressure. `null` is a child leaving: unlink it unless it is
     *  still in this interior (moved within it, and about to publish again). */
    _onChildPressure(el, value) {
        if (!this._childSubs.has(el)) return
        if (value == null && !this._childProviders().includes(el)) {
            this._unlinkChild(el)
            return
        }
        this._childPressure.set(el, value)
        this._publishAperture()
    }

    _unlinkChild(el) {
        const i = this._children.indexOf(el)
        if (i >= 0) this._children.splice(i, 1)
        const sub = this._childSubs.get(el)
        this._childSubs.delete(el)
        this._childPressure.delete(el)
        sub?.then(desc => { if (desc) this.unsub(desc) })
        this._publishAperture()
    }

    /** The enclosing aperture's `gateVersions`: mirror them, and pass the path on
     *  (own version first) to this aperture's own children. */
    _onPathVersions(list) {
        this._pathVersions = new Map()
        for (const entry of Array.isArray(list) ? list : []) {
            if (typeof entry?.gate === 'string' && Number.isFinite(entry.version)) {
                this._pathVersions.set(entry.gate, entry.version)
            }
        }
        this._publishGateVersions()
    }

    /** This gate's version and every enclosing gate's, as last heard. Only the
     *  versions travel down: a parent's publish never makes a child publish its
     *  pressure back up, so the two topics cannot loop. */
    _publishGateVersions() {
        if (!this.aperture) return
        this.pub('gateVersions', [
            { gate: this._gateId(), version: this.aperture.version },
            ...[...this._pathVersions].map(([gate, version]) => ({ gate, version })),
        ])
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

    _onMindSleeping = () => {
        for (const controller of this._compareAborts || []) {
            try { controller.abort() } catch { /* cooperative */ }
        }
    }

    _orderFor(sourceName) {
        if (!this._sourceCommit) this._sourceCommit = new Map()
        let order = this._sourceCommit.get(sourceName)
        if (!order) {
            order = new CommitOrder()
            this._sourceCommit.set(sourceName, order)
        }
        return order
    }

    _commitEvaluations(evaluations, percept) {
        const predictionId = evaluations.find(e => e.subject?.kind === 'prediction')?.subject?.id ?? null
        const subjects = evaluations
            .filter(e => e?.subject?.kind && e.verdict)
            .map(e => ({ kind: e.subject.kind, verdict: e.verdict }))
        // The search controller hears this commit on the membrane (its request id,
        // evidence id, evaluation ids and verdicts): nothing else is handed to it.
        fireEvaluationCommit(this, evaluationCommitPayload({
            evaluationIds: evaluationIdsOf(evaluations),
            verdicts: verdictsOf(evaluations),
            evidenceId: percept.id,
            actId: percept.actId,
            predictionId,
            requestId: percept.requestId,
            subjects,
        }))
    }

    /**
     * Ask every gate on the path about one candidate (message-rule.md). The request
     * is plain data — the stage, the candidate's id, the frozen contract, the gate
     * ids — sent from this aperture, the source's nearest: every other gate on the
     * path encloses it, so the request bubbles through all of them and the membrane
     * stops it. Each gate replies with its verdict (at acquisition also its version
     * and gain factor). Collection ends when every gate has answered, one has
     * refused, or `gateDeadline` (default 500ms) passes. A gate that has not answered
     * denies: the composed verdict is `gate-missing` (monotone authority, M6).
     * Resolves to {verdict, versions, gainTrail}; never rejects.
     */
    async _askGates(stage, candidate, contract, gates) {
        const inPath = reply => reply.status === 'ok' && gates.includes(reply.from)
            && reply.data?.verdict?.gate === reply.from
        const refuses = reply => inPath(reply) && reply.data.verdict.permitted === false
        const { replies } = await this.requestAll('percept-candidate', {
            stage,
            candidateId: candidate.id,
            contract: { ...contract, powers: { ...contract.powers } },
            gates: [...gates],
        }, {
            deadline: this._gateDeadline(),
            until: got => got.some(refuses) || gates.every(g => got.some(r => inPath(r) && r.from === g)),
        })
        // One answer per gate, in path order (inner first), rebuilt from plain data.
        const answers = []
        for (const gate of gates) {
            const reply = replies.find(r => inPath(r) && r.from === gate)
            if (!reply) continue
            let verdict
            try { verdict = new GateVerdict(reply.data.verdict) } catch { continue }
            if (verdict.stage !== stage) continue
            answers.push({ gate, verdict, version: reply.data.version, gain: reply.data.gain })
        }
        const versions = []
        const gainTrail = []
        if (stage === 'acquisition') {
            for (const a of answers) {
                if (Number.isFinite(a.version)) versions.push({ gate: a.gate, version: a.version })
                // Enclosure may attenuate, never amplify: pushGainTrail throws on a
                // factor > 1, and that gate's answer then counts as missing.
                try { pushGainTrail(gainTrail, a.gate, a.gain) } catch { a.invalid = true }
            }
        }
        const valid = answers.filter(a => !a.invalid)
        const refused = valid.find(a => !a.verdict.permitted)
        let verdict
        if (refused) verdict = refused.verdict
        else if (gates.every(g => valid.some(a => a.gate === g))) {
            verdict = valid.find(a => a.gate === this._gateId())?.verdict
                || this._gateMissingVerdict(stage, contract)
        } else verdict = this._gateMissingVerdict(stage, contract)
        return { verdict, versions, gainTrail }
    }

    _gateDeadline() {
        const raw = this.attr('gateDeadline')
        if (!raw) return DEFAULT_GATE_DEADLINE_MS
        try { return parseTime(raw) } catch { return DEFAULT_GATE_DEADLINE_MS }
    }

    /**
     * This gate's answer to a candidate on its path, or undefined (abstain) when it
     * is not on the path, has no aperture yet, or the request did not come from an
     * aperture component. The contract is rebuilt from the request's plain data —
     * the frozen snapshot taken at registration, never the source's attributes now.
     */
    _gateAnswer(detail, event) {
        if (!detail || (detail.stage !== 'acquisition' && detail.stage !== 'awareness')) return undefined
        if (!this.aperture) return undefined
        if (!Array.isArray(detail.gates) || !detail.gates.includes(this._gateId())) return undefined
        // Authority comes from the sender (messageOrigin.js): only an aperture asks.
        if (!sentByComponent(event) || !providesOf(event.target, 'aperture')) return undefined
        let contract
        try { contract = new SourceContract(detail.contract) } catch {
            return { verdict: { ...this._gateMissingVerdict(detail.stage, null), reason: 'invalid-contract' } }
        }
        // Call the named permit* so a test (or a later policy) can stub one stage.
        const annotated = { stage: detail.stage, candidateId: detail.candidateId, contract }
        const verdict = detail.stage === 'awareness'
            ? this.permitAwareness(annotated)
            : this.permitAcquisition(annotated)
        const answer = { verdict: { ...verdict } }
        if (detail.stage === 'acquisition') {
            answer.version = this.aperture.version
            answer.gain = contract.powers.bypassAperture ? 1 : this.aperture.gain
        }
        return answer
    }

    _gateMissingVerdict(stage, contract) {
        return new GateVerdict({
            stage: stage === 'awareness' ? 'awareness' : 'acquisition',
            permitted: false,
            reason: 'gate-missing',
            bypass: contract?.powers?.bypassAperture === true,
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
                if (child !== this && providesOf(child, 'aperture') && gateIdOf(child) === id) {
                    throw new Error(`Aperture names must be unique within a membrane (${id})`)
                }
                walk(child)
            }
        }
        walk(root)
    }

    /**
     * Re-check every recorded `{ gate, version }` against that gate's live version:
     * this gate's own, and the enclosing gates' as last heard (`gateVersions`, M1).
     * The path is resolved by id on the current enclosing apertures (a structural
     * lookup yielding names): a gate that has left the tree, or never bound and so
     * never published, is a failed hold (drop), not permission.
     */
    _versionsHold(annotated) {
        const recorded = annotated.versions
        if (!recorded.length || !this.aperture) return false
        const own = this._gateId()
        const path = new Set(enclosingAllOf(this, 'aperture').map(gateIdOf))
        return recorded.every(entry => {
            if (entry.gate === own) return entry.version === this.aperture.version
            return path.has(entry.gate) && entry.version === this._pathVersions.get(entry.gate)
        })
    }

    sourceNames() {
        if (!this._sources) return []
        return [...this._sources.values()].map(s => s.source)
    }

    /** The frozen SourceContract of a registered source, by name. The one way a
     * controller may read a source's declared tier and decider without touching
     * the element: policy comes from the contract, never from the DOM. */
    contractFor(name) {
        if (!this._sources || !name) return null
        for (const entry of this._sources.values()) {
            if (entry.source === name) return entry.contract
        }
        return null
    }

    /** An `orient` request's plain request, rebuilt (shared/apertureRequests.js). */
    _orientFromRequest(data) {
        let request
        try { request = new OrientationRequest(data) } catch { return false }
        return this.requestOrientation(request)
    }

    /** A `control` request's plain request, rebuilt with its id (the attempt's). */
    _controlFromRequest(data) {
        let request
        try { request = new ControlRequest(data) } catch { return false }
        return this.requestControl(request)
    }

    requestOrientation(request) {
        if (!(request instanceof OrientationRequest)) {
            throw new Error('requestOrientation requires an OrientationRequest')
        }
        const name = this.attr('name') || this.localName
        if (request.aperture === name) {
            if (!this.aperture) return false
            return this.orient(request.state, request.source ?? null, Date.now(), { actId: request.actId })
        }
        // An aperture inside this one is asked by name, as a controller would ask it
        // (names are unique in a membrane, so only it answers). Resolves to whether
        // it oriented. Anything outside this aperture is not reached from here.
        if (!this._interiorApertureNames().includes(request.aperture)) return false
        return askOrientation(this, request)
    }

    /** Every aperture inside this one, nested ones too: names, not handles (M4). */
    _interiorApertureNames() {
        const names = []
        const walk = node => {
            for (const el of node.part ? node.part('aperture') : []) {
                names.push(gateIdOf(el))
                walk(el)
            }
        }
        walk(this)
        return names
    }

    /** Whether the aperture changed: a boolean with the built-in policy, a Promise
     *  of one with a substituted regulator. */
    orient(state, source = null, now = Date.now(), extra = {}) {
        if (!this.aperture) return false
        if (state === 'narrow' && ![...this._sources.values()].some(s => s.source === source)) return false
        const before = this.aperture.state
        const changed = this._regulate('orient', { state, source, now },
            aperture => aperture.orient(state, { source, now }))
        return andThen(changed, changed => {
            if (!changed || !this.aperture) return false
            this._transition(before, 'orientation', extra?.actId ?? null)
            return true
        })
    }

    /** The burst boundary advances the regulator. Returns nothing with the built-in
     *  policy, a Promise with a substituted regulator. */
    onBoundary(now = Date.now()) {
        if (!this.aperture) return
        const before = this.aperture.state
        const changed = this._regulate('advance', { now, awake: !this._membraneSleeping, arousal: this._arousal },
            aperture => aperture.advance(now, { awake: !this._membraneSleeping, arousal: this._arousal }))
        return andThen(changed, changed => {
            if (!this.aperture) return
            if (changed) this._transition(before, 'contact-deficit')
            else this._publishAperture()
        })
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
     * not an error and must not fall through to a later sibling. Children are
     * asked by message (_forwardControl): with any, the result is a Promise. */
    requestControl(request) {
        if (!(request instanceof ControlRequest)) throw new Error('requestControl requires a ControlRequest')
        if (!this.aperture) return false
        const sleeping = this._membraneSleeping
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
        const children = this._childProviders().map(gateIdOf)
        if (!children.length) return delivered
        return this._forwardControl(children, request, delivered)
    }

    /**
     * Forward to the child apertures, each asked by name with a `control` request
     * (shared/apertureRequests.js), as any controller would ask it. A named target
     * goes to one child at a time in tree order, so the first that owns it takes it
     * and a later sibling is never asked. An untargeted request goes to all of them
     * at once. A child silent past the deadline delivered nothing (M6).
     */
    async _forwardControl(children, request, delivered) {
        if (request.target != null) {
            for (const child of children) {
                if (await askControl(this, child, request)) return true
            }
            return delivered
        }
        const answers = await Promise.all(children.map(child => askControl(this, child, request)))
        return delivered || answers.some(Boolean)
    }

    /** Ask the source to sample. A source registered by message is asked with a
     * `sample` request, and the control is armed by id until the source has answered
     * and every offer it counted under it arrived (_controlForOffer). A callback
     * source (the door) gets the request snapshotted around the call so a second
     * control in the same turn cannot overwrite A's lineage with B's: `offer` reads
     * the stack top, not a single shared slot. */
    _armControl(entry, request) {
        if (!entry.sample) {
            const armed = { request, seen: 0, expected: null }
            if (entry.armed.size >= 16) entry.armed.delete(entry.armed.keys().next().value)
            entry.armed.set(request.id, armed)
            // Deferred as the callback door is: requestControl returns before any
            // source is sampled.
            Promise.resolve().then(() => askSample(this, entry.source, request)).then(offers => {
                armed.expected = offers
                this._settleArmed(entry, request.id, armed)
            })
            return
        }
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

    _settleArmed(entry, id, armed) {
        if (armed.expected != null && armed.seen >= armed.expected && entry.armed.get(id) === armed) {
            entry.armed.delete(id)
        }
    }

    /** The control an offer names, only if this region armed it for that source. */
    _controlForOffer(entry, controlId) {
        const armed = typeof controlId === 'string' ? entry.armed.get(controlId) : null
        if (!armed) return null
        armed.seen += 1
        this._settleArmed(entry, controlId, armed)
        return armed.request
    }

    /**
     * A source's `offer` (shared/sources.js): the nearest aperture answers and stops
     * it. The source is registered on first offer if its announcement has not landed
     * yet (a refused registration is the error reply). The materializer stays with
     * the source: the text is asked for by `offerId` only after acquisition.
     */
    async _offerAnswer(detail, event) {
        const el = event.target
        if (el === this || !el || el.nodeType !== 1) return undefined
        if (!providesOf(el, 'source') || enclosingOf(el, 'aperture') !== this) return undefined
        event.stopPropagation()
        if (!sentByComponent(event) || typeof detail?.offerId !== 'string') return undefined
        const offer = this.registerSource(el)
        const entry = this._sources.get(el)
        const control = this._controlForOffer(entry, detail.controlId)
        const materialize = (kinds, rendition) => askMaterialize(this, entry.source, detail.offerId, rendition)
        const bid = await offer(detail.header || {}, materialize, { control })
        return { bid: bid ? bidData(bid) : null }
    }

    _transition(from, reason, actId = null) {
        this._publishAperture()
        this.fire('aperture-change', { from, to: this.aperture.state, reason, actId: actId ?? null })
        if (from) this.fire('backstage', { text: `Attention aperture: ${from} → ${this.aperture.state} (${reason}).` })
        // Ask the sources for the present. No candidate or suppressed content is queued.
        // ControlRequest.template stays null — a semantic template must not enter the detector.
        this.requestControl(new ControlRequest({
            kind: 'sample',
            issuedBy: this.attr('name') || this.localName,
            reason: reason === 'orientation' ? 'orientation' : 'reopening',
            actId: actId ?? null,
            template: null,
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
        for (const item of receiptsFrom(e)) {
            const id = item.perceptId
            if (!this._issued.has(id)) continue
            const occurredAt = typeof item.occurredAt === 'number' ? item.occurredAt : Date.parse(item.occurredAt)
            const now = Date.now()
            this._issued.delete(id)
            // A substituted regulator's credit lands with its reply; publish it then.
            const credited = this._regulate('attended', { occurredAt, now },
                aperture => aperture.attended(occurredAt, now))
            if (credited instanceof Promise) credited.then(() => this._publishAperture())
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
        const childPressures = this._childProviders()
            .map(el => this._childPressure.get(el))
            .filter(value => value != null)
        const pressure = this.fold(own, childPressures)
        this.contactPressure = pressure
        this.pub('contactPressure', pressure)
        this.pub('apertureState', { state: this.aperture.state, focus: this.aperture.focus,
            contactPressure: pressure, gain: this.aperture.gain })
        // The enclosing aperture (only the nearest: tree, not graph) is subscribed.
        this._publishGateVersions()
    }

    _publishDecision(verdict, annotated) {
        this.pub('perceptDecision', {
            stage: verdict.stage,
            source: annotated.contract.name,
            permitted: verdict.permitted,
            reason: verdict.reason,
            changeMagnitude: annotated.candidate.changeMagnitude,
            apertureState: verdict.apertureState,
            candidateId: annotated.candidate.id,
            requestId: annotated.candidate.requestId ?? null,
        })
    }
}
