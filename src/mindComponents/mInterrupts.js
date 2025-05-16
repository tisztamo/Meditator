import {MBaseComponent} from "./mBaseComponent.js"
import { logger } from '../infrastructure/logger.js';
import { InterruptRecord } from '../infrastructure/interruptRecord.js';
import { createStateManager } from '../infrastructure/interruptState.js';

const log = logger('mInterrupts.js');

/**
 * Pipeline stages for interrupt processing
 * @enum {string}
 */
const PipelineStage = {
  RECEPTION: 'reception',
  ANALYSIS: 'analysis',
  PLANNING: 'planning',
  EXECUTION: 'execution'
};

/**
 * Response strategies for interrupts
 * @enum {string}
 */
const ResponseStrategy = {
  RESUME: 'resume',        // Resume current stream
  TERMINATE: 'terminate'   // Terminate stream
};

/**
 * Manages interrupt requests and implements rate limiting for interruptions.
 * Acts as an intermediary that can validate interrupt requests and process them 
 * through a multi-step LLM pipeline as described in the architecture.
 * 
 * @interface
 * Event listeners:
 *   - "interrupt-request": Receives and processes interrupt requests
 * 
 * Attributes:
 *   - model: Optional model to use for processing interrupts
 *   - analysis-model: Optional model for analysis stage (defaults to model)
 *   - planning-model: Optional model for planning stage (defaults to model)
 *   - rateLimit: Optional rate limit in milliseconds (defaults to 0 - no limit)
 *   - statePrefix: Optional prefix for state storage (defaults to "interrupt-handler")
 * 
 * Topics published to:
 *   - Value from the interrupt: Published when interrupt is approved
 *   - "pipeline-stage": Published during pipeline progression
 *   - "resume": Published when a resume strategy is chosen
 *   - "terminate": Published when stream should be terminated
 *   - "new-prompt": Published when a new prompt is generated
 *   - "update-kb": Published when knowledge base updates are required
 * 
 * Events dispatched:
 *   - "interrupt": Broadcasts approved interruptions
 */
export class MInterrupts extends MBaseComponent {
    lastInterruptTime = 0;
    rateLimit = 0;
    processing = false;
    pendingInterrupts = [];
    currentPipelineStage = null;
    stateManager = null;
    processingHistory = [];

    /**
     * Sets up the component on connection
     */
    onConnect() {
        this.rateLimit = Number(this.attr("rateLimit") || 0);
        log.debug(`Interrupt manager initialized with rate limit: ${this.rateLimit}ms`);
        
        // Initialize state manager for storing interrupt processing history
        const statePrefix = this.attr("statePrefix") || "interrupt-handler";
        this.stateManager = createStateManager(statePrefix);
        
        // Load processing history from state
        this.loadState().then(() => {
            log.debug(`Loaded interrupt processing history: ${this.processingHistory.length} entries`);
        });
    }
    
