import {MBaseComponent} from "./mBaseComponent.js"

export class MMind extends MBaseComponent {
    "@interrupt" = e => {
        console.debug("Interrupt received in m-mind, generating new prompt")
        const streamEl = this.querySelector('m-stream')
        const lastTokens = streamEl.chunkHistory.slice(Math.max(0, streamEl.chunkHistory.length - 1000))
        const prompt = this.getPrompt() + lastTokens.join("") + "\n\n" + e.detail
        this.pub("prompt", prompt)
    }
}