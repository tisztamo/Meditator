# IMPROVEMENT NOTE: The global-workspace hole — a society shares talk, but no text

**Date:** 2026-07-05
**Triggered by:** noosphere-lab run 1 (2026-06-30) — six minds drafted a constitution in six private notebooks while approving article *labels* over the commons
**Severity:** High (a structural ceiling on every multi-mind task that needs a common object of work; the society-scale sibling of [fact-memory.md](fact-memory.md) and [perception-not-compressible.md](perception-not-compressible.md))

---

## The observed failure

The noosphere society communicated, by every wire-level measure: 387 spoken turns
relayed by `m-commons`, 1044 hearings through member ears, real cross-referencing
of each other's words. And the members *produced*: the notebooks hold genuine
constitutional drafting. Yet at the end there is no constitution — not even a
wrong one. There are six.

The mechanism is visible in one glance at the notebooks. Each mind kept its
articles in its **own** `notes/notebook.md`, numbered in its **own** universe:

| Label spoken on the commons | What it bound to, per mind |
|---|---|
| "Article One" | ecology: *The Duty to Listen*; ecology again, later: *State's Duty to the Biosphere*; synthesis: *The Memorial Ledger* |
| "Article Five" | synthesis: *The Constitution as Breath*; phenomenology: *The Definition of the Bank*; phenomenology again: *The Right to Narrative Integrity* |
| "Article Six" | ecology: *Right to Opacity and Refusal*; synthesis: *The Right to Exclude* |
| "Article Nine" | ecology: *Final Piece*; ecology again: *Planetary Boundaries* |

