import {MBaseComponent} from "./mBaseComponent.js"
import {createContinuationStream} from "../modelAccess/streamingModel.js"

/**
 * m-stream generates a stream of thoughts.
 * It must be a direct child of m-mind or another root-level mind component.
 * 
 * @pub chunk
 */
export class MStream extends MBaseComponent {
    stream = null

    "../prompt" = async prompt => {
        this.abortStream()
        await this.createStream(prompt)
        this.processStream()
    }

    "../@interrupt" = e => {
        console.debug("Interrupt received in m-stream, aborting stream")
        this.abortStream()
    }

    async createStream(prompt) {
        this.stream = await createContinuationStream(prompt ||this.getPrompt(), this.attr("model") || "deepseek-chat")
    }

    async processStream() {
        for await (const chunk of this.stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
                this.handleChunk(content)
            }
        }
        console.debug("\nStream ended")
        this.stream = null
    }

    handleChunk(content) {
        this.pub("chunk", content)
        process.stdout.write(content)

    }
    abortStream() {
        if (this.stream) {
            this.stream.controller.abort()
            this.stream = null
        }
    }
}