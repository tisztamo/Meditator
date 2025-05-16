import { MBaseComponent } from "./mBaseComponent.js";
import { logger } from '../infrastructure/logger.js';
import { InterruptRecord } from '../infrastructure/interruptRecord.js';
import { createStateManager } from '../infrastructure/interruptState.js';

const log = logger('mTokenMonitor.js');

/**
 * Token analysis modes for different processing granularity
 * @enum {string}
 */
const TokenAnalysisMode = {
  SINGLE: 'single',    // Process each token individually
  BATCH: 'batch',      // Process tokens in batches
  HYBRID: 'hybrid'     // Use a sliding window approach
};

/**
 * Pattern types that can be detected in token streams
 * @enum {string}
 */
const PatternType = {
  REPETITION: 'repetition',
  DIGRESSION: 'digression',
  CONFUSION: 'confusion',
  HALTED: 'halted',
  KEYWORD: 'keyword'
};

/**
 * Token-based interrupt generator that monitors the token stream
 * and generates interrupts based on content analysis.
 * Uses partial/full state system with proper state chain.
 * 
 * @interface
 * Attributes:
 *   - src: Source stream to monitor (defaults to "/stream/chunk")
 *   - maxBufferSize: Maximum size of token buffer (defaults to 500)
 *   - name: Identifier for this monitor (required for state management)
 *   - model: Optional model to use for analyzing content
 *   - fullStateInterval: Number of partial states before saving a full state (defaults to 10)
 * 
 * Events dispatched:
 *   - "interrupt-request": Bubbling event requesting an interrupt
 */
export class MTokenMonitor extends MBaseComponent {
  tokenBuffer = [];
  tokenHistory = [];
  lastTokens = [];
  patternMetrics = {};
  analysisMode = TokenAnalysisMode.HYBRID;
  batchSize = 10;
  windowSize = 100;
  detectedPatterns = {};
  totalTokensProcessed = 0;
  keywords = [];
  slideWindow = 3; // For hybrid mode, how many tokens to slide
  
  // State management
  partialStateCount = 0;
  fullStateInterval = 10;
  stateManager = null;
  lastInterruptTime = 0;
  lastSaveTime = 0;
  
  // Rate limiting
  lastPublishTime = 0;
  publishCooldown = 3000; // ms

  /**
   * Sets up the token monitor on component connection
   */
  onConnect() {
    this.maxBufferSize = Number(this.attr("maxBufferSize") || 500);
    this.fullStateInterval = Number(this.attr("fullStateInterval") || 10);
    this.stateManager = createStateManager(`token-monitor-${this.attr("name") || "default"}`);
    
    // Load previous state if available
    this.loadState().then(() => {
      log.debug(`Token monitor state loaded for ${this.attr("name")}`);
    });
    
    // Subscribe to token stream
    this.sub(this.attr("src") || "/stream/chunk", this["[src]"]);
  }
  
  /**
   * Handles new tokens from the stream
   * @param {string} chunk - The new token/chunk
   */
  "[src]" = async (chunk) => {
    // Add to buffer and limit size
    this.tokenBuffer.push(chunk);
    if (this.tokenBuffer.length > this.maxBufferSize) {
      this.tokenBuffer.shift();
    }
    
    // Analyze content and potentially generate interrupt
    await this.analyzeContent();
  }
  
  /**
   * Analyzes the token buffer content and may generate an interrupt
   * This uses both rule-based checks and LLM processing when configured
   */
  async analyzeContent() {
    const content = this.tokenBuffer.join("");
    
    // First, apply simple rule-based checks
    const ruleTriggered = await this.performRuleChecks(content);
    if (ruleTriggered) {
      await this.generateInterrupt(ruleTriggered);
      return;
    }
    
    // If model is specified, use LLM analysis
    if (this.attr("model")) {
      const llmTriggered = await this.performLLMAnalysis(content);
      if (llmTriggered) {
        await this.generateInterrupt(llmTriggered);
      }
    }
  }
  
  /**
   * Performs rule-based checks on content
   * @param {string} content - The content to check
   * @returns {string|null} Reason for interrupt or null if not triggered
   */
  async performRuleChecks(content) {
    // Load rules from state
    const meta = await this.stateManager.loadMeta();
    const rules = meta.rules || [];
    
    // Apply custom rules if defined in metadata
    for (const rule of rules) {
      try {
        if (rule.type === 'regex' && rule.pattern) {
          const regex = new RegExp(rule.pattern, rule.flags || '');
          if (regex.test(content)) {
            return `Rule trigger: ${rule.name || 'Unnamed rule'} - ${rule.description || 'Pattern match'}`;
          }
        } else if (rule.type === 'keyword' && rule.keywords) {
          const keywords = Array.isArray(rule.keywords) ? rule.keywords : [rule.keywords];
          for (const keyword of keywords) {
            if (content.includes(keyword)) {
              return `Keyword trigger: "${keyword}" detected - ${rule.description || 'Keyword match'}`;
            }
          }
        }
      } catch (error) {
        log.error(`Error applying rule ${rule.name || 'unknown'}:`, error);
      }
    }
    
    return null;
  }
  
