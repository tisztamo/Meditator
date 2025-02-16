import A from "amanita"
import {createContinuationStream} from "../modelAccess/streamingModel.js"

export class MStream extends A(HTMLElement) {
    stream = null

    async onConnect() {
        await this.createStream()
        this.processStream()
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
        this.pub("chunk", content)
        process.stdout.write(content)
    }

    "..m-mind/@interrupt" = e => { // TODO: this definition makes it impossible for m-stream to work without m-mind which is bad- e.g. an extended m-x-mind is not possible now
        console.debug("Interrupt received in m-stream, aborting stream")
        this.stream.controller.abort()
    }
}

customElements.define("m-stream", MStream)