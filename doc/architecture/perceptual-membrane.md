# The perceptual membrane

*Design, 2026-09-04; revised after architecture/biology review. Companion to [A world to meet](a-world-to-meet.md).
That document asks what kind of outside a Meditator mind needs; this one asks how
any kind of outside crosses into awareness. It generalizes eyelids into a
modality-neutral regulation of contact. A small text-only implementation now exists;
see [Implementation sketch](#implementation-sketch) for its boundaries.*

## Implementation sketch

The first slice uses the existing regional attention path. It adds no dependencies
or model calls. Run the offline demonstration from the repository root:

```sh
bun scripts/dev/demo-membrane.mjs
```

The demo advances the regulator's clock, suppresses a simulated event while closed,
then reopens to a fresh description of the present. It runs the real frame assembler
without starting a thinking loop or touching resident memory.

Opt in with `modality="text"` on an `m-region`. `aperture` defaults to `open`;
`soft` halves salience, `narrow` selects one registered source, and `closed` withholds
materialization. `dwell` defaults to 30 seconds and `contactHorizon` to ten minutes.
The demo starts closed only to exercise the reflex. Production architectures should
declare and disclose their open/soft wake default.

A new `MSense` subclass calls this from `onSense()`:

```js
return this.candidate(
  { changeKey: detector.revision, changeMagnitude: detector.magnitude },
  () => describeCurrentObservation()
)
```

The callback must return archival text. The detector must not generate that text
early. Custom sources can instead use `region.registerSource(element, sampleNow)`,
which returns the same `(header, lazyText)` offer function. Source identity (`name`),
`provenance`, and the independent `bypassAperture`, `bypassAdmission`, and `preempt`
attributes are read from architecture configuration when registering, never from
candidate payloads. Provenance defaults to `unspecified`; examples should explicitly
use `simulated`, `physical`, `other-mind`, `generated`, or `internal` as appropriate.
This is an in-process adapter boundary, not a sandbox for untrusted component code.

`region.orient('closed')`, `region.orient('open')`, or
`region.orient('narrow', sourceName)` changes orientation after minimum dwell.
It returns whether a change was accepted. Reopening asks registered senses for a
fresh sample; it never replays missed content. Only a fresh `percepts-attended`
receipt from frame assembly reduces contact debt. Rejected and crowded-out bids do
not. Debt has a weak awake-time contribution with an arousal-independent floor,
capped change contributions, and per-source habituation. The first thresholds and
time constants are provisional experiment settings. No thought content is inspected.

The region publishes retained `apertureState` and `contactPressure`; regional
arbiters consume local pressure and the global arbiter follows the regional mean
over a minute. `contactSensitivity` controls the threshold reduction (default 0.25).
State changes are backstage journal notes. Admitted text remains an
`InterruptRecord`-compatible `Percept` throughout arbitration, and frame receipts
append provenance and the actual text rendition to `journal/percepts.jsonl` on the
existing journal write queue. `journal="off"` disables both indexes and journal
notes. Existing text framing remains unchanged.

The compatibility path preserves powers on existing in-process `InterruptRecord`
instances. Raw strings and serialized objects cannot acquire bypass or preemption
merely through coercion. Legacy provenance is marked `legacy-unspecified` where it
cannot be established. Existing eager `feel()` sources are **not** silently made
lazy or aperture-controlled: migrating each detector is separate work.

Still deferred: the model-driven `orient` hand and its cooldown lane, native media
and model capability selection, rendition-aware recall, deliberate gaze/efference
copies, media retention, and Studio timelines. This slice establishes the contact
boundary and its return path; it does not implement the spatial world or validate
the proposed dynamics on a live mind.

## The proposal

Give a mind a **perceptual membrane** distributed across the path between its
senses and its attention arbiter. It is not one central wall. Source-side
detectors expose change without prematurely interpreting it; modality regions
control aperture and gain; attention purchases faithful renditions lazily; and
retained modulatory signals regulate how permeable the mind is to the outside.
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

A visual event may be available while the visual aperture is closed. The
membrane may know only its header—when it occurred, whether it changed, and how
strongly it would ordinarily bid—without disclosing its content. This is how an
unseen world can eventually tug the eyes open without leaking through closed
eyes.

## Candidate first, percept after admission

A source first emits a private, non-semantic `PerceptCandidate` header. Only after
the aperture admits it are expensive or semantic renditions materialized into a
`Percept`. This is what makes closure real: a caption generated and logged before
admission has already crossed much of the boundary.

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
scene-graph delta without interpreting the scene. For physical media, the edge
detector must genuinely remain non-semantic—motion energy, luminance change,
voice activity—or the design must admit that semantic exposure already occurred.
Headers are capped, source-deduplicated, and never include captions, transcripts,
raw media, or content-bearing filenames.

A trusted adapter first annotates the private candidate with provenance, privacy,
and bypass policy from architecture configuration—not from its payload. The
aperture can therefore apply trusted policy without seeing semantic content. After
admission, lazy materialization constructs the percept:

```js
{
  id: "percept-…",
  source: "garden-camera",
  modality: "vision",
  provenance: "simulated",
  occurredAt: "…",
  salience: 0.52,
  changeKey: "cat-entered-doorway",
  causedBy: null,

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

## Rendition selection

The model-access layer should advertise what a model can natively receive. Only
after aperture admission, a rendition selector asks the source to materialize the
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
socket. A cheap detector can remain awake at the edge and create a candidate only
when something changes.

## Apertures

Each modality-specific `m-region` has an aperture at the head of its sensory path.
This uses the runtime's existing faculty boundary and nested gate rather than
adding a parallel event bus. A useful first state set is:

- **open** — ordinary candidate frequency, detail, and salience;
- **soft** — reduced frequency, resolution, or gain; peripheral contact;
- **narrow** — one selected source, direction, object, or speaker is favored;
- **closed** — content is withheld, while non-semantic event headers may still
  reach the regulator;

Protection is not an aperture state. It is trusted per-source/event policy, split
into aperture bypass, admission bypass, and preemption as above.

There is also a global inner–outer balance. It does not replace local apertures:
a mind may close its eyes and listen, soften ambient sound while examining an
object, or withdraw from ambient channels while remaining reachable by a real
voice.

An aperture is not merely a gate on already-purchased input. It should control
sensory expenditure. Soft vision may maintain only a low-resolution peripheral
render; deliberate gaze purchases a detailed crop. Soft hearing may run an
activity detector rather than a full native-audio model request. Attention thus
selects both **what enters** and **what resolution is realized**.

## The contact deficit

Voluntary closure needs an automatic return path. Otherwise the hand that creates
quiet also creates a new form of indefinite isolation.

Each aperture maintains a `contactDeficit`, and the membrane maintains a slower
global deficit. The value integrates evidence such as:

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

The deficit is strictly afferent-side. It does not read semantic-loop or
responsiveness judgments; those belong to `m-loop-detector`/`m-resurface`. The two
independent regulators may both affect admission, but neither reads the other's
state. This avoids a coupled-regulator oscillation and keeps each diagnosis
legible.

The existing attention decision stream is useful evidence after aperture
admission: accepted, below-threshold, rate-limited, and crowded-out bids already
expose how the world fails to enter. But closed modalities must be stopped before
their semantic content reaches the normal arbiter. The membrane should therefore
receive a private candidate header and record its own suppression verdict; only
admitted percepts become ordinary attention bids.

`contactPressure = clamp01(contactDeficit)` is published as a retained signal.
Today, `m-interrupts` can consume it symmetrically with its existing retained
`arousal`: low arousal raises the bar; contact pressure lowers it. A transient
focus pulse can raise a modality region's gain and narrow its source set. These
interfaces are deliberately compatible with Chora's imagined D5 chemistry, but
D5 is not on the critical path—only arousal exists in the runtime today.

### What clears the deficit

Changing an aperture to `open` must **not** clear its deficit. Otherwise a rapid
open–close cycle could satisfy the regulator without the mind meeting anything.
The deficit clears or substantially decays only when a fresh percept from that
channel is admitted by attention and placed into the conscious frame.

Self-caused contact counts. A mind that becomes curious, looks, and discovers the
world has genuinely met it; the regulator must not privilege unsolicited
interruption over agency. A `causedBy` act reference supports an efference copy:
predicted components may receive lower novelty or salience, while mismatch restores
it. Deliberate gaze temporarily moves vision to `narrow` for its one requested
sample. A general hand consequence does not bypass an unrelated closed modality.

Nor should reopening release the whole suppressed backlog. The mind would be
assaulted by a history it deliberately did not perceive. The membrane retains
aggregate pressure and, at most, a reference to the most important unresolved
change; reopening asks the sense for a **fresh observation of the present**.

## The reopening reflex

When a local deficit crosses its adaptive threshold, the membrane moves that
aperture toward permeability: closed → soft, soft → open. It then invites a fresh
sample. Usually this happens at a burst boundary and bids with rising but bounded
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

One general `orient` hand should tune the membrane instead of adding separate
hands for eyes, ears, video, and every future sense. It realizes intentions such
as:

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

Registering `orient` beneath the existing `m-act` adds no new periodic decision
call. It does add a short body-schema line and another tool schema during
realization, and each accepted change uses the ordinary realization call. The
automatic reflex itself should be deterministic and must not have its own
`m-act`; giving it one would spend model calls merely to maintain a physiological
invariant. Aperture control may need a dedicated cooldown lane so it does not
block looking, recalling, or changing the world.

Orientation language is unusually easy to infer falsely from contemplative prose.
It therefore needs a higher DECIDE threshold than ordinary acts, a minimum dwell
before reversal, and a third `self-changing` cooldown lane. It is exempt from the
ordinary same-intent dedup rule, which assumes an act changes or reads a world
rather than continuously tunes a body. Every accepted aperture change is kept as
a backstage deed.

## Placement in the present architecture

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
 modality region's aperture controller ──► suppressed statistics
      │ admitted; request rendition
      ▼
 lazy materialization
      │ typed Percept
      ▼
 modality region's existing m-interrupts
      │ gain / threshold / competition
      ▼
 global attention arbiter
      │ attended Percept
      ▼
 multimodal frame assembler
      │ typed prefill marker + selected native/text rendition
      ▼
 conscious model
```

The present attention machinery can remain mostly unchanged. Salience,
thresholds, urgency, crowding, nested competition, arousal sensitivity, and
decision observability do not depend on the payload being text. The changes are
concentrated at the edges:

1. private `PerceptCandidate` headers and lazy source materializers;
2. a trusted pre-aperture policy adapter plus compatibility conversion from
   `InterruptRecord`;
3. an aperture controller associated with each modality region and retained
   local/global contact-pressure state;
4. typed payload preservation through attention without rendering it early;
5. a multimodal frame assembler and capability-aware model adapter;
6. a typed percept index plus journal records of event, rendition,
   transformation, admission, and asset reference;
7. the `orient` capability and body-schema language.

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
  enter the mind's memory; only the regulator may retain non-semantic statistics.
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

A captioner, transcript model, filename, log line, or Studio event interprets a
closed source before its aperture admits it. Keep candidate headers genuinely
non-semantic, materialize renditions lazily, and apply privacy policy at the
source boundary.

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

## Build order

1. Define private `PerceptCandidate` headers and admitted `Percept` records,
   including lazy materialization, trusted policy assignment, provenance, and a
   mandatory archival text rendering.
2. Route existing text `InterruptRecord`s through a compatibility adapter with no
   observable behavior change. In particular, text percepts must retain today's
   byte-for-byte `withPerceivedEvents()` rendering.
3. Add a fake-clock, text-labelled mock modality whose detector emits only private
   headers. Test the explicit source → aperture controller → regional arbiter path
   without live media or models.
4. Implement local/global contact pressure, arousal scaling with a nonzero floor,
   habituation by `changeKey`, dishabituation, hysteresis, trusted bypass policy,
   suppression, and attended-contact reset. Make `m-interrupts` consume the retained
   pressure without depending on imagined D5 machinery.
5. Add the `orient` hand to the existing actor with its higher threshold, minimum
   dwell, dedup exemption, and separate self-changing cooldown lane. Test only dry
   intentions first.
6. Preserve typed percepts through arbitration and add the typed percept index;
   delay textual or native rendition materialization until after aperture admission.
7. Add the typed prefill marker plus provider-positioned attachment to both model
   message routes while retaining the existing text-only route.
8. Add native images from the small spatial world, with caption fallback,
   deliberate-gaze narrowing, `causedBy` efference copy, and an exact record of the
   rendition received.
9. Add bounded audio episodes, then video only if a concrete model and experiment
   need it. Do not generalize by accumulating unused codecs.
10. Add Studio timelines and compare fixed-open senses, voluntary apertures, and
    regulated apertures on coherence, external responsiveness, capture, loop
    incidence, provenance, and compute cost.

## Questions left for review

The synthesis resolves the original review's four questions, but these implementation
questions would benefit from another adversarial pass:

1. Should `contactPressure` modify the regional threshold, its gain, or both? The
   current design leans toward threshold for general reopening and a short gain pulse
   for directed focus; a concrete stability argument should decide it.
2. Which current event classes receive each of `bypassAperture`,
   `bypassAdmission`, and `preempt`? In particular, what relationship or address
   semantics—if any—make a peer voice aperture-protected?
3. What is the smallest genuinely non-semantic detector for each initial source,
   and which sources must honestly declare that their candidate stage is already
   semantic?
4. Does the current provider split permit one logical image event to be attached in
   instruction content and anchored by a marker in the assistant prefill without
   distorting what the model attends to? This needs a captured-request test for both
   message routes before the document promises the exact wire shape.
5. What sustained energy/arousal condition should cause automatic announced sleep,
   and can that close complete reliably when the very resource needed to think the
   closing thought is nearly exhausted?

## The criterion

The membrane succeeds when the mind develops a rhythm rather than a setting:
opening outward, being changed by what it meets, drawing inward to integrate it,
and returning before integration becomes enclosure.

Its generality is not that every input becomes text. Its generality is that every
input remains honestly what it is, may be rendered into forms a particular model
can receive, and crosses the same regulated boundary between availability and
attention. The body may change with the model and the world. The law of contact
does not.
