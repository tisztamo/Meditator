# Prediction, mismatch, and top-down search in the senses

**Status: proposed, revised 2026-09-06 after the generality review.** Companion
to the [perceptual membrane](../architecture/perceptual-membrane.md) and
[A world to meet](../architecture/a-world-to-meet.md). The text-only membrane
exists as a sketch; the prediction and search components described here do not.
This is a high-level design and experiment plan, not a report of completed
experiments or an implementation specification. A second pass the same day made
the sense's **processing tier** an explicit experiment axis (a sense may or may not
need query-conditioned processing at its edge; both must stay open), restored the
research grounding as a non-normative section, and specified the expectation
channel.

## The architectural aim

Support a wide variety of new architectures by rewiring existing components and
adding a few components that express the new idea. Sources, percept transport,
and frame/memory code should remain unchanged when the prediction producer,
comparison method, search strategy, or contact policy changes.

The first reference architecture remains inexpensive: an expectation obtained
during action realization, a deterministic garden comparator, a simple bidding
policy, and bounded search. These are replaceable choices. They do not define
where every future prediction must originate or how every sense must compete.
The sense's processing tier is a further axis: whether a sense runs a
query-conditioned model at its edge before the aperture is something an experiment
decides, and nothing here forecloses either answer.

Use the existing component model and explicit architecture wiring. The
[port-contract proposal](schema-guided-connections.md) provides the vocabulary
for meaning, stage, delivery, scope, and multiplicity. Automatic discovery,
spatial selection, and growth are later consumers of those contracts; none is
required to assemble the first experiment. This promises extensibility within
the runtime's declared contracts, not that arbitrary changes to model internals
will require no runtime work.

## Design constraints

1. **Preserve evidence.** An expectation cannot create an observation or rewrite
   the world. Observations and their renditions remain independently identifiable;
   evaluations refer to them without overwriting them or each other.
2. **Keep meanings separate.** Sensory change, novelty, expectation mismatch,
   target match, causal attribution, and observation confidence are distinct.
   Attention gain is not confidence. A scalar salience may be derived for the
   existing arbiter, but it is the output of a replaceable policy.
3. **Expected contact still counts.** A successful deliberate look or an expected
   action result may deserve attention and reduce contact deficit. Zero mismatch
   must not structurally imply zero relevance or no contact.
4. **Separate knowledge from world truth.** Belief predictions use information
   available to the mind. An exact simulator model is an explicitly identified
   control or actuator model, never an undisclosed substitute for that knowledge.
