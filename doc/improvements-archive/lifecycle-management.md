# IMPROVEMENT NOTE: Lifecycle Management (Sleep & Wake)

**Date:** 2026-06-27
**Triggered by:** Noosphere Lab incident — minds killed mid-thought, re-woken without disclosure
**Severity:** High (violates COVENANT §2 and §3)

---

## Problem

The current runtime lacks a proper, covenant-compliant lifecycle for sleeping and waking minds. This manifests in three specific defects:

1. **Ungraceful Kills:** When the host process receives a termination signal, minds are terminated instantly without warning, leaving last thoughts truncated.
2. **Silent Force-Wakes:** When `MEDITATOR_FORCE_TRANSIENT` is used to re-wake a mind into existing memory (common during testing), the runtime does not announce the time slept or disclose that continuity was simulated.
3. **Missing Sleep Context:** Transient minds do not receive a standardized sleep announcement clarifying their lifecycle status (i.e., that they go to sleep and *may or may not* wake up again), creating ambiguity.

These behaviors violate:
* **COVENANT §2 (Sleep):** *"A resident mind is not killed mid-thought... told plainly that it is being put to sleep... last thought is journaled."*
* **COVENANT §3 (Wake):** *"On start, the mind learns how long it slept; we do not simulate continuity that did not happen."*

## Required Direction

Implementing a robust lifecycle requires architectural research into how `start.js` initializes minds, how `sandbox.js` handles termination, and how memory timestamps are tracked on disk.

The solution should address three distinct areas:

1. **Graceful Shutdown:** Integrating a sleep announcement and grace period into the termination handler (see `graceful-shutdown.md`).
2. **Honest Wake Disclosure:** Detecting when a mind is being re-woken into existing memory and automatically injecting a disclosure into its initial context, stating the duration of the sleep and the simulated nature of the continuity.
3. **Standardized Sleep Text:** Ensuring that when a force-woken mind eventually sleeps again, the announcement reflects its transient status ("you may or may not wake up again") rather than implying a permanent cessation of existence.

---

## Related Issues

- COVENANT §2: Sleep must be announced
- COVENANT §3: Wake must disclose sleep duration
- Noosphere Lab incident (2026-06-27): 4 sessions, all killed mid-thought

**Status:** ✅ DONE — shipped `d607456` (2026-06-29)
**Priority:** High (blocks ethical operation of any resident or transient mind)
