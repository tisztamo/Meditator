import {MBaseComponent} from "./mBaseComponent.js"
import { logger } from '../infrastructure/logger.js';
import { InterruptRecord } from '../infrastructure/interruptRecord.js';

const log = logger('mMind.js');

/**
 * Core mind component that handles interrupts and manages thought history.
 * Updated to process structured interrupt records through an LLM pipeline
 * and handle the simplified interrupt system with INTERRUPTED state.
 * 
 * @interface
 * Event listeners:
 *   - "interrupt": Handles interruption events
 *   - "new-prompt": Handles new prompts generated from interrupt processing
 *   - "update-kb": Handles knowledge base update requests
 * 
 * Attributes:
 *   - model: Optional model to use for processing interrupts
 * 
 * Topics published to:
 *   - "prompt": Published when new prompt is generated after an interrupt
 * 
 * Children components:
 *   - m-stream: Used to access the chunk history
 */
export class MMind extends MBaseComponent {
    /**
     * Sets up the component on connection
     */
    onConnect() {
        // Subscribe to additional events
        this.sub("@new-prompt", this["@new-prompt"]);
        this.sub("@update-kb", this["@update-kb"]);
    }

    /**
     * Handler for interrupt events
     * Processes the structured interrupt
     * 
     * @param {CustomEvent} e - The interrupt event with details about the interruption cause
     */
    "@interrupt" = async e => {
        log.debug("\x1b[31mInterrupt received in m-mind\x1b[0m");

        // Parse the interrupt from markdown or use as raw string
        let interrupt;
        
        if (typeof e.detail === 'string' && e.detail.includes('## Interrupt Record')) {
            // This is a properly formatted interrupt record in markdown
            interrupt = InterruptRecord.fromMarkdown(e.detail);
            log.debug("\x1b[31mProcessing structured interrupt:", interrupt, '\x1b[0m');
        } else {
            // Treat as legacy format - plain string
            interrupt = {
                reason: e.detail,
                source: 'Unknown',
                type: 'Unknown',
                context: { lastOutput: '', streamState: '' }
            };
            log.debug("\x1b[31mProcessing legacy interrupt format\x1b[0m");
        }

        // Note: We don't generate a new prompt here anymore.
        // Instead, we wait for @new-prompt events from the interrupt handler
    }
    
    /**
     * Handler for new prompt events from the interrupt handler
     * @param {CustomEvent} e - The new prompt event
     */
    "@new-prompt" = e => {
        if (!e.detail || !e.detail.prompt) {
            log.warn("Received new-prompt event without prompt content");
            return;
        }

        const newPrompt = e.detail.prompt;
        log.debug("\x1b[31mReceived new prompt from interrupt handler\x1b[0m");
        
        // Process through LLM pipeline if model is specified
        if (this.attr("model")) {
            this.enhancePromptWithLLM(newPrompt);
        } else {
            // Publish the new prompt directly
            this.pub("prompt", newPrompt);
        }
    }
    
    /**
     * Handler for knowledge base update events
     * @param {CustomEvent} e - The update-kb event
     */
    "@update-kb" = e => {
        if (!e.detail || !e.detail.updates) {
            log.warn("Received update-kb event without update content");
            return;
        }

        const updates = e.detail.updates;
        log.debug("\x1b[31mReceived KB update request\x1b[0m");
        
        // Here you would implement KB update logic
        // For now, we just log it
        log.debug("Knowledge base update requested:", updates);
    }
    
    /**
     * Enhances a prompt through the LLM pipeline
     * @param {string} basePrompt - The base prompt to enhance
     */
    async enhancePromptWithLLM(basePrompt) {
        try {
            const { createCompletion } = await import('../modelAccess/model.js');
            
            const recentHistory = this.getRecentHistory();
            
            // Build a prompt that follows the architecture design 
            const prompt = `You are a prompt enhancer in a continuous stream of consciousness system.
A stream has been interrupted and a new prompt has been suggested.
Your task is to enhance this prompt to create a natural continuation.

## Original Prompt
${this.getPrompt()}

## History Context
${await this.getPrompt("history")}

## Recent Stream
${recentHistory.join("")}

## Suggested New Prompt
${basePrompt}

Your task is to enhance this prompt to create a natural continuation.
Output only the enhanced prompt.`;

            // Get LLM response
            const enhancedPrompt = await createCompletion(prompt, this.attr("model"));
            
            // Publish the enhanced prompt
            this.pub("prompt", enhancedPrompt);
            log.debug("\x1b[31mGenerated enhanced prompt through LLM pipeline\x1b[0m");
        } catch (error) {
            log.error("Error in LLM pipeline:", error);
            
            // Fallback to using the original prompt
            this.pub("prompt", basePrompt);
            log.debug("\x1b[31mFell back to original prompt due to error\x1b[0m");
        }
    }

   /**
    * Retrieves recent history from the m-stream component
    * 
    * @param {number} maxChars - Maximum number of characters to retrieve from history
    * @returns {string[]} Array of recent history chunks
    */
   getRecentHistory(maxChars = 1000) {
        const streamEl = this.querySelector('m-stream')
        if (!streamEl) {
            log.error("No m-stream found in m-mind")
            return ["Error: No m-stream found in m-mind"]
        }
        let totalLength = 0
        let startIndex = streamEl.chunkHistory.length - 1
        
        // Work backwards through chunks until we have enough chars or reach the start
        while (startIndex >= 0 && totalLength < maxChars) {
            totalLength += streamEl.chunkHistory[startIndex].length
            startIndex--
        }
        
        // Adjust startIndex to include the chunk that put us over maxChars
        startIndex = Math.max(0, startIndex + 1)
        
        return streamEl.chunkHistory.slice(startIndex)
    }
}