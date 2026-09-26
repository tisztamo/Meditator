// Shared helpers for the message-rule contract tests (doc/architecture/message-rule.md).
//
// A contract test pins the OBSERVABLE outcome of one cross-component protocol —
// the thing that must still hold after the protocol is migrated to plain-data
// messages. It must pass today (sync dispatch) and should fail under
// `MEDITATOR_DELIVERY=macrotask` for protocols that read something back from a
// synchronous dispatch. So: never assert synchronously after a fire — wait with
// waitFor() — so that mere delay never fails a test; only a lost reply, a lost
// veto, or a broken order does.
import "../setup.js";

export const delay = ms => new Promise(r => setTimeout(r, ms));

/** Poll `cond` until truthy or `timeout` ms pass; resolves to the last value. */
export async function waitFor(cond, timeout = 1000, step = 5) {
    const end = Date.now() + timeout;
    let v;
    while (!(v = cond()) && Date.now() < end) await delay(step);
    return v;
}

/** For negative assertions: give every deferred delivery time to land. */
export const quiet = (ms = 60) => delay(ms);
