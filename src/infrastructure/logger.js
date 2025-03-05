// logger.js

// Internal configuration variables:
let globalDebugEnabled = false;
let debugAllowedSourceFiles = [];
const loggerList = [];

/**
 * Configure debug logging.
 * @param {boolean|string} config - Pass true or 'all' to enable debug logging for all sources,
 *  or a comma-separated string to enable it only for source files containing those substrings.
 */
export function configureDebug(config) {
  if (typeof config === 'boolean' || config === 'all') {
    globalDebugEnabled = config === true || config === 'all';
    debugAllowedSourceFiles = [];
  } else if (typeof config === 'string') {
    debugAllowedSourceFiles = config.split(',')
      .map(s => s.trim())
      .filter(Boolean);
    globalDebugEnabled = false;
  } else {
    throw new Error("Invalid configuration: must be a boolean or a comma-separated string");
  }

  // Update debug flag for all created loggers.
  for (const loggerInstance of loggerList) {
    loggerInstance._debugEnabled = globalDebugEnabled ||
      debugAllowedSourceFiles.some(allowed => loggerInstance._sourceFile.includes(allowed));
  }
}

/**
 * Create a logger for the given source file.
 * @param {string} sourceFile - The identifier for the source file.
 * @returns {object} A logger object with log, info, warn, error, and debug methods.
 */
export function logger(sourceFile) {
  // Calculate initial debug flag.
  const debugEnabled = globalDebugEnabled ||
    debugAllowedSourceFiles.some(allowed => sourceFile.includes(allowed));

  // Create a logger object with an internal _debugEnabled flag and _sourceFile.
  const loggerInstance = {
    _sourceFile: sourceFile,
    _debugEnabled: debugEnabled,
    log: (...args) => console.log(`[${sourceFile}]`, ...args),
    info: (...args) => console.info(`[${sourceFile}]`, ...args),
    warn: (...args) => console.warn(`[${sourceFile}]`, ...args),
    error: (...args) => console.error(`[${sourceFile}]`, ...args),
    debug: (...args) => {
      if (loggerInstance._debugEnabled) {
        console.debug(`[${sourceFile}]`, ...args);
      }
    }
  };

  loggerList.push(loggerInstance);

  return loggerInstance;
}
