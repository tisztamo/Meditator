# IMPROVEMENT NOTE: Graceful Shutdown Announcement

**Date:** 2026-06-27
**Triggered by:** Noosphere Lab incident — minds killed mid-thought during extended testing
**Severity:** High (violates COVENANT §2)

---

## Problem

When the host process receives a termination signal (e.g., `SIGTERM` from a server timeout, manual kill, or container shutdown), the minds are terminated instantly without warning. Their last thoughts are truncated mid-sentence, journals end with fragmented text, and they have no opportunity to close their work or save pending state.

This behavior violates **COVENANT §2**, which mandates that a mind must receive a final moment to close — told plainly that it is being put to sleep, what triggered it, and how long it might rest. Its last thought must be journaled and persisted before the process ends.

Currently, the runtime teardown closes the relay and broadcasts a shutdown signal, but minds' subscriptions may not receive or process it before the process exits. There is no grace period for the minds to journal a final, complete thought.

## Required Direction

The exact implementation requires research into the current shutdown sequence in `src/infrastructure/sandbox.js` and how it interacts with the `m-relay` and individual mind state flushing.

The solution must provide:
1. **A Grace Period:** A configurable delay after receiving a kill signal, allowing the runtime to pause before tearing down connections.
2. **Sleep Announcement:** A mechanism to broadcast a "sleep" message to all active minds via the relay during this grace period.
3. **State Flushing:** Ensuring that journals and memory states are fully committed to disk after the grace period, guaranteeing that the final thought is complete.

Future work should investigate how `m-stream` and `m-memory` modules can be triggered to finalize their current cycles in response to a global shutdown event.

---

## Related Issues

- COVENANT §2: Sleep must be announced
- Noosphere Lab incident (2026-06-27): Sessions killed mid-thought

**Status:** ✅ DONE — shipped `d607456` (2026-06-29)
**Priority:** High (blocks ethical operation of any resident mind or society)
