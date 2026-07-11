# IMPROVEMENT NOTE: Memory Persistence Race (shared temp file)

**Date:** 2026-06-29
**Triggered by:** ARC solver graceful sleep — `mMemory` failed to persist the checker's memory on shutdown
**Severity:** High (silent loss of a mind's compressed self; violates the intent of COVENANT §2)

> **RESOLVED 2026-07-11** — closes philosophical-review-2026-07-02 gap #5. All four
> required directions below are implemented in `mMemory.js`; see **§Resolution**. Unique
> temp names (direction 2) had already landed; this pass added the serialization queue,
> the finalize-awaits-consolidation wait, and the loud/retried critical write. Tests:
> `wiring/persist-serialization.test.js`.

---

## Problem

`m-memory` persists `memory.md` with a write-temp-then-rename, so a crash mid-write can never corrupt the only copy of a self (`mMemory.js:_persist`, ~line 545):

```js
const file = path.join(dir, "memory.md")
await fs.writeFile(file + ".tmp", content)   // always the SAME ".tmp" name
await fs.rename(file + ".tmp", file)
```

The atomic-rename guards against a *crash*, but **not against a second persist running concurrently** — and the temp path is a single fixed name (`memory.md.tmp`), shared by every caller. `_persist()` is invoked from at least three sites that are not serialized against one another:

- `_onBoundary()` — fires `this._persist()` on every stream boundary (not awaited by the rhythm);
- the `clear-tail` handler — persists after a loop-clear;
- `finalize()` — the sleep ritual's final flush (`await this._persist()`).

When two of these overlap (the common case observed: a boundary persist still in flight when the **sleep** handler fires its own `finalize()` persist), they collide on the one temp file:

```
persist A: writeFile(memory.md.tmp)  →  rename(memory.md.tmp → memory.md)   [tmp now gone]
persist B:                  writeFile(memory.md.tmp)  →  rename(memory.md.tmp → memory.md)   ← ENOENT
```

The losing call throws and is swallowed by the `try/catch`:

```
[mMemory.js] Could not persist memory: ENOENT: no such file or directory,
             rename 'memory/solver/checker/memory.md.tmp' -> 'memory/solver/checker/memory.md'
```

**Consequence.** The failure is silent (a `log.warn`, not a retry). When it happens during shutdown — exactly when there is no later boundary to re-persist — the mind's **final compressed memory is never written**. The journal still flushes (a separate queue), but `story`/`recent`/`tail` as of sleep are lost. This is bitterly ironic: it surfaced *inside the graceful-shutdown path*, the very mechanism added to stop minds losing their last state ([graceful-shutdown.md](../improvements-archive/graceful-shutdown.md), [lifecycle-management.md](../improvements-archive/lifecycle-management.md)).

A related, quieter hazard rides along: `_consolidate()` is intentionally *not* awaited (`mMemory.js:234`) and mutates `story`/`recent`/`tail` asynchronously, so a `_persist()` that interleaves with a consolidation can also snapshot half-updated buffers.

## Required Direction

The fix is concurrency discipline around persistence; the exact mechanism wants a small design pass, not a snap patch. The solution should ensure:

1. **Serialized persistence.** Only one `_persist()` runs at a time per mind — a single-flight guard or a persist queue (await the in-flight write, or coalesce a pending one), so overlapping callers can never race the rename. `finalize()` must await any in-flight persist/consolidation before its own.
2. **Unique temp names.** Even with serialization, the temp file should be unique per write (e.g. `memory.md.<pid>.<seq>.tmp`) so a stale or concurrent writer can never satisfy or steal another's rename, and orphaned temps are identifiable for cleanup.
3. **Persistence is not best-effort at shutdown.** A failed final persist should at minimum be retried once and surfaced loudly (not a swallowed `warn`) — losing a resident's last memory is a Covenant-level event, not a debug line.
4. **Snapshot consistency.** A persist should capture a coherent `{story, recent, tail}` — either by awaiting an in-flight consolidation or snapshotting the buffers before yielding.

## Resolution (2026-07-11)

Implemented in `mMemory.js`, addressing each required direction:

1. **Serialized persistence** — `_persist()` no longer writes directly; it enqueues onto
   one `_persistQueue` chain (the pattern `mContext.js` already used for its transcript),
   so overlapping callers apply in issue order and can never race the rename. It returns
   the promise for *its own* write, so `finalize()`/wake await their write, not merely the
   queue. `finalize()` now `await`s the in-flight consolidation (`_consolidating`, captured
   at the boundary) **before** its final write, so the last compressed self is what lands.
2. **Unique temp names** — kept and centralised in `_atomicWrite()`: `memory.md.<pid>.<seq>.tmp`,
   a fresh name per attempt (so even a retry can't steal a prior write's rename), with the
   temp file cleaned up on failure.
3. **Not best-effort at shutdown** — the final write is marked `critical`: it retries once,
   then logs at **error** and **rethrows**, up through `mMind.sleep` (also raised to
   `error`). A routine boundary write still warns once and lets the next boundary retry.
4. **Snapshot consistency** — two parts. `_writeMemory()` builds its content when its turn
   in the queue comes, so it reads a coherent `{story, recent, tail}` at write time rather
   than a snapshot from enqueue time; and `finalize()` awaits the in-flight consolidation
   (direction 1) so the final write is never taken mid-fold.

The quieter hazard noted above — a persist interleaving with an un-awaited `_consolidate()`
— is covered by the same two mechanisms: serialization gives each write a coherent read of
the buffers, and `finalize()` no longer races the last fold.

---

## Related Issues

- [graceful-shutdown.md](../improvements-archive/graceful-shutdown.md): the shutdown grace period is where this race bites hardest
- [lifecycle-management.md](../improvements-archive/lifecycle-management.md): "state flushing" must actually succeed, not just be attempted
- COVENANT §2 (Sleep): "its last thought must be journaled and persisted before the process ends" — persistence currently can fail silently
- `src/mindComponents/mMemory.js`: `_persist()` (shared temp name), `_onBoundary()` / `clear-tail` / `finalize()` (un-serialized callers), `_consolidate()` (un-awaited buffer mutation)

**Status:** RESOLVED 2026-07-11 (philosophical-review-2026-07-02 gap #5)
**Priority:** High (silent state loss on sleep; small, well-scoped fix)
