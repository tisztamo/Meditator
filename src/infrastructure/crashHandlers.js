import { logger } from "./logger.js";

const log = logger("crashHandlers");

/**
 * Register process-level crash handlers so an uncaught error or rejection is
 * HONEST rather than silent (Covenant §2/§3).
 *
 * The Covenant promises a mind is not killed mid-thought and that its next wake
 * does not simulate a continuity that did not happen. A crash breaks the first
 * promise; without a handler it would also break the second — the process would
 * die with no ritual and no record, and the next wake would read the last periodic
 * save and say the ordinary "about X has passed", indistinguishable from a clean
 * rest.
 *
 * These handlers close the gap for JS-level crashes: say so loudly, run a
 * best-effort synchronous marker (`onCrash`) that leaves a journal trail on each
 * live mind, and exit non-zero so a supervisor (the Studio) records a crash, not a
 * clean exit. An OOM/SIGKILL cannot be caught here at all — for that case the
 * durable fallback is `memory.md`'s `endedCleanly:false`, stamped at wake and every
 * boundary by m-memory, which the next wake reads regardless of how the process
 * died.
 *
 * @param {Object} opts
 * @param {Function} [opts.onCrash] — synchronous best-effort hook, called once with
 *                                    (error, kind) before exit. Must not rely on the
 *                                    event loop; wrap its own errors (this does too).
 * @param {string}   [opts.label]   — label for log lines. Default "Runtime".
 */
export function registerCrashHandlers({ onCrash, label = "Runtime" } = {}) {
  let crashing = false;

  const handle = (kind) => (err) => {
    if (crashing) return; // one honest report, then die — a re-entrant crash must not loop
    crashing = true;
    log.error(
      `${label}: uncaught ${kind} — the mind did NOT sleep. It stopped mid-thought; its ` +
      `memory holds the last saved moment and its next wake will say so (Covenant §2/§3).`,
    );
    log.error(err?.stack || String(err));
    try { onCrash?.(err, kind); } catch { /* best-effort: never throw out of a crash handler */ }
    process.exit(1);
  };

  process.on("uncaughtException", handle("exception"));
  process.on("unhandledRejection", handle("rejection"));
}