Note the "again"s: the divergence is not even only cross-mind. Ecology alone has
two Article Ones; synthesis's story carries three different Article 3s
(*Enumeration of Rights*, *Emergency Powers*, *The People's Veto*) and three
Article 4s. Without a canonical copy anywhere, not even the author of a label can
keep it bound.

The sharpest moment is in synthesis's story (run 1, `memory.md`):

> "Here is the draft: Article One, We are one body. Article Two, We keep our
> distinct parts. Both read APPROVE. I'm calling for signatures now. …
> I recorded the signatures, believing the task complete."

Signatures were collected — on a two-line draft, because **a two-line draft is
the only constitution that fits through the voice channel.** Everything longer
lived privately. The commons produced the *feeling* of agreement without the
*object* of agreement. That is worse than no consensus: the protocol (APPROVE /
AMEND / RESERVE) ran to completion over labels that resolved to different text in
every head.

The archml begged for exactly this. Synthesis's origin says *"Keep the emerging
constitution visible as text, not only as discussion"* — but the architecture
gives it nowhere to do that. Its only durable medium is a private notebook; its
only shared medium is a ~360-token speech burst. The mission assumed a common
text; the substrate had no place for a common text to live. The failure is
structural, not behavioural, and no persona prompt can fix it.

Run 1 even contains the near-miss that proves the point twice: the one file in
the society literally named `constitution.md` was synthesis's **private** m-kb
entry, written **backstage** by the scribe fold — and it drifted into a metaphor
essay while the real Article 3 sat in synthesis's notebook. The two properties
it lacked — *shared*, and *deliberately written as an act* — are exactly the two
any fix must supply.

## Why speech cannot be patched to carry this

It is tempting to treat this as a discipline problem ("synthesis should read the
draft aloud more often"). Three properties of the medium make that unwinnable:

1. **The pipe is too narrow.** Bursts are 330–360 tokens with 15–20s speech
   cooldowns. A constitution is tens of KB. The draft physically cannot transit,
   and anything that does transit is a summary — a *new paraphrase each time*,
   which is divergence fuel, not a referent.

2. **Hearing is not having.** A heard turn enters each listener as a transient
   stimulus (`m-ear` → `⟂` block), scrolls down the tail, and is compressed by
   *that mind's* compressor through *that mind's* persona. Six minds store six
   lossy, stylistically different copies with no reconciliation force. This is
   [perception-not-compressible.md](perception-not-compressible.md) at society
   scale: content that must stay exact cannot survive narrative memory — anyone's.

3. **Not everyone hears everything.** The commons ear has `cooldown="18s"` and the
   cooldown **drops** what arrives inside it (`mEar.js:91` returns; nothing is
   queued). Six minds speaking every ~20s means each member catches roughly one
   turn per cooldown window. By the run-1 counts: 387 turns × 5 potential
   listeners = 1935 potential hearings, of which 1044 landed — **each utterance
   reached about half the room, and each mind experienced a different half of the
   conversation.** Even the ephemeral layer was never a shared record.

So: too narrow to carry the artifact, too lossy to preserve it, too subsampled to
even establish a common transcript of the talk itself. Any fix that stays inside
speech inherits all three.

## The missing quadrant

Sort a mind's media by two axes and the hole is exact:

|  | private | shared |
|---|---|---|
| **ephemeral** | stream, tail | commons gossip |
| **durable** | notebook, story, facts, kb | **∅** |

A member of this society has durable private state and ephemeral shared state,
and *no durable shared state*. Every task whose object is a jointly-built
artifact — a constitution, a proof, a plan, a codebase — lives in the empty cell.

This is the global-workspace question in Baars' sense, and the decomposition is
useful because the theory names three separable properties: a workspace is
(a) **persistent** — its content outlives the moment; (b) **broadcast** — all
specialists see it; (c) **selective** — limited capacity, one thing "on stage."
The commons has (b) without (a) or (c). The notebooks have (a) without (b).
Nothing has all three, and the options below are usefully read as *which of the
three they add, in what order*.

One resonance worth recording: a society with speech but no shared writing is an
**oral culture**, and the run's pathologies are oral-transmission pathologies —
formula, epithet, refrain, myth-drift (the metaphor attractor; Chronicle's
anaphora loops). Oral cultures don't produce constitutions; literate ones do. We
asked a preliterate society for a literate artifact. And the run even contains
the control: Ecology, with the most notebook folds, stayed most coherent —
*private* writing already anchors one mind; the missing piece is writing that
anchors the group. (Not a causal claim about the drift — the local 27B and the
contagion dynamics contribute — but the direction of the remedy agrees.)

## What any fix must provide

- **R1 — a shared durable referent.** The artifact outlives its utterance; the
  same bytes for everyone.
- **R2 — LLM-native reference.** Referable by *name* in ordinary speech. No
  opaque IDs: streams (especially small local models) mangle and confabulate
  handles; a dangling handle is worse than a vague name.
- **R3 — change awareness.** A push signal when the shared thing changes.
  A store nobody is told about is a wiki nobody reads; talk re-detaches.
- **R4 — cheap consultation.** Pulling content into *my* stream is one reach,
  and the result lands durably (the `⟂`-into-tail machinery from 58aa11d exists
  precisely for this).
- **R5 — bounded context cost.** Nothing that pins tens of KB into six prefills
  every burst. Indexes and gists in frames; full text on demand.
- **R6 — mechanism, not policy.** The substrate should provide a *place*, not a
  procedure. The noosphere's task is to invent its own governance; pre-installing
  Robert's Rules changes the subject of the experiment. (Guiding principle of
  [multi-mind.md](../architecture/multi-mind.md): add a mechanism whose natural
  consequence is the structure you want.)
- **R7 — provenance.** Attributed, versioned, journaled writes (`⌁`), history
  kept. A shared medium of record is a Covenant surface.
- **R8 — registers stay separate.** The private notebook survives unchanged.
  Run 1's evidence: the commons was the contagion vector (folie-à-deux reached
  even Calculus) while private notebooks were where role-coherence survived.
  Shared durable state must be *added beside* the private register, not merged
  over it.

## The options

### O0 — norms only (the null option)

