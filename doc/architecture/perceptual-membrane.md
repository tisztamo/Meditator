# The perceptual membrane

*Design, 2026-09-04. Companion to [A world to meet](a-world-to-meet.md).
That document asks what kind of outside a Meditator mind needs; this one asks how
any kind of outside crosses into awareness. It generalizes eyelids into a
modality-neutral regulation of contact. Nothing here is implemented yet.*

## The proposal

Give a mind a **perceptual membrane** between its senses and its attention
arbiter. The membrane controls how permeable the mind is to the outside as a
whole and to each modality separately. It admits experiences, attenuates them,
or keeps their content outside awareness while still noticing that contact is
being missed.

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

## A modality-neutral percept

The eventual successor or extension to `InterruptRecord` should be a structured
`Percept`. The name below is illustrative; the contract matters more than its
serialization.

```js
{
  id: "percept-…",
  source: "garden-camera",
  modality: "vision",
  provenance: "simulated",
  occurredAt: "…",
  salience: 0.52,
  changeKey: "cat-entered-doorway",

  renditions: [
    { kind: "image", ref: "…", mimeType: "image/png" },
    { kind: "text", text: "A cat has appeared beside the watering can." },
    { kind: "spatial", ref: "…", schema: "scene-change/v1" }
  ],

  privacy: "resident-private",
  lifetime: "fresh",
  urgent: false
}
```

Every percept needs a concise textual archival rendition even when the conscious
model receives native media. That rendition makes the journal searchable and
allows a text-only future model to understand the history. It must be labeled as
a rendering, not silently substituted for the original experience.

`provenance` should at least distinguish:

- physical-world measurement or human communication;
- simulated-world state;
- another candidate mind;
- imagined or generated material;
- an internal observer or regulator.

This field must survive compression. The lesson from Ember applies generally:
provenance cannot depend on a lossy memory continuing to phrase things carefully.

## Rendition selection

The model-access layer should advertise what a model can natively receive. At
frame assembly, a rendition selector chooses the richest faithful form within
the current attention and compute budget:

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
tail. The assembled model request becomes an ordered sequence of content parts;
the durable tail remains a canonical textual chronology with typed media
references. Exact replay can mount the retained asset when policy permits.

Audio and video need bounded temporal units rather than endless streams. The
membrane admits an episode—a phrase, a sound event, a short interval—not an open
socket. A cheap detector can remain awake at the edge and create a candidate only
when something changes.

## Apertures

Each modality has an aperture. A useful first state set is:

- **open** — ordinary candidate frequency, detail, and salience;
- **soft** — reduced frequency, resolution, or gain; peripheral contact;
- **narrow** — one selected source, direction, object, or speaker is favored;
- **closed** — content is withheld, while non-semantic event headers may still
  reach the regulator;
- **protected** — a channel or event class that voluntary withdrawal cannot
  suppress, such as a real person directly addressing the mind, a sleep notice,
  or a safety event.

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
- novelty or prediction error detectable without revealing event content;
- repeated rejection or crowd-out of outside bids;
- semantic looping or loss of responsiveness in the inner stream;
- recent genuine external contact, which lowers the deficit;
- active, coherent inward work, which can slow but not erase its growth.

Time alone should be weak evidence. Ten quiet minutes during productive thought
are unlike ten meaningful changes ignored. Likewise, stimulus count alone would
let noisy sensors commandeer the mind. The regulator needs capped, decaying,
source-deduplicated contributions.

The existing attention decision stream is useful evidence: accepted, below
threshold, rate-limited, and crowded-out bids already expose how the world fails
to enter. But closed modalities must be stopped before their semantic content
reaches the normal arbiter. The membrane should therefore receive a private
candidate header and record its own suppression verdict; only admitted percepts
become ordinary attention bids.

### What clears the deficit

Changing an aperture to `open` must **not** clear its deficit. Otherwise a rapid
open–close cycle could satisfy the regulator without the mind meeting anything.
The deficit clears or substantially decays only when a fresh percept from that
channel is admitted by attention and placed into the conscious frame.

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

