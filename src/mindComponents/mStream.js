import {MBaseComponent} from "./mBaseComponent.js"
import {createContinuationStream} from "../modelAccess/streamingModel.js"
import { logger } from '../infrastructure/logger.js';
import { InterruptRecord } from '../infrastructure/interruptRecord.js';

const log = logger('mStream.js');

/**
 * Stream states as defined in the architecture
 * @enum {string}
 */
const StreamState = {
  IDLE: 'idle',
  STARTING: 'starting',
  STREAMING: 'streaming',
  INTERRUPTED: 'interrupted',   // Stream is paused by an interrupt and can be resumed or terminated
  COMPLETED: 'completed',
  ERROR: 'error'
};

/**
 * Generates and manages a stream of text from a language model.
 * Must be a direct child of m-mind or another root-level mind component.
 * Implements the full state machine described in the architecture.
 * 
 * @interface
 * Attributes:
 *   - model: The model to use for streaming (defaults to "deepseek-chat")
 *   - resumable: Whether interrupts are resumable (defaults to "true")
 * 
 * Subscriptions:
 *   - "../prompt": Receives prompts from parent component
 *   - "../@interrupt": Handles interruption events
 *   - "../resume": Handles resume commands
 *   - "../terminate": Handles termination commands
 * 
 * Topics published to:
 *   - "chunk": Published when new content is received from the stream
 *   - "state": Published when stream state changes
 */
export class MStream extends MBaseComponent {
    currentStream = null
    chunkHistory = []
    streamState = StreamState.IDLE
    pausedText = ""
    pausedContext = null
    lastChunkTime = null
    isResumable = true
    
    /**
     * Sets up the component on connection
     */
    onConnect() {
      // Subscribe to additional commands
      this.sub("../resume", this["../resume"]);
      this.sub("../terminate", this["../terminate"]);
      this.isResumable = this.attr("resumable") !== "false"; // Default to true
    }
    
    /**
     * Changes the stream state and publishes the new state
     * @param {string} newState - The new state from StreamState enum
     * @private
     */
    _changeState(newState) {
      if (this.streamState === newState) return;
      
      const oldState = this.streamState;
      this.streamState = newState;
      
      log.debug(`Stream state changed: ${oldState} -> ${newState}`);
      
      // Publish state change
      this.pub("state", {
        oldState,
        newState,
        timestamp: new Date().toISOString()
      });
    }
    
    /**
     * Handles prompt events from parent component
     * Aborts any existing stream and creates a new one with the provided prompt
     * 
     * @param {string} prompt - The prompt to send to the model
     */
    "../prompt" = async prompt => {
        this.abortStream()
        this._changeState(StreamState.STARTING);
        await this.createStream(prompt)
        this._changeState(StreamState.STREAMING);
        this.processStream()
    }

    /**
     * Handles interrupt events from parent component
     * Changes stream state and manages the stream
     * 
     * @param {CustomEvent} e - The interrupt event
     */
    "../@interrupt" = e => {
        log.debug("\x1b[31mInterrupt received in m-stream\x1b[0m");
        
        // Parse the interrupt to determine how to handle it
        let interrupt;
        
        if (typeof e.detail === 'string' && e.detail.includes('## Interrupt Record')) {
            try {
                // Parse and update the interrupt record
                interrupt = InterruptRecord.fromMarkdown(e.detail);
                
                // Add context information
                interrupt.context.streamState = this.streamState;
                interrupt.context.lastOutput = this.getRecentOutput(500);
                
                // Replace the event detail with the updated record
                e.detail = interrupt.toMarkdown();
            } catch (error) {
                log.error("Error updating interrupt context:", error);
            }
        }
        
        // Transition to INTERRUPTED state
        this._changeState(StreamState.INTERRUPTED);
        
        // Save current context for potential resumption if resumable is enabled
        if (this.isResumable) {
            this.pauseStream();
        } else {
            // If not resumable, abort the stream
            this.abortStream();
        }
    }
    
    /**
     * Handles resume events
     * Resumes a paused stream in interrupted state
     */
    "../resume" = () => {
        if (this.streamState !== StreamState.INTERRUPTED) {
            log.warn("Cannot resume stream - not in interrupted state");
            return;
        }
        
        if (!this.isResumable || !this.pausedContext || !this.pausedContext.stream) {
            log.warn("Cannot resume - stream not resumable or no paused context available");
            return;
        }
        
        log.debug("Resuming interrupted stream");
        this.resumeStream();
    }
    
