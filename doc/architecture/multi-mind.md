# Multi-mind — societies, links, and the recursive membrane

> **Status: design.** This fleshes out [deep-structure.md](deep-structure.md)
> §3 (*spawned subminds*) and §5 (*a society of minds*), and realizes the
> deferred `<a-wire from to>` connector named in
> [decoupling.md](decoupling.md). Nothing here changes the behaviour of a flat
> single mind. Part 1 names the concepts; Part 2 is the topology cookbook;
> Part 3 is the implementation surface and the smallest first milestone.

## The premise: a mind already has a membrane

We don't need a new runtime to connect minds. The substrate that makes a *single*
mind work is already two recursive-capable mechanisms (deep-structure.md):

1. **A broadcast bus** — `pub`/`sub` topics that are *behaviour-values* (a late
   subscriber replays the current value). Fan-out for free.
2. **A bubbling attention spine** — observers `fire("interrupt-request", …)`;
   `m-interrupts` arbitrates by salience; `m-mind` drains the winners at each
   boundary. The one genuinely tree-shaped thing.

And one underused primitive: **`hub` / `setHub`**, which forwards *every*
publication of a component to another element — the natural "fold my result
upward" conduit.

The single change in posture that makes minds composable was **already shipped**:
faculties bind through **mind-relative refs** (`..m-mind/stream/chunk`), not the
global `/stream/chunk`. That one decision means a mind's interior is *already*
encapsulated — two minds in one document don't stomp each other's streams. Everything
below builds on that.

So a mind is best seen as a **cell with a thin membrane**:

- **Interior** — stream, tail, memory, observers, arbiter. Private. Addressed only
  by *relative* refs, so it composes at any depth.
- **Membrane** — a small, named surface the outside world may touch:
  - **egress** — what the mind emits. It already exists: `m-speech` publishes
    `spoken {text, at}`. Optionally a mind may also expose its raw `thought`
    (stream chunks) for a transparent, "thinks out loud" member.
  - **ingress** — stimuli arriving as `interrupt-request`s into its arbiter. The
    *human-voice* path is already exactly this. Another mind's voice is just one
    more stimulus.

> **The encapsulation rule (load-bearing).** *Inside* a mind, only relative refs.
> To *cross* a membrane, go through a named port — never reach into another mind's
> interior. This single rule is what keeps N minds from interfering and makes the
> wiring graph the *only* place inter-mind coupling lives.

---

## Part 1 — The concepts

Five concepts. Each is either a renaming of something shipped or a small new
element on the same DOM/bus. None is a new runtime.

### 1. Ports — the named surface of a mind

A **port** is just a topic on the membrane, addressed by the mind's **unique name**:

| Port | Direction | Today | Shape |
|------|-----------|-------|-------|
| `voice` | out | `m-speech` → `spoken {text, at}` | event (dedupe on `at`) |
| `thought` | out (optional) | `m-stream` → `chunk` | event stream |
| `mood`/`stance` | out (optional) | any retained `pub` | behaviour-value |
| `ear` | in | `fire("interrupt-request", …)` into the arbiter | event → stimulus |

Egress is a **topic or event** (pull/subscribe); ingress is an **event into the arbiter**.
The whole job of an inter-mind connection is the *adaptation* between them:
subscribe to a source's egress (`@spoken` for voice, a topic for relays), and raise a framed stimulus on a target's
ingress. That adaptation — where framing, salience, and gating live — is the link.

> **Address voice as `@spoken`, not `spoken`.** Since the events refactor
> (`c699bba`), `m-speech` emits its voice by `fire("spoken", {text})` — a
> transient DOM event, never a retained `pub`. So a consumer MUST subscribe to the
> **event ref** `…/voice/@spoken` and read the payload from `e.detail`; a plain
> `…/voice/spoken` ref binds a behaviour-value that the fired event never reaches,
> and the link goes *silently deaf* (the bug that hid in `m-ear`/`m-commons`/
> `m-link` because their tests drove `.pub` instead of `.fire`). A genuinely
> retained value port (a `gossip` relay, a `mood`/`stance`) is still addressed by
> its plain topic name.

Ports require **unique names per mind** (`alice`, `bob`, `expert-3`). The global
ref `/alice/voice/@spoken` then addresses exactly one mind. Inside the society this
is the address space; the society assigns/enforces uniqueness (templating gives
`expert-0…N` for free).

### 2. `m-ear` — ingress, the realized connector

