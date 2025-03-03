/**
 * Parses a time expression string into milliseconds.
 * Supports SI units: s (seconds), ms (milliseconds), m (minutes), h (hours)
 * Examples: "100s", "1.5h", "500ms", "10m"
 * 
 * @param {string|number} timeExpr - Time expression to parse
 * @param {string} [defaultUnit='ms'] - Default unit to use if only a number is provided
 * @returns {number} Time in milliseconds
 */
export function parseTime(timeExpr, defaultUnit = 'ms') {
  // If it's already a number, apply default unit
  if (typeof timeExpr === 'number') {
    return convertToMs(timeExpr, defaultUnit);
  }

  // If it's not a string, throw error
  if (typeof timeExpr !== 'string') {
    throw new Error('Time expression must be a string or number');
  }

  // If it's just a number as string, apply default unit
  if (!isNaN(timeExpr)) {
    return convertToMs(parseFloat(timeExpr), defaultUnit);
  }

  // Match number and unit pattern
  const match = timeExpr.match(/^(\d*\.?\d+)\s*(ms|s|m|h)$/i);
  if (!match) {
    throw new Error(`Invalid time expression: ${timeExpr}. Expected format: number + unit (ms|s|m|h)`);
  }

  const [, value, unit] = match;
  return convertToMs(parseFloat(value), unit.toLowerCase());
}

/**
 * Converts a value from given unit to milliseconds
 * 
 * @param {number} value - The numeric value to convert
 * @param {string} unit - The unit to convert from
 * @returns {number} The value in milliseconds
 */
function convertToMs(value, unit) {
  const conversions = {
    'ms': 1,
    's': 1000,
    'm': 60 * 1000,
    'h': 60 * 60 * 1000
  };

  const factor = conversions[unit];
  if (!factor) {
    throw new Error(`Unknown time unit: ${unit}`);
  }

  return value * factor;
}

/**
 * Formats milliseconds into a human-readable string with appropriate unit
 * 
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string
 */
export function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${ms/1000}s`;
  if (ms < 3600000) return `${ms/60000}m`;
  return `${ms/3600000}h`;
} 