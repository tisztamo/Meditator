# The honesty ledger (⟂/⌁), completed for the strongest interventions

> **Status: IMPLEMENTED 2026-07-11.** Closes the 2026-07-02 philosophical review's
> **finding 7** — the ⟂/⌁ journal ledger was systematically incomplete for exactly the
> interventions that reach deepest into the stream. Touches `mMemory.js`, `mMind.js`,
> `mAct.js`, `mInterrupts.js`, and `mAgent.js`; tests in `wiring/clear-tail.test.js`,
> `wiring/bridge-journal.test.js`, `wiring/act-busy.test.js`, `wiring/muffled-memory.test.js`,
> `wiring/agent-govern.test.js`. Resolves the open items **C1** and **C3** of
> [ui-journal-honesty.md](ui-journal-honesty.md).

## The gap

The One Rule ([efference.md](../architecture/efference.md): "the conscious stream model is
never given tools; only the realizer is") means every intervention reaches the mind as
unmarked first-person experience. That is the *intended* design — the mind's experience is
meant to be seamless. The journal's marks were invented as the honesty backstop that keeps
the seamless experience from becoming a dishonest *record*:

- **⟂ perceived** — a stimulus the mind actually saw this frame.
- **⌁ backstage** — a subconscious/mechanism event the mind never saw, recorded for a human.

The principle is a pair: a deed is journaled ⌁ (the mind never felt the reaching) and its
consequence ⟂ (the mind genuinely perceives it). Experience seamless, record true.

The review found that the strongest interventions had the ⟂ half (or the seamless stream)
but not the ⌁ half — so the *record* passed off harness action as the mind's own agency:

1. **clear-tail** wiped the tail and discarded uncompressed overflow while handing the mind a
   scripted "I let my mind go quiet a moment…" with no ⌁ trail of the loop or the discard.
2. **m-resurface** injected a code-selected recall as a spontaneous first-person turn-back,
   with no ⌁ trail at all (ui-journal-honesty C3).
3. **the bridge** — a *utility*-model transition sentence — was journaled as the mind's own
   continuous inner monologue (ui-journal-honesty C1; Covenant §9).
4. **govern-modify** silently rewrote an agent's tool args with no disclosure even to the
   agent's own reasoning loop.
5. **m-act cooldown/dedup** returned pure silence when a formed reach was held — the
   documented confabulation trigger (`terminal-hand-live-validation.md`) — where `m-terminal`
   already modelled the honest alternative ("the desk is still busy…").
6. **arousalSensitivity** silently raised a tired mind's interrupt threshold, so a low-energy
   mind grew isolated with no felt *or recorded* reason. (Acknowledged nowhere before.)

## The mechanism, item by item

Throughout, the fix keeps the mind's experience exactly as it was and adds only to the record
(or, for m-act, replaces silence with an honest felt sensation — which the mind *should*
have).

- **clear-tail + resurface** (`mMemory._onClearTail`, `mMind._assembleClearFrame`). The felt
  ⟂ line is unchanged. The same cut now also writes a ⌁ note: the loop's `kind`, the count of
  uncompressed characters discarded (tail + overflow), and — from `breaker.type`, newly carried
  on the `clear-tail` event as `via` — whether a kept memory was resurfaced (`via === "Recall"`,
  m-resurface) or the floor simply brought the mind to rest. One ⌁ trail per actual cut,
  attributed correctly, emitted where the cut really happens (memory owns the tail *and* the
  journal), so m-resurface needs no separate note and can never claim a cut it lost the bid for.

- **bridge** (`mMind` fires `@bridge`; `mMemory` `bridgeSrc` + `_flushJournal`). m-mind
  announces the utility-written sentence on a backstage `@bridge` event. m-memory marks it
  pending and, when the next journal block flushes, peels it off the front (the stream emits it
  as the redirect burst's opening `prefix` chunk) and renders it as a `↪` provenance line. It
  still rides the verbatim tail untouched — the model must continue from it — so only the
  human-facing journal changes. Per §9 the fault is *provenance, not model identity*, so the
  minimal mark is the correct fix; the deeper "make the voice model write the bridge" option is
  not needed for honesty.

- **govern-modify** (`mAgent._runOne`). The args are snapshotted before the govern seam and
  compared after. When a norm rewrote them, the tool observation the agent reads next turn is
  prefixed "a governing norm adjusted this call's arguments before it ran." A veto was already
  self-disclosing (`refused: …`); only a silent modify needed the mark.

- **m-act busy** (`mAct._feelReachInMotion`). A formed reach that is deduped ("already
  reaching for this") or meets a closed hand lane no longer passes in silence: the mind feels a
  low-salience, ambient "my hands are still busy with what I last set going" — the faculty-level
  twin of m-terminal's busy line. It is a perceived (⟂) consequence with **no deed** (nothing
  reached the world) and is throttled per normalized intent (one telling per `intentCooldown`),
  so a standing wish is felt once, not every cadence — otherwise it would defeat the dedup it
  rides on.

- **arousalSensitivity** (`mInterrupts._noteMuffled`; `mMemory._onMuffled`). When low arousal
  alone drops a stimulus (it clears the base threshold but not the arousal-raised one), the
  global arbiter fires a bubbling backstage `muffled` event, throttled to `rateLimit`. m-memory
  journals a ⌁ trail ("Tired (arousal 0.xx), the bar on what reaches me has risen; something I
  would have taken when rested passed unfelt"). The mind is told nothing — it never perceived
  the stimulus, so there is nothing to feel — but its withdrawal gains a recorded cause. The
  same change hardened the arbiter's arousal subscription with the `.catch` its sibling m-act
  already had, so an `arousalSensitivity` mind with no economy no longer leaks an unhandled
  `RefResolutionError`.

## What was deliberately left

- The **m-act cooldown-lane gate before DECIDE** (`onBoundary`, all lanes closed) stays silent:
  no reach has been formed yet there, so there is nothing to confabulate from, and running the
  decide model just to say "busy" would cost a call every cadence. Only a *formed* reach that is
  held is felt.
- **Studio-stream** rendering of the bridge is still inline; the honest journal mark is the
  named fix (finding 7 / C1 name the *journal*). Marking the bridge distinctly in the live
  Studio stream, using the same `@bridge` event, is a good follow-up but a separate UI change.
- The muffled trail is **record-only by design.** A felt interoceptive sense of tiredness (so a
  mind's withdrawal has a felt cause from within, not only a recorded one) is a larger,
  additive design — an interoception feature, not a ledger fix — and is left open.
