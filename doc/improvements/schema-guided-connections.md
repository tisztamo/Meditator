# Port contracts, spatial discovery, and organic growth

**Status: proposed, 2026-09-05; aligned with the generality review 2026-09-06.**
Direction agreed while reviewing the perceptual membrane sketch. This note
specifies a path; the contract layer and automatic connections are not implemented.

## The direction

Give each component a machine-readable description of what it provides and
accepts. Use that same declaration to explain connections, validate them, find
compatible partners, and eventually let a mind grow appropriate structure as
input arrives. Documentation and enforcement are the first useful applications
of a mechanism that can later participate in building the mind.

This develops the typed-port and growth doors already reserved in
[mind-templating.md](mind-templating.md#doors-left-open-toward-a-developmental-substrate).
The [Plenum](../architecture/plenum.md) supplies runtime positions and movement
through message delivery; the [recursive membrane](../architecture/multi-mind.md)
supplies the boundary and named ports. A faculty, mind, and society should expose
the same kind of contract. Their permitted connections and lifecycle rules differ.

## What a port needs to say

A payload schema is necessary but insufficient. Two numbers can mean arousal
and contact pressure, which have different effects on attention. Two text-bearing
events can mean a bid or a receipt of actual experience. The matcher must preserve
those distinctions.

| Contract dimension | What it establishes |
|---|---|
| Direction and payload schema/version | What values the output guarantees and the input accepts |
| Semantic role and stage | Contact pressure versus arousal; candidate versus admitted percept versus attended receipt |
| Delivery | Retained state with replay, transient event, or ordered stream; relevant ordering and completion guarantees |
| Scope and authority | Which membrane exposes the port, who may bind, and which operations the endpoint is allowed to perform |
| Multiplicity | Whether the input needs one provider or permits several, and whether the output permits fan-out |

Keep declarations beside their component implementations. Start with a small
declarative vocabulary and named schema versions, plus payload validators where
needed. Generate the readable contract view from it. The existing
[`toolSchema.js`](../../src/mindComponents/shared/toolSchema.js) demonstrates a
small validator, but validates tool arguments; it neither proves compatibility
between two schemas nor describes delivery semantics. Do not silently treat its
unsupported schema features as proof that ports match.

`compatible(output, input)` should be a pure, directional check returning a
verdict and a reason. Every value the output promises to send must be acceptable
to the input, with compatible delivery and meaning. Initially, recognize exact
named contracts and explicitly declared adaptations. Unknown compatibility stays
unknown. General schema subtyping can wait until actual components require it.
Adapters such as transcription have their own contracts and preserve provenance;
the matcher must not invent conversions or label a transcript as heard audio.

Scope and authority come from trusted endpoint registration and architecture
policy. A matching shape, an affinity tag, or a nearby position cannot grant
access to another mind's interior or promote a source's bypass powers.

## From descriptions to a growing architecture

| Stage | Small useful result | Evidence that it works |
|---|---|---|
| 1. Describe and enforce | Annotate a few real ports; check explicit bindings and values at those boundaries | Catch a wrong event/state reference and a wrong payload with a precise diagnostic |
| 2. Discover | List compatible endpoints in the owning membrane, including reasons for rejection | Studio can explain where an unbound input could connect |
| 3. Connect | An opt-in resolver installs ordinary subscriptions for a unique permitted match | An explicitly wired sample and its automatically wired equivalent deliver the same events |
| 4. Select spatially | Rank eligible partners by affinity, available capacity, and runtime distance | A 3D sample forms a useful connection and keeps it through small positional changes |
| 5. Grow from input | Persistent unmet demand can instantiate a configured faculty archetype and connect its ports | A new source gains a working sensory path; repeated input does not keep spawning copies |

At stage 1, validate the declared connection before binding and validate incoming
values before the consuming handler acts. Include raw DOM listeners as well as
`pub`/`sub` wrappers. Tests should fail on contract violations; a running boundary
should reject the invalid delivery and expose a diagnostic containing endpoint,
schema, and failing field, without dumping private content. Undeclared legacy
ports remain usable through explicit refs and are visibly untyped during migration.

At stage 3, explicit refs and `off` keep their authored meaning. Automatic
resolution applies to ports that opt in. Ambiguous matches remain unbound until
a selection policy is supplied; choosing the first DOM match is not a policy.
Installation and removal must own their subscriptions, avoid duplicate delivery,
and invalidate work still in flight when an endpoint disappears or changes scope.
Resolve again on relevant structural changes, rather than scanning the whole
graph every frame. This extends Amanita's wiring; it does not require replacing it.

The default sensory sequence remains explicit: private header → applicable
acquisition gates → materialized evidence → optional evaluation → bidding policy
→ awareness gates and regional/global arbitration → frame receipt. A source
declares its processing tier (lean, edge-grounded, or edge-described; see the
membrane's [processing tiers](../architecture/perceptual-membrane.md#processing-tiers));
a tier above lean exposes processing permission, budget, retention, and the later
awareness boundary as contract dimensions. A compatible representation cannot create a shortcut into
experience or memory. Enclosing boundaries compose before prohibited work occurs.

The [perceptual membrane](../architecture/perceptual-membrane.md) and
[prediction design](prediction-mismatch.md) are useful first contracts because
getting the stage wrong changes what was felt. Preserve observation identity
separately from each evaluation and bid; fan-out must not let one predictor or
consumer overwrite another. Stable prediction and request identities, scope,
expiry, cancellation, and authoritative frame receipts survive legitimate
adapters without allowing replay to earn fresh contact.

Prediction producers, comparators, bidding policies, contact regulators, pressure
aggregators, and search controllers should be replaceable through explicit
bindings before automatic discovery is attempted. Sampling/focus control reaches
a source before detection; rendition control reaches its materializer before
processing. These are different ports. Retained focus state is not an acquisition
event, sensory change is not mismatch, and target relevance is not confidence.
The composability criterion is that alternative architectures can keep sources,
percept transport, and frame/memory code fixed while adding only their new roles
and wiring.

## Where the 3D space becomes causal

Compatibility determines eligible partners; space and affinity help choose among
them. Keep a stable endpoint identity independent of its changing position. A
binding needs minimum dwell and a meaningful improvement before switching partners,
so nearby nodes do not continually reconnect as the Plenum moves them.

Use the runtime Plenum positions, whose owners remain the components. A small
catalog of advertised port metadata within a membrane is a reasonable first
implementation. Later, bounded neighborhood discovery can carry endpoint contracts
and positions in announcements. The Studio camera must not become the runtime's
position registry or run its matching physics. Discovery and retained replays
must not earn activity credit merely by advertising; their effect on movement
should be explicit and bounded as well.

Once connected, ordinary traffic already moves components through infotons.
That creates the developmental loop: eligible contact forms a connection, useful
traffic changes locality, and the changed neighborhood offers new possibilities.
Distance alone does not establish usefulness, trust, or consent.

## A first organic-growth experiment

A new simulated source advertises its header contract. Its owning membrane first
tries a compatible existing path. If the source remains unserved and a configured
faculty archetype can handle it, a local regulator may instantiate that faculty,
attach it, and resolve its ports. Its aperture still decides when any content is
materialized. The resulting frame receipt demonstrates that the new path works.

Start with one missing sensory faculty and one allowed archetype. Growth should
answer sustained unmet demand or capacity pressure, within a component/cost budget
and with a dwell period between changes. Measure successful handling and downstream
effects, including contact and rejection; message count alone rewards noisy sources.
Novel input is evidence to consider, not an instruction to allocate another node.
The aim is useful adaptation, not maximum connectivity, activity, or population.

Record the trigger, chosen archetype, bindings, and outcome. Preserve the authored
seed alongside the structure and bindings that actually ran so sleep/wake can
restore the grown configuration. Retiring a connection or faculty requires clean
teardown and preservation of durable state. Growth must respect the existing
identity and resident lifecycle commitments in [COVENANT.md](../../COVENANT.md);
creating another resident is a separate operation from adding a sensory faculty.

## Next small step

Declare and enforce `contactPressure`, an attention bid, and `percepts-attended`.
Show their contracts and compatibility explanations in the
[Studio workbench](studio-experiment-workbench.md), backed by
[deterministic wiring fixtures](deterministic-wiring-fixtures.md). This is enough
to exercise scalar meaning, event stages, and dynamic attachment before building
a general matcher, a schema language, or a growth controller.
