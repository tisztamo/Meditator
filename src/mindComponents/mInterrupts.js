import {MBaseComponent} from "./mBaseComponent.js"
import { logger } from '../infrastructure/logger';

const log = logger('mInterrupts.js');

export class MInterrupts extends MBaseComponent {
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

    checkRateLimit(interrupt) {
        return false
    }
}