The runtime form of a connection is a thin component placed **inside the listening
mind**. It generalizes the interlocutor-voice path and `m-observer`'s overridable
`src`:

```html
<!-- inside bob's <m-mind>: bob overhears alice -->
<m-ear from="/alice/voice/@spoken" as="Alice" salience="0.55" cooldown="20s"></m-ear>
```

```js
// src/mindComponents/mEar.js  (sketch)
export class MEar extends MBaseComponent {
  onConnect() {
    const from = this.attr("from")              // external egress, e.g. "/alice/voice/@spoken"
    const as   = this.attr("as") || "someone"   // how the speaker is framed
    const salience = Number(this.attr("salience") || 0.5)
    const urgent   = this.attr("urgent") === "true"
    this.sub(from, raw => {
      const msg = raw.detail ?? raw              // a FIRED voice arrives as a CustomEvent; payload in .detail
      if (!msg || !msg.text) return
      this.fire("interrupt-request", {           // bubbles to THIS mind's arbiter
        source: as, type: "voice",
        suggestion: `${as} says: ${msg.text}`,
        salience, urgent,
      })
    }, 12)
  }
}
```

It is correctly encapsulated: it touches *its own* arbiter only by bubbling
(`fire`), and the outside world only through the named `from` topic. Putting
ingress *inside* the listener is what keeps "intent bubbles up" intact — the link
never reaches *into* a foreign interior.

> `m-ear` is deliberately small. A richer member could instead point a full
> `m-observer src="/alice/voice/@spoken"` at a peer and raise only on *salient*
> content — "hear, but only react when it matters." Same membrane, smarter ear.

### 3. `m-link` — the legible edge (the realized `a-wire`)

Hand-writing ears is fine for two minds. For a graph you want the wiring in **one
legible place**, which is exactly why `decoupling.md` proposed `<a-wire from to>`.
`m-link` is that connector, specialized for minds. It is a **declaration of an
edge**; at boot it realizes itself as an `m-ear` inside the target.

```html
<m-society>
  <m-mind name="alice">…</m-mind>
  <m-mind name="bob">…</m-mind>

  <!-- the graph, in one place -->
  <m-link from="alice" to="bob"   as="Alice" salience="0.55"></m-link>
  <m-link from="bob"   to="alice" as="Bob"   salience="0.55"></m-link>
</m-society>
```

