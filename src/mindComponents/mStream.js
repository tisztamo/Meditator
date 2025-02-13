import A from "amanita"
import {createStream} from "../modelAccess/streamingModel.js"

export class MStream extends A(HTMLElement) {
    stream = null

    async onConnect() {
        await this.createStream()
        await this.processStream()
    }

    async createStream() {
        this.stream = await createStream(this.attr("model") || "deepseek-chat")
        console.log("Stream created")
    }

    async processStream() {
        for await (const chunk of this.stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
                this.handleChunk(content)
            }
        }
        console.log("\nStream ended")
    }

    handleChunk(content) {
        this.textContent += content
        process.stdout.write(content)
    }
}

customElements.define("m-stream", MStream)