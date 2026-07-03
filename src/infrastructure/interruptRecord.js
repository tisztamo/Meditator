import { logger } from './logger.js';

const log = logger('interruptRecord.js');

/**
 * How an external human voice is framed for the attention frame, per language: a
 * mind that thinks in Hungarian should hear "Margit azt mondja: …", not an English
 * "says". Keyed by the mind's ambient `lang` (the lang="…" on <m-mind>, stamped onto
 * the record where the voice enters — see mWs/mConsole). `say` is the third-person
 * "says" used for both a named speaker and the unknown-speaker case; `who` is the
 * indefinite "someone". Any language not listed falls back to English, so a mind in
 * an unlisted language is framed exactly as before — never broken, just English.
 */
const VOICE_FRAMING = {
  en: { say: "says",       who: "Someone"   },
  hu: { say: "azt mondja", who: "Valaki"    },
  de: { say: "sagt",       who: "Jemand"    },
  fr: { say: "dit",        who: "Quelqu'un" },
  es: { say: "dice",       who: "Alguien"   },
  it: { say: "dice",       who: "Qualcuno"  },
  pt: { say: "diz",        who: "Alguém"    },
  nl: { say: "zegt",       who: "Iemand"    },
  pl: { say: "mówi",       who: "Ktoś"      },
  ru: { say: "говорит",    who: "Кто-то"    },
  sv: { say: "säger",      who: "Någon"     },
  ro: { say: "spune",      who: "Cineva"    },
  cs: { say: "říká",       who: "Někdo"     },
};

/** The voice framing for a lang tag ("hu", "hu-HU", "HU"), matched on the primary
 *  subtag; English for anything unlisted, empty, or null. */
export function voiceFraming(lang) {
  const key = String(lang || "").trim().toLowerCase().split(/[-_]/)[0];
  return VOICE_FRAMING[key] || VOICE_FRAMING.en;
}

/**
 * Appends perceived stimuli to a stretch of the stream, rendered exactly as the
 * journal (and Studio) render them — a `> ⟂ …` block at the point where they
 * reached the mind: AFTER its last words, because that is when they entered the
 * thinking, not somewhere earlier.
 *
 * This is THE one rendering of perception in the stream record. m-mind uses it to
 * compose the burst's prefill (tail + what just arrived) and m-memory uses it to
 * append the same events to the durable tail — both through this function, so the
 * prompt the model continues, the tail it wakes from, and the journal a human reads
 * never drift apart. Pure, so it is unit-testable without a mind.
 *
 * The block ends with a blank line: the continuation starts as fresh prose after
 * the event, free to take it up or to abandon the interrupted sentence above it.
 *
 * @param {string} text   the stream so far (may be empty — a freshly-born mind)
 * @param {string[]} lines rendered stimulus lines (renderForFrame output)
 * @returns {string}
 */
export function withPerceivedEvents(text, lines) {
  if (!Array.isArray(lines) || !lines.length) return text || "";
  const block = lines.map(l => `> ⟂ ${l}`).join("\n\n");
  const base = (text || "").replace(/\s+$/, "");
  return base ? `${base}\n\n${block}\n\n` : `${block}\n\n`;
}

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
    from = null,
    lang = null,
    salience,
    urgent = false,
    suggestion = null,
    clearsTail = false,
    settle = null,
    episode = null,
    kind = null,
    context = {},
    additionalData = {}
  }) {
    this.dateTime = new Date().toISOString();
    this.source = source;
    this.type = type;
    this.reason = reason;
    // For an external human voice: who is speaking, when known (the mind's
    // companion — see m-mind's interlocutor). Left as raw words in `reason`;
    // `from` only decides how renderForFrame() attributes the voice.
    this.from = (from && String(from).trim()) || null;
    // The mind's ambient language (the lang="…" on <m-mind>), so the voice is
    // framed in the language the mind thinks in — see renderForFrame / VOICE_FRAMING.
    this.lang = (lang && String(lang).trim()) || null;
    this.salience = typeof salience === 'number' ? Math.max(0, Math.min(1, salience)) : 0.5;
    this.urgent = !!urgent;
    this.suggestion = suggestion;
    // Loop-break properties (loop-detection-redesign.md §contracts·2). A `clearsTail`
    // bid asks the mind to start fresh if it wins: the arbiter ADMITS it past
    // threshold + rate-limit (so co-bidding breakers compete by salience) but does NOT
    // preempt the running burst the way `urgent` does — a confirmed loop is always
    // heard, but it is not a now-now interruption. `settle` is an optional one-off pause
    // (ms or a time string) the mind honours as a beat of quiet around the reset;
    // `episode` ties co-bids to one detection so the mind cuts exactly once; `kind` is
    // the loop's named flavour (presence | void | spam | …), passed on to the cut.
    this.clearsTail = !!clearsTail;
    this.settle = settle;
    this.episode = episode;
    this.kind = (kind && String(kind).trim()) || null;
    this.context = {
      lastOutput: context.lastOutput || '',
      streamState: context.streamState || 'unknown'
    };
    this.additionalData = additionalData;
  }

  /**
   * Renders the interrupt as a short first-person stimulus line for the
   * attention frame — what the mind experiences, not a bureaucratic record.
   *
   * For an external human voice (`UserInput` / `ConsoleInput`), wraps the raw
   * `reason` in narrative framing so the model perceives it as someone
   * speaking, in the mind's own language (`lang`). When the speaker is known
   * (`from`, the mind's companion) the voice is attributed by name — a known
   * person, not an unsettling source from nowhere; otherwise it falls back to
   * the language's "someone says". The raw `reason` remains unadorned on the
   * record itself, so UI consumers can display the user's actual words without
   * the internal narrative wrapper.
   * @returns {string}
   */
  renderForFrame() {
    let text = this.reason;
    if (this.type === 'UserInput' || this.type === 'ConsoleInput' || this.type === 'Peer') {
      // A human voice (UserInput/ConsoleInput) or another mind overheard in the same
      // society (Peer, raised by m-ear) is experienced the same way: as someone
      // speaking, attributed by name when known (`from`), in the mind's own language.
      const f = voiceFraming(this.lang);
      const speaker = this.from || f.who;
      text = `${speaker} ${f.say}: "${this.reason}"`;
    }
    const parts = [text];
    if (this.suggestion) parts.push(this.suggestion);
    return parts.join(' ');
  }

  /**
   * Coerces event detail of any supported shape (InterruptRecord, plain object,
   * legacy markdown string, plain string) into an InterruptRecord.
   * @param {*} detail
   * @returns {InterruptRecord}
   */
  static coerce(detail) {
    if (detail instanceof InterruptRecord) return detail;
    if (typeof detail === 'string') {
      if (detail.includes('## Interrupt Record')) return InterruptRecord.fromMarkdown(detail);
      return new InterruptRecord({ source: 'External', type: 'Raw', reason: detail, urgent: true, salience: 1 });
    }
    if (detail && typeof detail === 'object') return new InterruptRecord(detail);
    return new InterruptRecord({ source: 'Unknown', type: 'Unknown', reason: String(detail) });
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