import {MBaseComponent} from "./mBaseComponent.js"
import { parseTime } from '../config/timeParser.js';
import { logger } from '../infrastructure/logger';

const log = logger('mTimeout.js');

/**
 * Timer component that triggers interrupts after a specified timeout period.
 * Uses normal distribution for randomizing timeout values.
 * 
 * @interface
 * Attributes:
 *   - timeout: Time until interrupt is triggered (defaults to "1000ms")
 *   - sigma: Standard deviation for randomizing the timeout (defaults to "0ms")
 *   - name: Identifier for logging
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

    /**
     * Sets up the timeout on component connection
     */
    onConnect() {
        this.setUp()
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
     * Publishes the prompt and dispatches an interrupt-request event
     * Then sets up a new timeout
     */
    handleTimeout = () => {
        const prompt = this.getPrompt()
        log.debug(`Timeout reached in [name=${this.attr("name")}], interrupting with prompt: ${prompt}`)
        this.pub(prompt)
        this.dispatchEvent(new CustomEvent("interrupt-request", {
            bubbles: true,
            detail: prompt
        }))
        this.setUp()
    }
}

customElements.define('m-timeout', MTimeout);