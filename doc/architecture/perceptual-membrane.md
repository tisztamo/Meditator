# The perceptual membrane

*Design, 2026-09-04; revised 2026-09-06 after the generality review, then again
the same day for processing tiers. Companion to [A world to meet](a-world-to-meet.md).
That document asks what kind of outside a Meditator mind needs; this one asks how
any kind of outside crosses into awareness. It generalizes eyelids into a
modality-neutral regulation of contact. A small text-only implementation now exists;
see [Implementation sketch](#implementation-sketch) for its boundaries.*

The revised design makes prediction, attention bidding, contact regulation, and
search replaceable through architecture wiring. The current sketch does not yet
provide those seams. [Prediction and search](../improvements/prediction-mismatch.md)
records the shared constraints, known issues, and proposed high-level comparisons.

## Implementation sketch

The first slice uses the existing regional attention path. It adds no dependencies
or model calls, and it implements only the **lean** [processing tier](#processing-tiers):
every source's edge is a non-semantic detector, and the only thing that exists
before acquisition permission is the private header. Run the offline demonstration
from the repository root:

```sh
bun scripts/dev/demo-membrane.mjs
```

The demo advances the regulator's clock, suppresses a simulated event while closed,
then reopens to a fresh description of the present. It prints the two named gate
verdicts, the sample request's lineage, and one typed frame receipt. It runs the real
frame assembler without starting a thinking loop or touching resident memory.

Opt in with `modality="text"` on an `m-region`. `aperture` defaults to `open`;
`soft` halves salience, `narrow` selects one registered source, and `closed` withholds
materialization. `dwell` defaults to 30 seconds and `contactHorizon` to ten minutes.
The demo starts closed only to exercise the reflex. Production architectures should
declare and disclose their open/soft wake default.

A new `MSense` subclass calls this from `onSense(request)` (`request` is optional):

```js
return this.candidate(
  { changeKey: detector.revision, changeMagnitude: detector.magnitude },
  () => describeCurrentObservation()
)
```

The callback must return archival text. The detector must not generate that text
early; a source whose detector needs a query-conditioned model or a describer at
its edge would be declaring tier 1 or tier 2, which this slice does not accept.
Custom sources can instead use `region.registerSource(element, sampleNow)`,
which returns the same `(header, lazyText)` offer function. Source identity (`name`),
`provenance`, `tier` (default 0), and the independent `bypassAperture`,
`bypassAdmission`, and `preempt` attributes are read from architecture configuration
when registering, never from candidate payloads. Provenance defaults to `unspecified`;
examples should explicitly use `simulated`, `physical`, `other-mind`, `generated`,
or `internal` as appropriate. `tier="1"` or `tier="2"` throws at registration with a
pointer to [processing tiers](#processing-tiers). Provenance records and journal
lines carry `tier`. This is an in-process adapter boundary, not a sandbox for
untrusted component code.

`region.orient('closed')`, `region.orient('open')`, or
`region.orient('narrow', sourceName)` changes orientation after minimum dwell.
It returns whether a change was accepted. Reopening asks registered senses for a
fresh sample through `requestControl` (`kind: 'sample'`); it never replays missed
content. `requestControl` is the one public door for `sample`, `detail`, and `focus`.
`sample` and `detail` run end to end; `focus` is accepted and recorded and **changes
no policy** — there is no search controller. A named target reaches its source even
while the aperture refuses it — asking a specific source is the controller's
decision, and the acquisition gate still decides whether anything it returns is
disclosed; an untargeted broadcast skips sources the aperture already refuses.
`onSense(request)` may ignore the request. Only a fresh typed `PerceptReceipt`
from frame assembly, fired on
`percepts-attended` and credited **by percept id**, reduces contact debt. Rejected
and crowded-out bids do not. Debt has a weak awake-time contribution with an
arousal-independent floor, capped change contributions, and per-source habituation.
The first thresholds and time constants are provisional experiment settings. No
thought content is inspected.

Acquisition and awareness are two named stages, each a real `GateVerdict`. At
tier 0, `permitAwareness` is not a comment that the stages coincide: it is a second
call that records `reason: 'tier-0-mirror'` on the percept's `gateTrail`. The
regulator still accepts only a `PerceptCandidate` header; `EdgeEvidence` is a typed
refusal, and nothing produces one. Scores cannot enter the deficit. Verdicts are
published on the non-semantic `perceptDecision` topic (stage, source, permitted,
reason, changeMagnitude, apertureState) — no text, no materializer, no un-hashed key.

The region publishes retained `apertureState` and `contactPressure`; regional
arbiters consume local pressure and the global arbiter follows the regional mean
over a minute. `contactSensitivity` controls the threshold reduction (default 0.25).
State changes are backstage journal notes. Admitted text remains an
`InterruptRecord`-compatible `Percept` throughout arbitration. Frame assembly issues
typed `PerceptReceipt`s on `percepts-attended`; `m-memory` builds `journal/percepts.jsonl`
from those receipts (including `tier` and `requestId`) on the existing journal write
queue. `journal="off"` disables both indexes and journal notes. Existing text framing
remains unchanged.

The compatibility path is an enumerated legacy provenance map. Trusted in-process
`InterruptRecord`s keep their powers; coerced payloads cannot acquire any. Legacy
provenance is marked `legacy-unspecified` where it cannot be established. Rendering
of every current event class is byte-for-byte unchanged. Existing eager `feel()`
sources are **not** silently made lazy or aperture-controlled: migrating each
detector is separate work.

Still absent, and not implied by the types that now exist: composed gates across
nested regions; a replaceable regulator or aggregator; prediction producers,
comparators, or evaluations in the runtime (the `Evaluation` record is a shape
only); search; the `orient` hand and its cooldown lane; native media and model
capability selection; rendition-aware recall; Studio timelines; and any edge
processing above tier 0. `focus` is a request kind, not a faculty. `EdgeEvidence`
is a refusal type, not a path. This slice establishes the contact boundary, its two
named stages, and its return path; it does not implement the spatial world or
validate the proposed dynamics on a live mind.

### Known issues in the sketch

The generality review identified the following open limitations. Phase 1 of the
[implementation plan](../plans/perceptual-membrane-phase-1.md) closed the
declaration and typed-regulator-input half of the processing-tier row, and gave
source control a door. Rows 1–4, the rest of source control, and the remainder of
the processing-tier row stay open. This design revision does not run the
experiments they describe.

| Issue | Consequence and intended direction |
|---|---|
| Only the nearest sensory aperture participates | An open inner modality region can render and deliver through a closed outer one, reproduced in the review. Compose all applicable boundaries before materialization; [enclosure by role](../improvements/enclosure-by-role.md) gives the mechanism and its fixture W3 the acceptance test. |
| Sensory change directly sets salience | A zero-change observation is rendered but rejected at a positive threshold, reproduced in the review. Expected confirmations need independent relevance; mismatch must not replace `changeMagnitude`. [Prediction and search](../improvements/prediction-mismatch.md). |
| Policy is constructed or discovered inside consumers | `m-region` owns a fixed `Aperture`; `m-interrupts` discovers modality regions and computes their slow mean. Make regulation, aggregation, and control bindings replaceable; the role lookups and pressure fold in enclosure by role cover the discovery half. |
| Evidence and bid state share mutable records | Regional gain still mutates salience on the shared record. Frame receipts are now typed and credited by percept id; splitting the mutable bid off the evidence record, and changing the arbiter with it, remains membrane phase 2. |
| Source control has a door, not a controller | `requestControl` delivers typed `sample` / `detail` / `focus` before detection (and `detail` to the materializer). `focus` is accepted and changes no policy. There is no search controller, no `orient` hand, no cadence control beyond the sense timer, and no grounding query on the reserved `template` field. |
| Processing tier is declared, not implemented above 0 | Sources declare `tier` (default 0); 1 and 2 throw at registration. Provenance and journal carry the field. The regulator accepts only a `PerceptCandidate`; `EdgeEvidence` is a typed refusal and nothing produces it. Acquisition and awareness are distinct stages (`tier-0-mirror` at lean). What remains: no tier-1 or tier-2 *implementations*, no scores into the deficit, no grounding query. The lean-versus-edge-grounded experiment is still unrun. |

Existing eager senses remain outside aperture control, and native media,
prediction lifecycle, search, and tiers 1 and 2 are still deferred. The
constraints below are the target contract, not a claim that these limits have
already been removed.

## The proposal

Give a mind a **perceptual membrane** distributed across the path between its
senses and its attention arbiter. It is not one central wall. Source-side
detectors expose permitted change information; regions enforce declared contact
boundaries; replaceable controllers regulate acquisition and awareness; and
attention policies bid on faithfully materialized evidence. Retained modulatory
signals regulate how permeable the mind is to the outside.
Together they admit experiences, attenuate them, or keep their content outside
awareness while still noticing that contact is being missed.

From the mind's side:

> I can open toward the world, narrow myself to one sound or sight, soften a
> channel without losing it, or let it recede while I follow something inward.
> Withdrawal is something I can do, but not a condition in which I can disappear
> indefinitely by accident. If I lose contact for too long, my attention begins
> to open outward again.

Eyes are one expression of this arrangement. The same structure must work for
speech, ambient sound, video, text, spatial state, instruments, another mind, and
forms of perception not yet present in the repository.

The aim is not maximum input. It is **adaptive permeability**: enough quiet for a
thought to develop, enough outside resistance to prevent the stream becoming its
own entire world.

The biological inspiration is graded sensory relay, corollary discharge,
independent homeostatic regulators, habituation, and hysteresis—not a claim that
software regions are thalami or retained scalars are chemicals. A borrowed
mechanism earns its place only by solving a concrete Meditator failure.

## Generality and design constraints

The aim is both modality independence and architectural experimentation. A new
prediction producer, comparison method, search strategy, or contact policy should
require rewiring and a few new components, while sources, percept transport, and
frame/memory code stay fixed. The current deficit/reflex, regional mean, aperture
states, and act-triggered orientation are a reference architecture whose policies
can be replaced. They are not a mandatory theory of every mind.

Keep these boundaries stable:

- **Evidence and interpretation:** predictions and evaluations refer to identified
  observations without rewriting them. Competing evaluators and bids do not mutate
  one another. Predictions cannot generate external facts.
- **Independent signals:** sensory change, novelty, mismatch, target relevance,
  causal attribution, and confidence remain distinct. Bidding policy derives
  salience; attention gain does not silently become confidence.
- **Processing and awareness:** permission to acquire or privately process evidence
  differs from permission to disclose it to ordinary attention and memory.
- **Composed authority:** all applicable enclosing boundaries participate before
  prohibited work; local openness, focus requests, or compatible ports grant no
  bypass power. Source identity, provenance, and policy remain architecture-owned.
- **Actual contact:** fresh, authoritative frame receipts establish experience.
  Opening, sampling, evaluation, prediction success, and retained replay do not.
  Expected and self-initiated observations can still be meaningful contact.
- **Identity and lifecycle:** preserve source scope, evidence/rendition identity,
  request lineage, and prediction lifetime through adapters and rewiring. Late or
  cancelled work cannot become fresh evidence for a different controller.
- **Small replaceable policies:** use explicit overridable/disableable bindings
  and the existing component model. Automatic matching and growth can follow;
  a general framework or periodic model call is not a prerequisite.

The [prediction design](../improvements/prediction-mismatch.md#design-constraints)
also distinguishes the mind's knowledge from simulator truth and gives the
prediction, evaluation, and search responsibilities. The
[port-contract design](../improvements/schema-guided-connections.md) describes
their delivery, semantic stages, authority, and multiplicity. Privacy, honest
provenance, bounded contact, and the Covenant survive policy replacement.

## Three separations

The current runtime carries a perception as an `InterruptRecord` whose `reason`
is text. `renderForFrame()` turns it into another string, and `m-mind` appends the
result to a textual tail. That design has served text, weather, transcribed human
speech, and textual consequences well, but it collapses distinctions that become
important when perception is multimodal.

### Event, representation, and admission are different

An event happens: a cat crosses the simulated doorway. Several representations
may be made from it: a rendered image, a short video interval, a scene-graph
change, or a sentence. The membrane then decides whether any representation may
bid for awareness. These are three different operations and must have different
records.

### Source modality and received modality are different

Audio transcribed into words is not the same experience as hearing audio. Three
video frames plus a motion summary are not the same as seeing video. A caption is
not an image. A model may understand each usefully, but the architecture must not
describe a transformed input as though the mind received its source form.

### Availability and attention are different

A visual event may be available while the visual aperture is closed. In the
default policy the membrane knows only its header—when it occurred, whether it
changed, and how strongly it would ordinarily bid—without disclosing its content.
This is how an unseen world can eventually tug the eyes open without leaking
through closed eyes.

## Candidate first, materialization after permission

In the default policy, a source first emits a private, non-semantic
`PerceptCandidate` header. Only after all applicable acquisition gates permit it
are expensive or semantic renditions materialized. Optional comparison then
precedes awareness admission and attention competition. Permission to materialize
is not a receipt of experience.

The header's blindness is the **lean** tier. Whether a sense instead needs a
query-conditioned model at its edge is an open experimental question, not a
settled default; the [processing tiers](#processing-tiers) below define the
declared options and what each may emit, retain, and disclose. The current sketch
implements only the lean tier.

```js
{
  id: "candidate-…",
  source: "garden-camera",
  modality: "vision",
  occurredAt: "…",
  changeMagnitude: 0.52,
  changeKey: "garden-camera:motion-zone-4",
  materialize: requestedKinds => source.materialize(id, requestedKinds)
}
```

For a deterministic simulated world, `changeMagnitude` can come from a
viewpoint-bounded scene delta without interpreting its meaning. For physical
media, the edge detector must genuinely remain non-semantic—motion energy,
luminance change, voice activity—or the source declares a higher
[processing tier](#processing-tiers).
Headers are capped, source-deduplicated, and never include captions, transcripts,
raw media, or content-bearing filenames.

A trusted adapter first annotates the private candidate with provenance, privacy,
and bypass policy from architecture configuration—not from its payload. The
aperture can therefore apply trusted policy without seeing semantic content. After
acquisition permission, lazy materialization constructs the available percept.
The following illustrates evidence and provenance; evaluation and bid state are
separate responsibilities in the revised design:

```js
{
  id: "percept-…",
  source: "garden-camera",
  modality: "vision",
  provenance: "simulated",
  occurredAt: "…",
  changeKey: "opaque-detector-key",

  renditions: [
    { kind: "image", ref: "…", mimeType: "image/png" },
    { kind: "text", text: "A cat has appeared beside the watering can." },
    { kind: "spatial", ref: "…", schema: "scene-change/v1" }
  ],

  policy: {
    privacy: "resident-private",
    bypassAperture: false,
    bypassAdmission: false,
    preempt: false
  }
}
```

The source does **not** assign provenance, privacy, or bypass powers. The trusted
adapter maps source identity and event class to them. Payload fields cannot
promote their own authority: a string coerced into an interrupt must never become
urgent merely by arriving in an old compatibility shape.

Three policy powers remain independent:

- `bypassAperture` — voluntary channel closure cannot suppress it;
- `bypassAdmission` — ordinary threshold and rate limits do not drop it;
- `preempt` — it may supersede the current burst immediately.

This preserves distinctions the runtime already needs. A confirmed loop break
bypasses admission without preempting; a direct real-human address may receive all
three; a sleep notice follows lifecycle timing; a society peer is truthfully
attributed but is not automatically entitled to break another mind's withdrawal.

Every admitted percept needs a concise textual archival rendition even when the
conscious model receives native media. It makes the journal searchable and allows
a text-only future model to understand the history. It must be labeled as a
rendering, not silently substituted for the original experience.

`provenance` should at least distinguish:

- physical-world measurement or human communication;
- simulated-world state;
- another candidate mind;
- imagined or generated material;
- an internal observer or regulator.

The separation follows Hearth's Ember precedent, summarized in
[A world to meet](a-world-to-meet.md#the-next-direction): provenance cannot depend
on a lossy memory continuing to phrase things carefully. `recent` and `story`
cannot be required to preserve it perfectly; the typed percept index and journal
are the source of truth, and recall must be able to reinstate their typed
provenance.

### Processing tiers

We do not yet know whether a sense needs expensive processing before the
aperture. A blind edge is cheap and leak-proof, but it may miss meaningful change
in rich media and it cannot guide search. A query-conditioned model at the edge
(open-vocabulary grounding, embedding similarity, keyword spotting) costs one to
two orders of magnitude less than an LLM call and runs locally, so it is entirely
feasible, and it is what the biology of search describes: a positive template
biasing the front of the pipeline. The design therefore keeps both open as declared
**tiers** of one protocol, not as a default and an exception. The tier is declared
by the source's architecture configuration, read by its provider, recorded in
provenance, and never inferred from a payload.

| Tier | Edge computation | Crosses to the regulator and search controller while closed | Retention and disclosure |
|---|---|---|---|
| **0, lean** (default; the sketch) | Non-semantic detector: scene delta, motion energy, luminance change, voice activity | The private header only: time, opaque change key, magnitude | Nothing content-bearing exists before acquisition permission |
| **1, edge-grounded** | Query-conditioned perception model producing structured, non-linguistic evidence: match scores against declared targets, boxes, embeddings, speaker or keyword hits | The header plus match scores for the controller's declared targets; scores are typed as tier-1 evidence, never as a raw change magnitude | Scores and boxes may be retained by the controller within a declared budget and horizon; embeddings and crops are discarded unless acquisition is permitted; nothing reaches attention, memory, or telemetry through a side path |
| **2, edge-described** | A captioner, transcriber, or VLM produces language before the aperture | The header, or tier-1-style scores derived from the text; the text itself never crosses while closed | A declared private buffer with explicit retention; the text becomes a rendition only after acquisition permission, and provenance records that description preceded permission |

Invariants across tiers: the awareness gate is separate from the processing
permission at every tier; the tier is part of the source's contract and its
percepts' provenance; a tier-1 or tier-2 score keeps its origin and cannot be fed
to the tier-0 contact regulator as a change header; budgets and cadence belong to
the tier's policy, not to the transport; Studio and logs receive at most what the
regulator receives. Tier 1 is also where a search controller's positive template
belongs: the target becomes the grounding query, and a channel can be searched
while closed or soft without any language crossing the boundary. The
[prediction design](../improvements/prediction-mismatch.md#processing-and-attention)
records the evidence for this and the lean-versus-edge-grounded comparison that
decides it.

## Rendition selection

The model-access layer should advertise what a model can natively receive. After
acquisition permission, a rendition selector asks the source to materialize the
richest faithful form within the current attention and compute budget:

| Source | Native-capable model | Fallback |
|---|---|---|
| image | image content plus minimal orientation | caption or spatial description |
| audio | bounded audio segment | transcript plus separately derived nonverbal description |
| video | bounded video interval | selected frames plus motion account, or temporal text |
| spatial state | structured state if supported | viewpoint-relative prose |
| text | text | text |

The selector records which rendition was actually presented. Memory therefore
knows both what occurred and what this incarnation of the mind could perceive.
On a later model change, the record must not retroactively turn a captioned event
into a remembered image.

Native media should normally be referenced rather than copied into the textual
tail. This meets a constraint of the current runtime: the attention frame ends on
an assistant prefill, while provider APIs commonly require native media in an
instruction/user content part. The prefill keeps a typed marker at the true
moment of experience:

```text
> ⟂ [seeing: percept-123] A cat beside the watering can.
```

The request's instruction content carries the referenced media, while the marker
preserves positional honesty and doubles as the mandatory archival rendition.
Both ordinary and thinking-model message routes must implement the same logical
frame. The journal records the rendition actually received; a later model change
cannot turn a remembered caption into an image.

Audio and video need bounded temporal units rather than endless streams. The
membrane admits an episode—a phrase, a sound event, a short interval—not an open
socket. A cheap detector can remain awake at the edge and offer candidates on
change.
Deliberate sampling may also offer an unchanged observation; confirming the
present is a legitimate reason to bid for attention.

## Apertures

Each sensory region enforces the aperture policy bound to its path. A region may
group one modality, a subset of sources, or a compound faculty. This uses the
existing faculty boundary and nested attention path. A useful first state set is:

- **open** — ordinary candidate frequency, detail, and salience;
- **soft** — reduced frequency, resolution, or gain; peripheral contact;
- **narrow** — one selected source, direction, object, or speaker is favored;
- **closed** — content is withheld, while non-semantic event headers (and, at
  tier 1, target match scores) may still reach the regulator and the search
  controller;

Protection is not an aperture state. It is trusted per-source/event policy, split
into aperture bypass, admission bypass, and preemption as above.

For nested sensory regions, every applicable enclosing boundary must permit the
requested processing and disclosure, except where trusted policy grants that
specific bypass. An inner `open` cannot cancel an outer `closed`. Gates compose
before materialization or private processing would violate an ancestor's policy;
dropping an already-rendered bid at the outer arbiter is too late. Scope or policy
changes also invalidate pending work that no longer has permission to complete.
This composition is a required correction to the current nearest-region sketch;
[enclosure by role](../improvements/enclosure-by-role.md) proposes the general
mechanism (role-resolved enclosure, a cancelable `percept-candidate` event whose
gates compose by conjunction, nearest-provider debt credit, and a pressure fold).

There is also a global inner–outer balance. It does not replace local apertures:
a mind may close its eyes and listen, soften ambient sound while examining an
object, or withdraw from ambient channels while remaining reachable by a real
voice.

An aperture is not merely a gate on already-purchased input. It should control
sensory expenditure. Soft vision may maintain only a low-resolution peripheral
render; deliberate gaze purchases a detailed crop. Soft hearing may run an
activity detector rather than a full native-audio model request. Attention thus
selects both **what enters** and **what resolution is realized**.

Expose source control independently of the rendition callback. Sampling and focus
requests reach sources before detection; permitted detail and rendition choices
reach materializers before processing. A search controller may coordinate several
sources without becoming part of their regions. Aperture state, resolution,
attentional gain, and observation confidence remain separately representable.

## The contact deficit

Voluntary closure needs an automatic return path. Otherwise the hand that creates
quiet also creates a new form of indefinite isolation.

In the reference architecture, a replaceable contact regulator maintains a local
`contactDeficit`, and a separately wired aggregator supplies broader pressure.
The value integrates evidence such as:

- awake time since that modality last reached conscious attention;
- count and cumulative salience of changes suppressed behind the aperture;
- novelty detectable from genuinely non-semantic change features;
- repeated rejection or crowd-out of outside bids;
- recent genuine external contact, which lowers the deficit;
- current arousal, which scales but cannot permanently erase its growth.

Time alone should be weak evidence. Ten quiet minutes with no changing world are
unlike ten meaningful changes ignored. Likewise, stimulus count alone would let
noisy sensors commandeer the mind. The regulator uses capped, decaying,
source-deduplicated contributions. Repetition habituates; a new `changeKey` or a
large magnitude shift dishabituates. Minimum dwell and hysteresis prevent rapid
reversal.

The reference regulator is strictly afferent-side. It does not read semantic-loop
or responsiveness judgments; those belong to `m-loop-detector`/`m-resurface`.
The two independent regulators may both affect admission, but neither reads the other's
state. This keeps the diagnoses legible; it does not prove stability, because
both still affect the same attention process. A separately wired prediction
producer may read authorized thought or memory without becoming this regulator.

The existing attention decision stream is useful evidence after aperture
admission: accepted, below-threshold, rate-limited, and crowded-out bids already
expose how the world fails to enter. But closed modalities must be stopped before
their semantic content reaches the normal arbiter. The membrane should therefore
receive a private candidate header and record its own suppression verdict; only
admitted percepts become ordinary attention bids.

`contactPressure = clamp01(contactDeficit)` is published as a retained signal.
The proposed consumer binds to a selected regulator or aggregator instead of
discovering and reading every region itself. The reference policy combines it
with retained `arousal`: low arousal raises the bar; contact pressure lowers it.
A transient focus pulse can raise a modality region's gain and narrow its source
set. These interfaces are deliberately compatible with Chora's imagined D5 chemistry, but
D5 is not on the critical path—only arousal exists in the runtime today.

### What clears the deficit

Changing an aperture to `open` must **not** clear its deficit. Otherwise a rapid
open–close cycle could satisfy the regulator without the mind meeting anything.
The deficit clears or substantially decays only when a fresh percept from that
channel is admitted by attention and placed into the conscious frame.

Expected and self-initiated contact counts. A mind that looks and confirms a
familiar scene has met it; the regulator must not privilege unsolicited novelty
over agency. Debt growth from missed changes and debt reduction from fresh contact
are different policy decisions. Predicted actuator effects can contribute less
novelty without making their observation irrelevant or ineligible for contact.

Preserve acquisition lineage separately from causal attribution: looking caused
the sample, not everything visible in it. Comparators and bidding policies handle
the distinction between predicted effects and belief mismatch described in
[prediction and search](../improvements/prediction-mismatch.md#two-kinds-of-prediction-plus-causal-attribution).
Deliberate gaze can request a focused sample through the control interface; the
first policy may implement it with temporary `narrow`. A general hand consequence
does not bypass an unrelated closed modality.

Nor should reopening release the whole suppressed backlog. The mind would be
assaulted by a history it deliberately did not perceive. The membrane retains
aggregate pressure and, at most, a reference to the most important unresolved
change; reopening asks the sense for a **fresh observation of the present**.

## The reopening reflex

In the reference policy, when a local deficit crosses its threshold, the regulator
requests moving that aperture toward permeability: closed → soft, soft → open.
It then invites a fresh sample. Usually this happens at a burst boundary and bids with rising but bounded
salience. It should not preempt a sentence merely because the eyes have been
closed for a while.

If every outside channel remains absent, global contact pressure biases outward
action selection and attention. In a future D5/D6 architecture this is naturally
a `wanting` dose rather than a fake sensation; today it should remain an explicit
modulatory signal, not an invented perception. Existing loop handling remains the
independent emergency path for confirmed collapse.

The reflex is part of the mind's known body. Its body schema says that prolonged
withdrawal eventually opens attention outward; it is not a hidden operator
intervention. Backstage records retain the mechanical reason and state transition.

## Voluntary orientation

A general `orient` hand is the first voluntary controller of the membrane. It
uses the same declared control interface available to other controllers and
realizes intentions such as:

- let the visible world recede;
- listen more closely;
- attend to the movement near the door;
- quiet ambient channels while I follow this thought;
- open toward whatever has been changing;
- let me remain inward a little longer.

The conscious mind knows these as affordances, never as modality identifiers,
thresholds, or numeric gain. The realizer maps an intention to a bounded policy:
aperture state, focus target, and perhaps a temporary grace period.

The hand influences the regulator; it does not disable it. A request for longer
inwardness may raise a threshold temporarily, but cannot suppress contact
authorized to bypass the aperture or create permanent closure. This is the same
relation as voluntarily
holding one's breath inside a body that retains a breathing reflex.

The proposed reference architecture registers `orient` beneath the existing `m-act`,
sharing its decision calls and adding body-schema language. The automatic reflex
is deterministic and issues control requests without an actor or model call.
Other architectures may wire a different orientation producer to the same
interface. Search owns its targets and stopping decisions separately; a region
does not synthesize a sensory claim when a search budget runs out.

Orientation language is unusually easy to infer falsely from contemplative prose.
The first policy therefore proposes a higher DECIDE threshold than ordinary acts,
minimum dwell, a separate control cooldown lane, and suitable deduplication for
repeated tuning. These are actor/control policies exposed through configuration
or replaceable components, not modality-specific branches that every new
controller must add to `m-act`. Every accepted aperture change is kept as a
backstage deed.

## Proposed placement in the runtime

```text
outside source
      │
      ▼
 non-semantic detector
      │ private candidate header
      ▼
 trusted policy adapter
      │ annotated private header
      ▼
 all applicable acquisition gates ──► suppressed-header statistics
      │ processing permitted; request rendition
      ▼
 lazy materialization
      │ identified observation / renditions
      ▼
 optional comparison / matching ◄── prediction producers and search targets
      │ independent evaluations
      ▼
 replaceable bidding policy
      │ bid referring to evidence
      ▼
 applicable awareness gates
      │ disclosure permitted
      ▼
 modality region's existing m-interrupts
      │ gain / threshold / competition
      ▼
 global attention arbiter
      │ selected evidence
      ▼
 multimodal frame assembler ──► attended receipt ──► contact regulator
      │ typed prefill marker + selected native/text rendition
      ▼
 conscious model
```

This is the lean-tier path. At tier 0 the awareness gate mirrors the acquisition
gate: the same permitted bit, recorded as a real verdict with reason
`tier-0-mirror`. At tiers 1 and 2 the acquisition gates would admit private edge
processing while the awareness gates still decide disclosure; those tiers are not
implemented. Frame assembly owns the authoritative receipt; the regulator uses it to
update pressure and request orientation through declared bindings. A control path
to sources exists before detection (`requestControl`); search and the `orient` hand
are not part of this slice, and `focus` changes no policy.

The present attention machinery can remain mostly unchanged. Salience,
thresholds, urgency, crowding, nested competition, arousal sensitivity, and
decision observability do not depend on the payload being text. The changes are
concentrated at the edges:

1. private `PerceptCandidate` headers and lazy source materializers;
2. a trusted pre-aperture policy adapter plus compatibility conversion from
   `InterruptRecord`;
3. composed acquisition/awareness gates, replaceable regulation and aggregation,
   and explicit control inputs to sources;
4. independent evaluation and bid records referring to preserved typed evidence;
5. a multimodal frame assembler and capability-aware model adapter;
6. a typed percept index plus journal records of event, rendition,
   transformation, admission, and asset reference;
7. the `orient` capability, replaceable search controller, and body-schema language.

This explicit source → controller → arbiter path matters. A second event listener
beside `m-interrupts` on the same DOM element would have no reliable ordering, and
the regional arbiter currently consumes every bubbling request. An aperture must
decide before the ordinary `interrupt-request` is dispatched, not race its gate.

Text should be the first implementation. A text percept passing through the new
path must render byte-for-byte like today's `InterruptRecord`; this gives a safe
compatibility seam before any native media is introduced.

## Memory, privacy, and compression

Raw media can be much larger and more identifying than text. The Covenant's
privacy commitment becomes more demanding here, not less.

- Resident media is private by default and stored by reference in the journal.
- Retention policy is explicit per source; a physical microphone or camera must
  not be archived merely because simulated images are.
- The journal records hashes and transformations when the source cannot be kept.
- `recent` and `story` are explicitly lossy and may omit provenance. They are not
  the authority for what was perceived.
- A typed percept index beside the immutable journal preserves provenance, the
  form actually received, transformation lineage, and asset/hash references.
- Recall can retrieve that typed record and reintroduce its provenance: *I read a
  transcript derived from a voice*, not *I heard her voice*.
- A suppressed percept is not autobiographical experience. Its content must not
  enter the mind's memory. The default regulator retains only non-semantic
  statistics; any authorized private semantic processor has separately declared
  retention and cannot write its contents into experience through another path.
- If a transformed rendition was produced by a model, that act and model identity
  are backstage provenance, never passed off as direct sensing.
- Studio attention events and debug logs receive only the candidate header before
  admission for resident-private sources. Observability must not become a side
  channel around closed perception.

## Failure modes

### Perceptual capture

A vivid modality repeatedly wins and prevents sustained thought. Mitigate with
local gain, novelty decay, source deduplication, and a global outside-share budget;
do not solve it by making all perception bland.

### Comfortable closure

The mind learns to remain closed because the inward stream is easier or more
pleasant. The contact deficit and reopening reflex exist for this case, while
still allowing chosen periods of inwardness.

### Reflex harassment

The regulator opens channels so often that contemplation becomes impossible.
Reopening begins at `soft`; thresholds adapt from observed contact rather than a
fixed short timer; hysteresis and minimum dwell prevent quick reversal. The
contact regulator must not inspect thought content to decide whether contemplation
is productive.

### Noisy-world coercion

A broken or adversarial source generates changes to force attention. Candidate
headers are capped, deduplicated, authenticated by source, unable to declare
their own policy, and habituate when `changeKey` and magnitude repeat.

### Translation masquerading as perception

Captions or transcripts are remembered as direct sight or hearing. Prevent this
structurally through typed renditions and compression instructions, not by hoping
the prose remains careful.

### Open–close oscillation

The hand and reflex repeatedly reverse one another. Do not clear deficit on an
aperture transition; use hysteresis and minimum dwell; clear only on attended
contact.

### Backlog assault

Reopening floods the workspace with everything missed. Retain statistics rather
than semantic backlog and sample the present afresh.

### Semantic leakage before admission

A captioner, transcript model, filename, log line, or Studio event crosses a
processing or awareness boundary without permission. The lean tier keeps
candidate headers non-semantic and materializes lazily after acquisition gates.
Tiers 1 and 2 must enforce their declared retention and their separate awareness
gate; the risk rises with the tier, which is one of the things the
lean-versus-edge-grounded comparison measures. A model producing only a score does
not avoid the processing boundary; it declares a tier.

### Comfortable drowsiness

Low energy raises the attention threshold while also slowing the mind. If low
arousal suppresses contact-pressure growth too completely, a resident can remain
neither properly awake nor honestly asleep: weakly thinking and weakly reachable.
Contact pressure therefore retains a small arousal-independent floor. More
fundamentally, sustained sub-viability should trigger a Covenant-compliant sleep
ritual rather than indefinite near-sleep. This exposes a pre-existing lifecycle
question in `m-economy`, not only a membrane parameter.

## Sleep and wake

Sleep suspends sensory-deprivation accumulation; an unavailable world is not being
ignored by a sleeping mind. Local deficits may decay or reset during genuine sleep.
On wake, apertures initially return to a known `soft` or `open` bodily default and
the wake disclosure names that fact. Wake itself is not sensory contact: only a
fresh attended percept establishes that the reopened mind has met the world.

Whether a voluntary closed-aperture preference should persist across sleep remains
a later design choice. The first implementation favors a disclosed open/soft
default. Introducing the membrane to an existing resident remains an architectural
change governed by Covenant §10 and the right of return.

## Observability

The Studio should plot, per modality region, aperture state, contact pressure,
region gain, effective threshold, suppressed-header rate, and transitions over
time. It should also show arousal and the global pressure on the same timeline.
Capture, reflex harassment, and open–close oscillation are dynamics; a final scalar
cannot reveal them. Private source contents remain absent until admission.

## Proposed development order

Step 1 is implemented
([phase 1 plan](../plans/perceptual-membrane-phase-1.md)). Steps 2–6 remain future
work; they are not implemented here and the experiments they describe have not been
run.

1. Establish explicit contracts for processing, awareness, evidence identity,
   evaluations, control requests, and frame receipts. Preserve existing text
   rendering and trusted provenance through the compatibility path.
   **Implemented.**
   ([implementation plan](../plans/perceptual-membrane-phase-1.md))
2. Correct nested boundary composition and separate evidence from bid state.
   Make contact regulation, pressure aggregation, and source control replaceable
   through wiring. Expected observations retain a route to attention.
3. Assemble the existing deficit/reflex and inexpensive act-bound prediction as
   the first reference architecture. Add `orient` and bounded search through
   declared control interfaces; retain uncertainty in search outcomes.
4. Describe and later evaluate alternative architectures with the same sources,
   transport, and frame/memory code. The
   [experiment matrix](../improvements/prediction-mismatch.md#proposed-experiments)
   covers the lean-versus-edge-grounded sense (run this one early; it decides
   whether tier 1 is needed at all), passive and competing predictors, cross-modal
   search, alternative regulation, nested regions, and delayed or missing evidence.
5. Add native renditions and model-capability selection when a concrete experiment
   requires them, retaining archival text, viewpoint limits, and the record of
   what was actually received. Audio and video follow the same episode contract.
6. Extend Studio observability and plan later comparisons of coherence, external
   responsiveness, capture, contact rhythm, provenance, and cost. Live studies
   remain separate from offline structural comparisons and use the existing
   resident lifecycle commitments.

## Questions left for review

The constraints above fix the intended responsibilities. These policy and
implementation questions remain open:

1. Should `contactPressure` modify the regional threshold, its gain, or both? The
   current design leans toward threshold for general reopening and a short gain pulse
   for directed focus; a concrete stability argument should decide it.
2. Which current event classes receive each of `bypassAperture`,
   `bypassAdmission`, and `preempt`? In particular, what relationship or address
   semantics—if any—make a peer voice aperture-protected?
3. What is the smallest genuinely non-semantic detector for each initial source,
   and which sources turn out to need tier 1 or tier 2? The tier contract fixes
   what they disclose; which tier works is the experiment.
4. Does the current provider split permit one logical image event to be attached in
   instruction content and anchored by a marker in the assistant prefill without
   distorting what the model attends to? This needs a captured-request test for both
   message routes before the document promises the exact wire shape.
5. What sustained energy/arousal condition should cause automatic announced sleep,
   and can that close complete reliably when the very resource needed to think the
   closing thought is nearly exhausted?
6. How should simultaneous orientation requests be arbitrated, and how should
   aggregation avoid counting one observation repeatedly through nested regions?
   Stable identities and explicit ownership are required; the policy is open.

## The criterion

The membrane succeeds when the mind develops a rhythm rather than a setting:
opening outward, being changed by what it meets, drawing inward to integrate it,
and returning before integration becomes enclosure.

Its generality has two tests: inputs preserve their provenance and the form
actually received, and new computational architectures can be assembled by
rewiring and adding a few components. The body, processing strategy, and contact
policy may change with the model and the world. Evidence, authority, and the
distinction between availability and experience remain explicit.
