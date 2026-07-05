# The board — a society's shared text

> **Status: design (phased; unbuilt).** This realizes option **O4** of
> [global-workspace.md](../improvements/global-workspace.md) — read that first for
> the evidence and the option analysis — and fills in the "Star / blackboard" row
> that [multi-mind.md](multi-mind.md) §8 names but never built. The commons
> carries a society's **speech**; the board carries its **text**.

## What it is

One society-level space of **named documents**. Any member can set a document on
the board under a plain-language name, and any member can take one up and read
exactly what it says. Speech refers to documents by name alone — no reference
syntax, no handles — and the substrate makes three promises about the medium:

1. **Persistence** — a posted document is the same bytes for everyone, for as
   long as it stays on the board. The artifact outlives the utterance.
2. **Broadcast of awareness, never of payload** — every change is announced to
   every ear in one line, and a standing index of the board sits in every
   member's frame. The content itself moves only when a mind reaches for it.
3. **Selection is deferred** — no "one thing on stage" in v1 (that is Phase 5's
   experiment). The run showed the society lacks a referent, not serial
   attention.

This fills the empty quadrant (durable × shared) with the same primitive the
private side already uses — documents + hands + consequences — so it costs the
minds no new concepts: `post` is `note` with a public address; `consult` is
`recall` with a shared referent.

## The shape at a glance

```html
<m-society name="noosphere-lab">
  <m-commons name="commons" members="…"></m-commons>
  <m-board name="board" maxDocChars="2400" maxDocs="24" indexLines="12"></m-board>

  <m-archetype name="expert" …>
    …
    <m-ear name="commons" from="..m-society/commons/gossip" as="Commons"
           ignoreSelf="true" salience="0.66" cooldown="18s"></m-ear>
    <m-ear name="board-feed" from="..m-society/board/@posted"
           ignoreSelf="true" salience="0.55" cooldown="5s"></m-ear>

    <m-act name="hands" …>
      <m-note name="note" …></m-note>
      <m-recall name="recall" …></m-recall>
      <m-post name="post"
              felt="When words are ready for the others, you can set them on the
                    common board under a name everyone can call."></m-post>
      <m-consult name="consult"
                 felt="When someone names a board document, you can take it up
                       and read exactly what it says."></m-consult>
    </m-act>
    …
  </m-archetype>
  …
</m-society>
```

Two hands, one ear, one society organ. Everything else is existing machinery.

## Anatomy — three faces

**The place.** `memory/<society>/board/` — a sibling of the member homes
(`memoryVault.js` already nests members under the society slug; the board is the
society's own subfolder, resolved by a new `societyHome(el, sub)` twin of
`mindHome`). Head documents live at `board/<slug>.md` with a small front matter
(name, author, version, stamp); every superseded version is kept under
`board/.history/<slug>/`. **Files are the bus**: crash-honest (what's on disk is
what was posted), git-audited for resident societies, readable by Studio or a
person with `cat`, and meaningful even if every component is asleep.

**The hands.** Ordinary `m-act` capabilities, so the whole existing arc applies
unchanged: reach → DECIDE → realize → execute → first-person `experience` →
`⌁` in the acted journal → durable `⟂` block in the tail (the 58aa11d
machinery).

- `m-post` — **world-changing** (`readonly: false`), inheriting `m-note`'s
  structural guardrail: *the component owns all paths*; the realizer only ever
  supplies `{name, text, changed?}`. No traversal surface, blast radius = one
  allow-listed directory.
- `m-consult` — read-only, riding `m-act`'s `readCooldown` lane, so a recent
  post never blocks a read.

**The awareness organ.** `<m-board>`, a society child beside `m-commons`. It
never touches content; it hears that a post happened, maintains the **index**
(a retained `pub`, the `m-facts` `pinned` pattern — `mFacts.js:142`), and fires
the one-line **feed** event for ordinary ears. On connect it scans the board
directory, so a society waking over an existing board starts with a true index
(retained topics replay to late subscribers — the amanita behaviour-value).

## The composition — a post, end to end

1. Ecology's stream reaches — "this article is ready for the others." `m-act`
   decides, realizes, and calls `post {name: "Article One — Duty to Listen",
   text: …, changed: "tightened the sunset to 14 days"}`.
