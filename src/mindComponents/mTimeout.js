import {MBaseComponent} from "./mBaseComponent.js"
import { parseTime } from '../config/timeParser.js';
import { logger } from '../infrastructure/logger.js';
import { createStateManager } from '../infrastructure/interruptState.js';
import { createTimeInterrupt } from '../infrastructure/interruptRecord.js';

const log = logger('mTimeout.js');

/**
 * Timer component that triggers interrupts after a specified timeout period.
 * Uses normal distribution for randomizing timeout values.
 * Supports state storage and structured interrupt records with partial/full state chain.
 * 
 * @interface
 * Attributes:
 *   - timeout: Time until interrupt is triggered (defaults to "1000ms")
 *   - sigma: Standard deviation for randomizing the timeout (defaults to "0ms")
 *   - name: Identifier for logging and state management
 *   - fullStateInterval: Number of partial states before saving a full state (defaults to 5)
 * 
 * Topics published to:
 *   - Value from getPrompt(): Published on timeout
 * 
 * Events dispatched:
 *   - "interrupt-request": Bubbling event to request interruption
 */
export class MTimeout extends MBaseComponent {
    timeout = 0
    sigma = 0
    stateManager = null
    lastInterruptTime = null
    partialStateCount = 0
    fullStateInterval = 5

    /**
     * Sets up the timeout on component connection
     */
    onConnect() {
        // Initialize state manager
        this.stateManager = createStateManager(`time-based-${this.attr("name") || "default"}`);
        this.fullStateInterval = Number(this.attr("fullStateInterval") || 5);
        
        // Load state before setting up
        this.loadState().then(() => {
            log.debug(`Timeout state loaded for ${this.attr("name")}`);
            this.setUp();
        });
    }

    /**
     * Loads state from storage
     */
    async loadState() {
        try {
            const meta = await this.stateManager.loadMeta();
            
            // Load last interrupt time
            if (meta.lastInterruptTime) {
                this.lastInterruptTime = new Date(meta.lastInterruptTime);
                log.debug(`Last interrupt time for ${this.attr("name")}: ${this.lastInterruptTime}`);
            }
            
            // Load partial state count
            this.partialStateCount = meta.partialStateCount || 0;
            log.debug(`Loaded partial state count: ${this.partialStateCount}`);
            
        } catch (error) {
            log.error('Error loading timeout state:', error);
        }
    }

    /**
     * Saves state after an interrupt
     * @param {Object} interrupt - The interrupt record
     * @param {boolean} forceFull - Force saving as a full state
     */
    async saveState(interrupt, forceFull = false) {
        try {
            // Get existing metadata
            const meta = await this.stateManager.loadMeta();
            
            // Update interrupt history
            if (!meta.interrupts) {
                meta.interrupts = [];
            }
            
            // Add this interrupt to history (limit to last 5)
            meta.interrupts.unshift({
                dateTime: interrupt.dateTime,
                reason: interrupt.reason
            });
            
            if (meta.interrupts.length > 5) {
                meta.interrupts = meta.interrupts.slice(0, 5);
            }
            
            // Update last interrupt time
            meta.lastInterruptTime = interrupt.dateTime;
            
            // Create state with timeout configuration and history
            const state = `# Timeout Monitor State
            
Last updated: ${new Date().toISOString()}
Timeout: ${this.timeoutMs}ms
Sigma: ${this.sigmaMs}ms

## Last Interrupt
${interrupt.toMarkdown()}
`;
            
            // Determine if this should be a full state
            let isFullState = forceFull;
            
            if (!isFullState) {
                // Increment partial state count
                this.partialStateCount = (this.partialStateCount || 0) + 1;
                
                // Every fullStateInterval states, save a full state
                if (this.partialStateCount >= this.fullStateInterval) {
                    isFullState = true;
                    this.partialStateCount = 0;
                }
            } else {
                // Reset partial state count when saving a full state
                this.partialStateCount = 0;
            }
            
            // Update metadata with partial state count
            meta.partialStateCount = this.partialStateCount;
            
            // Save the updated state and metadata
            await this.stateManager.update(state, meta, isFullState);
            
            log.debug(`Saved ${isFullState ? 'full' : 'partial'} state for timeout ${this.attr("name") || "default"}`);
        } catch (error) {
            log.error('Error saving timeout state:', error);
        }
    }

    /**
     * Configures and starts the timeout timer
     * Calculates timeout with random variation based on sigma
     */
    setUp() {
        this.timeoutMs = parseTime(this.attr("timeout") || "1000ms")
        this.sigmaMs = parseTime(this.attr("sigma") || "0ms")
        
        const normalRandom = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())
        const timeoutMs = this.timeoutMs + normalRandom * this.sigmaMs
        log.debug(`Setting timeout for [name=${this.attr("name")}] to ${Math.round(timeoutMs)}ms`)
        setTimeout(this.handleTimeout, timeoutMs)
    }

    /**
     * Handles timeout expiration
     * Creates a structured interrupt record and dispatches an interrupt-request event
     * Then sets up a new timeout
     */
    handleTimeout = async () => {
        const prompt = this.getPrompt();
        
        // Create structured interrupt record
        const interrupt = createTimeInterrupt({
            reason: prompt,
            type: `Scheduled-${this.attr("name") || "Unknown"}`,
            context: {
                lastOutput: '',  // Stream component will need to provide this
                streamState: 'active'
            },
            additionalData: {
                configuration: {
                    timeout: `${this.timeoutMs}ms`,
                    sigma: `${this.sigmaMs}ms`
                },
                timeSinceLastInterrupt: this.lastInterruptTime ? 
                    `${new Date() - this.lastInterruptTime}ms` : 'N/A'
            }
        });
        
        log.debug(`Timeout reached in [name=${this.attr("name")}], interrupting with: ${interrupt}`)
        
        // Save state - regular timeouts are partial states unless we hit the interval
        await this.saveState(interrupt);
        
        // Update last interrupt time
        this.lastInterruptTime = new Date();
        
        // Publish the prompt
        this.pub(prompt)
        
        // Dispatch interrupt request with structured format
        this.dispatchEvent(new CustomEvent("interrupt-request", {
            bubbles: true,
            detail: interrupt.toMarkdown()
        }))
        
        // Set up next timeout
        this.setUp()
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

customElements.define('m-timeout', MTimeout);