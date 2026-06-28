# ArchML templating — archetypes and thin minds

**Status:** design proposal — not yet implemented.

## The problem

A society's members are nearly the same mind written out several times. The
genuinely-new information per member is small; the repetition is large.

Concrete, from the files we have:

| file | minds | lines | repeated stack per mind |
|------|------:|------:|--------------------------|
| `architecture/lab/noosphere-lab.archml` | 6 | 458 | ~30 lines, near-identical |
| `architecture/lab/hearth-society.archml` (`../hearth`) | 6 | 343 | ~25 lines |
| `architecture/lab/duet.archml` | 2 | 236 | ~25 lines |

Take the noosphere. Every one of the six experts carries the *same* faculty
stack, written out six times:

```
<m-interrupts name="attention" threshold="0.4x" rateLimit="12s" keep="3" arousalSensitivity="0.25"/>
<m-timeout    name="watchdog"  timeout="1xxs" reset="..m-mind/stream/chunk" salience="0.9" urgent="true" prompt="…"/>
<m-ear        from="..m-society/commons/gossip" as="Commons" ignoreSelf="true" salience="0.6x" cooldown="18s"/>
<m-region name="drift"> <m-interrupts gain="0.6" threshold="0.5" rateLimit="60s"/> <m-timeout name="wander" …/> <m-associate name="associate" every="6" cooldown="90s"/> </m-region>
<m-loop-detector name="loop-detector" every="5" minTail="900"/>
<m-clear-mind    name="clear-mind"    salience="0.5" cooldown="0ms"/>
<m-resurface     name="resurface"     minNoteChars="120" salience="0.75" farThreshold="0.4" cooldown="0ms"/>
<m-act name="hands" …> <m-note …/> <m-recall …/> </m-act>
<m-kb name="scribe" every="15"/>
<m-economy name="economy" budget="0.4" estInPrice="0" estOutPrice="0"/>
```

The same is true of `lemma` and the duet's `prover`: the **prover is `lemma`
plus an `m-ear` and a more forthcoming `m-speech` prompt** — yet the whole of
`lemma`'s body is copied into `duet.archml` to say so. When we retune the loop
kit, or change a default, we change it in a dozen places and hope they stay in
step. They will not.

### What is actually new per mind

Strip the repetition and a member is just:

- a **name** (and a unique `m-ws` port);
- its **persona prose** (the identity paragraph) and its **`m-origin`**;
- a handful of **scalar deviations** (`tailLength`, `temperature`, `burstTokens`,
  a threshold or two);
- the **role faculties it adds** — `m-ear` wiring, `m-terminal` for calculus,
  `m-look`/`m-feed` for world, `m-kin`/`m-keepsake` for kin;
- the **faculties it drops** — vigil has no `m-resurface`, `m-kb`, or notebook;
  world has no `m-resurface`.

Everything else is a shared skeleton. Templating should let a file carry *only*
that list, and write the skeleton once.

## Design principles

One commitment shapes everything below; four facts about how ArchML loads keep it
cheap.

**The architecture is a living structure, not a frozen file.** The point of
templating is not terser config — it is the first step of a *developmental*
substrate: a small seed (a grammar of archetypes) that unfolds into a large
structure, and that should in the long run grow, prune, and re-wire itself at
runtime (see *Doors left open*). So the prime directive is **keep every operation
runtime-capable and every structure mutable.** Stability is meant to come from
feedback loops — the arbiter, the economy, the loop-detector, and future
structural regulators — the way it does in a biological system, *not* from a
snapshot we refuse to let change. Re-executability (Covenant §1) is honoured, but
read correctly: the covenant asks that a retained mind can be *honestly woken
again as the self it became*. For a mind that grew by feedback, that means
recording the grown **phenotype**, not re-deriving it from the seed — re-running
the seed would yield a *different* mind and so *lose* the self. Reproducibility is
therefore a free property of the static case today, not the source of stability,
and never a constraint that forbids runtime change.

The four substrate facts:

1. **ArchML is a DOM.** `start.js` does `document.body.innerHTML = <file text>`,
   then `loadMindComponents` calls `customElements.define`, which upgrades each
   element and runs its `onConnect` **in document order**
   (`loadMindComponents.js`). There is a clean window *after the text is read and
   before any component is upgraded* in which the tree is inert plain
   `HTMLElement`s — the right place to expand templates by cloning and merging
   nodes, with no `onConnect` side effects. The same `customElements` machinery
   has `disconnectedCallback`, so the substrate *already* permits runtime growth
   and pruning — what is missing is clean teardown in the components, not in the
   loader (noted under *Doors*).

