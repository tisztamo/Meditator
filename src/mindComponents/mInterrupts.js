import {MBaseComponent} from "./mBaseComponent.js"

export class MInterrupts extends MBaseComponent {
    "@interrupt-request" = e => {
        console.debug("\x1b[31mInterrupt received, details:", e.detail, '\x1b[0m')
        const interrupt = e.detail
        if (this.checkRateLimit(interrupt)) {
            console.debug("\x1b[31mRate limit exceeded, cancel interrupting", e.detail, '\x1b[0m')
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