- A single `<m-link>` is **simplex** (`from → to`). A **duplex** channel is two
  links — and asymmetry is usually what you *want* (a mentor heard by students who
  aren't heard back; an observer-mind that hears all and speaks to none). `duplex`
  can be sugar that expands to both.
- `port="voice"` (default) vs `port="thought"` chooses *what* is overheard —
  finished speech, or raw thinking (gossip of thoughts).
- The edge carries the adaptation knobs (`as`, `salience`, `urgent`, `cooldown`,
  `gain`).

> **Why a component, not just a `*Src` attribute?** The `*Src` pattern is right for
> *one* faculty wiring to *one* sibling. A society's value is the **graph as data** —
> readable, generable, diffable in one block. That is precisely the "a concrete
> adapter need appears (spawned subminds, mismatched vocabularies)" trigger
> decoupling.md reserved `a-wire` for.

### 4. `m-society` — the container, and the recursive object

The recursive object the design is *about*. A marker/harness element (as `m-region`
is mostly a marker) that:

- **scopes a population** — its `<m-mind>` children are its members; `closest('m-society')`
  gives any descendant its enclosing society, the third relative-ref anchor beside
  `m-mind` and `m-region`.
- **assigns the address space** — guarantees unique member names.
- **holds the graph** — the `<m-link>`s (or generates them, §Templating).
- **optionally provides a commons** — a shared blackboard topic for gossip (§6).
- **names its public membrane** — optional `external-face`, `external-ear`, and
  `external-mouth` attributes tell a supervisor which member the outside world
  meets, where human input enters, and which port is the public voice.

The decisive property is **uniform ports across leaf and composite**: a society
exposes the *same* membrane a single mind does (a `voice` out, an `ear` in — by
default the voice of a designated speaker or an aggregator; see §fold). So **any
node plugs into any link regardless of whether it is one mind or a whole society.**
That is the composite pattern, and it is what "recursive object" means here:

```
m-society            (a graph of peers; no through-line of its own)
 ├─ m-mind           (a leaf: one stream, one tail)
 ├─ m-mind
 └─ m-society        (nested: a society IS-A node, plugs in like a mind)
     ├─ m-mind
     └─ m-mind

m-mind               (a mind built FROM minds: one through-line ON TOP of a graph)
 ├─ m-stream         (the outer narrative thread)
 ├─ m-society        (its subprocesses — a faculty that is itself a population)
 └─ m-fold           (folds the society's chatter into the outer tail; §fold)
```

Two distinct shapes fall out, and naming them prevents confusion:

- **A society** (`m-society`) is a *graph of peers* — no single through-line. Its
  "consciousness," if any, is emergent in the traffic. This is the MoE / gossip
  reading.
- **A mind-of-minds** (`m-mind` containing an `m-society` faculty + a fold) is *one
  through-line on top of a graph* — deep-structure §1 (competing sub-streams) and
  §3 (spawned subminds). The outer stream is the serialization; the inner society
  is the parallel substrate.

#### The external surface

A society may have many private mouths and ears, but an external supervisor needs
one public membrane: what to show as the face, where a human's words enter, and
which voice counts as the society speaking outward. Declare it on the society:

```html
<m-society name="hearth-society"
           external-face="face"
           external-ear="face/ws"
           external-mouth="face/voice">
  …
</m-society>
```

`external-face` is the member shown in Studio as the public face. `external-ear`
names the member/component that receives direct outside input, normally the
member's `m-ws`. `external-mouth` names the member/component whose speech is the
society's outward voice. These are membrane addresses, not implementation hooks:
the runtime still routes input and speech through the actual components (`m-ws`,
`m-speech`, `m-ear`, links) already in the tree.

When the attributes are absent, Studio uses the common convention: a member named
`face` if present, otherwise the first member with an `m-ws`, otherwise the first
member. This keeps Hearth-style files runnable before they are annotated, while
making the general contract explicit for future societies.

### 5. The fold — folding a population back into one voice

A society needs a way to *speak as one* (to be a node with a `voice` port) and a
mind-of-minds needs to *fold its subprocesses into its tail*. Both are the same
operation, and this is where the unused **`hub`** primitive earns its place:

- **`hub` (aggregate-up):** members `setHub(theFold)`; every member publication is
  forwarded to one collector. The collector (`m-fold`, or a plain `m-memory`
  subscribed to the commons) compresses the chatter into a single stimulus/summary
  that becomes either the society's `voice` or the outer mind's next tail seed.
  Spawn → dwell → **fold** → vanish (deep-structure §3).

---

## Part 2 — Topologies are wiring patterns, not new code

Given ports + `m-ear`/`m-link` + an optional commons + the fold, every structure
the request named is a *wiring choice*. The graph is data; simplex/duplex is
per-edge; manual or generated is just where the edge list comes from.

### 6. Gossip society — the MoE-flavoured default

The softest, most native reading of "Mixture of Experts": a **flat layer of experts
that overhear each other.** Don't wire N² ears — generalize the *broadcast bus* to
the society. One **commons** relay: every member's `spoken` is republished (tagged
with the speaker); every member has **one ear on the commons**.

```html
<m-society>
  <m-commons name="commons"></m-commons>   <!-- relay: any member's voice → tagged gossip -->

  <m-mind name="skeptic"> … <m-ear from="..m-society/commons/gossip" as="(overheard)" ignoreSelf="true"></m-ear> …</m-mind>
  <m-mind name="dreamer"> … <m-ear from="..m-society/commons/gossip" as="(overheard)" ignoreSelf="true"></m-ear> …</m-mind>
  <m-mind name="namer">   … <m-ear from="..m-society/commons/gossip" as="(overheard)" ignoreSelf="true"></m-ear> …</m-mind>
</m-society>
```

`m-commons` subscribes to every member's `voice` and re-`pub`s `gossip {speaker, text, at}`;
each ear hears it as low-salience ambient pressure (and skips its *own* echo by
`speaker`). "When one talks, the others see it as gossip" — exactly. No gate, no
hierarchy; a thought by one seeds the others. This is the broadcast star one level
up.

### 7. Gated MoE — a router mind as the gate

The literal ML-MoE shape: a **gate** routes work to top-k experts and combines.
Map it onto a router *mind* using salience as the gating function (the arbiter's
own currency):

- A `gate` mind broadcasts the question to all experts (one→many links).
- Each expert returns not an answer but a cheap **bid** — "I have something to say
  about this, salience 0.8" (its `m-speech` impulse already emits exactly this).