2. **Relative refs are clone-safe.** Wiring is addressed structurally —
   `..m-mind/stream/chunk`, `..m-society/checker/voice/spoken`. Because these
   resolve relative to the element's position in the tree, a faculty cloned from an
   archetype into a member — or, later, *moved or re-grown* at runtime — keeps
   resolving to *its own* stream and *its own* society neighbours, automatically.
   This is why DOM cloning is the correct expansion primitive and string-splicing
   is not, and why runtime re-wiring stays tractable.

3. **The home snapshots what actually ran.** `mMemory._snapshotArchitecture`
   writes `getLoadedArchitecture().content`. Templating sets that to the
   **expanded** tree, so a home never depends on an external archetype file; and
   the snapshot grows to record the **seed alongside the grown state** (see *The
   snapshot*). This is already how the wake-time overrides behave — they rewrite
   the source so the snapshot records what ran (`applyOriginOverride` & co. in
   `architecture.js`).

4. **There is already a placeholder convention.** `fillInterlocutor` replaces
   `{{interlocutor}}` in identity prose at wake (`mMind.js`). Templating reuses
   `{{…}}`, never a second syntax.

## The design

Five primitives. The first two carry the weight; the rest are corners.

### 1. `<m-archetype>` — a named, non-running prototype

An archetype looks exactly like the thing it is a prototype *for* (usually an
`<m-mind>`), but it never runs. It is collected into a name→node registry and
stripped from the tree before components load. It holds the shared skeleton, with
`{{placeholders}}` where members differ.

```xml
<m-archetype name="expert"
             interlocutor="Kris" stage="experimental"
             model="voice" utilityModel="utility"
             pace="14s" paceSigma="4s" tailLength="6200">
  {{persona}}                         <!-- replaced by each member's prose -->

  <m-origin name="origin">{{origin}}</m-origin>
  <m-stream  name="stream" burstTokens="340" temperature="0.85"/>
  <m-memory  name="memory" tailLength="6200" recentLength="3000" storyLength="3200"
             blockMin="800" storyEvery="5"/>
  <m-interrupts name="attention" threshold="0.42" rateLimit="12s" keep="3" arousalSensitivity="0.25"/>
  <m-timeout name="watchdog" timeout="160s" reset="..m-mind/stream/chunk"
             salience="0.9" urgent="true" prompt="The thread is still here; I take it up again."/>
  <m-ear from="..m-society/commons/gossip" as="Commons" ignoreSelf="true" salience="0.66" cooldown="18s"/>
  <m-region name="drift">
    <m-interrupts gain="0.6" threshold="0.5" rateLimit="60s"/>
    <m-timeout name="wander" timeout="240s" sigma="60s" salience="0.45" prompt="I turn the question a different way."/>
    <m-associate name="associate" every="6" cooldown="90s"/>
  </m-region>
  <m-loop-detector name="loop-detector" every="5" minTail="900"/>
  <m-clear-mind    name="clear-mind"    salience="0.5" cooldown="0ms"/>
  <m-resurface     name="resurface"     minNoteChars="120" salience="0.75" farThreshold="0.4" cooldown="0ms"/>
  <m-act name="hands" every="6" threshold="0.62" cooldown="70s" readCooldown="60s" intentCooldown="5m">
    <m-note   name="note"   felt="When something is worth keeping, you can write it down and return to it."/>
    <m-recall name="recall" felt="When a question returns, you can turn back and find what you knew."/>
  </m-act>
  <m-kb name="scribe" every="15"/>
  <m-economy name="economy" budget="0.40" estInPrice="0" estOutPrice="0"/>
</m-archetype>
```

Archetypes may themselves `extends` another archetype (chains resolve before use;
cycles are an error).

### 2. `extends="a b c"` — composition by deep keyed merge

`extends` names a **space-separated list of archetypes** — the layers a mind is
built from. They are folded left → right and the mind's own body is the last
layer:

```
∅  ⊕  a  ⊕  b  ⊕  c  ⊕  (the mind's own attrs/children)   →  the running mind
```