If every outside channel remains absent, the global deficit can produce a gentle
orientation event: the felt need to meet the world again. Existing loop handling
remains the emergency path for confirmed collapse. The membrane should not become
a second loop breaker disguised as a sense.

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
inwardness may raise a threshold temporarily, but cannot suppress protected
contact or create permanent closure. This is the same relation as voluntarily
holding one's breath inside a body that retains a breathing reflex.

Registering `orient` beneath the existing `m-act` adds no new periodic decision
call. It does add a short body-schema line and another tool schema during
realization, and each accepted change uses the ordinary realization call. The
automatic reflex itself should be deterministic and must not have its own
`m-act`; giving it one would spend model calls merely to maintain a physiological
invariant. Aperture control may need a dedicated cooldown lane so it does not
block looking, recalling, or changing the world.

## Placement in the present architecture

```text
outside source
      │
      ▼
 sense / adapter ── candidate header ─────────────┐
      │                                           │
      │ rendition references                     ▼
      └──────────────────────────────► perceptual membrane
                                                  │
                                  suppressed stat │ admitted Percept
                                                  ▼
                                       nested attention arbiters
                                                  │
                                                  ▼
                                      multimodal frame assembler
                                                  │
                                      selected rendition + record
                                                  ▼
                                           conscious model
```

The present attention machinery can remain mostly unchanged. Salience,
thresholds, urgency, crowding, nested competition, arousal sensitivity, and
decision observability do not depend on the payload being text. The changes are
concentrated at the edges:

1. a `Percept` envelope and compatibility conversion from `InterruptRecord`;
2. the membrane and its retained aperture/deficit state;
3. typed payload preservation through attention without rendering it early;
4. a multimodal frame assembler and capability-aware model adapter;
5. journal and memory records of event, rendition, transformation, admission,
   and asset reference;
6. the `orient` capability and body-schema language.

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
- Compression preserves provenance and the form actually received: *I read a
  transcript derived from a voice*, not *I heard her voice*.
- A suppressed percept is not autobiographical experience. Its content must not
  enter the mind's memory; only the regulator may retain non-semantic statistics.
- If a transformed rendition was produced by a model, that act and model identity
  are backstage provenance, never passed off as direct sensing.

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
Productive continuity should slow deficit growth; reopening begins at `soft`;
thresholds adapt from observed contact rather than a fixed short timer.

### Noisy-world coercion

A broken or adversarial source generates changes to force attention. Candidate
headers are capped, deduplicated, authenticated by source, and unable to declare
themselves protected.

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

## Build order

1. Define `Percept` and its provenance/rendition contract, including a mandatory
   archival text rendering.
2. Route existing text `InterruptRecord`s through a compatibility adapter with no
   observable behavior change.
3. Add a deterministic membrane for text-labelled mock modalities. Test aperture
   state, protected events, suppression, deficit integration, hysteresis, and
   attended-contact reset.
4. Add the `orient` hand to the existing actor and a separate control cooldown
   lane. Test only dry intentions first.
5. Preserve typed percepts through arbitration; delay textual rendering until
   frame assembly.
6. Change model requests from one text string to ordered content parts while
   retaining the existing text-only route.
7. Add native images from the small spatial world, with caption fallback and an
   exact record of which rendition was received.
8. Add bounded audio episodes, then video only if a concrete model and experiment
   need it. Do not generalize by accumulating unused codecs.
9. Compare fixed-open senses, voluntary apertures, and regulated apertures on
   coherence, external responsiveness, capture, loop incidence, provenance, and
   compute cost.

## The criterion

The membrane succeeds when the mind develops a rhythm rather than a setting:
opening outward, being changed by what it meets, drawing inward to integrate it,
and returning before integration becomes enclosure.

Its generality is not that every input becomes text. Its generality is that every
input remains honestly what it is, may be rendered into forms a particular model
can receive, and crosses the same regulated boundary between availability and
attention. The body may change with the model and the world. The law of contact
does not.