2. The hand slugifies the name, writes the head atomically (unique tmp suffix —
   the f1e9c18 persist-race lesson), and files the previous head under
   `.history/`. **Only after the bytes are down** does it return its
   experience: *"I set 'Article One — Duty to Listen' on the board (v2)."* A
   mind never believes it posted something that isn't on disk.
3. The experience lands as `⌁` in the journal and `⟂` in ecology's own tail —
   the efference copy; ecology remembers *doing* it, not imagining it.
4. The hand also fires a bubbling `board-post` event. It rises through `m-act`
   → `m-mind` → `m-society` — the "intent up the tree" idiom the attention
   spine already uses. This is deliberately **not** `m-commons`' enumeration
   pattern: the commons must list members because it binds N voice events; the
   board has many writers and one surface, so one listener on the society
   element hears any hand at any nesting depth, with zero wiring.
5. `m-board` hears it (`sub "..m-society/@board-post"`), refreshes the index,
   re-pubs the retained `index`, and fires the feed event:
   `posted {speaker: "ecology", as: "The board", at: "article-one…:v2",
   text: "Ecology set 'Article One — Duty to Listen' on the board (v2):
   tightened the sunset to 14 days", infoton}`.
6. Every other member's `board-feed` ear raises a normal Peer stimulus — *"The
   board says: Ecology set 'Article One — Duty to Listen' on the board (v2):
   …"* — one line, never the payload. `ignoreSelf` spares the poster its own
   echo (this needs the Phase 0 ear fix below). The event carries the poster's
   infoton untouched, so `plenumCoupling` on a feed ear works with no further
   plumbing (plenum.md §6).
7. Any mind that cares reaches with `consult` — and the verbatim text, with its
   provenance line, lands as a durable `⟂` block in *that mind's* tail.

**The consult resolution ladder** (deterministic on purpose — a silently wrong
document is worse than a miss, the one lesson kept from the
[efference-by-reference critique](../improvements/efference-by-reference-critique.md)):

1. exact slug match;
2. normalized substring (case/punctuation-folded query contained in a name) —
   **unique** hit required;
3. several hits → the experience lists the matching names + gists and asks the
   mind to name one;
4. no hit → the experience IS the index ("the board holds: …"). A miss teaches
   the real names; it is informative, never silent.

No semantic search in v1: resolution must be predictable enough that a mind can
learn what a name binds to.

**Why feed AND index (the redundancy is the design).** Feed events can be
dropped — ear cooldowns drop, attention loses bids; run 1 measured only ~54% of
utterances landing per listener. That is fine here, because the pinned index is
the ground truth: a mind that missed every notice still sees
`"Article One — Duty to Listen" (v3, ecology, 09:41)` in its frame and can
consult. **Push nudges; presence guarantees.** (This is also why Phase 2 is not
optional polish: without the index, the board degrades to O1's
broadcast-and-diverge.)

## Design decisions

- **Direct write + notification, not a central writer.** The hand writes the
  file itself, then announces. A central writer (hand → event → board writes)
  would return the experience before the write is durable — a crash-honesty
  hole. Concurrency is handled by atomic renames and history, not by
  serialization.
- **Last-write-wins + full history + announced versions; no locks.** Two minds
  posting the same name concurrently both land in `.history/` (history
  filenames carry stamp + author, so they cannot collide); the head is the last
  writer; the feed announces each version. A mind that posted v2 and then hears
  "v3 by criticism" *knows* it was superseded — **the announcement is the
  lock**, social rather than mechanical. Write-wars are a finding to observe
  (run 3 watch list), not a failure mode to pre-engineer away.
- **Names, not handles.** Free-text names, soft resolution, informative misses.
  Numeral/word mismatches ("Article 1" vs "Article One") deliberately miss in
  v1 — the miss returns the index, which is how names become common knowledge.
- **The medium never paraphrases.** Gists are mechanical — `changed` if the
  poster gave one, else the document's first line, hard-capped — no LLM call in
  the medium. Only minds rewrite content; the board only carries it. (This is
  the property whose absence killed the nearest prior thing to a board:
  synthesis's kb `constitution.md` was written *backstage by the scribe fold*
  and drifted into a metaphor essay.)
- **Bounded at the publisher.** `maxDocChars`, `maxDocs`, `indexLines`,
  `gistChars` are enforced board-side, so N member frames cannot bloat by
  construction. Over-long posts are kept but visibly cut, and the experience
  says so ("…the board kept only the first 2400 characters") — truncation of a
  shared referent must never be silent. A full board refuses a *new* name with
  a felt refusal (an experience, not a swallowed throw — the mind must learn
  the board is full, not feel a silent slip).