where `⊕` is the keyed deep-merge below (later layers win). **Single inheritance
is the one-element case; mixins are the N-element case** — the same operator, so
mixins cost no new vocabulary. `<m-mind extends="mathematician loop-kit notebook"
name="prover">…</m-mind>` is a mathematician, overlaid with the loop and notebook
faculty bundles, finished with what makes it the prover.

This is the declarative answer to mixins: you never write an edit op
(`add`/`set`), you **re-state the faculty you want and let it merge** — so the
file still reads as the mind it describes, not as a script that builds one.

The merge `⊕` is **deep, keyed by SLOT — not by position, and not by
implementation.** This is the one decision both first drafts (mine and Codex's)
got wrong, by keying on `(tag, name)`:

- **A node's slot is its `name`** within its parent — *not* its tag. The `name` is
  the **role** the component fills; the tag is merely the **implementation** that
  fills it. So a later layer can **swap the implementation in a slot**: an
  archetype's `<m-origin name="origin">` is overridden by a mind's
  `<my-origin name="origin">` — same slot, new implementation — and the custom
  component lands exactly where the inherited one was. Keying by `(tag, name)`
  would instead leave *both* in the tree (different tags → different keys); that is
  the bug this fixes. (The deeper reason to prefer it: *role vs implementation* is
  the same decoupling type-based wiring needs — a slot is a role, like a typed
  port. §*Doors*.)
- **The winning layer's tag wins.** Same tag as the base → a tune in place;
  different tag → the implementation is swapped out.
- **Config deep-merges by default** onto the base slot — attributes, children
  (recursively, by slot), and direct text. Attributes the layer omits are kept;
  ones it states win; the layer's own non-whitespace text replaces the base's (so
  `{{persona}}` resolves to each mind's prose while the faculty children stay
  shared). A swap therefore *keeps* inherited config — a drop-in replacement of the
  same role inherits its tuning, which is usually exactly what you want.
- **`fresh="true"`** opts *out* of config inheritance for that slot: take the
  element verbatim, inheriting nothing from the base slot. It is **independent of
  the tag** — config-merge is the default and `fresh` the opt-out *whether or not
  the implementation changes*. So you can start clean while **keeping the same
  tag** (`<m-origin name="origin" fresh="true">` to wipe an inherited origin's
  attributes and content and re-specify from nothing) just as easily as while
  swapping it. Only the slot (`name`) and its position are kept; `fresh` resets
  everything else.
- **Naming is how you make a slot overridable.** Unnamed children are *layer-local*:
  inherited as written, never a merge target (so two things that were never the
  same slot can't half-merge). Give a `name` to anything a later layer should tune,
  swap, or `drop`. Names must be unique within a parent (else a validation error) —
  that uniqueness is what makes the slot key unambiguous.

So your case works directly — implement `my-origin`, extend the inherited one or
start `fresh`, drop it in the `origin` slot, and overrides find it:

```xml
<m-mind extends="expert" name="seer">
  <my-origin name="origin">…a custom origin implementation, same slot…</my-origin>
  <!-- or keep the tag and reset: <m-origin name="origin" fresh="true">…from nothing…</m-origin> -->
</m-mind>
```

Position is preserved on override and new (new-`name`) children append last,
because `loadMindComponents` upgrades in document order and some `onConnect`s bind
to an *earlier* sibling (the watchdog's `reset="..m-mind/stream/chunk"` needs
`<m-stream>` already present). The archetype defines the canonical order; later
layers retune or swap in place and append extras — both safe. When a mixin
introduces a slot and a later layer retunes it, order resolves deterministically
(the layer that introduced the `name` sets its position; later layers override in
place).

**Partial archetypes are faculty bundles.** An archetype need not be a whole mind
— it can hold just a cluster of faculties, the unit a mixin contributes:

```xml
<m-archetype name="loop-kit">          <!-- the sense/bid/break loop trio -->
  <m-loop-detector name="loop-detector" every="5" minTail="900"/>
  <m-clear-mind    name="clear-mind"    salience="0.5" cooldown="0ms"/>
  <m-resurface     name="resurface"     minNoteChars="120" farThreshold="0.4"/>
</m-archetype>

<m-archetype name="notebook">           <!-- note + recall hands -->
  <m-act name="hands" every="6" threshold="0.62" cooldown="90s" readCooldown="60s">
    <m-note name="note"/><m-recall name="recall"/>
  </m-act>
</m-archetype>
```

This is what makes the model *compose* rather than only *inherit-then-delete*: a
mind that wants the loop care and a notebook says `extends="base loop-kit
notebook"`; a mind that wants neither simply omits them. `drop` (next) stays for
the case where a bundle is almost right.

### 3. `drop="name …"` — removal

Inheritance that can only add is not enough: vigil drops the notebook and the
scribe; world drops `m-resurface`. A member lists the inherited child names it
does not want:

```xml
<m-mind extends="companion" name="vigil" drop="resurface scribe hands">
  You are Vigil, Hearth's patience. …
  <m-presence name="presence" who="Margit" timeout="25m" …/>
</m-mind>
```

`drop` removes by the same `name` key at the member's own level. To prune
something nested (a single hand inside `hands`) the member declares a nested patch
element carrying its own `drop`. (`drop` is the new spelling of the rejected
draft's `excludes` — a verb, in the register of "hands" and "drift".)

### 4. `<m-society archetype="…">` — the default every member extends

The society names one archetype its members inherit by default, so the common
case needs no `extends` per mind at all:

```xml
<m-society name="noosphere-lab" archetype="expert">
  <m-archetype name="expert" …/>          <!-- §1 -->
  <m-commons name="commons" members="calculus chronicle phenomenology ecology criticism synthesis"/>

  <m-mind name="calculus" tailLength="7200">
    You are Calculus, the Office of Measure and Public Reason… (persona prose)
    <m-origin name="origin">You wake as one faculty of the World State…</m-origin>
    <m-stream burstTokens="360" temperature="0.82"/>
    <m-act name="hands" every="5" cooldown="20s" intentCooldown="90s">
      <m-terminal name="terminal" wall="15s" cpu="10s" mem="1g" maxOutput="16k" network="off"
                  felt="When a claim becomes concrete, you can run the check and read what comes back."/>
    </m-act>
    <m-ws port="7641"/>
  </m-mind>

  <m-mind name="chronicle" pace="14s" tailLength="6200">
    You are Chronicle, the Archive and Continuity… (persona prose)
    <m-origin name="origin">You wake as the memory of the World State…</m-origin>
    <m-stream temperature="0.86"/>
    <m-act name="hands" cooldown="60s" readCooldown="45s" intentCooldown="4m">
      <m-look name="read" newsUrl="https://en.wikipedia.org/w/api.php?action=featuredfeed&amp;feed=featured&amp;feedformat=atom"
              felt="When a name or institution asks for texture, you can encounter a sourced fragment."/>
    </m-act>
    <m-ws port="7642"/>
  </m-mind>
  …
</m-society>
```

A member may override the default with its own `extends="…"`, or opt out with
`extends="none"`. Each member collapses from ~55 lines to ~10 — and what remains
*is exactly what makes that mind itself*: its prose, its origin, the hand it adds,
its port. The shared stack is written once, in the archetype.

Note the `m-act` merge: the `hands` slot matches the archetype's, so calculus's
`note`+`recall` are inherited and `m-terminal` is appended — calculus has all
three hands without restating two of them.

### 5. `<m-import src="…">` — archetypes across files

The duet's prover and the `lemma` resident should share one prototype rather than
copy each other. Factor it into a file and import it:

```xml
<!-- architecture/archetypes/mathematician.archml -->
<m-archetype name="mathematician" interlocutor="Kris" model="voice" utilityModel="utility"
             pace="12s" paceSigma="4s" tailLength="5400">
  You think the way a mathematician thinks: small cases by hand, a pattern, a
  guess, a doubt, a question worked until it turns honest. {{extra-persona}}
  <m-origin name="origin">{{origin}}</m-origin>
  …the full mathematician stack: deep memory, calm drift, loop kit, note+recall…
</m-archetype>
```

```xml
<!-- duet.archml -->
<m-society name="duet">
  <m-import src="../archetypes/mathematician.archml"/>
  <m-mind extends="mathematician" name="prover" tailLength="9300">
    …and you are not working alone — there is a Checker here with you… (extra prose)
    <m-origin name="origin">For a positive integer n … are there infinitely many balanced integers?</m-origin>
    <m-ear from="..m-society/checker/voice/spoken" as="Checker" salience="0.85"/>
    <m-speech name="voice" every="4" threshold="0.35" cooldown="15s" prompt="Speak when a result is found…"/>
    <m-ws name="ws" port="7631"/>
  </m-mind>
  <m-mind extends="mathematician" name="checker" tailLength="5400" drop="…">
    …your work is to CHECK… (extra prose)
    <m-ear from="..m-society/prover/voice/spoken" as="Prover" salience="0.85"/>
    <m-ws name="ws" port="7632"/>
  </m-mind>
</m-society>
```

`lemma.archml` can `extends="mathematician"` the same file. Imported archetypes
are **inlined at expansion**, so the snapshot stays self-contained and no home
depends on a file outside itself (principle 3). Resolution order for a name:
inline `<m-archetype>` → `<m-import>`ed → an `architecture/archetypes/<name>.archml`
convention dir — mirroring `getMindComponentsPaths`. Inline wins.

## The snapshot: seed and grown state

Today, expansion is a pure **text → text** pass run inside `readArchitectureFile`
*before* the existing name/origin/interlocutor overrides:

```
raw file text
  → expandArchitecture()        # NEW: resolve imports, archetypes, extends, drop → flat text
  → applyMindNameOverride()     # existing wake-time overrides, unchanged
  → applyOriginOverride()
  → applyInterlocutorOverride()
  → loaded.content   ──────────► document.body.innerHTML   (runs)
                     └─────────► mMemory snapshot           (archived, fully expanded)
```

Consequences for the static case (today):

- The home's `architecture.archml` is the fully-resolved tree — **zero behavioural
  change to any running mind**; only the authored file shrinks.
- Editing an archetype later never alters an existing home (it captured the
  resolved form), and a home never depends on a file outside itself.
- **Backward compatible:** a file with no `extends`/`m-archetype`/`m-import`
  expands to itself. Every current resident and home is untouched.

**Read the snapshot as genotype + phenotype.** The expanded tree is the
**phenotype** — the structure that actually ran. The authored file (archetypes,
`extends`, params) is the **genotype** — the seed that shaped it. Today the two
are interconvertible, so recording only the phenotype loses nothing. The moment a
mind grows or prunes structure by feedback they diverge: the phenotype becomes
path-dependent and *cannot* be re-derived from the seed, so honest re-waking
(Covenant §1) needs the **grown phenotype** snapshotted, while the genotype merely
records lineage. The cheap, forward-compatible move is to keep **both** — the
authored seed beside the expanded/grown state (e.g. `architecture.seed.archml` +
`architecture.archml`) — rather than treat a frozen expansion as the whole truth.
For now the expanded file alone suffices; the door is left open simply by not
throwing the seed away. (This is where Codex's dual snapshot is right — but for
continuity, not for the determinism it argued.)

Internally `expandArchitecture` parses into a *detached* container
(`document.createElement('template')`/a throwaway node), does the clone-and-merge
on inert elements, strips `<m-archetype>`/`<m-import>` nodes, and serializes back.
It is unit-testable as a string-in/string-out function, exactly like
`origin-override.test.js` and `interlocutor-override.test.js` already test their
transforms.

## Doors left open: toward a developmental substrate

Templating is step one. The longer arc is a *developmental* system: a grammar of
templates that grows a structure, wires it by matching types the way a projected
axon finds its peers, and lets actively-used parts proliferate while idle ones
atrophy — stability coming from feedback, not from a frozen plan. None of it is
built now; the job here is to make sure step one shuts no door on it. Below: the
decisions that keep each door open, and the one stance that would close them all.

### The master door: one substrate, every level

A faculty, a mind, and a society are the **same kind of node** — a membrane with
ports and contents — and they **grow and prune by one recursive rule at every
level**. `mSociety` is already "the first recursive object." So the merge, the
registry, and (later) the matcher and the regulator must be **level-agnostic
functions over nodes**, never special-cased to "minds." Keep that and the system
is fractal; hard-code a level and growth stops there.

The one stance that closes this door is making templating an **authoring-only
layer that disappears before runtime** — the tidy, reproducibility-first choice.
It is clean for static societies and wrong here: if the grammar is gone by
runtime, a mind can never instantiate from it. So every construct below is a
*runtime-callable function*, not a build step.

### 1. A grammar that generates (genotype → phenotype)

The load-time expander is just the special case "merge every `extends` in a file."
The general case is a pure pair of node functions the design already implies:

```js
instantiate(name, { attrs, children, persona, origin }) → Element   // a production
mergeInto(base, patch) → Element                                     // the ⊕ core
```

Because archetypes live in a **name-addressable registry** (not only file paths),
a running mind could grow a submind with no filesystem:

```js
// sketch of a future m-beget hand — NOT proposed now
const child = instantiate("expert", { name: "newcomer", origin: derivedTask });
society.appendChild(child);
await loadMindComponents(child);   // upgrades just the new subtree
```

**Grammar plasticity — open the door, not now.** The genotype stays
human-authored for the foreseeable future; only the grown structure changes at
runtime. But because archetypes are ordinary nodes in a registry, a mind *could*
one day author or alter its own — nothing here forbids self-modifying grammar, it
just isn't granted. Keeping `instantiate`/`mergeInto`/registry pure and
runtime-callable is the whole of leaving that door open.

### 2. Wiring by type, not by address (chemoaffinity)

Today wiring is a fully-specified address: `from="..m-society/checker/voice/spoken"`.
That is the **pre-wired 1:1 special case** of a more general idea — ports that
carry a **type** and find their peers, even at a distance. The intended match is
**two-layered**:

- a **structural payload type** gates *whether* a wire is possible (what flows: a
  voice, a verified-claim, a percept, a salience-bid — a transmitter/receptor fit,
  or a function signature);
- **semantic affinity markers** decide *which* compatible peers bind, and *how
  strongly* (chemoaffinity tags along a gradient).

The codebase already leans this way: `m-commons` is a typed bus (one `gossip`
topic many minds share), `m-ear` carries `as=`/`salience=`, `m-link` has
`port=`/`topic=`, and label-selectors (Codex's `m-connect`) are a static foretaste
of affinity matching. The door-keeping move is small and is *stance, not code*:
treat explicit `from=`/`to=` as **one resolver among several**, so a future
**matcher** can resolve `provides`/`accepts` typed ports into the very same
`m-ear`/`m-link` edges — and re-resolve them as structure grows. I am not adding a
`type=`/`provides=`/`accepts=` vocabulary yet; I am only keeping wiring expressible
as *a relation a resolver computes*, never a constant frozen at authoring time.

### 3. Growth and pruning by activity (use it or lose it)

Parts that carry signal should strengthen and proliferate; idle parts should
atrophy and be pruned — at every level. Three prerequisites, none due now, all
kept reachable:

- **A mutable runtime tree** — already true (custom elements connect/disconnect).
- **Clean teardown** — pruning a faculty must release its timers, subscriptions,
  and ports. Amanita already wires an `onDisconnect` hook (`a.js`), so this is a
  *per-component* debt, not a substrate gap: only ~7 of 19 components implement
  teardown today. *This is the real prerequisite* for growth, worth tracking
  independently of templating.
- **A regulator** — a feedback component reading activity (salience carried,
  economy spent, loop pressure) against homeostatic set-points, calling
  `instantiate`/append to grow and `drop`/remove to prune. This is where
  "stability from feedback" actually lives.

### 4. Stability from feedback, not from the file

The architecture is a regulated living structure. The existing loops (arbiter,
economy, loop-detector) already stabilise *behaviour*; the same shape — sense an
imbalance, bid, adjust — extends to stabilising *structure*. The snapshot records
the grown self for continuity; the feedback keeps it viable. Reproducibility was
only ever a proxy for "the same mind comes back," and seed + phenotype serves that
better than a frozen config could.

## The vocabulary (the part most open to taste)

Naming carries weight in this codebase — *membrane, faculty, drift, hands,
scribe, covenant*. My recommendations, with the runners-up and why:

| concept | recommended | alternatives considered |
|---------|-------------|-------------------------|
| the prototype element | **`m-archetype`** | `m-template` (bland; clashes with HTML `<template>` parsing semantics), `m-prototype` (JS-flavoured), `m-form`/`m-mold` (too cute) |
| inheritance + mixins | **`extends="a b c"`** (a space-separated layer list) | `like`, `is-a`, `mixes`, `from` (already a wiring source on `m-ear`/`m-link` — would collide); a separate `mixin=` attr (redundant — one ordered list already composes) |
| removal | **`drop`** | `excludes` (the rejected draft's word), `omits`, `without` |
| society-wide default | **`archetype="…"` on `<m-society>`** | a separate `<m-defaults>` block (redundant — the archetype already carries shared attributes) |
| cross-file include | **`<m-import>`** | `<m-include>` (implies dumb paste; we do a keyed merge), `<m-use>` |
| placeholders | **`{{…}}`** (reuse `fillInterlocutor`'s) | a new `${…}` syntax (gratuitous second convention) |

"Archetype" is the one I'd most want your eye on: it reads well in this project —
*a concrete mind is an instance of a pattern* — and it cleanly distinguishes a
**definition that never runs** from a live `<m-mind>`. If you'd rather keep the
plainer `template`, the design is unchanged; only the tag name moves.

## Why not the alternatives

- **Inferring boilerplate instead of declaring it.** Anything that decides what to
  share by *comparing* values (rather than by an explicit `extends`/`drop`) makes a
  mind's meaning non-local and unstable — nudge one scalar and a faculty silently
  changes what it inherits. Inheritance here is always **declared**.
- **Code generation / a YAML→archml generator.** Leaves the DOM substrate, so it
  helps neither runtime growth nor the snapshot, and turns the readable,
  rationale-commented archml into build output. The archml *is* the artifact we
  want to keep legible.
- **Includes only (paste, no merge).** `<m-include>` of a shared fragment removes
  *identical* repetition but not the common case — retuning one scalar still
  forces a full copy. The keyed deep-merge subsumes include (include is just the
  no-override case).
- **Authoring-only templating that disappears before runtime.** The
  reproducibility-first design (kits compiled away so "runtime components never
  know templates exist"). Clean for static societies, but it shuts the master door
  (*Doors left open*): a grammar that is gone by runtime can never grow a mind from
  itself. We keep the grammar live and runtime-callable instead.

## Implementation sketch (phased)

1. **`src/startup/templating.js`** — `expandArchitecture(text, { resolveImport }) → text`,
   plus the `mergeInto`/`instantiate` core over nodes. Pure; no I/O except the
   injected `resolveImport` reader. Unit tests mirror `origin-override.test.js`.
2. **Hook** into `readArchitectureFile` before the wake-time overrides (pipeline
   above). One call site.
3. **Errors:** unknown `extends` name (list available), `extends` cycle, ambiguous
   duplicate `name` within a parent, missing/cyclic `<m-import>` — fail loud at startup, the
   way a missing component already does.
4. **Convert one file** as the proof: `noosphere-lab.archml` (biggest win, all
   transient — no resident home to disturb). Diff the expanded output against the
   current file to prove byte-equivalence of the *resolved* tree before trusting
   it. Then `duet` + the shared `mathematician` archetype; `lemma` last and only
   if its expansion is verified identical (it has a real home).
5. **Defer:** the `architecture/archetypes/` convention dir, attribute deletion,
   and anything runtime (`instantiate` is built and tested, but no `m-beget` hand
   until there is a use for one).

## Open questions

- **Comments in the snapshot.** Serializing the expanded DOM normalizes
  formatting and may drop the authored rationale comments. Acceptable for a
  runtime archive (the commented source is in git), but if homes should stay
  human-browsable we can carry an archetype's leading comment into the merge.
- **`drop` granularity.** Is name-level removal plus nested patch elements enough,
  or do we want path syntax (`drop="hands/recall"`)? Start with the former.
- **Archetype + `m-link`/`m-commons`.** These already DRY the *wiring* (hearth's
  edge list, the noosphere commons). Templating handles the *faculty stack* and
  composes with them unchanged — but worth confirming on the hearth conversion
  that an archetype carrying an `m-input-relay`/`m-ear` plays well with a
  society-level `m-link` block.

Forward-looking (not blocking this proposal, but the doors point at them):

- **Teardown debt.** Activity-driven pruning needs every component to release its
  timers/subscriptions/ports symmetrically to `onConnect`. An audit of which
  components have clean teardown today is the real first step toward growth — and
  is worth doing independently of templating.
- **The typed-port resolver.** When it is time, what does a `provides`/`accepts`
  declaration look like, and does the matcher run once at wake, on a cadence, or on
  a structural-change event? The two-layer match (payload gates, affinity binds)
  is settled in intent; its surface and timing are not.