    /**
     * Loads state from storage
     */
    async loadState() {
        try {
            const state = await this.stateManager.loadState();
            
            // Parse processing history if available
            if (state && state.includes('## Processing History')) {
                const historyMatch = state.match(/## Processing History\n([\s\S]+?)(?=\n##|$)/);
                if (historyMatch) {
                    // Simple parsing of history entries
                    const historySection = historyMatch[1];
                    const entries = historySection.split(/\n- /).filter(Boolean);
                    
                    this.processingHistory = entries.map(entry => {
                        const dateMatch = entry.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
                        const strategyMatch = entry.match(/Strategy: ([A-Z_]+)/);
                        
                        return {
                            timestamp: dateMatch ? dateMatch[1] : null,
                            strategy: strategyMatch ? strategyMatch[1] : null,
                            summary: entry
                        };
                    });
                }
            }
        } catch (error) {
            log.error("Error loading interrupt handler state:", error);
        }
    }
    
    /**
     * Saves state with processing information
     * @param {InterruptRecord} interrupt - The processed interrupt
     * @param {string} strategy - The chosen response strategy
     * @param {Object} analysisResults - Results from the analysis stage
     */
    async saveState(interrupt, strategy, analysisResults) {
        try {
            // Add to processing history
            const historyEntry = {
                timestamp: new Date().toISOString(),
                interruptType: interrupt.type,
                source: interrupt.source,
                strategy: strategy,
                summary: `${new Date().toISOString()} - ${interrupt.source}/${interrupt.type} - Strategy: ${strategy}`
            };
            
            // Keep history limited to most recent entries
            this.processingHistory.unshift(historyEntry);
            if (this.processingHistory.length > 50) {
                this.processingHistory = this.processingHistory.slice(0, 50);
            }
            
            // Create state with processing history
            const state = `# Interrupt Handler State
            
Last updated: ${new Date().toISOString()}

## Processing History
${this.processingHistory.map(entry => `- ${entry.summary}`).join('\n')}

## Last Processed Interrupt
${interrupt.toMarkdown()}

## Analysis Results
${JSON.stringify(analysisResults, null, 2)}
`;
            
            // Determine if this should be a full state (every 10 interrupts)
            const isFullState = this.processingHistory.length % 10 === 0;
            
            // Save state
            const meta = {
                lastInterruptTime: historyEntry.timestamp,
                totalProcessed: this.processingHistory.length,
                lastStrategy: strategy
            };
            
            await this.stateManager.update(state, meta, isFullState);
        } catch (error) {
            log.error("Error saving interrupt handler state:", error);
        }
    }

    /**
     * Handles interrupt request events
     * Processes through LLM pipeline if needed and validates before approval
     * 
     * @param {CustomEvent} e - The interrupt request event
     */
    "@interrupt-request" = async e => {
        // Parse the interrupt from markdown or create a basic one if needed
        let interrupt;
        
        if (typeof e.detail === 'string' && e.detail.includes('## Interrupt Record')) {
            // This is a properly formatted interrupt record in markdown
            interrupt = InterruptRecord.fromMarkdown(e.detail);
            log.debug("\x1b[31mStructured interrupt received:", interrupt, '\x1b[0m');
        } else {
            // Create a basic interrupt for backward compatibility
            interrupt = new InterruptRecord({
                source: 'External',
                type: 'Basic',
                reason: e.detail,
                context: {
                    lastOutput: '',
                    streamState: 'active'
                }
            });
            log.debug("\x1b[31mBasic interrupt created from:", e.detail, '\x1b[0m');
        }

        // Check rate limit
        if (this.checkRateLimit(interrupt)) {
            log.debug("\x1b[31mRate limit exceeded, canceling interrupt\x1b[0m");
            e.preventDefault();
            return;
        }

        // Add to pending queue if already processing
        if (this.processing) {
            log.debug("\x1b[31mAlready processing an interrupt, queuing new one\x1b[0m");
            this.pendingInterrupts.push(interrupt);
            return;
        }

        // First, dispatch the interrupt event to pause the stream
        this.dispatchEvent(new CustomEvent("interrupt", {
            bubbles: true,
            detail: interrupt.toMarkdown()
        }));

        // Then process the interrupt through the pipeline
        await this.processInterruptPipeline(interrupt);
    }

    /**
     * Processes an interrupt through the multi-step LLM pipeline
     * @param {InterruptRecord} interrupt - The interrupt to process
     */
    async processInterruptPipeline(interrupt) {
        try {
            this.processing = true;
            this.lastInterruptTime = Date.now();
            
            // Stage 1: Reception
            this._changePipelineStage(PipelineStage.RECEPTION);
            const validatedInterrupt = await this.stageReception(interrupt);
            
            // Stage 2: Analysis
            this._changePipelineStage(PipelineStage.ANALYSIS);
            const analysisResults = await this.stageAnalysis(validatedInterrupt);
            
            // Stage 3: Planning
            this._changePipelineStage(PipelineStage.PLANNING);
            const { 
                strategy, 
                enhancedInterrupt,
                newPrompt,
                kbUpdates
            } = await this.stagePlanning(validatedInterrupt, analysisResults);
            
            // Stage 4: Execution
            this._changePipelineStage(PipelineStage.EXECUTION);
            await this.stageExecution(enhancedInterrupt, strategy, newPrompt, kbUpdates);
            
            // Save state after successful processing
            await this.saveState(enhancedInterrupt, strategy, analysisResults);
            
            log.debug("\x1b[31mInterrupt successfully processed through pipeline\x1b[0m");
        } catch (error) {
            log.error("Error in interrupt pipeline:", error);
            
            // Fallback to basic processing if pipeline fails
            this.fallbackProcessing(interrupt);
        } finally {
            this.processing = false;
            this.currentPipelineStage = null;
            
            // Process next interrupt in queue if any
            if (this.pendingInterrupts.length > 0) {
                const nextInterrupt = this.pendingInterrupts.shift();
                setTimeout(() => this.processInterruptPipeline(nextInterrupt), 0);
            }
        }
    }
    
    /**
     * Updates the current pipeline stage and publishes it
     * @param {string} stage - The new pipeline stage
     * @private
     */
    _changePipelineStage(stage) {
        this.currentPipelineStage = stage;
        log.debug(`Pipeline stage: ${stage}`);
        
        // Publish the pipeline stage change
        this.pub("pipeline-stage", {
            stage,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Reception stage: Validates and enhances the interrupt
     * @param {InterruptRecord} interrupt - The original interrupt
     * @returns {InterruptRecord} Validated interrupt
     * @private
     */
    async stageReception(interrupt) {
        log.debug("Pipeline stage - Reception: Validating interrupt");
        
        // Validate interrupt structure
        if (!interrupt.source || !interrupt.type) {
            log.warn("Invalid interrupt missing required fields");
            throw new Error("Invalid interrupt structure");
        }
        
        // Add reception metadata
        const enhanced = { ...interrupt };
        enhanced.additionalData = {
            ...enhanced.additionalData,
            reception: {
                timestamp: new Date().toISOString(),
                processingPipeline: "multi-step"
            }
        };
        
        return enhanced;
    }
    
    /**
     * Analysis stage: Analyzes the interrupt using LLM
     * @param {InterruptRecord} interrupt - The validated interrupt
     * @returns {Object} Analysis results
     * @private
     */
    async stageAnalysis(interrupt) {
        log.debug("Pipeline stage - Analysis: Analyzing interrupt content");
        
        try {
            const { createCompletion } = await import('../modelAccess/model.js');
            
            // Use specialized analysis model if specified
            const analysisModel = this.attr("analysis-model") || this.attr("model");
            if (!analysisModel) {
                // Skip LLM analysis if no model available
                return {
                    priority: interrupt.source === 'External' ? 'high' : 'medium',
                    relevance: 'unknown',
                    needsNewPrompt: true,
                    needsKnowledgeBaseUpdate: false,
                    shouldResume: false,
                    context: 'limited'
                };
            }
            
            // Create a specialized analysis prompt
            const prompt = `You are the analysis component in a multi-step interrupt processing pipeline.
Your task is to analyze this interrupt and determine its characteristics.

## Interrupt Details
${interrupt.toMarkdown()}

Analyze this interrupt and provide a structured assessment with the following format:

## Analysis Results
- priority: [high|medium|low]
- relevance: [high|medium|low]
- needsNewPrompt: [true|false]
- needsKnowledgeBaseUpdate: [true|false]
- shouldResume: [true|false]
- context: [sufficient|limited|none]
- summary: [brief assessment of the interrupt]
- recommendation: [initial recommendation for handling]`;

            // Get the LLM response
            const response = await createCompletion(prompt, analysisModel);
            
            // Parse the structured results
            const analysisResults = {};
            
            // Extract priority
            const priorityMatch = response.match(/- priority: (\w+)/);
            if (priorityMatch) analysisResults.priority = priorityMatch[1].toLowerCase();
            
            // Extract relevance
            const relevanceMatch = response.match(/- relevance: (\w+)/);
            if (relevanceMatch) analysisResults.relevance = relevanceMatch[1].toLowerCase();
            
            // Extract needsNewPrompt
            const needsNewPromptMatch = response.match(/- needsNewPrompt: (true|false)/);
            if (needsNewPromptMatch) analysisResults.needsNewPrompt = needsNewPromptMatch[1] === 'true';
            
            // Extract needsKnowledgeBaseUpdate
            const needsKbUpdateMatch = response.match(/- needsKnowledgeBaseUpdate: (true|false)/);
            if (needsKbUpdateMatch) analysisResults.needsKnowledgeBaseUpdate = needsKbUpdateMatch[1] === 'true';
            
            // Extract shouldResume
            const shouldResumeMatch = response.match(/- shouldResume: (true|false)/);
            if (shouldResumeMatch) analysisResults.shouldResume = shouldResumeMatch[1] === 'true';
            
            // Extract context assessment
            const contextMatch = response.match(/- context: (\w+)/);
            if (contextMatch) analysisResults.context = contextMatch[1].toLowerCase();
            
            // Extract summary
            const summaryMatch = response.match(/- summary: (.+)/);
            if (summaryMatch) analysisResults.summary = summaryMatch[1].trim();
            
            // Extract recommendation
            const recMatch = response.match(/- recommendation: (.+)/);
            if (recMatch) analysisResults.recommendation = recMatch[1].trim();
            
            return analysisResults;
        } catch (error) {
            log.error("Error in analysis stage:", error);
            
            // Return basic analysis on failure
            return {
                priority: interrupt.source === 'External' ? 'high' : 'medium',
                relevance: 'unknown',
                needsNewPrompt: true,
                needsKnowledgeBaseUpdate: false,
                shouldResume: false,
                context: 'limited',
                error: error.message
            };
        }
    }
    
    /**
     * Planning stage: Determines response strategy and generates new prompt or KB updates if needed
     * @param {InterruptRecord} interrupt - The validated interrupt
     * @param {Object} analysisResults - Results from analysis stage
     * @returns {Object} Planning results with strategy, enhanced interrupt, and additional outputs
     * @private
     */
    async stagePlanning(interrupt, analysisResults) {
        log.debug("Pipeline stage - Planning: Determining response strategy");
        
        try {
            const { createCompletion } = await import('../modelAccess/model.js');
            
            // Use specialized planning model if specified
            const planningModel = this.attr("planning-model") || this.attr("model");
            if (!planningModel) {
                // Default strategy based on analysis without LLM
                const defaultStrategy = analysisResults.shouldResume ? 
                    ResponseStrategy.RESUME : ResponseStrategy.TERMINATE;
                
                return {
                    strategy: defaultStrategy,
                    enhancedInterrupt: interrupt,
                    newPrompt: analysisResults.needsNewPrompt ? "Continue based on the recent context." : null,
                    kbUpdates: null
                };
            }
            
            // Create planning prompt
            const prompt = `You are the planning component in a multi-step interrupt processing pipeline.
Based on the interrupt and analysis results, determine the optimal response strategy and provide additional outputs.

## Interrupt Details
${interrupt.toMarkdown()}

## Analysis Results
${Object.entries(analysisResults).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

You need to produce these outputs:
1. A response strategy (RESUME or TERMINATE)
2. A new prompt if needed
3. Knowledge base updates if needed

## Response Strategy
Choose one of these strategies:
- RESUME: Resume the current stream after handling the interrupt
- TERMINATE: Terminate the current stream completely

## Format your response as follows:

## Response Strategy
strategy: [RESUME|TERMINATE]

## New Prompt
[Only if a new prompt is needed, otherwise write 'None required']

## Knowledge Base Updates
[Only if KB updates are needed, otherwise write 'None required']

## Reasoning
[Your explanation for these choices]

## Enhanced Interrupt
[The original interrupt with any suggested modifications or enhancements]`;

            // Get the LLM response
            const response = await createCompletion(prompt, planningModel);
            
            // Parse the strategy
            const strategyMatch = response.match(/strategy: ([A-Z_]+)/);
            const strategy = strategyMatch ? strategyMatch[1] : ResponseStrategy.TERMINATE;
            
            // Parse new prompt if available
            const newPromptMatch = response.match(/## New Prompt\n([\s\S]+?)(?=\n##|$)/);
            let newPrompt = null;
            if (newPromptMatch && !newPromptMatch[1].includes('None required')) {
                newPrompt = newPromptMatch[1].trim();
            }
            
            // Parse KB updates if available
            const kbUpdatesMatch = response.match(/## Knowledge Base Updates\n([\s\S]+?)(?=\n##|$)/);
            let kbUpdates = null;
            if (kbUpdatesMatch && !kbUpdatesMatch[1].includes('None required')) {
                kbUpdates = kbUpdatesMatch[1].trim();
            }
            
            // Parse enhanced interrupt if available
            let enhancedInterrupt = interrupt;
            const enhancedMatch = response.match(/## Enhanced Interrupt\n([\s\S]+?)(?=\n##|$)/);
            
            if (enhancedMatch && enhancedMatch[1].includes('## Interrupt Record')) {
                try {
                    enhancedInterrupt = InterruptRecord.fromMarkdown(enhancedMatch[1]);
                } catch (error) {
                    log.warn("Failed to parse enhanced interrupt, using original");
                }
            }
            
            return {
                strategy,
                enhancedInterrupt,
                newPrompt,
                kbUpdates
            };
        } catch (error) {
            log.error("Error in planning stage:", error);
            
            // Default strategy on failure
            return {
                strategy: ResponseStrategy.TERMINATE,
                enhancedInterrupt: interrupt,
                newPrompt: "Continue with the prior context.",
                kbUpdates: null,
                error: error.message
            };
        }
    }
    
    /**
     * Execution stage: Executes the chosen strategy
     * @param {InterruptRecord} interrupt - The enhanced interrupt
     * @param {string} strategy - The chosen strategy
     * @param {string|null} newPrompt - New prompt if generated
     * @param {string|null} kbUpdates - Knowledge base updates if needed
     * @private
     */
    async stageExecution(interrupt, strategy, newPrompt, kbUpdates) {
        log.debug(`Pipeline stage - Execution: Executing strategy ${strategy}`);
        
        // Always publish the interrupt for awareness
        this.pub(interrupt.toMarkdown());
        
        // Execute the strategy
        switch (strategy) {
            case ResponseStrategy.RESUME:
                // Publish resume command
                this.pub("resume", {
                    timestamp: new Date().toISOString(),
                    interruptType: interrupt.type
                });
                break;
                
            case ResponseStrategy.TERMINATE:
                // Terminate the stream
                this.pub("terminate", {
                    timestamp: new Date().toISOString(),
                    reason: interrupt.reason
                });
                break;
                
            default:
                // Unknown strategy, fall back to terminate
                log.warn(`Unknown strategy ${strategy}, falling back to terminate`);
                this.pub("terminate", {
                    timestamp: new Date().toISOString(),
                    reason: "Unknown strategy - defaulting to terminate"
                });
                break;
        }
        
        // Publish new prompt if available
        if (newPrompt) {
            this.pub("new-prompt", {
                prompt: newPrompt,
                timestamp: new Date().toISOString(),
                interruptType: interrupt.type
            });
        }
        
        // Publish KB updates if available
        if (kbUpdates) {
            this.pub("update-kb", {
                updates: kbUpdates,
                timestamp: new Date().toISOString(),
                interruptType: interrupt.type
            });
        }
    }
    
    /**
     * Fallback processing when pipeline fails
     * @param {InterruptRecord} interrupt - The original interrupt
     * @private
     */
    async fallbackProcessing(interrupt) {
        log.warn("Using fallback interrupt processing");
        
        // Default to terminate in fallback mode
        this.pub("terminate", {
            timestamp: new Date().toISOString(),
            reason: "Fallback processing due to pipeline failure"
        });
        
        // Generate a basic prompt
        this.pub("new-prompt", {
            prompt: "Continue based on recent context and the interrupt that occurred.",
            timestamp: new Date().toISOString(),
            interruptType: interrupt.type
        });
    }

    /**
     * Checks if the interrupt exceeds rate limits
     * 
     * @param {InterruptRecord} interrupt - The interrupt to check
     * @returns {boolean} True if rate limit exceeded, false otherwise
     */
    checkRateLimit(interrupt) {
        if (this.rateLimit <= 0) {
            return false; // No rate limiting
        }
        
        const timeSinceLastInterrupt = Date.now() - this.lastInterruptTime;
        
        // Allow user-command or urgent interrupts to bypass rate limiting
        if (interrupt.type === 'User-Command' || interrupt.type === 'Urgent') {
            return false;
        }
        
        return timeSinceLastInterrupt < this.rateLimit;
    }
    
    /**
     * Gets information about the current pipeline state
     * @returns {Object} Pipeline state information
     */
    getPipelineState() {
        return {
            isProcessing: this.processing,
            currentStage: this.currentPipelineStage,
            pendingCount: this.pendingInterrupts.length,
            lastInterruptTime: this.lastInterruptTime ? new Date(this.lastInterruptTime) : null,
            processingHistoryLength: this.processingHistory.length
        };
    }
}