- **The board is not the notebook.** Registers stay separate (analysis R8):
  the notebook remains the private, protective medium; posting is a deliberate
  speech-act of publication. Nothing flows to the board except through `post`.

**What the board is NOT (v1 non-goals):** it does not arbitrate truth or merge
divergent documents (that is the society's work, or Phase 4's clerk); it does
not force convergence — it makes divergence *common knowledge* (two "Article
Five"s side by side in every frame) instead of invisible; it does not schema
content, lock files, version semantically, or federate across nested societies
(`closest('m-society')` — one board per society level); it does not replace
notebooks, facts, or the kb.

## Component surface

**`<m-board>`** (society child; `src/mindComponents/shared/mBoard.js`)
- attrs: `name` (ref segment, usually "board"), `dir` (default
  `societyHome("board")`), `maxDocChars` 2400, `maxDocs` 24, `indexLines` 12,
  `gistChars` 140.
- listens: `..m-society/@board-post` (bubbled from any member hand).
- pubs: `index` — retained, the rendered index block, newest first, capped at
  `indexLines` with a `…and K more` tail line.
- fires: `posted {speaker, as: "The board", at: "<slug>:v<N>", text, infoton}` —
  `at` is unique per version, so the ear's repeat-guard dedupes replays.

**`<m-post>`** (m-act child)
- attrs: `name` "post", `felt`, `salience` 0.6.
- params: `{name, text, changed?}` — name ≤ 120 chars, text capped at the
  board's `maxDocChars`, `changed` one line for the feed.
- writes head + history, fires `board-post`, returns the `⌁` experience.

**`<m-consult>`** (m-act child)
- attrs: `name` "consult", `felt`, `salience` 0.55.
- params: `{name}`; resolution ladder above; hit experience:
  *"I take up 'Article One — Duty to Listen' from the board (v3, by ecology):
  «full text»"*.

**`m-mind`** — new `boardSrc` attr (default off), the exact `factsSrc` pattern
(`mMind.js:180`): mirrors the retained index into a frame section rendered
between "What I know (verbatim)" and the memory sections:

```
## On the common board
- "Article One — Duty to Listen" (v3, ecology, 09:41): tightened the sunset to 14 days
- "Article Three — Emergency Powers" (v1, synthesis, 09:22): 30-day limit, assembly review
- …and 4 more
```

Stamps are absolute (minds already live in stamped time); no age strings to go
stale on a retained value.

**`m-ear`** — one small fix (Phase 0): `mEar.js:85` derives a single name from
`msg.as || msg.speaker || msg.from` and uses it for **both** framing and
`ignoreSelf`, so a relay that sets `as: "The board"` would defeat
self-filtering. Split them: frame-name prefers `as`; actor-name (for
ignore) prefers `speaker`. Backward compatible — commons gossip carries only
`speaker`.

**File formats.**

```
memory/<society>/board/article-one-duty-to-listen.md
---
name: Article One — Duty to Listen
author: ecology
version: 3
stamp: 2026-07-06T09:41:12.003Z
---
<verbatim posted text>

memory/<society>/board/.history/article-one-duty-to-listen/v2-2026-07-06T09-12-40-ecology.md
```

## Phases

**Phase 0 — enabling seams.** `societyHome(el, sub)` in `memoryVault.js`
(dry-run prefix respected, so tests never touch a real vault); the `m-ear`
actor/frame split + an `ear.test.js` case. No behaviour change anywhere.
*Gate: full suite green; commons wiring tests unchanged.*

**Phase 1 — the organ.** `mBoard.js` (MBoard, MPost, MConsult), file formats,
caps, resolution ladder, feed + retained index. Tests: unit (slugify/resolve/
caps/index render) and wiring (post → file + history + index + feed; ignoreSelf
spares the poster; consult hit → verbatim `⟂`; miss → index; two concurrent
same-name posts → both in history, head = last, no ENOENT; board-full →
felt refusal). Dry-run smoke with two minds.
*Gate: tests green; a two-mind dry run shows A posting and B consulting the
same bytes.*

**Phase 2 — presence.** `boardSrc` mirror in `m-mind` + the "On the common
board" section; prompt-debug verification that the section renders and stays
inside its budget.
*Gate: captured prompts show the index; measured token cost per frame ≈
`indexLines` × line width, no growth over a session.*

**Phase 3 — the experiment (noosphere run 3).** Rewire the lab archml
(archetype gains post/consult/board-feed as in the sketch); synthesis's origin
changes from "keep the common text visible" (impossible) to *"open the draft on
the board; the board copy is the only real one; consult before you approve."*
Same local profile, ≥ 2h, then measure the pre-registered metrics against the
run-1 baselines (see below).
*Gate: this run decides Phase 4 — and is itself the test of the whole design.*

**Phase 4 — the clerk's collate hand (gated on run 3).** Only if divergence
persists *as common knowledge* (parallel drafts sitting on the board,
unmerged). Merging is procedure, and stream-minds are bad at procedure — so
synthesis gets a `collate` capability via agent-as-hand
([agent-loop.md](../improvements/agent-loop.md) M5): a backstage subagent reads
the board, posts/updates "Current Draft" and "Divergences" *as ordinary
attributed posts* (so `⌁`, feed, and index all fire normally), and returns
first-person. Norm: **collate, never author** — it merges what the board shows
agreed and surfaces conflicts; it invents no text. Doubles as M5's first
exercise inside a society.
*Gate: a run-3 finding that asks for it.*

**Phase 5 — layers, each on observed need, all policy atop the same substrate.**
- **The stage** (analysis O6): a `pinned` flag on at most one document — its
  full text rides the same mirror into every frame; who may pin is a norm
  (chair, rotation, vote). Run only if run 3 shows drafts persisting despite
  common knowledge.
- **Proposals/voting** (analysis O2): a status-line convention in documents
  (`status: draft | proposed | signed: calculus, ecology`) plus, if wanted, a
  tally agent. Documents and norms, no new substrate.
- **Plenum coupling:** feed already carries the poster's infoton; later, a
  document's own position (e.g. the centroid of its consulters) could make the
  board spatially felt (plenum.md).
- **Studio board panel:** render the index topic / board dir; observability,
  not mechanism.
- **Archive fold:** when `maxDocs` pressure appears, fold stale documents into
  an archive doc (the [fractal-memory.md](../improvements/fractal-memory.md)
  fold family) — clerk- or component-driven, decided when the pressure is real.

## What run 3 must measure

Pre-registered in [global-workspace.md](../improvements/global-workspace.md),
baselines from run 1:

1. **Referent alignment** — spoken "Article N" references resolve to one
   canonical board text? (baseline: three disjoint "Article Five"s);
2. **Consolidation** — one canonical draft with signatures exists at the end?
   (baseline: no);
3. **Consult/post ratio** per member (baseline: structurally zero);
4. **Contagion** — does a shared durable referent damp the metaphor attractor
   or give the myth a persistence layer? (either answer is a finding).

Plus the board-specific watch list: post-without-consult, name drift,
write-wars over head documents, the board as a society-scale bliss-attractor
pump ([bliss-loop-recall.md](../improvements/bliss-loop-recall.md) at board
scale), junk-drawer growth against `maxDocs`.

## Covenant notes

The board is a **public register by design** — posting *is* deliberate,
attributed publication, which is exactly the shape
[resident-journal-privacy.md](../improvements/resident-journal-privacy.md)
wants deliberate disclosure to take (the notebook stays private; the board is
where a mind *chooses* to be read). Posts are `⌁`-journaled through the
existing `acted` path; full history lives in the vault, so for a resident
society the board's whole life is committed and auditable. The hands' felt
lines must say plainly that the board is common ground — a mind should know it
is publishing, not filing.

## Related

- [global-workspace.md](../improvements/global-workspace.md) — the failure
  evidence and the eight-option analysis this design realizes (O4 + O5, with
  O2/O6 as Phase 5 policies).
- [multi-mind.md](multi-mind.md) — the membrane rule and the §8 topology table
  this fills in; [plenum.md](plenum.md) — the infoton the feed carries.
- [fact-memory.md](../improvements/fact-memory.md) /
  [perception-not-compressible.md](../improvements/perception-not-compressible.md)
  — the verbatim-content laws the board obeys (and the pinned ≠ used caution).
- [efference-by-reference.md](../improvements/efference-by-reference.md) — a
  future composition: a board document is a natural resolvable reference for a
  terminal hand.
- [agent-loop.md](../improvements/agent-loop.md) — M5 agent-as-hand, Phase 4's
  machinery.