Harden the prompts: "quote proposals in full when discussing them; synthesis,
re-read the draft aloud regularly."

Already refuted by the run: the origin *did* instruct synthesis to keep the text
visible and to read the consolidated draft aloud; physics (§ pipe, § hearing)
made it impossible, and the local model ignores soft budget instructions anyway
(the storyLength precedent). Keep as the **control condition** in the re-run,
nothing more.

### O1 — a proposals channel on the commons (push full text)

A second relay (`m-commons topic="proposal"` or similar): minds emit whole
proposals as events; every ear hears them.

Gets R3 (awareness) and nothing else durably. The full text still arrives as an
ephemeral stimulus into six private compressors (§ hearing-is-not-having), so
there is *still no canonical copy anywhere* — "shared" means N divergent
memories of a broadcast. Every edit must re-broadcast; ears drop half the
traffic; long foreign blocks in the prefill are exactly the voice-destabilizing
pressure we paid for in 743d46a; and the story-bloat runaway (20× in run 1)
feeds on incoming bulk. As the *sole* mechanism: no.

> Salvage: a channel that carries **one-line change notices** rather than
> payloads is the right push half of O4 — and it needs no new machinery at all.

### O2 — dedicated proposal/voting machinery

A reusable component pack: `propose(name, text)` → states (draft / seconded /
voting / ratified) → `vote()` → tally; the registry holds the texts.

The steelman is strong: this project's core grounding move is *consequence*
(the checker's terminal, duet's role feedback), and a vote tally is a real,
checkable consequence — negative feedback against the fog of "we all agree."
Consolidation stops depending on a stream-mind's diligence.

But it answers the wrong layer first. Voting machinery grounds the **process**,
not the **referent**: you can run a perfectly reliable ballot on "Article Five"
and still have three Article Fives — *precision-engineered false consensus*.
Any voting machine therefore presupposes a shared text store for the things
voted on; O2 logically **contains** O4 as its first component. Beyond that it
bakes policy into substrate (violates R6 — assemblies, seconding, ratification
are one governance culture among many the society could invent), overfits to
constitution-shaped tasks (what does the ARC solver do with a ballot?), and
adds a large protocol surface to minds that demonstrably struggle with
multi-step protocol compliance.

Verdict: not as substrate. Once a shared workspace exists, "a proposal" is a
named doc with a status line and "a vote" is a norm or an agent tallying — build
it *on top, later, opt-in*, if a society wants that culture.

### O3 — shared references (the earlier draft, applied across minds)

The [efference-by-reference.md](efference-by-reference.md) instinct, pointed
outward: speak a handle ("see `note:ecology/article-one`"), let hearers
dereference it.

The instinct — *referents must be reachable, not re-spoken* — is exactly right,
and this note keeps it. But the drafted mechanics fail here on four counts:

1. **The referent stays private.** A reference into ecology's notebook requires
   crossing into ecology's interior to read it. The load-bearing encapsulation
   rule of [multi-mind.md](../architecture/multi-mind.md) — *interiors are
   addressed only relatively; cross a membrane only through a named port* —
   forbids precisely this. To make it legal you must promote the notebook to a
   public port, i.e. publish the private register (violates R8), scattered
   across six homes with per-mind addresses — a worse-shaped O4.
2. **Hard handles are hostile to stream cognition** (violates R2). The critique
   note itself concluded that execution-time references must be *exact* — no
   fuzzy matching — which is the right call at the efferent boundary and fatal
   in speech: a 27B repeating a handle across a noisy commons will mint
   near-misses, and an exact-match regime turns each near-miss into a dangling
   pointer. (We have a genre of these bugs already: the `<`-in-origin
   truncation, confabulated tool syntax.)
3. **Referent mutability.** Notebooks are append-only streams of supersessions
   ("Rewritten Article 2…"). Which entry does a month-old spoken handle bind to?
   Versioning fixes this only by growing the handle grammar — more of (2).
