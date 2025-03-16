import {MBaseComponent} from "./mBaseComponent.js"
import { logger } from '../infrastructure/logger';

const log = logger('mInterrupts.js');

/**
 * Manages interrupt requests and implements rate limiting for interruptions.
 * Acts as an intermediary that can validate interrupt requests.
 * 
 * @interface
 * Event listeners:
 *   - "interrupt-request": Receives and processes interrupt requests
 * 
 * Topics published to:
 *   - Value from the interrupt: Published when interrupt is approved
 * 
 * Events dispatched:
 *   - "interrupt": Broadcasts approved interruptions
 */
export class MInterrupts extends MBaseComponent {
    /**
     * Handles interrupt request events
     * Checks rate limits and either approves or rejects the interrupt
     * 
     * @param {CustomEvent} e - The interrupt request event
     */
    "@interrupt-request" = e => {
        log.debug("\x1b[31mInterrupt received, details:", e.detail, '\x1b[0m')
        const interrupt = e.detail
        if (this.checkRateLimit(interrupt)) {
            log.debug("\x1b[31mRate limit exceeded, cancel interrupting", e.detail, '\x1b[0m')
            e.preventDefault()
        } else {
            this.pub(interrupt)
            this.dispatchEvent(new CustomEvent("interrupt", {
                bubbles: true,
                detail: interrupt
            }))
        }
    }

    /**
     * Checks if the interrupt exceeds rate limits
     * Base implementation always returns false (no rate limiting)
     * 
     * @param {string} interrupt - The interrupt content
     * @returns {boolean} True if rate limit exceeded, false otherwise
     */
    checkRateLimit(interrupt) {
        return false
    }
}