import {MBaseComponent} from "./mBaseComponent.js"
import { parseTime } from '../config/timeParser.js';

export class MTimeout extends MBaseComponent {
    timeout = 0
    sigma = 0

    onConnect() {
        this.setUp()
    }

    setUp() {
        this.timeoutMs = parseTime(this.attr("timeout") || "1000ms")
        this.sigmaMs = parseTime(this.attr("sigma") || "0ms")
        
        const normalRandom = Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random())
        const timeoutMs = this.timeoutMs + normalRandom * this.sigmaMs
        console.debug(`Setting timeout for [name=${this.attr("name")}] to ${Math.round(timeoutMs)}ms`)
        setTimeout(this.handleTimeout, timeoutMs)
    }

    handleTimeout = () => {
        const prompt = this.getPrompt()
        console.debug(`Timeout reached in [name=${this.attr("name")}], interrupting with prompt: ${prompt}`)
        this.pub(prompt)
        this.dispatchEvent(new CustomEvent("interrupt-request", {
            bubbles: true,
            detail: prompt
        }))
        this.setUp()
    }
}

customElements.define('m-timeout', MTimeout);