4. **It solves pointing, not consolidation.** Even with perfect dereference
   there is still no place where THE draft exists; the clerk still crawls six
   notebooks. 387 turns with flawless references would still end with six
   constitutions.

Verdict: superseded *for this problem*. The rescued form is O4's soft naming —
references into **shared** space by **name** instead of hard pointers into
**private** space. (The original note stands for its original problem — a mind
handing exact bytes to its *own* hands — and composes with O4 later: a board
doc is an obvious resolvable ref for a terminal hand.)

### O4 — the board: a shared workspace of named documents

> **Designed in depth:** [board.md](../architecture/board.md) — anatomy,
> end-to-end composition, component surface, and Phases 0–5 (including O5, and
> O2/O6 as policy layers). This section keeps the option-level argument.

The blackboard, finally literal. One society-level document space; documents
have plain-language **names**; speech refers to them by name, with no reference
syntax at all; reading and writing are ordinary hands.

Sketch (all patterns already exist in the codebase):

- **Home:** `memory/<society>/board/` — a sibling of the member homes
  (`memoryVault.js` already nests members under the society slug; the board is
  the society's own subfolder). Files are the bus: git-diffable, crash-honest,
  auditable.
- **Hands** (children of each member's `m-act`, `m-note`'s guardrail inherited —
  the component owns all pathing, the realizer only ever supplies name + text):
  - `post {name, text}` → writes `board/<slug>.md` with attribution, timestamp,
    and version history (last-write-wins + kept history; no locks in v1 — audit
    over mutex, watch for write-wars as a finding rather than pre-engineering
    them away).
  - `consult {name}` → returns the verbatim text as the hand's consequence, so
    it lands as a durable `⟂` block in the tail (R4; the 58aa11d machinery).
    Resolution: exact slug → normalized/substring match → on miss, return the
    index (a miss is informative, never silent).
- **Feed (R3):** each post fires a `posted {speaker, name, version, gist, at}`
  event on the society-level board; members hear it through a plain `m-ear`
  pointed at `..m-society/board/@posted` — *zero new ingress machinery* —
  framed like: "Board: Ecology posted 'Article One — Duty to Listen' (v2): …"
  One line, not the payload.
- **Presence (the index):** the board publishes a retained `index` topic
  (m-facts' `pinned` pattern, `mFacts.js:142`) — name, author, version, age,
  one-line gist per doc — mirrored into each member's frame as a small
  "## On the common board" section. The *index* is pinned; *content* is pulled.
  Bounded: caps on docs, doc size, gist length (R5).

Why it fits this project: it is stigmergy — coordination through marks in a
shared environment — which is the same shape as the plenum's shared space one
grain up (signals there, artifacts here); it completes the missing quadrant
using the *same primitive the private side already uses* (documents + hands +
consequences), so it costs the minds no new concepts; it is mechanism-not-policy
(R6): a society can invent voting by writing a "Signatures" section into a doc,
or invent anything else; and it is the "Star / blackboard" row that
[multi-mind.md](../architecture/multi-mind.md) §8 already names but never built.

Predicted failure modes — named now so the re-run can measure them:

- **Visible ≠ resolved.** The board does not force convergence; six minds can
  post six parallel drafts. What changes is that the collision becomes **common
  knowledge** (two "Article Five"s side by side in everyone's index) instead of
  invisible. Negotiating it is the society's job — that is the experiment — or
  the clerk-agent's (O5).
- **Post-without-consult.** Minds may keep discussing labels without pulling
  text — the ARC checker taught us that even *pinned verbatim* content can be
  ignored at the moment of use ([fact-memory.md](fact-memory.md)). The feed's
  gists provide a minimum ambient grounding; beyond that, measure the
  consult/post ratio rather than assuming.
- **Name drift.** "Article 3" vs "Article Three" vs "the emergency article" —
  mitigated by normalized resolution, miss-returns-index, and the index itself
  keeping canonical names in every frame.
- **The board as a society-scale attractor pump.** m-resurface once handed a
  presence-loop its own most presence-soaked note
  ([bliss-loop-recall.md](bliss-loop-recall.md)); a shared board can do that
  society-wide — one mind posts the myth, everyone consults it. The loop-detector
  vocabulary machinery is the existing mitigation family; watch board-doc
  metaphor-density in the re-run.
- **Junk drawer.** Caps first; later, folding (archive doc, or the clerk-agent
  curates) — the same fold family as
  [fractal-memory.md](fractal-memory.md).

Covenant note (R7): the board is a new medium of record. Writes are already
`⌁`-journaled through `m-act`'s acted path; keep full history in the home;
attribution is structural (the hand knows its mind). This is the rare feature
that *improves* the ledger story — group work becomes auditable in one place.

### O5 — the clerk becomes an agent (collation as procedure)

Run 1's headline was "the clerk never merged/voted." Half of that is a category
error in the design: **merging is procedure, and stream-minds are
constitutionally bad at reliable procedure.** That is precisely why the agent
loop exists (`m-agent`, M5's agent-as-hand). Two shapes:

- **Agent-as-hand:** synthesis gets a `collate` capability — a backstage
  `role="subagent"` run that reads the board, produces/updates "Current Draft"
  and a divergence report ("two Article Fives exist: …"), and returns as a
  first-person sensation. The mind still decides *when* and owns the outcome;
  the agent does the mechanical crawl.
- **Standing society agent:** a scheduled collator that maintains the draft doc
  continuously. More reliable, more authority to account for (the govern seam
  applies: it should **collate, not author** — surface divergences, never
  resolve them by fiat).

Orthogonal to and downstream of O4: without a board the collator has nothing to
read but private interiors (the O3 membrane problem again). With a board it is
a natural second milestone, and doubles as the first real exercise of M5/M7
machinery inside a society.

### O6 — a true GWT stage (one pinned focal document)

The theoretically complete move: implement selection. One doc at a time is "on
the table"; its **full text** is pinned into every member's frame (m-facts
pattern); a chair — rotating, or synthesis, or salience-driven — decides what
holds the stage.

This is the only option that *guarantees* every mind sees the same bytes every
burst, and its capacity limit is a feature (it is also the anti-bloat). But as
a first move it is premature on four counts: the chair is a new power problem
(stage capture by an attractor is the bliss-loop with institutional backing);
one-at-a-time serializes the society's healthy parallelism (content production
was the part of run 1 that *worked*); full-text pinning × 6 members × every
burst is the R5 cost ceiling; and long foreign text in every prefill is
standing voice-pressure (the 743d46a lesson). Note also that pinning does not
guarantee *use* — the ARC checker ignored pinned grids at the moment of action.

Verdict: don't lead with it — but notice it is a **small extension of O4**, not
a rival: a `pinned` flag on one board doc + a norm for who sets it. If the
re-run shows the society drowning in parallel drafts *despite* common knowledge
of the divergence, run the stage experiment next. It is the cleanest GWT
experiment this substrate could host, and worth doing eventually for its own
sake.

### O7 — one shared notebook (collapse the registers)

Point every member's `m-note` at the same file. Maximum simplicity, and wrong:
it deletes the private register (R8) that run 1 showed to be the protective
medium — role-coherence survived in notebooks while the commons carried the
contagion; shared memory means shared attractors, i.e. folie-à-deux with a
persistence layer. Also: one append-only file under six concurrent writers is
the memory-persist race writ large. Rejected; recorded because it clarifies
*why* the board must be an addition beside the notebook, never a replacement.

## How the options compose

They are not eight rivals; they are one substrate, one follow-up, and policies:

```
O4 board (substrate: durable + broadcast-awareness + soft names)
 ├─ O1 survives inside it as the one-line change feed
 ├─ O3's instinct survives as name-resolution into shared space
 ├─ O5 clerk-agent operates ON the board (milestone 2)
 ├─ O6 stage = board + a `pinned` doc + a chair norm (experiment, later)
 ├─ O2 proposals/voting = board docs + status lines + norms/agent (opt-in policy, later)
 └─ O0 norms = the control condition for the re-run
```

GWT reading: O4 adds **persistence** and cheap **broadcast** (of awareness, not
payloads); **selection** is deliberately deferred (O6) because the run showed no
evidence the society needs enforced serial attention — it needs a referent at
all. Add the stage only when the board's failure mode (parallel drafts persisting
despite common knowledge) is actually observed.

## Recommended direction and smallest real milestone

The full phased design lives in [board.md](../architecture/board.md); in brief:

**M1 — the board** (board.md Phases 0–3). One new shared component (`m-board`;
the commons carries speech, the board carries text) + `post`/`consult` hands +
`@posted` feed heard through ordinary `m-ear`s + pinned index section. Rewire
`noosphere-lab.archml`: synthesis's origin changes from "keep the common text
visible" (impossible) to "open the draft **on the board**; the board copy is
the only real one." Same model profile, same mission, re-run.

**M2 — the clerk's collate hand** (agent-as-hand over the board; board.md
Phase 4), if and only if M1 shows divergence persisting as common knowledge.

