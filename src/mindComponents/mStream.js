import A from "amanita"
import {createContinuationStream} from "../modelAccess/streamingModel.js"

export class MStream extends A(HTMLElement) {
    stream = null

    async onConnect() {
        await this.createStream()
        await this.processStream()
    }

    async createStream() {
        this.stream = await createContinuationStream(this.attr("prompt"), this.attr("model") || "deepseek-chat")
    }

    async processStream() {
        for await (const chunk of this.stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
                this.handleChunk(content)
            }
        }
        console.debug("\nStream ended")
    }

    handleChunk(content) {
        this.textContent += content
        process.stdout.write(content)
    }
}

customElements.define("m-stream", MStream)