    /**
     * Handles termination events
     * Terminates the current stream completely
     */
    "../terminate" = () => {
        if (this.streamState !== StreamState.INTERRUPTED) {
            log.warn("Cannot terminate - not in interrupted state");
            return;
        }
        
        log.debug("Terminating interrupted stream");
        this.abortStream();
    }

    /**
     * Creates a new stream using the provided prompt
     * 
     * @param {string} prompt - The prompt to send to the model
     */
    async createStream(prompt) {
        this.currentStream = await createContinuationStream(prompt || this.getPrompt(), this.attr("model") || "deepseek-chat")
    }

    /**
     * Processes the current stream, handling each chunk as it arrives
     */
    async processStream() {
        try {
            for await (const chunk of this.currentStream) {
                // Check if we've been paused or aborted
                if (this.streamState !== StreamState.STREAMING) {
                    break;
                }
                
                const content = chunk.choices[0]?.delta?.content || ''
                if (content) {
                    this.handleChunk(content)
                    this.lastChunkTime = Date.now();
                }
            }
            
            if (this.streamState === StreamState.STREAMING) {
                log.debug("\nStream completed normally");
                this._changeState(StreamState.COMPLETED);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                log.debug("\nStream aborted");
            } else {
                log.error("Stream error:", error)
                this._changeState(StreamState.ERROR);
            }
        } finally {
            if (this.streamState !== StreamState.INTERRUPTED) {
                this.currentStream = null;
            }
        }
    }

    /**
     * Handles a content chunk from the stream
     * Adds it to history and publishes it
     * 
     * @param {string} content - The content chunk from the stream
     */
    handleChunk(content) {
        this.chunkHistory.push(content)
        this.pub("chunk", content)
        process.stdout.write(content)
    }
    
    /**
     * Aborts the current stream if one exists
     */
    abortStream() {
        if (this.currentStream) {
            this.currentStream.controller.abort()
            this.currentStream = null;
            this.pausedText = "";
            this.pausedContext = null;
        }
    }
    
    /**
     * Pauses the current stream
     * Used when transitioning to interrupted state to save context for potential resumption
     */
    pauseStream() {
        if (this.currentStream && this.streamState === StreamState.INTERRUPTED) {
            // Save context including the current stream
            this.pausedContext = {
                stream: this.currentStream,
                lastChunkTime: this.lastChunkTime,
                timestampPaused: Date.now()
            };
            
            log.debug("Stream paused in interrupted state");
        }
    }
    
    /**
     * Resumes a previously paused stream
     * Only works if the stream is in interrupted state and has saved context
     */
    async resumeStream() {
        if (this.streamState !== StreamState.INTERRUPTED) {
            log.warn("Cannot resume - stream not in interrupted state");
            return;
        }
        
        if (!this.pausedContext || !this.pausedContext.stream) {
            log.warn("Cannot resume - no paused context available");
            return;
        }
        
        log.debug("Resuming stream from interrupted state");
        
        // Restore the stream from paused context
        this.currentStream = this.pausedContext.stream;
        this.lastChunkTime = this.pausedContext.lastChunkTime;
        
        // Clear paused context
        this.pausedContext = null;
        
        // Resume processing the stream
        this._changeState(StreamState.STREAMING);
        this.processStream();
    }
    
    /**
     * Gets the most recent output from the stream
     * 
     * @param {number} maxChars - Maximum characters to return
     * @returns {string} Recent output
     */
    getRecentOutput(maxChars = 1000) {
        let totalLength = 0
        let startIndex = this.chunkHistory.length - 1
        
        // Work backwards through chunks until we have enough chars or reach the start
        while (startIndex >= 0 && totalLength < maxChars) {
            totalLength += this.chunkHistory[startIndex].length
            startIndex--
        }
        
        // Adjust startIndex to include the chunk that put us over maxChars
        startIndex = Math.max(0, startIndex + 1)
        
        return this.chunkHistory.slice(startIndex).join("")
    }
    
    /**
     * Gets information about the current stream state
     * 
     * @returns {Object} Object containing stream state information
     */
    getStreamStateInfo() {
        return {
            currentState: this.streamState,
            chunkCount: this.chunkHistory.length,
            lastChunkTime: this.lastChunkTime,
            isPaused: this.streamState === StreamState.INTERRUPTED,
            isResumable: this.isResumable && this.pausedContext !== null,
            isActive: [StreamState.STREAMING, StreamState.INTERRUPTED].includes(this.streamState)
        };
    }
}