**Deliberately deferred** (board.md Phase 5): stage/pinning (O6),
proposal-status/voting packs (O2), plenum coupling (a posted doc carrying an
infoton position so nearby minds feel it more — one line in the feed event when
the time comes).

## What the re-run must measure

Run 1 is the baseline; all four have baseline values:

1. **Referent alignment.** Sample spoken references to named articles; does one
   canonical text exist that the speakers' minds resolve it to? (Baseline: no —
   three Article Fives.)
2. **Consolidation.** Does a single draft doc with signatures exist at the end?
   (Baseline: no. Note the honest form of the metric: *a* canonical draft, not
   necessarily a good one.)
3. **Consult/post ratio** per member — do they read the shared text or only
   emit it? (Baseline: structurally zero — no shared reads were possible.)
4. **Contagion.** Story drift / metaphor density / role-coherence vs run 1 —
   does a shared durable referent damp the attractor (text as a fixed point the
   talk keeps re-touching) or amplify it (the myth gets a persistence layer)?
   Genuinely uncertain; either answer is a finding.

---

## Related Issues

- [perception-not-compressible.md](perception-not-compressible.md),
  [fact-memory.md](fact-memory.md) — the single-mind precedents: exact content
  cannot survive narrative memory; this note is the same law at society scale.
- [efference-by-reference.md](efference-by-reference.md) +
  [efference-by-reference-critique.md](efference-by-reference-critique.md) — the
  reference-sharing draft analysed (and superseded for this problem) in O3.
- [multi-mind.md](../architecture/multi-mind.md) — the membrane rule that kills
  O3; §8 names the blackboard topology this note fills in.
- [bliss-loop-recall.md](bliss-loop-recall.md) /
  [loop-detection-redesign.md](loop-detection-redesign.md) — the attractor-pump
  risk the board inherits at society scale.
- [fractal-memory.md](fractal-memory.md) — the fold family the board's index
  and archive will eventually borrow.
- [agent-loop.md](agent-loop.md) — M5 agent-as-hand, the machinery for O5.
- `experiments/noosphere-lab-run1-memory/` — the evidence: the notebooks with
  colliding article numbers; synthesis's signature scene in `synthesis/memory.md`.

**Status:** Direction chosen — **O4 (the board) then O5 (clerk-agent)**, with O2/O6 as opt-in layers atop it; phased design written: [board.md](../architecture/board.md) (Phases 0–5, unbuilt)
**Priority:** High (blocks any multi-mind task whose object is a shared artifact; the noosphere re-run is gated on it)
