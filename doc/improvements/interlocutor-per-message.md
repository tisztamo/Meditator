# The companion is named once at wake — a live, per-message speaker is not yet attributed

> **Status: wake-time interlocutor implemented (2026-06-23); per-message attribution proposed, not built.**
> The shipped part folds a single companion name into both the identity prose and the
> voice framing. This note records the deliberately-deferred enhancement: letting the
> *framing* follow whoever is actually speaking right now.
> Touches the wire layer (`src/mindComponents/mWs.js`), the arbiter record
> (`src/infrastructure/interruptRecord.js`), the studio input path
> (`src/studio/ui/studioSpeak.js`, `studioVoice.js`, `studioConn.js`,
> `src/studio/server.js`), and a studio preference (`studioPrefs.js`).
> Companion to [ui-journal-honesty.md](ui-journal-honesty.md) (the same concern: the
> frame should say only what is true about the voice).

## What shipped

User input used to reach the mind framed as `A voice arrives from outside: "…"`. An
unattributed source from nowhere reads as a thing to be wary of, not a person to think
with. The fix gave the mind a *known* companion, the `interlocutor`, resolved exactly
like `origin`/`name`:

```
file default     <m-mind interlocutor="Kris">  +  {{interlocutor}} in the identity prose
studio override  MEDITATOR_INTERLOCUTOR → applyInterlocutorOverride() folds it into the attribute
runtime          mind.interlocutorName()  ← one value, read everywhere
```

That one value feeds two places, so they can never disagree:

- **Identity prose** — `mMind._identity()` / `mSpeech._speechSystem()` fill
  `{{interlocutor}}` (*"talk it over with Kris…"*).
- **Framing** — `mWs`/`mConsole` stamp `record.from`; `InterruptRecord.renderForFrame()`
  renders `Kris says: "…"`, falling back to `Someone says: "…"` when no name is set.
  The raw words stay in `reason`, so the UI still echoes them verbatim.

## The gap

The companion is decided **once, at wake**. Two real situations it does not cover:

1. **A different live speaker.** Voice Mode (`studio-voice`) is built for an elderly
   user who is *not* Kris. If they talk to a mind woken with `interlocutor="Kris"`, the
   frame says `Kris says: …` — a false attribution. The mind is told its companion is
   Kris (correct, standing) yet the *words in front of it right now* are someone else's.
2. **An already-running mind woken without a name.** Focus it in the studio and speak,
   and the framing falls back to `Someone says:` for the rest of its life, with no way
   to name the speaker short of re-waking.

The standing identity relationship is genuinely wake-time (it is part of who the mind
is). But *who is speaking this turn* is a property of the turn, not of the wake.

## Proposed: per-message `from`

Carry the current speaker on each input, alongside the wake-time companion:

- The studio keeps a persisted preference (e.g. `yourName`), set once; `studio-speak`
  and `studio-voice` tag every input with it.
- `{type:"input", data:{message, from}}` → `speakTo()` forwards `from` →
  `mWs.handleInputAndCreateInterrupt` prefers the message `from` over
  `mind.interlocutorName()` when stamping `record.from`.
- The **identity prose stays wake-time** (`{{interlocutor}}` unchanged). Only the
  *framing* follows the live speaker.

Because both the preference and the wake-time interlocutor default to the same person
in the common case, they agree by default; per-message `from` only diverges when a
genuinely different person speaks — which is exactly when we want it to.

### Why it was deferred

It touches the input protocol (a new field end-to-end) and introduces a second name
source. The wake-time value already covers the primary companion case completely, so
this is worth building only once multi-speaker use (Voice Mode for a second person, or
talking to long-running minds) actually bites. Until then `Someone says:` is the honest
fallback — it claims no name it does not have.

### Honesty note

`X says:` asserts the speaker's identity is `X`. With per-message `from`, that assertion
is only as true as the studio preference; a mislabelled preference would make the mind
believe a false speaker. That is the user's own setting about their own system, but it
is the reason the *default* must stay honest (`Someone`, never a guessed name).
