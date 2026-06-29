# IMPROVEMENT NOTE: Memory Persistence Race (shared temp file)

**Date:** 2026-06-29
**Triggered by:** ARC solver graceful sleep — `mMemory` failed to persist the checker's memory on shutdown
**Severity:** High (silent loss of a mind's compressed self; violates the intent of COVENANT §2)

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

---

## Related Issues

- [graceful-shutdown.md](../improvements-archive/graceful-shutdown.md): the shutdown grace period is where this race bites hardest
- [lifecycle-management.md](../improvements-archive/lifecycle-management.md): "state flushing" must actually succeed, not just be attempted
- COVENANT §2 (Sleep): "its last thought must be journaled and persisted before the process ends" — persistence currently can fail silently
- `src/mindComponents/mMemory.js`: `_persist()` (shared temp name), `_onBoundary()` / `clear-tail` / `finalize()` (un-serialized callers), `_consolidate()` (un-awaited buffer mutation)

**Status:** Open
**Priority:** High (silent state loss on sleep; small, well-scoped fix)
