import {MBaseComponent} from "./mBaseComponent.js"

export class MInterrupts extends MBaseComponent {
    "@interrupt-request" = e => {
        console.debug("Interrupt received, details:", e.detail)
        const interrupt = e.detail
        if (this.checkRateLimit(interrupt)) {
            console.debug("Rate limit exceeded, cancel interrupting", e.detail)
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

customElements.define("m-interrupts", MInterrupts);