import { logger } from './logger.js';

const log = logger('interruptRecord.js');

/**
 * Class representing a structured interrupt record
 * Implements the Markdown format described in architecture docs
 */
export class InterruptRecord {
  /**
   * Creates a new interrupt record
   * @param {Object} options - Interrupt record options
   * @param {string} options.source - Source of the interrupt (Internal/External)
   * @param {string} options.type - Specific interrupt type
   * @param {string} options.reason - Detailed explanation for the interrupt
   * @param {Object} options.context - Context information
   * @param {string} options.context.lastOutput - Recent tokens from stream
   * @param {string} options.context.streamState - Current stream state
   * @param {Object} options.additionalData - Any relevant metadata (optional)
   */
  constructor({
    source,
    type,
    reason,
    context = {},
    additionalData = {}
  }) {
    this.dateTime = new Date().toISOString();
    this.source = source;
    this.type = type;
    this.reason = reason;
    this.context = {
      lastOutput: context.lastOutput || '',
      streamState: context.streamState || 'unknown'
    };
    this.additionalData = additionalData;
  }

  /**
   * Converts the interrupt record to a Markdown document
   * @returns {string} Markdown representation of the interrupt
   */
  toMarkdown() {
    let markdown = `## Interrupt Record\n`;
    markdown += `- DateTime: ${this.dateTime}\n`;
    markdown += `- Source: ${this.source}\n`;
    markdown += `- Type: ${this.type}\n`;
    markdown += `- Context:\n`;
    markdown += `  - Last Output: ${this.context.lastOutput}\n`;
    markdown += `  - Stream State: ${this.context.streamState}\n`;
    markdown += `- Reason: ${this.reason}\n`;
    
    if (Object.keys(this.additionalData).length > 0) {
      markdown += `- Additional Data:\n`;
      for (const [key, value] of Object.entries(this.additionalData)) {
        if (typeof value === 'object' && value !== null) {
          markdown += `  - ${key}:\n`;
          for (const [subKey, subValue] of Object.entries(value)) {
            markdown += `    - ${subKey}: ${subValue}\n`;
          }
        } else {
          markdown += `  - ${key}: ${value}\n`;
        }
      }
    }
    
    return markdown;
  }

  /**
   * Returns the interrupt record as an object
   * @returns {Object} The interrupt record as an object
   */
  toObject() {
    return {
      dateTime: this.dateTime,
      source: this.source,
      type: this.type,
      context: this.context,
      reason: this.reason,
      additionalData: this.additionalData
    };
  }

  /**
   * Returns a simple string representation of the interrupt
   * @returns {string} String representation
   */
  toString() {
    return `[${this.source}/${this.type}] ${this.reason}`;
  }

  /**
   * Creates an interrupt record from a Markdown string
   * @param {string} markdown - Markdown representation of the interrupt
   * @returns {InterruptRecord} The parsed interrupt record
   */
  static fromMarkdown(markdown) {
    const record = {
      source: '',
      type: '',
      reason: '',
      context: {
        lastOutput: '',
        streamState: ''
      },
      additionalData: {}
    };

    // Extract DateTime
    const dateTimeMatch = markdown.match(/- DateTime: (.+)/);
    if (dateTimeMatch) {
      record.dateTime = dateTimeMatch[1].trim();
    }

    // Extract Source
    const sourceMatch = markdown.match(/- Source: (.+)/);
    if (sourceMatch) {
      record.source = sourceMatch[1].trim();
    }

    // Extract Type
    const typeMatch = markdown.match(/- Type: (.+)/);
    if (typeMatch) {
      record.type = typeMatch[1].trim();
    }

    // Extract Reason
    const reasonMatch = markdown.match(/- Reason: (.+)/);
    if (reasonMatch) {
      record.reason = reasonMatch[1].trim();
    }

    // Extract Context
    const lastOutputMatch = markdown.match(/  - Last Output: (.+)/);
    if (lastOutputMatch) {
      record.context.lastOutput = lastOutputMatch[1].trim();
    }

    const streamStateMatch = markdown.match(/  - Stream State: (.+)/);
    if (streamStateMatch) {
      record.context.streamState = streamStateMatch[1].trim();
    }

    // Create and return new instance
    const instance = new InterruptRecord(record);
    if (record.dateTime) {
      instance.dateTime = record.dateTime;
    }
    
    return instance;
  }
}

/**
 * Creates an internal interrupt record
 * @param {Object} options - Interrupt record options
 * @returns {InterruptRecord} The created interrupt record
 */
export function createInternalInterrupt(options) {
  return new InterruptRecord({
    source: 'Internal',
    ...options
  });
}

/**
 * Creates an external interrupt record
 * @param {Object} options - Interrupt record options
 * @returns {InterruptRecord} The created interrupt record
 */
export function createExternalInterrupt(options) {
  return new InterruptRecord({
    source: 'External',
    ...options
  });
}

/**
 * Creates a time-based interrupt record
 * @param {Object} options - Interrupt record options
 * @returns {InterruptRecord} The created interrupt record
 */
export function createTimeInterrupt(options) {
  return createInternalInterrupt({
    type: 'Time-Based',
    ...options
  });
}

/**
 * Creates a token-based interrupt record
 * @param {Object} options - Interrupt record options
 * @returns {InterruptRecord} The created interrupt record
 */
export function createTokenInterrupt(options) {
  return createInternalInterrupt({
    type: 'Token-Based',
    ...options
  });
} 