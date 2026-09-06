# Enclosure by role: native recursion in the component tree

**Status: proposed, 2026-09-06; mechanism decisions settled with Kris the same day
(see [Decisions](#decisions)).** Written after the generality review of the
[perceptual membrane](../architecture/perceptual-membrane.md), whose first known
issue (an open inner sensory region delivers through a closed outer one) is one
instance of a general gap. This note names the gap, states the requirement, and
proposes a small mechanism. Nothing here is implemented. It is written so that an
implementation plan can be derived from it directly; the
[migration table](#migration-surface) and [fixtures](#acceptance-fixtures) are the
plan's raw material.

## The requirement

Any single component should be replaceable by a **region**, a component that
encloses inner components, without changing anything outside it. The converse
holds too: a region should be replaceable by a leaf that does the same job. And a
component inside a region must be able to address its enclosing provider of some
role (its aperture, its faculty, its mind) even when that provider is not the
default implementation but a custom one from a `components/` bundle, without the
ArchML file naming roles.

Stated as two invariances:

| Invariance | Statement |
|---|---|
| **Wrap invariance** (client side) | Wrapping any components in a container that provides no role, or in an identity provider (an open gate with gain 1), changes nothing observable outside the container: same events at the mind, same frames, same journal. |
| **Substitution invariance** (provider side) | Replacing a provider of role R by another provider of R changes nothing for components that address R, inside or outside. |

Recursion is *native* when both hold for every role by construction, so that a
new architecture is assembled by rewiring and adding a few components rather than
by editing the components already there. This is the composability criterion the
membrane and prediction notes rely on, made structural.

## Why the tree cannot do this today

Wiring inside a mind is addressed three ways. Two of them are already fine.

1. **Lateral, by `name`.** Amanita's bare ref steps match the `name` attribute
   (`economy/arousal`, `stream/chunk`), and templating's slots are names, not tags
   (a custom `my-origin` can fill the `origin` slot). Tag-free; unchanged by this note.
2. **Upward, by tag.** `closest('m-mind')` (about twenty sites), `closest('m-region')`,
   `closest('m-region[modality]')`, `closest('m-agent')`, `closest('m-society')`,
   `closest('m-act, m-agent')`, and Amanita's `..m-mind/…` and `..m-agent/…` steps,
   which resolve with `closest(tagName)`. A custom provider with a different tag is
   invisible to all of these.
3. **Downward, by tag, within a membrane.** `mind.querySelector('m-memory[name]')`,
   `m-stream`, `m-act[name]`, `m-speech`, `m-economy`, `m-loop-detector[name]`, and the
   global-arbiter rule "the `m-interrupts` not enclosed in an `m-region`". Same
   problem from the other direction, plus a scoping rule (never reach into a nearer
   mind) that each site re-implements by hand.

Only one component recurses today, and it shows both what works and what does not.
`m-interrupts` is global or nested purely by position: it listens on
`closest('m-region') || closest('m-mind')`, gates locally, re-weights survivors, and
re-dispatches them one level up. That is the right shape. It relies on the tag name
for a specific reason: `A.settle()` defines tags in the document order of their
*first* occurrence, so when a top-level `m-interrupts` precedes the first
`m-region`, the nested arbiter upgrades while its region is still a plain
`HTMLElement`. Only a DOM-structural lookup that works on un-upgraded elements is
safe at connect time. Any replacement must keep that property.

The membrane sketch shows the failure. `MSense.candidate()` resolves
`closest('m-region[modality]')`, `m-region` requires that the nearest modality
region is itself, and permission is that one region's `allows()`. An enclosing
closed region is never consulted, the regulator is a private `Aperture` object,
the mind-level consumer scans `querySelectorAll('m-region[modality]')`, and the
receipt path credits by object identity. None of these can be substituted or
nested without editing the component.

## Roles: declared by implementations, resolved by structure

A **role** is a named contract that a component implementation *provides*. The
class declares it; the ArchML author never writes it. Resolution is by tree
position, exactly like `closest()`, but on roles rather than tag names.

```js
// src/mindComponents/mind/mRegion.js
export class MRegion extends MBaseComponent {
  // A region is always an attention scope; with `modality` it is also a sensory gate.
  static provides = { faculty: true, aperture: el => el.hasAttribute('modality') }
}

// components/mAnotherAperture.js  (an author's bundle; no ArchML change anywhere)
export class MAnotherAperture extends MBaseComponent {
  static provides = { faculty: true, aperture: true }
}
```

Predicates receive the raw element and may read only its attributes, which exist
before upgrade. Suggested initial roles, all already implicit in the code:

| Role | Provided by today | Meaning |
|---|---|---|
| `mind`, `agent`, `society` | `m-mind`, `m-agent`, `m-society` | Identity roots; a **membrane** is the nearest of these |
| `faculty` | `m-region` | Attention scope; the boundary a nested arbiter binds to |
| `aperture` | `m-region[modality]` | Sensory acquisition gate and contact regulator |
| `arbiter` | `m-interrupts` | Attention competition at its faculty |
| `source` | `MSense` subclasses, registered spans | A sensory origin that offers candidates |
| `assembler` | `m-act` | Collects offered hands (the check in `mAgent` and `mTerminal`) |
| `memory`, `stream`, `economy`, `voice`, `scribe`, `facts`, `loop-detector` | the obvious singletons | Parts a mind addresses downward |

Do not introduce an authored `role` attribute: `m-agent` already uses
`role="subagent"` for something else, and ARIA owns the word in HTML. The
declaration is `static provides`; the concept is a role.

### Resolution that survives the upgrade race

Build a **role table** in `loadMindComponents` between its two phases. After
phase 1 every module is imported and every class is known; before phase 2 nothing
is upgraded. This is the inert window the templating note already relies on. For
each element whose tag has a class, evaluate `provides` against the element and
**reflect** the result onto the live DOM as a derived attribute:

```html
<m-region name="outside" modality="text" provides="faculty aperture">
```

Reflection is what makes the rest free:

- `closest('[provides~="aperture"]')` works on un-upgraded elements, so the race
  that forced `m-interrupts` onto tag names is handled the same way it is today.
- Amanita refs need no grammar change: `..[provides~="mind"]/economy/arousal`
  already parses (`..selector` → `closest(selector)`).
- `querySelectorAll('[provides~="aperture"]')` gives scoped downward lookups.
- Studio's live-tree telemetry shows roles without any extra plumbing.

The attribute is derived, never authored. The loader overwrites any authored
`provides` value and warns: authoring cannot grant roles, the same rule as
"payloads cannot grant authority". The reflected attribute never reaches a home or
the identity diff, because the architecture snapshot is the source *text* captured
before the DOM is built (`architecture.js` / `templating.js`), not a serialization of
the live tree. Elements created at runtime (growth, cloning) are reflected in
`MBaseComponent.connectedCallback` before `onConnect`; as a last resort a lookup may
consult `customElements.get(localName)?.provides` for an element not yet reflected.

### Lookup API on `MBaseComponent`

| Call | Returns | Replaces |
|---|---|---|
| `this.enclosing(role)` | nearest proper ancestor providing `role`, or null | `closest('m-region')`, `closest('m-region[modality]')` |
| `this.enclosingAll(role)` | ancestors providing `role`, nearest first, stopping at the membrane | (new; composition) |
| `this.membrane()` | nearest enclosing `mind`, `agent`, or `society` | `closest('m-mind')`, `closest('m-mind, m-agent')` |
| `this.part(role)` / `part(root, role)` | **top-level** providers of `role` inside the membrane: those not enclosed by another provider of the same role, and not inside a nearer membrane | `mind.querySelector('m-memory[name]')`, the `_arbiter()` rule, the `m-region[modality]` scan |
| `this.provides(role)` | whether this element provides `role` | `localName === 'm-act'` checks |

The pair `enclosing` (nearest, from inside) and `part` (outermost, from outside)
is the crux of "replace a component by a region". From outside, a composite
provider is one unit; from inside, its interior sees the composite as its
enclosure. Nothing on either side needs to know which.

All lookups are synchronous and DOM-structural. Wiring through them stays clone-safe
in the sense the templating note describes: a faculty cloned into a member keeps
resolving to its own enclosures.

## The three laws of enclosure

Role lookup alone does not give recursion; it gives substitution. Recursion needs
each role's protocol to obey three laws. `m-interrupts` obeys all three already,
which is why nesting it works; the aperture obeys none yet.

**Law 1, transparency.** A container that does not provide role R is invisible to
R's protocol: requests bubble through it, registrations pass through it, control
passes down through it. DOM bubbling gives this for events. Registration and
control paths must be built to have it too.

**Law 2, delegation.** A provider of R is also a *client* of R toward its own
enclosing provider. It handles what arrives from its interior, then forwards the
result upward in the same protocol; it receives control from above and forwards it
to its registrants. Its outward face is indistinguishable from a leaf client's. The
chain terminates at the membrane, which supplies the default for every role, and
structural events never cross a membrane (the multi-mind encapsulation rule).

**Law 3, monotone authority.** Enclosure can only restrict, attenuate, or
aggregate. It can never widen permission or grant powers. Powers (`bypassAperture`,
`bypassAdmission`, `preempt`, privacy) come from trusted architecture policy bound
to the *source*, read by providers from the source element's own attributes, never
from payloads; a trusted bypass crosses every *voluntary* gate on its path.
Corollary: wrapping is always safe under the Covenant, so wrap invariance can be
promised for clients without a per-case review.

### Declared exceptions

Kris asked for recursion "except when we have reason not to". These are the reasons.

- **Identity roots do not delegate.** A mind inside a mind is not a nested mind;
  it is a society member, a different object with its own lifecycle. `part()` stops
  at membranes; `enclosing('mind')` finds one membrane, not a chain.
- **Providers re-scope when wrapped.** Wrapping the global arbiter in a region makes
  it a nested arbiter. Position decides the role by design. Wrap invariance is a
  promise for clients, not for providers.
- **Plenum seeding is positional.** `_spacePath()` seeds a component's position from
  its tag/index path, so wrapping reseeds positions. Accepted for now; positions are
  telemetry and diffusion, not behavior. A role-based seed path is a later option.
- **Build-time constructs stay textual.** `m-archetype`, `m-import`,
  `m-society[archetype]`, the name overrides, and the identity-diff classification
  operate on ArchML text before there is a tree.
- **Legacy eager senses.** `feel()` sources bypass acquisition gates. This is the
  membrane's declared migration limit, not a role.
- **Roles whose contract is still a method call** (`memory.note()`, `stream`,
  `economy`). Substitution there is duck typing until the
  [port-contract work](schema-guided-connections.md) gives them declared ports.
  Role lookup does not pretend otherwise; it only removes the tag name.

## The aperture as a protocol

Applying the laws to the membrane turns the first, third, and fourth known issues
from bugs in one component into properties of a protocol any provider can join.
The reference dynamics (`Aperture` in `aperture.js`) stay as the first policy; what
changes is how a provider is found, how gates compose, and what state is shared.

| Message | Direction | Who acts | Composition (Law 2) |
|---|---|---|---|
| `percept-candidate` | up, cancelable bubbling event from the source element; `detail = { header, origin }` where `header` is the frozen `PerceptCandidate` and `origin` the source element | every `aperture` on the path | Each gate reads trusted policy from `origin`'s attributes and calls `preventDefault()` if its state forbids and no bypass applies. Nobody stops propagation, so permission is the **conjunction** of all gates in whatever listener order. Only the gate for which `enclosingOf(origin, 'aperture') === this` credits contact debt (the **nearest credits** rule). Each gate appends its policy version to `detail.versions`. The membrane root stops the event. |
| materialization | local to the source | the source | Only if `!defaultPrevented`. The resulting `Percept` is dropped if any recorded version changed while rendering, generalizing today's single-region check. |
| `interrupt-request` | up | every `arbiter` on the path | Unchanged: gate, gain, promote. An alternative policy that permits private processing while awareness is closed vetoes bids at its boundary in the capture phase; the default provider does nothing at this stage. |
| `aperture-register` | up, at source connect | nearest `aperture` (stops it) | The provider records the registrant; a provider registers itself once with its own enclosing provider. Providers also scan their interior on connect with `part`-style scoped lookup, so connect order does not matter. |
| `sample`, `orient`, `focus` | down | the provider to its registrants | Child providers forward to theirs (Law 1 and 2). A named target (`orient('narrow', name)`) is lateral addressing and stays by `name`. |
| `contactPressure` | retained topic | each provider | Published value is `fold(own deficit, child providers' pressures)`; the fold is a replaceable policy. The mind-level consumer reads `part(mind, 'aperture')`, which by definition returns only top-level providers, each already folded. No scan by tag, no double counting. |
| `percepts-attended` | event at the membrane | the provider that issued the percept | Credit by **percept id** against the ids this provider issued, not by object identity. The issuer alone credits; enclosing providers see the effect through the fold. |

Two consequences worth stating. First, the earlier design's open question 6
(arbitrating simultaneous orientation requests and avoiding repeated counting through
nested regions) is answered structurally: one issuer, one crediting gate, one fold.
Second, the sketch's "nearest region" is not wrong, only incomplete. The nearest
provider still owns registration and debt; what it lacked was the conjunction over
`enclosingAll('aperture')`, which the bubbling event supplies without the source
knowing how many gates exist.

## Acceptance fixtures

Build on the [deterministic wiring fixture](deterministic-wiring-fixtures.md). Each
fixture takes a baseline ArchML `B` and a variant, drives the same scripted
headers and boundaries, and compares the ordered receipts (attention decisions,
`percepts-attended`, journal lines).

| Id | Variant | Must hold |
|---|---|---|
| W1 | leaf sense wrapped in `<m-region>` (no role) | receipts identical to `B` |
| W2 | wrapped in `<m-region modality="text" aperture="open">` | receipts identical to `B`; only telemetry differs |
| W3 | outer `closed`, inner `open` | zero materializations, zero journal lines; **fails today** |
| S1 | `m-region[modality]` replaced by a test-only `m-test-aperture` in a `components/` dir; inner sense untouched | same veto, credit, and receipt behavior as `B` |
| P1 | one suppressed header inside nested providers | outer `contactPressure` equals the fold; debt credited exactly once |
| R1 | a top-level `m-interrupts` precedes the first `m-region` in the file | nested arbiter and nested sense both resolve their enclosures at connect |
| A1 | ArchML authors `provides="aperture"` on a plain element | attribute overwritten from the role table, one warning, no role granted |
| C1 | **conformance suite**: any provider of `aperture` run against the message table | passes veto, nearest-credits, id-based receipt, fold, and forwarding checks |

C1 is the executable form of the role contract. An author of `m-another-aperture`
runs it instead of reading the runtime. It is also the natural seed for the port
declarations the schema-guided note wants: a role that has a conformance suite has
a contract; the declaration can be generated from what the suite checks.

## Migration surface

The reflection and lookup API introduce no behavior change on their own. Sites to
migrate afterward, grouped by what they become:

| Becomes | Sites |
|---|---|
| `enclosing('faculty')` | `mInterrupts.js:70` (`closest('m-region')`); `mMind.js:417` inside `_arbiter()` |
| `enclosing('aperture')` | `mSense.js:75`; `mRegion.js:72`, `:83` (`closest('m-region[modality]')`) |
| `enclosing('assembler')` / `provides()` | `mAgent.js:178`; `mTerminal.js:77`; `mFacts.js:154` |
| `membrane()` | all `closest('m-mind')`, `closest('m-mind, m-agent')`, `closest('m-agent')` in `mConsole`, `mImage`, `mKb`, `mLoopDetector`, `mAct`, `mSpeech`, `mClearMind`, `mResurface`, `mMemory`, `mFacts`, `mEar`, `mJobs`, `mRegion`, `memoryVault.js:49` |
| `part(role)` | `mMind.js:163–217`, `:283`, `:328`, `:416–419`, `:530`, `:560`; `mMemory.js:120–147`; `mKb.js:58`; `mLoopDetector.js:60`; `mAct.js:135`; `mClearMind.js:55`; `mResurface.js:81`; `mInterrupts.js:215` |
| `..[provides~="mind"]/…` refs | `..m-mind/economy/arousal` in `mInterrupts`, `mLoopDetector`, `mAct`, `mRegion`; `..m-mind/stream/@boundary` in `mRegion`; `..m-mind/@percepts-attended`, `..m-mind/@aperture-change` in `mMemory`; `..m-agent/…` in `mReport`, `mContext`, `mWs` |
| leave as is | `startup/*` (build-time text), `studio/architectureSurface.js` (parses the file), `mWs.js` society/mind enumeration (identity roots; migrate for uniformity later), `mSociety.js:41` |

`m-mind` and `m-agent` are identity roots, so their tag-based refs are not wrong.
Migrating them is worth doing in one mechanical pass anyway: `membrane()` collapses
the `m-mind, m-agent` union strings and makes the same component correct inside an
agent, a mind, or a society without a case list.

## Proposed order

1. **Phase 0, no behavior change.** `static provides` on the classes in the role
   table; role table and reflection in the loader between phases; `enclosing`,
   `enclosingAll`, `membrane`, `part`, `provides` on `MBaseComponent`; fixtures R1
   and A1. Existing tests stay green untouched.
2. **Phase 1, structural lookups.** Migrate the first four rows of the table and
   the ref row, identity roots included. `_arbiter()` becomes "top-level `arbiter`
   in the membrane". Fixture W1 passes trivially; it is recorded as the baseline
   for the rest.
3. **Phase 2, the aperture protocol.** `percept-candidate` with conjunction, nearest
   credits, version chain, and membrane stop; `aperture-register` and interior
   scan; id-based receipts; pressure fold; the mind-level consumer reads
   `part(mind, 'aperture')`. Fixtures W2, W3, P1, C1.
4. **Phase 3, substitution shown.** `m-test-aperture` under a `components/` dir
   used by S1; then the perceptual-membrane known-issues rows 1, 3, and 4 point
   here and the `Aperture` class is documented as the reference policy, not the
   provider.
5. **Later.** Role-based Plenum seed path; a `..~role/…` ref shorthand if the
   attribute selector proves noisy in practice; generated port declarations from
   conformance suites.

## Decisions

Settled with Kris on 2026-09-06.

1. **Roles are reflected onto the live DOM as a derived `provides` attribute**, with
   the loader's role table as the source of truth. It reuses `closest`, Amanita refs,
   and CSS scoping unchanged; it is race-free at connect without retry loops; and it
   cannot reach a home or the identity diff. The name is `provides`: not `role`,
   which the agent's `role="subagent"` and ARIA already own, and not a `data-*` name,
   which would read as a debugging aid rather than a convention the loader owns.
   Authored values are overwritten with a warning (fixture A1).
2. **Identity-root lookups migrate in Phase 1**, mechanically, together with the
   faculty and aperture lookups. `membrane()` replaces every `closest('m-mind')`,
   `closest('m-mind, m-agent')`, and `closest('m-agent')`; the `..m-mind/…` and
   `..m-agent/…` refs become `..[provides~="mind"]/…` and `..[provides~="agent"]/…`.
   Low risk, and it removes the union strings that would otherwise grow with every
   new kind of membrane.
3. **The nearest provider credits contact debt** in nested apertures. All-credit
   double counts; outermost-only leaves an inner regulator blind to its own sources.
   This is part of the protocol table above, not a policy knob.

## Still open

1. **Awareness-gate mechanism for the higher
   [processing tiers](../architecture/perceptual-membrane.md#processing-tiers).**
   Recommended: a capture-phase cancelable veto on `interrupt-request` at the
   provider. Order-independent and needs no new event; arbiters stay bubble-phase.
   Decide when the first tier-1 or tier-2 source exists.
2. **Split `m-region` into `m-region` plus an explicit `m-aperture` child?** Not now.
   The conditional `provides` keeps every existing ArchML file valid and unchanged.
   Revisit when a second aperture policy exists and wants to live beside the first.