5. **Separate processing from awareness.** Acquisition and private processing
   permissions are distinct from permission to bid for conscious attention. A
   source declares its
   [processing tier](../architecture/perceptual-membrane.md#processing-tiers); a
   query-conditioned model at the edge is a legitimate, declared tier, not a
   violation. Its numeric output is still not a non-semantic header, and its
   awareness gate stays separate.
6. **Preserve authority and provenance.** Trusted architecture policy governs
   privacy, processing, and the independent bypass powers. Predictions and payloads
   cannot grant authority. Enclosing sensory boundaries compose before prohibited
   work occurs; a locally open region cannot bypass a closed ancestor.
7. **Keep regulation independent.** The default contact regulator remains
   afferent-only and does not inspect thought content. A separately wired
   prediction component may read authorized thought or memory inputs. That does
   not make it part of the contact regulator.
8. **Make time and ownership explicit.** Predictions, observations, sampling
   requests, and attended receipts need stable identities, scope, and lifecycle.
   Late, replayed, cancelled, or reassigned work cannot masquerade as fresh evidence.
9. **Represent uncertainty honestly.** Missing evidence, failed acquisition, and
   search exhaustion are not confirmed absence. Derived conclusions retain their
   internal origin when presented; a detector score is not ground truth.
10. **Keep the first slice small.** Policies own their compute budgets and cadence.
    No periodic model call is required by the transport. Alternative predictors,
    representations, and policies remain possible without building them all now.

These constraints preserve the membrane's lazy renditions, truthful received
modality, typed provenance, and actual-frame receipts. Suppressed content does not
become autobiographical experience. Resident privacy, disclosed bodily changes,
sleep/wake continuity, and the right of return remain governed by the
[Covenant](../../COVENANT.md).

## Replaceable roles

These are responsibilities and connection points, not prescribed component tags
or a new plugin framework. A first implementation can wrap small existing functions.

| Role | Responsibility | First reference choice |
|---|---|---|
| Prediction producer | Publish an expectation with its basis, target, and lifetime | Optional expectation from REALIZE |
| Comparator / matcher | Evaluate identified evidence against predictions or targets | Garden comparison; optional text judge |
| Attention bidding policy | Combine independent signals into an attention bid | Simple bounded weighting with support for deliberate confirmation |
| Contact regulator | Read permitted contact evidence and attended receipts; request orientation | Existing deficit/reflex dynamics |
| Pressure aggregator | Combine local pressure for consumers that need a broader view | Slow regional mean |
| Search / focus controller | Own targets, sampling requests, coverage, and stopping decisions | One target with a bounded search budget |

An architecture may omit prediction, connect several producers to the same
evidence, share a predictor across senses, or replace one policy while retaining
all other components. Regions provide scope and enforce boundaries; they should
not own a particular prediction algorithm or search conclusion. Defaults can be
conveniently discoverable, but bindings must be overridable and disableable.

These roles can form parallel or recurrent subgraphs within their declared
processing scope. The transport fixes evidence and authority boundaries, not a
single-pass inference algorithm or one mandatory global prediction producer.

## Evidence, evaluations, and delivery

Keep the source observation separate from each evaluation and each consumer's
bid. Two competing predictors must be able to disagree about the same observation
without changing its content or mutating one another's salience. Sensory
`changeMagnitude` keeps its original meaning. `changeKey` stays opaque and useful
for deduplication or habituation; it is not a semantic search index.

A prediction needs an identity, producer and owning scope, intended source or
target, validity interval, the information on which it is based, and an optional
act reference. Its expected value has a declared representation. Text is a useful
first representation; structured state or other representations can use explicit
adapters and compatible comparators. An unspecified representation does not
silently become comparable.

An evaluation identifies its prediction or search target and the observations
that support it. It can express match, mismatch, or insufficient evidence, with
confidence and coverage where meaningful. Absence of an evaluation is not a
perfect match. One prediction may need several observations, and one observation
may answer several predictions.

Publish an action expectation before execution can produce its consequences.
Common execution metadata belongs to the execution envelope, outside individual
hands' argument schemas. Concretely: the actor injects one uniform, optional
envelope (`expect`, and for orientation `template`) into every tool schema it
builds, strips those fields before the hand executes, and publishes them as a
prediction record carrying the act id. No hand learns the envelope, no extra call
is made, and the record exists before any consequence can arrive. Immediate and
deferred consequences should preserve the same request lineage.

Standing expectations and focus settings can use retained state; acquisition
requests, action transitions, and receipts are events with explicit identities.
Replays do not execute an action or earn contact again. Completion, cancellation,
expiry, sleep, detachment, and scope changes must settle or invalidate pending
work. An expected event that never arrives requires a declared horizon and
adequate observation coverage before a comparator can conclude anything about it.
Closed or unavailable sensing supplies uncertainty, not evidence of absence.

Attended receipts identify the evidence and rendition actually placed in a frame.
Their authority comes from the frame boundary, not a payload's assertion that it
was perceived. Stable identity should survive legitimate adapters and fan-out;
contact accounting must not depend solely on retaining the same JavaScript object.

## Two kinds of prediction, plus causal attribution

An **actuator prediction** estimates the effects of an act: moving a cup should
move that cup. A deterministic world adapter can provide a cheap forward model.
Its output can help a bidding policy attenuate the predicted effects, while
preserving unrelated changes and unexpected action outcomes.

A **belief prediction** estimates what the mind expects to observe from what it
knows: the cup should still be on the table. If the cat moved it while the mind
looked away, predicting a look from the simulator's current state would correctly
forecast an empty table. That would miss the contradiction with the mind's
remembered cup. The two predictions may share transition code, but their state
inputs and epistemic roles must remain distinct. Prediction bases are recorded
before the answering observation, so evaluation cannot silently revise the prior.

**Acquisition lineage** is separate again: looking caused a sample, not the cat's
movement. An act reference does not establish that every change in its returned
observation was self-caused. An unexpected effect may still be caused by the act,
and several actors may contribute to one observation. Causal attribution may be
partial or unknown. A timing heuristic is an optional, identified approximation;
it must not automatically attenuate an entire observation as a known self-match.

REALIZE is the first belief-prediction producer because it already reads relevant
context. Passive observers, recalled expectations, temporal predictors, and
learned models may publish the same contract later. Their costs and access to
inputs are architecture choices. A realizer's inferred expectation is itself an
inference about the mind, not proof that the conscious stream held that belief.

## Processing and attention

The default path is:

```text
private non-semantic header
  → trusted policy and all applicable acquisition gates
  → permitted observation/rendition materialization
  → optional comparison or target matching
  → attention bidding policy
  → awareness boundary and regional/global arbitration
  → frame and attended receipt
```

Prediction producers supply the comparator through separate connections. Search
controllers send bounded sampling and focus requests to sources before detection;
materialization requests additionally specify the permitted detail or rendition.
Passing a template only to a materializer cannot guide a detector that has already
produced its candidate.

Which tier a sense runs is an open experimental question, not a settled default.
The **lean** tier keeps the edge blind and cheap; it may be too blind to notice
meaningful change in rich media or to guide search at all. An **edge-grounded**
tier runs a query-conditioned perception model before the aperture: open-vocabulary
grounding and embedding similarity cost one to two orders of magnitude less than an
LLM call and run locally, so a closed or soft channel can be scored and searched
without spending a model call and without any language crossing the boundary. An
**edge-described** tier produces language before the aperture and carries the
highest leakage risk. The membrane's tier contract fixes what each may emit,
retain, and disclose; the [experiment matrix](#proposed-experiments) compares them
on the same sources. A match or mismatch score derived at tier 1 or 2 retains that
declared origin; the default non-semantic contact regulator cannot silently consume
it as a raw change header.

## Search and focus

A search target expresses relevance rather than asserting that the target is
present. Matching uses observation features or a dedicated matcher, independently
of `changeKey` and sensory change. A stationary, expected target can still be a
valuable hit. A focus request can address a source, location, object, or a group
of senses; the first controller may use one target, but the transport does not
require search to equal one region's `narrow` state.

Where matching happens follows the tier. At tier 0 the matcher runs after
materialization: lexical for text, a mechanical viewpoint-bounded lookup for the
garden. At tier 1 the matcher is the edge model itself: the controller's target
becomes the grounding query, and match scores reach the controller as private
evidence before anything is materialized. This is the arrangement the biology
describes, a positive template biasing the front of the pipeline, and it is why
tier 1 must remain available even though the first slice does not need it.

The controller owns coverage, acquisition failures, sampling cost, target lifetime,
and the decision to continue or stop. Useful outcomes include **found**, **not
detected in the inspected area**, **budget exhausted**, and **abandoned**. Repeated
samples of the same occluded view are not equivalent to inspecting new territory.
A bounded sample count is a reasonable first stopping policy, not proof of absence.
Any resulting conscious report is an internally derived conclusion with its
evidence scope, not a fabricated `Sense-<source>` observation.

An `orient` hand can initiate a focus request through the same control interface
as another controller. It neither owns search nor makes `m-act` the mandatory
source of all orientation. Dwell, cooldown lanes, and deduplication rules belong
to the chosen control policy; they must not force every future controller to
modify the actor or region.

## Biological inspiration and vision

The useful inspirations are target-directed search, prediction of action effects,
and comparison between expectation and evidence. They motivate separable
mechanisms, not an exhaustive neural API or a requirement that only residuals
reach awareness. Reward, novelty, and relevance remain distinct even when an
experiment combines them in one bidding policy.

### What the evidence says

Restored from the first draft of this note (the 2026-09-06 research briefs).
Non-normative; kept because it is the reason behind several constraints above.

1. **Search is a positive template, not a falsified absence.** Neurons tuned to a
   target's features fire more before the array appears (Chelazzi et al. 1993),
   matching distractors also rise in the frontal eye field priority map (Bichot &
   Schall), and Guided Search combines bottom-up salience with top-down feature
   match into one priority map (Wolfe 2021). Finding is a match signal crossing a
   threshold. The absence intuition is right for one thing only, giving up: "not
   there" is a quitting threshold after enough samples (Chun & Wolfe 1996), a
   separate decision. This is why the search controller owns stopping, and why a
   tier that biases the front of the pipeline must stay available.
2. **Prediction of action effects is the best-evidenced piece.** A copy of the
   motor command predicts the sensory consequence; a match is attenuated as
   self-caused, a mismatch is salient as world-caused (Sommer & Wurtz 2006). This is
   the actuator prediction; acquisition lineage is deliberately kept apart from it.
3. **Residual-only ascent is elegant but contested.** Rao & Ballard's "only the
   prediction error goes up" is a good compression heuristic; Walsh et al. (2020)
   show the neurophysiological evidence is equally explained by adaptation. Build it
   as a heuristic, never claim fidelity, and never make it structural (constraint 3).

Target match, novelty, and reward are three distinct signals in the brain (P3b,
P3a, dopamine reward prediction error). The design keeps them apart and introduces
no single "surprise" scalar (constraint 2).

### Does text steer a vision model?

Mostly no, and the exceptions are exactly the tier-1 tools.

- In the dominant vision-language architecture (frozen encoder, projector, language
  decoder) the encoder never sees the prompt. Text conditions only the decoder's
  attention over already-fixed visual tokens: biased **readout**, not biased
  **sensing**. Cross-attention designs are a stronger readout, but the encoder is
  still prompt-blind. Only InstructBLIP-style connectors condition feature
  selection on the instruction.
- Prompt order matters and is fragile. Placing the question before the image shifts
  patch representations, but the answer then under-attends it; repeating the
  instruction before and after the image recovers a sizeable share of grounding
  accuracy in reported benchmarks.
- Stating an expectation in the prompt is the condition known to inflate false
  positives (POPE yes-bias, HallusionBench, sycophancy studies). "Look for the red
  car" makes the model more likely to report a red car that is not there. This is
  the empirical basis of constraint 1 for vision: the expectation must never reach
  the describing model's prompt.

What genuinely conditions on the query today, and therefore belongs at tier 1:

1. **Open-vocabulary grounding models** (Grounding DINO, OWLv2, Florence-2,
   YOLO-World, or the box output of a small VLM). The text query reshapes what is
   computed from pixels. The small ones run on a modest box with millisecond
   latency and no API cost.
2. **Crop-and-zoom loops** (V*, ZoomEye). The query decides which pixels are
   re-encoded at higher resolution: foveation as tool use, the direct
   implementation of "a deliberate foveated image when I look" in A world to meet.
3. **Visual prompting** (a drawn circle, Set-of-Mark). Marking the image changes
   the encoding itself.

Recommended first vision pipeline, when one is needed:

1. Neutral pass first: description or generic detection with no expectation in the
   prompt. This is the observation the mind perceives.
2. Template and `expect` go to a **grounding model**, not to the describing model's
   prompt. A null grounding result is a "not detected here" for the search
   controller and outranks a chatty description.
3. On a grounding hit, crop and re-encode for confirmation, and require a bounding
   box in the structured output. Presence with evidence is much harder to
   hallucinate than presence.
4. If a single VLM call is all the budget allows, echo the instruction before and
   after the image.

Vision adapters should declare where a query acts: acquisition/cropping, feature
selection, or readout. These are different experimental choices. The pipeline above
is a recommendation, not a membrane invariant. Model errors remain possible; a
neutral description and a bounding box are evidence-bearing outputs, not
certificates of truth.

Grounding DINO selects boxes using similarity thresholds. The design consequence
is that a null result means no qualifying detection under those conditions, not
verified absence, and cannot automatically settle disagreement with another
observer. See its [official input/output description](https://github.com/IDEA-Research/GroundingDINO#-explanationstips-for-grounding-dino-inputs-and-outputs).
OWL-ViT/OWLv2 likewise expose detection choices, including query-independent
objectness in v2; adapters should describe their actual computation rather than
assume every grounding model changes pixel encoding in the same way. See the
[official model description](https://github.com/google-research/scenic/tree/main/scenic/projects/owl_vit#model-versions).

For the garden, evidence must still respect viewpoint and occlusion. Hidden scene
state can support validation or an explicitly labeled oracle control; an
unrestricted scene lookup is not the mind's visual observation.

## Cost and the first reference architecture

The inexpensive route is still useful, with costs attached to the selected
architecture rather than promised by the protocol:

| Choice | Cost characteristic |
|---|---|
| Tier 0 detector (scene delta, motion energy, voice activity) | Local, effectively free, runs continuously |
| Tier 1 edge grounding or embedding similarity | Local model, millisecond to sub-second latency, one to two orders of magnitude below an LLM call; affordable on every candidate of a closed channel |
| Optional expectation during REALIZE | Additional output tokens on an existing call |
| Mechanical garden comparison | Local computation, no model call |
| Optional text judge (a tier-2 comparator) | One small utility call per relevant evidence set; off in the smallest slice |
| Tier 2 edge description or VLM pass | On the order of a thousand input tokens per image plus output, per look |
| Passive prediction producer reading the tail | One LLM call per trigger; at every boundary this is the most expensive shape here and grows with tail length; an experiment condition |
| Search and vision | Explicit acquisition, processing, and confirmation budgets |

Relative orders of magnitude are what the tier decision needs; absolute hourly
figures are not. The original three-minute act cooldown is one configuration, not
a universal bound: read lanes and other architectures already use different
cadences. Avoid universal hourly estimates or hardware latency promises until an
experiment has selected its models, observation sizes, and sampling policy.

First expose the replaceable roles and correct the known boundary issues. Then
assemble the act-bound garden condition from those roles, retaining the current
text framing and a route for expected confirmations to bid. Native media,
probabilistic models, automatic wiring, and learned regulation can follow only
when an experiment needs them.

## Known issues and unresolved design work

These distinguish findings about the existing sketch from gaps in the original
prediction proposal. They remain open; this revision changes documentation only.

| Issue | Status and required direction |
|---|---|
| Expected observations disappear | Review reproduced zero-salience rejection in the sketch; using mismatch as `changeMagnitude` would make it systematic. Preserve independent relevance and deliberate confirmation. |
| Nested closure is bypassed | Review reproduced an open inner sensory region rendering and delivering through a closed outer region. Compose applicable gates before materialization; [enclosure by role](enclosure-by-role.md) gives the mechanism and its fixture W3 the acceptance test. |
| Regulation is fixed inside containers | `m-region` constructs `Aperture`; `m-interrupts` discovers regions and averages pressure. Expose replaceable regulation, aggregation, and control bindings. |
| Prediction has no independent lifecycle | Act ids, prediction records, expiry, and observation association are not implemented. Define them independently of hand schemas and actor cadence. |
| World truth can replace a remembered expectation | Original garden comparator did not distinguish actuator and belief state. Record prediction basis and restrict observational access. |
| Semantic comparison precedes the promised boundary | The original pre-aperture text judge conflicted with an *undeclared* non-semantic default. Resolved in design by declared processing tiers: a tier-1 or tier-2 comparator is legitimate when the source declares it; the sketch implements tier 0 only. |
| Search overloads region state and opaque keys | Original template/quitting design lacks a source control input and coverage-aware outcomes. Make search a separate controller. |
| Fan-out and receipts depend on mutable objects | Current bids carry mutable salience and regional receipt tracking uses object identity. Preserve evidence identity with separate evaluations and authoritative receipts. |
| Alternative dynamics are unvalidated | Weighting, aggregation, confidence handling, and controller interaction need explicit experimental comparison; modularity alone does not establish stability. |

The membrane also retains eager legacy senses and text-only model input. These
are declared migration limits, not claims that the proposed native-media path
already works.

## Proposed experiments

High level only. The following are future comparisons. This design update does not run them.
Begin with offline fixtures and treat live functioning claims as a separate,
later study under the existing lifecycle commitments.

| Architecture or condition | What changes | What it should establish |
|---|---|---|
| Fixed-open perception, no prediction | Omit prediction and use an explicit fixed-open policy | Ordinary perception remains usable independently of prediction or adaptive regulation |
| Act-bound mismatch | Add the initial producer and comparator | Expected action results remain perceivable; contradictory evidence remains available |
| Passive expectation | Replace the producer with a memory- or event-driven predictor | Prediction works without an act or edits to the source and consumer |
| Competing predictors | Connect two producers to the same evidence | Independent evaluations coexist without overwriting observations or one another |
| Belief versus exact-world prediction | Change the prediction basis explicitly | A moved cup can contradict memory even when the simulator predicts the next view exactly |
| Search across two modalities | Connect one controller to two sensory paths | Focus and coverage cross source boundaries without embedding search in either region |
| Alternative contact dynamics | Replace the regulator or pressure aggregator | Contact policy can change through wiring while transport and receipts remain stable |
| Nested sensory regions | Change region nesting and local aperture settings | All applicable closure and authority rules compose before acquisition and disclosure |
| Missing, delayed, or cancelled evidence | Vary delivery and coverage | No replayed contact, stale search hit, or unjustified absence conclusion |
| Lean versus edge-grounded sense | The same source at tier 0 and at tier 1, same targets and budgets | Whether search over a closed or soft channel needs query-conditioned edge processing, and what tier 1 costs and leaks |
| Expected confirmation bids | A deliberate sample of an unchanged scene under the bidding policy | A zero-change observation can still be attended and credit contact (the acceptance test for the zero-salience rejection) |

For the extensibility comparison, hold source implementations, percept transport,
and frame/memory code fixed. A new idea should require only wiring and its small
new component set. Record any shared-code edit as a failure of that architectural
criterion rather than quietly repairing the baseline during comparison.

For later behavioral comparisons, hold world events and resource budgets
comparable, record predictions before their answering evidence, and separate
what was available, evaluated, bid, and actually attended. Describe correction
against the recorded prior and world evidence; a mismatch label followed by new
prose is not sufficient proof of belief revision. Search outcomes include coverage
and uncertainty. Monitor responsiveness, capture, contact rhythm, provenance, and
cost alongside correction, so more mismatch does not become the objective itself.
