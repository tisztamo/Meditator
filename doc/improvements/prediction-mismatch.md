# Prediction, mismatch, and top-down search in the senses

**Status: proposed, revised 2026-09-06 after the generality review.** Companion
to the [perceptual membrane](../architecture/perceptual-membrane.md) and
[A world to meet](../architecture/a-world-to-meet.md). The text-only membrane
exists as a sketch; the prediction and search components described here do not.
This is a high-level design and experiment plan, not a report of completed
experiments or an implementation specification.

## The architectural aim

Support a wide variety of new architectures by rewiring existing components and
adding a few components that express the new idea. Sources, percept transport,
and frame/memory code should remain unchanged when the prediction producer,
comparison method, search strategy, or contact policy changes.

The first reference architecture remains inexpensive: an expectation obtained
during action realization, a deterministic garden comparator, a simple bidding
policy, and bounded search. These are replaceable choices. They do not define
where every future prediction must originate or how every sense must compete.

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
   permissions are distinct from permission to bid for conscious attention.
   Semantic comparison is not a non-semantic detector merely because its output
   is numeric. The default processing boundary is described below.
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
hands' argument schemas. Immediate and deferred consequences should preserve the
same request lineage. This lets an existing hand participate without learning the
schema of every prediction component.

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

An alternative architecture may permit private semantic processing while conscious
access is closed. It must declare that processing permission, its budget and
retention, and the separate awareness gate. Its results remain outside ordinary
attention, memory, and public telemetry until permitted. A numeric mismatch
derived from private semantics must retain that declared processing origin; the
default non-semantic contact regulator cannot silently consume it as a raw header.

## Search and focus

A search target expresses relevance rather than asserting that the target is
present. Matching uses observation features or a dedicated matcher, independently
of `changeKey` and sensory change. A stationary, expected target can still be a
valuable hit. A focus request can address a source, location, object, or a group
of senses; the first controller may use one target, but the transport does not
require search to equal one region's `narrow` state.

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

Vision adapters should declare where a query acts: acquisition/cropping, feature
selection, or readout. These are different experimental choices. An independent
description, grounding, and crop/confirmation can be assembled as a first vision
pipeline, but no model sequence or prompt order becomes a membrane invariant.
Model errors remain possible; a neutral description and a bounding box are
evidence-bearing outputs, not certificates of truth.

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
| Optional expectation during REALIZE | Additional output on an existing call |
| Mechanical garden comparison | Local computation, no model call |
| Optional text judge | Budgeted per relevant evidence set; off in the smallest slice |
| Passive prediction producer | Independently chosen trigger, cadence, and budget |
| Search and vision | Explicit acquisition, processing, and confirmation budgets |

The original three-minute act cooldown is one configuration, not a universal
bound: read lanes and other architectures already use different cadences.
Avoid universal hourly estimates or hardware latency promises until an experiment
has selected its models, observation sizes, and sampling policy.

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
| Nested closure is bypassed | Review reproduced an open inner sensory region rendering and delivering through a closed outer region. Compose applicable gates before materialization. |
| Regulation is fixed inside containers | `m-region` constructs `Aperture`; `m-interrupts` discovers regions and averages pressure. Expose replaceable regulation, aggregation, and control bindings. |
| Prediction has no independent lifecycle | Act ids, prediction records, expiry, and observation association are not implemented. Define them independently of hand schemas and actor cadence. |
| World truth can replace a remembered expectation | Original garden comparator did not distinguish actuator and belief state. Record prediction basis and restrict observational access. |
| Semantic comparison precedes the promised boundary | Original pre-aperture text judge conflicts with non-semantic acquisition. Declare processing permissions and comparison stage. |
| Search overloads region state and opaque keys | Original template/quitting design lacks a source control input and coverage-aware outcomes. Make search a separate controller. |
| Fan-out and receipts depend on mutable objects | Current bids carry mutable salience and regional receipt tracking uses object identity. Preserve evidence identity with separate evaluations and authoritative receipts. |
| Alternative dynamics are unvalidated | Weighting, aggregation, confidence handling, and controller interaction need explicit experimental comparison; modularity alone does not establish stability. |

The membrane also retains eager legacy senses and text-only model input. These
are declared migration limits, not claims that the proposed native-media path
already works.

## Proposed experiments — high level only

The following are future comparisons. This design update does not run them.
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
