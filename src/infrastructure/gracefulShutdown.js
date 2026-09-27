import { logger } from "./logger.js";

const log = logger("gracefulShutdown");

/** Exit code of a shutdown whose sleep was not confirmed: a membrane's memory
 *  did not confirm its commit, or the grace ran out first (Covenant: reported,
 *  never assumed). The Studio supervisor reads it to say so. */
export const SLEEP_UNCONFIRMED_EXIT = 3;

/**
 * Register paired SIGINT + SIGTERM handlers that share a single "sleep all minds"
 * callback and a double-tap force-quit guard.
 *
 * Both signals behave identically:
 *   1st tap → call `sleepAll()` then exit when it resolves: 0, or
 *             SLEEP_UNCONFIRMED_EXIT when it reported {confirmed: false} or the
 *             grace ran out.
 *   2nd tap → force exit(1).
 *
 * Returns {shutdown(reason)}: the same path, asked for by something other than a
 * signal (a port's `/sleep`). A repeated request is ignored, not a force quit.
 *
 * @param {Object} opts
 * @param {Function} opts.sleepAll — async function that tells every mind to sleep.
 *                                    Called with {deadline} (the grace); must handle its
 *                                    own errors. May resolve to {confirmed}.
 * @param {number} [opts.graceMs] — max milliseconds to wait for sleepAll to settle
 *                                   before forcing exit. Default 45 000.
 * @param {string} [opts.label] — human-readable label for log messages. Default
 *                                "Process".
 * @param {Function} [opts.beforeSleep] — optional sync hook called once, before
 *                                         sleepAll starts, for pre-sleep bookkeeping.
 */
export function registerGracefulShutdown({ sleepAll, graceMs = 45_000, label = "Process", beforeSleep } = {}) {
  let shuttingDown = false;

  const sleepAndExit = async () => {
    if (typeof beforeSleep === "function") {
      beforeSleep();
    }

    let result;
    try {
      result = await Promise.race([
        sleepAll({ deadline: graceMs }),
        new Promise(resolve => setTimeout(() => resolve({ confirmed: false, grace: true }), graceMs)),
      ]);
    } catch (error) {
      log.warn(`${label} sleep ritual error:`, error.message);
      result = { confirmed: false };
    }

    if (result?.confirmed === false) {
      log.log(`${label}: ${result.grace ? "grace ran out — " : ""}sleep NOT confirmed for every mind. Exiting.`);
      process.exit(SLEEP_UNCONFIRMED_EXIT);
    }
    log.log(`${label}: minds asleep. Exiting.`);
    process.exit(0);
  };

  const handleSignal = (signal) => {
    if (shuttingDown) {
      log.log(`\n${label}: forced quit — memory may miss the last moments.`);
      process.exit(1);
    }
    shuttingDown = true;
    log.log(`\n${signal} received — ${label} asking minds to sleep. Press again to force quit.`);
    return sleepAndExit();
  };

  const shutdown = (reason = "Sleep requested") => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.log(`${reason} — ${label} asking minds to sleep.`);
    return sleepAndExit();
  };

  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));
  return { shutdown };
}