- The gate hears the bids, selects top-k, and grants the floor (raises the
  question's salience only into the chosen experts).
- Chosen experts answer; a **fold** (hub → collector) combines into the gate's
  reply.

Gate → experts → combine, with k-selection by salience. No new mechanism — it is
the attention arbiter applied across minds instead of within one.

### 8. Other graphs — the same edge list, shaped differently

| Topology | Edges | Note |
|----------|-------|------|
| **Dialog / debate** | one duplex pair | two `m-link`s; let salience decide who holds the floor |
| **Pipeline / chain** | A→B→C simplex | each stage's `voice` is the next's `ear` |
| **Random / sparse** | each hears *k* random peers | a *generated* edge list (§9) |
| **Hierarchy** | leaves→manager→… via `hub` | fold-up at each tier; a society-of-societies |
| **Star / blackboard** | all↔commons | §6 gossip |
| **Observer / chorus** | all→one, one→none | asymmetric simplex; a silent witness mind |

The duplex/simplex question resolves cleanly: **simplex is the primitive; duplex is
two edges.** And what *flows* on an edge picks one of Amanita's two shapes —
**retained** (a standing `mood`/`stance` a late joiner replays) or **event** (an
`utterance`, transient, deduped). A link declares which; default is utterance.

---

## Part 3 — Templating: instantiating a population

A mind is *fully* declared by its DOM subtree + attributes. So "make six experts"
is "clone a subtree six times with six attribute sets," and "wire them as MoE" is
"add one commons + six ears." Templating is not a bolt-on; it is the natural
authoring mechanism because **the mind is markup.** Three mechanisms, increasing
power, all available today:

### 9a. `<template>` + clone — the simple, explicit way

```html
<m-society>
  <template id="expert">
    <m-mind model="voice" pace="12s">
      <m-stream name="stream"></m-stream>
      <m-memory name="memory"></m-memory>
      <m-interrupts name="attention" threshold="0.5"></m-interrupts>
      <m-speech name="voice" every="6"></m-speech>
      <m-ear from="..m-society/commons/gossip" as="(overheard)" ignoreSelf="true"></m-ear>
    </m-mind>
  </template>
  <m-commons name="commons"></m-commons>
  <m-population template="#expert" count="6" vary="persona"></m-population>
</m-society>
```

`template.content.cloneNode(true)` works under jsdom. The instantiator clones,
stamps a unique `name` (`expert-0…5`) and a distinct **persona** (the per-expert
identity prose — from a list attribute, a data file, or a one-shot utility-model
call at boot), and appends. The loader then upgrades the new custom elements
exactly as it does authored ones.

### 9b. `a-switch` / `a-if` — conditional membership and topology variants

Amanita's stdlib `a-switch` literally stores child HTML in `<template>`
placeholders and swaps by case — purpose-built for **topology variants**: a society
that is a gossip-star in one mode and a debate-pair in another, or that includes a
`critic` expert only when a flag is set. The conditional wiring is declarative, not
code.

### 9c. `m-population` — generator = clone + vary + emit-graph

The generator folds templating *and* graph generation into one element:
`count` clones of `template`, varied along `vary`, then an emitted edge set
(`topology="gossip" | "ring" | "random:k=2" | "star:hub=gate"`). Manual graphs stay
as authored `<m-link>`s; generated graphs are a function from `(members, topology,
seed)` to an edge list. **The graph is data either way** — which is exactly what
makes "manual or generated" a non-question.

---

## Part 4 — Implementation surface

Honest accounting of what is reused vs. genuinely new.

**Reused unchanged:** pub/sub topics + retained values; mind-relative refs; the
`interrupt-request` → `m-interrupts` → `m-mind` spine; `m-speech.spoken` as egress;
the interlocutor-voice ingress path; `m-observer`'s overridable `src`; `<template>`
+ clone under jsdom; `a-switch`/`a-if`; and finally **`hub`/`setHub`** for fold-up.

**New, and small:**

| Piece | Size | What it is |
|-------|------|------------|
| `m-ear` | tiny, shipped | external egress topic → local framed `interrupt-request` |
| `m-society` | small, shipped | marker + address-space + `closest` anchor (like `m-region`) |
| `m-commons` | small, shipped | relay: members' `voice` → tagged `gossip` topic, with dedupe |
| `m-link` | small, deferred | legible edge; realizes itself as an `m-ear` in the target |
| `m-population` | medium, deferred | clone + vary + emit graph (could be a build step first) |
| `m-fold` | small, deferred | hub-collector → compressed stimulus (or reuse `m-memory`) |

**Plumbing that must change (the only real gotchas):**

1. **Lifecycle is singular today.** `start.js` sleep handler does
   `document.querySelector("m-mind")` — must become *all* minds (sleep/finalize each;
   the society awaits its members). Memory homes must be per-member (each mind a
   distinct vault path) or the society owns one shared vault — a deliberate choice.
2. **Transports are document-anchored and singular.** Two options, both with
   precedent: give each member its own `m-ws port=…` (lemma already picks distinct
   ports — 7627/7628/7629), *or* add a **society-level transport** that multiplexes
   every member over one connection (a "Studio for societies"). The latter is the
   real new work if you want one pane of glass. Until then, per-member ports ship today.
3. **Unique names.** The society must guarantee them; templating supplies them.
4. **Economy/budget.** N minds = N token meters. The society should expose an
   aggregate `m-economy` (sum of members) so a population can't silently 6× the burn.

**Encapsulation is the safety rail:** because the rule is "relative inside, ports
across," the blast radius of a wrong wire is one edge in the graph, not a silent
global rebind. Worth a lint: *no absolute `/name/...` ref inside an `<m-mind>` except
in an `m-ear`/transport.*

---

## Part 5 — The smallest real milestone — **built**

> **Status: shipped** as `architecture/lab/duet.archml` (transient, local-model).
> We built the **role-asymmetric** duet rather than symmetric overhearing, because
> roles invert the central risk (below). It is the minimum that is genuinely
> multi-mind, and it exposed the plumbing gotchas cheaply.

A **prover** grinds at lemma's balanced-number problem; a **checker** overhears the
prover's *spoken claims* and tests them on concrete cases, asking back. Why roles and
not the symmetric "two minds overhearing" of deep-structure §5: two peers can
phase-lock and amplify a shared confabulation — the *social* form of the
recall→attractor pump. A prover↔checker asymmetry is **negative feedback** (the
checker's job is to push back), so it damps rather than amplifies. The role structure
*is* the grounding mechanism, and is what makes this safe to try this early.

What it took (all small):

1. **`m-ear`** — the one genuinely new faculty: subscribes to a peer's voice event or relay topic and
   raises a framed, non-urgent `interrupt-request` on its own mind's arbiter.
2. **`m-society`** — a marker container; `closest('m-society')` anchors the
   society-relative cross-mind ref `..m-society/<member>/voice/@spoken` (members get
   unique *mind* names; component names stay generic).
3. **`mindHome` nests under the society** — `memory/duet/{prover,checker}/`: one
   folder, a subfolder per member, as asked.
4. **`m-ws` made mind-relative** (`..m-mind/…`) — so each mind's WebSocket binds to
   *its own* stream/faculties, not the first one in the document. Backward-compatible
   for a lone mind. `start.js` now sleeps *all* minds.
5. **`Peer` voice framing** in `InterruptRecord` — a peer is heard as "Checker says: …".
6. A wiring test (`ear.test.js`): prover speaks → checker's arbiter gets a framed
   `Peer` stimulus; the membrane holds (prover doesn't hear itself); dedupe + empty-skip.

**Deliberately deferred** (the user OK'd "as a beginning they show up as separate
minds"): grounding is *social*, not computational — the checker has no terminal hand
yet (kept out for the same confabulation reason lemma keeps it out). And the Studio
still spawns *one mind per process*; talking to each member is via its own `m-ws` port
(7631/7632) for now. **"Focus any mind in the architecture" in one Studio** is the next
plumbing piece: keep all upstreams open, tag telemetry with a `mindId`, let panes
filter — see the gaps in `src/studio/{server,store}.js` and `studioConn.js`.

The first live run answers what theory can't: does the checker catch the **documented**
balanced-number confabulation (the non-palindromic sub-claim), or do the two agree on
it (*folie à deux*)? After that: use the shipped `m-commons` relay for flat expert
societies, then defer the heavier sugar (`m-link`, `m-population`) until the graph
needs to be generated rather than authored.

---

## Guiding principle (unchanged from deep-structure)

> Don't impose structure; add a **mechanism whose natural consequence is the
> structure you want.** A society is the broadcast bus allowed to recurse across
> minds; a gate is the attention arbiter allowed to arbitrate across minds; a
> mind-of-minds is the second concurrent stream (`m-speech`) allowed to become N.
> Every multi-mind shape here is a *generalization of something already shipped* —
> which is the sign the architecture was built to grow this way, and is merely
> under-iterated, not flat.
