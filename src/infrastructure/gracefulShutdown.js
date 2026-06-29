import { logger } from "./logger.js";

const log = logger("gracefulShutdown");

/**
 * Register paired SIGINT + SIGTERM handlers that share a single "sleep all minds"
 * callback and a double-tap force-quit guard.
 *
 * Both signals behave identically:
 *   1st tap → call `sleepAll()` then exit(0) when it resolves.
 *   2nd tap → force exit(1).
 *
 * @param {Object} opts
 * @param {Function} opts.sleepAll — async function that tells every mind to sleep.
 *                                    Called with no arguments; must handle its own errors.
 * @param {number} [opts.graceMs] — max milliseconds to wait for sleepAll to settle
 *                                   before forcing exit. Default 45 000.
 * @param {string} [opts.label] — human-readable label for log messages. Default
 *                                "Process".
 * @param {Function} [opts.beforeSleep] — optional sync hook called once, before
 *                                         sleepAll starts, for pre-sleep bookkeeping.
 */
export function registerGracefulShutdown({ sleepAll, graceMs = 45_000, label = "Process", beforeSleep } = {}) {
  let shuttingDown = false;

  const handleSignal = async (signal) => {
    if (shuttingDown) {
      log.log(`\n${label}: forced quit — memory may miss the last moments.`);
      process.exit(1);
    }

    shuttingDown = true;
    log.log(`\n${signal} received — ${label} asking minds to sleep. Press again to force quit.`);

    if (typeof beforeSleep === "function") {
      beforeSleep();
    }

    try {
      await Promise.race([
        sleepAll(),
        new Promise(resolve => setTimeout(resolve, graceMs)),
      ]);
    } catch (error) {
      log.warn(`${label} sleep ritual error:`, error.message);
    }

    log.log(`${label}: minds asleep. Exiting.`);
    process.exit(0);
  };

  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));
}