  /**
   * Performs LLM analysis on content
   * @param {string} content - The content to analyze
   * @returns {string|null} Reason for interrupt or null if not triggered
   */
  async performLLMAnalysis(content) {
    try {
      const { createCompletion } = await import('../modelAccess/model.js');
      
      // Build analysis prompt
      const state = await this.stateManager.loadState();
      const meta = await this.stateManager.loadMeta();
      
      // Get monitoring criteria from state or use defaults
      const criteria = meta.criteria || 'Detect content that needs intervention, changes topic abruptly, or contains problematic material.';
      
      const prompt = `Analyze this text and determine if an interrupt should be triggered:

Text to analyze:
${content}

Previous state context:
${state}

Monitoring criteria:
${criteria}

If an interrupt should be triggered, respond with "INTERRUPT: <reason>".
If no interrupt is needed, respond with "CONTINUE".`;

      const result = await createCompletion(prompt, this.attr("model"));
      
      if (result.startsWith('INTERRUPT:')) {
        return result.substring('INTERRUPT:'.length).trim();
      }
      
      return null;
    } catch (error) {
      log.error('Error in LLM analysis:', error);
      return null;
    }
  }
  
  /**
   * Generates and dispatches an interrupt
   * @param {string} reason - The reason for the interrupt
   */
  async generateInterrupt(reason) {
    // Create structured interrupt record
    const interrupt = new InterruptRecord({
      source: 'Internal',
      type: 'TokenMonitor',
      reason: reason,
      context: {
        lastOutput: this.tokenBuffer.join(""),
        streamState: 'active'
      }
    });
    
    log.debug(`Token monitor generating interrupt: ${reason}`);
    
    // Save state with information about this interrupt - this is a significant event, save as full state
    await this.saveState(true);
    
    // Dispatch interrupt request event
    this.dispatchEvent(new CustomEvent("interrupt-request", {
      bubbles: true,
      detail: interrupt.toMarkdown()
    }));
  }
  
  /**
   * Loads and initializes state
   */
  async loadState() {
    try {
      // Load metadata to get the partial state count
      const meta = await this.stateManager.loadMeta();
      this.partialStateCount = meta.partialStateCount || 0;
      
      // State content will be loaded on demand by the state manager
      log.debug(`Token monitor initialized with partial state count: ${this.partialStateCount}`);
    } catch (error) {
      log.error('Error loading token monitor state:', error);
    }
  }
  
  /**
   * Saves state with interrupt information
   * @param {boolean} forceFull - Force saving as a full state
   */
  async saveState(forceFull = false) {
    try {
      // Avoid saving too frequently (at most once every 3 seconds)
      const now = Date.now();
      if (now - this.lastSaveTime < 3000 && !forceFull) {
        return;
      }
      this.lastSaveTime = now;
      
      // Increment partial state counter
      this.partialStateCount++;
      
      // Determine if this should be a full state
      const isFullState = forceFull || (this.partialStateCount >= this.fullStateInterval);
      if (isFullState) {
        this.partialStateCount = 0;
      }
      
      // Prepare metadata
      const metadata = {
        totalTokensProcessed: this.totalTokensProcessed,
        lastInterruptTime: this.lastInterruptTime,
        partialStateCount: this.partialStateCount,
        lastSaveTime: now,
        isFullState: isFullState
      };
      
      // Create state content
      const state = `# Token Monitor State
      
Last updated: ${new Date(now).toISOString()}

## Token History
\`\`\`
${JSON.stringify(this.tokenHistory.slice(-this.windowSize))}
\`\`\`

## Pattern Metrics
\`\`\`
${JSON.stringify(this.patternMetrics, null, 2)}
\`\`\`

## Detected Patterns
\`\`\`
${JSON.stringify(this.detectedPatterns, null, 2)}
\`\`\`

## Metadata
\`\`\`
${JSON.stringify(metadata, null, 2)}
\`\`\`
`;
      
      // Save state
      await this.stateManager.update(state, metadata, isFullState);
      
      log.debug(`Saved ${isFullState ? 'full' : 'partial'} state for token monitor ${this.attr("name") || "default"}`);
    } catch (error) {
      log.error('Error saving token monitor state:', error);
    }
  }
  
  /**
   * Gets the state history
   * @returns {Promise<Array>} Array of state objects
   */
  async getStateHistory() {
    try {
      return await this.stateManager.getStateHistory();
    } catch (error) {
      log.error('Error getting state history:', error);
      return [];
    }
  }
}

// Register the custom element
customElements.define('m-token-monitor', MTokenMonitor); 