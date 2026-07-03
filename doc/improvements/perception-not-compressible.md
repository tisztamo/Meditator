# Perception bypasses compressible memory — the experiential anchor is lost

> **Status: RESOLVED (2026-07-03) — direction 1 implemented, with a stronger rendering.**
> Diagnosed 2026-06-23 from the `lemma-lab-5` run; the decision was forced by the
> `lemma-lab-20` run (2026-07-03), where the mind's own terminal results — correct
> answers it had reached for — lived one frame each and never entered memory, so it
> re-ran the same search ~109 times for two hours (see the project memory,
> `local-voice-profile-experiment`). Implementation notes at the end of this file.
> Touches `MMemory` (the tail's write paths and `_onAttended`) and `MMind.assembleFrame`
> (`src/mindComponents/mind/mMemory.js`, `src/mindComponents/mind/mMind.js`).
> Companion to [memory.md](../architecture/memory.md) and
> [compression-fidelity.md](../architecture/compression-fidelity.md).

## The problem

An external stimulus enters the mind for exactly one burst and is then visible to
the human only in the journal. It **never enters the verbatim `tail`**, so it is
**never handed to the compressor**. When the mind's *reaction* to that stimulus
later scrolls out of the tail and is consolidated, the compressor summarises a
reaction to an event whose content it cannot see — and there is no way to recover
what the event was, because it was never written anywhere the compressor reads.

The tail is the only fresh material the compressor ever receives (via `_overflow`,
folded in `_consolidate`, `mMemory.js:299`). And the tail is built from **only the
mind's own outputs**:

- stream chunks — `_onChunk` (`mMemory.js:202`)
- aloud speech — `spoke()` (`mMemory.js:403`)
- generated images — `imageGenerated()` (`mMemory.js:416`)

An external stimulus calls none of these. It travels:

```
External stimulus
  → arbiter (takePending)
  → MMind.assembleFrame → rendered in this burst's prompt as "## This just happened"
                          (mMind.js:386) + a bridge sentence onto the tail (mMind.js:376)
  → MMind publishes it on `attended`            (mMind.js:368)
  → MMemory._onAttended                          (mMemory.js:279)
  → note()  → JOURNAL ONLY                        (mMemory.js:384)
```

`note()` is explicitly *"a human-readable annotation only — the journal is never fed
back to the model"* (`mMemory.js:382-387`). So the stimulus lands in
`journal/<day>.md` as a perceived (`⟂`) note and **nowhere else durable**. The bridge
that stitches it onto the tail in the frame (`mMind._writeBridge`, `mMind.js:447`) is
ephemeral framing — it is part of the prompt payload, not appended to `MMemory.tail`;
only the model's *generated continuation* is published as chunks and persisted.

### The asymmetry at the root

The mind's **output** is fed back into the compressible substrate; its **perception
is not**.

| event | reaches the tail? | reaches the compressor? | durable trace |
| --- | --- | --- | --- |
| inner monologue (chunks) | yes | yes | tail → recent → story |
| aloud speech | yes (`(aloud) "…"`) | yes | tail |
| generated image | yes (`(image) …`) | yes | tail |
| **external stimulus / voice** | **no** | **no** | journal `⟂` only |
| scribe filing (`_onFiled`) | no | no | journal `⌁` only |
| hands' deed (`_onActed`) | no | no | journal `⌁` only |

The tail is therefore a pure record of the mind's *own voice*. Any external event
survives into compressible memory **only insofar as the mind happens to re-narrate
it in its own monologue** — and that re-narration is unreliable.

## Evidence — the `lemma-lab-5` run

The calculation was interrupted by the human (Kris). The actual input was a single
word, recorded in the journal (`memory/lemma-lab-5/journal/2026-06-22.md:14492`):

```
> ⟂ A voice arrives from outside: "Wow!"
```

The tail (`memory/lemma-lab-5/memory.md`, `## Tail`, the line beginning *"The
calculation halts…"*) holds only the mind's reaction, which **abstracts the input
away and then confabulates a scene that never happened**:

> The calculation halts as the exclamation pierces the silence. … The voice belongs
> to Kris, who is standing in the doorway, holding a cup of coffee. … "You've been
> quiet for a long time. What did you find?" …

None of that — the doorway, the coffee, the question — was said. The real input was
`"Wow!"`. The confabulated exchange **is in the tail and will be compressed**, while
the ground-truth stimulus exists only in the un-compressed journal. So the memory
will faithfully preserve a fiction and silently drop the fact. The same is true of
the whole preceding exchange — every `A voice arrives from outside: "…"` line in the
journal (e.g. `:14353` *"You are in an attractor… can you stop it and continue working
on the math problem?"*, `:14385` *"break it. work on the math"*) is journal-only and
invisible to the compressor.

This is precisely why the tail is *not self-understandable*: read on its own,
"the exclamation pierces the silence" has no referent.

## Why it is (partly) by design

The journal being write-only to the model is deliberate — it keeps the human's
annotation channel out of the mind's loop, and the tail is meant to be "what *I* was
just saying." The asymmetry is not an accident; it is the decoupling described in
[decoupling.md](../architecture/decoupling.md) (memory listens on topics; nothing
reaches in). But it has a failure mode that was not the intent: **a perceived event
the mind does not faithfully restate is lost to memory, and confabulation can take its
place.** For a mind whose entire continuity is its compressed memory, losing the
ground truth of what was said *to* it — while keeping an invented version — is a
fidelity bug, not just a design choice.

## Directions to consider (undecided)

Not yet chosen — listed so the trade-offs are on record.

1. **Leave a verbatim stimulus trace in the tail.** When a stimulus enters a frame,
   append a short marked block to the tail (mirroring `(aloud) "…"`), e.g.
   `(heard) "Wow!"`, so the next thought — and every later compression — continues
   knowing what was actually said. Smallest change; reuses the existing tail/overflow
   path. Risk: the tail is a budgeted resource (9300 chars here) and is *the mind's own
   voice* — interleaving external lines changes its character and competes for budget.
   Mitigation: mark them unmistakably and keep them short.

2. **Give the compressor the stimulus as read-only context.** The consolidation prompt
   already accepts `<earlier>`/`<continues>` overlap context that is summarised-around
   but not folded in (`buildCompressionPrompt`, `mMemory.js:612`, the overlap built in
   `_consolidate`, `mMemory.js:308-322`). A parallel "what was perceived during this
   block" channel could let the compressor anchor the mind's reactions to real events
   without treating the journal as model-facing memory. Risk: plumbing the
   per-block stimulus set into the compressor; deciding what counts as "during this
   block."

3. **Accept the gap but constrain confabulation.** If perception is to stay
   journal-only, the stream instruction (`mMind.js:402-403`) could discourage inventing
   unstated detail when redirected by a stimulus — so the mind abstracts ("a voice
   interrupted me") rather than fabricating a scene. This does not recover the content,
   but it stops fiction from being remembered as fact. Weakest fix; treats the symptom.

4. **Do nothing — document it as a known limitation.** Defensible only if the journal
   is considered the system of record for perception and memory is explicitly the
   *mind's-eye* account, confabulation included. Worth stating outright if chosen, so
   it is not mistaken for an oversight.

## Relationship to the active experiment

The journal-only voices that vanish from memory are exactly the human's repeated
attempts to break the presence-attractor (`break it. work on the math`,
`You worked on math for long before slipped to the loop. You can go back there`).
Because they never reach the compressed memory the mind reads each burst, the mind
has no *remembered* record that it was repeatedly asked to return to work — only the
journal does. This is directly relevant to the memory-length × presence-attractor
study (see the project memory index): the intervention is invisible to the substrate
that drives the next burst.

## Resolution (2026-07-03)

Direction 1 was chosen, with one refinement over the sketch above: instead of a new
`(heard) "…"` marker, a perceived stimulus enters the tail in **the exact rendering
the journal and Studio already use** — a `> ⟂ …` block — and at the **honest
temporal position**: after the mind's last words, because that is when it entered
the thinking, not somewhere earlier. One pure helper,
`withPerceivedEvents(text, lines)` (`src/infrastructure/interruptRecord.js`), is the
single source of that rendering:

- `MMind.assembleFrame` composes the burst's **prefill** with it — the thought in
  progress now *ends* with what just arrived, so the model continues from the event
  instead of resuming an interrupted sentence past it. The `## This just happened`
  system section is gone; perception is stream, not briefing.
- `MMemory._onAttended` appends the **identical block to the durable tail** (and
  still journals it), so this frame's prefill, the next frame's mirrored tail, and
  the journal read as one text. Perception now scrolls into the compressor like the
  mind's own voice; `buildCompressionPrompt` was taught that `> ⟂` lines are lived
  events whose substance (a result that came back, a voice) outranks speculation.
- The identity instruction explains the notation and forbids the mind writing `> ⟂`
  lines itself — only the world writes them — so a real result is now typographically
  distinct from an imagined one (the lemma-lab-20 killer asymmetry, inverted).
- `m-loop-detector`'s prompt was updated: repeated near-identical `> ⟂` events the
  thought never takes up ARE circling, so the re-reach ruts the events make visible
  are now detectable.

Backstage (`⌁`) events — the scribe's filings, the hands' deeds — stay journal-only:
the mind never experienced them, and the One Rule keeps them out of its stream. The
budget-competition risk flagged above is real but bounded: events pass through the
tail into consolidation like everything else, and the compression prompt knows what
they are.
