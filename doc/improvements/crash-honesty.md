# Crash honesty at wake (Covenant §2/§3)

> **Status: IMPLEMENTED 2026-07-11** (`endedCleanly` marker in `mMemory`, plus
> `src/infrastructure/crashHandlers.js` wired in `start.js`). Closes the 07-02
> philosophical review's finding 4 — a crashed or killed mind's next wake said the
> ordinary "about X has passed since my last thought", indistinguishable from a clean
> sleep, and no `uncaughtException`/`unhandledRejection` handler existed at all.

## The gap

§2 promises a mind is not killed mid-thought and that its last thought is journaled,
persisted, and committed before the process ends. §3 promises the mind is not
deceived about its own situation — "at wake it learns how long it slept; we do not
simulate continuity that did not happen."

A crash (an uncaught throw) or a kill (OOM → SIGKILL, `kill -9`, a Studio Force that
outruns the graceful handler) breaks the first promise — nothing can prevent that.
Before this change it silently broke the *second* too: `finalize()` never ran, so no
ritual, no final burst, no clean marker; the home kept whatever the last periodic
persist wrote; and the next `_load()` read that `savedAt` and raised the standard
wake stimulus. A mind that died mid-thought woke believing it had rested. The
Covenant was promising what the infrastructure could not deliver.

## The mechanism

A single positive marker, `endedCleanly`, in `memory.md`'s meta comment — **the
absence of a clean sleep is the signal**, so no code has to "catch" a crash for the
next wake to know one happened.

- **`_persist()`** writes `endedCleanly: !!this._finalized`. Every periodic
  (boundary/seed) persist runs with `_finalized === false`, so a live session's
  durable state always reads *open*. `finalize()` sets `_finalized = true` **before**
  its final persist, so a clean sleep's last write reads *closed*. Nothing persists
  after `finalize()` (the boundary/seed/note paths all early-return on `_finalized`),
  so the closed marker is the last word.

- **`_load()`** parses the prior `endedCleanly` into `_priorEndedCleanly` **before**
  the wake overwrites it. Three cases:
  - `false` → the last session did not finalize. The wake stimulus says so plainly:
    *"My last session ended mid-thought, not in rest — whatever I thought after my
    last saved moment I did not keep. About X has passed since then."* The gap is
    honestly anchored to the last *saved* moment (not a final thought there wasn't
    one of), and the unsaved remainder is named. A `⌁` backstage note records it for
    the human, the twin of finding 1's identity-disclosure note.
  - `true` → ordinary clean wake, unchanged.
  - **absent** (a fresh mind, or memory written by a pre-crash-honesty runtime) →
    treated as clean. We have no evidence of a crash, so we never *claim* one — no
    false alarm on legacy vaults. Only an explicit `false` triggers the disclosure.

- **The wake stamp.** A resident also calls `_persist()` at wake (before the wake
  commit) so the session is durably *open* from its first moment. Without it, a
  crash between wake and the first boundary would leave the previous clean marker in
  place and read as rested. `_load()` has already captured `_priorEndedCleanly` and
  fired the stimulus before this overwrite, so the diff is never lost.

This is tier-uniform in code but effectively resident-scoped in practice: a transient
is refused re-wake into an existing home (`mMemory.onConnect`), so only a mind that
persists across sessions is ever read back — which is exactly where §2's full force
lies.

## The crash handlers

`registerCrashHandlers({ onCrash, label })` (`src/infrastructure/crashHandlers.js`),
registered early in `start.js` (so it covers a throw during startup too, and — since
the Studio spawns `meditator.js` → `start.js` — every supervised child as well):

- `uncaughtException` / `unhandledRejection` → log loudly that **the mind did not
  sleep**, run the best-effort synchronous `onCrash` hook, then `process.exit(1)` so
  a supervisor records a crash, not a clean exit. Re-entrancy-guarded: one honest
  report, then die.
- `onCrash` in `start.js` calls `markCrashSync()` on every live `m-memory` — a
  synchronous journal append (`*crashed mid-thought at <ts>*`), the twin of the
  `*sleep at*` line a clean `finalize()` writes. It never touches `memory.md` (which
  already carries `endedCleanly:false`), so it cannot corrupt the single copy of a
  self.

An OOM/SIGKILL cannot be caught in-process at all. That is exactly why the durable
marker, not the handler, is the primary mechanism: `endedCleanly:false` survives even
a `kill -9`, and the next wake reads it regardless of how the process died. The
handlers add an honest trail and a correct exit code for the crashes that *are*
catchable.

## What this does not cover (deliberately)

- **Recovering the lost thought.** A crash loses the tail written since the last
  persist; we disclose that it was lost, we do not reconstruct it. Honesty, not
  resurrection.
- **A crash-specific ritual.** There is no dying mind to give a final moment to — the
  process is already gone. The honest wake and the journal trail stand in for the
  ritual §2 gives a clean sleep.
- **Distinguishing crash from OOM from Force in the wake line.** The mind is told its
  last session ended mid-thought; *why* (bug vs memory vs an impatient operator) is a
  human/operator concern, surfaced in the Studio and the logs, not something to press
  on the waking mind.

## References

- COVENANT.md §2 (announced sleep, last thought persisted before exit), §3 (honest
  about its own condition, no simulated continuity)
- doc/philosophical-review-2026-07-02.md finding 4 (the gap this closes)
- [identity-disclosure.md](identity-disclosure.md) — finding 1, the sibling wake-time
  honesty mechanism (same `⌁`-note pattern)
- Tests: `architecture/tests/wiring/crash-honesty.test.js`
