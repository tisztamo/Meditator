import {MBaseComponent} from "./mBaseComponent.js"

export class MTimeout extends MBaseComponent {
    timeout = 0
    sigma = 0

    onConnect() {
        this.setUp()
    }

    setUp() {
        this.timeout = Number(this.attr("timeout")) || 120
        this.sigma = Number(this.attr("sigma")) || 0
        const normalRandom = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())
        const timeoutMs = this.timeout * 1000 + normalRandom * this.sigma * 1000
        console.debug(`Setting timeout for [name=${this.attr("name")}] to ${timeoutMs}ms`)
        setTimeout(this.handleTimeout, timeoutMs)
    }

    handleTimeout = () => {
        const prompt = this.getPrompt()
        console.debug(`Timeout reached in [name=${this.attr("name")}], interrupting with prompt: ${prompt}`)
        this.pub(prompt)
        this.dispatchEvent(new CustomEvent("interrupt", {
            bubbles: true,
            detail: prompt
        }))
    }
}

customElements.define("m-timeout", MTimeout);