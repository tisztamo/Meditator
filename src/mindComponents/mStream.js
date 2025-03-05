import {MBaseComponent} from "./mBaseComponent.js"
import {createContinuationStream} from "../modelAccess/streamingModel.js"
import { logger } from '../infrastructure/logger';

const log = logger('mStream.js');

/**
 * m-stream generates a stream of thoughts.
 * It must be a direct child of m-mind or another root-level mind component.
 * 
 * @pub chunk
 */
export class MStream extends MBaseComponent {
    currentStream = null
    chunkHistory = []

    "../prompt" = async prompt => {
        this.abortStream()
        await this.createStream(prompt)
        this.processStream()
    }

    "../@interrupt" = e => {
        log.debug("\x1b[31mInterrupt received in m-stream, aborting stream\x1b[0m")
        this.abortStream()
    }

    async createStream(prompt) {
        this.currentStream = await createContinuationStream(prompt ||this.getPrompt(), this.attr("model") || "deepseek-chat")
    }

    async processStream() {
        for await (const chunk of this.currentStream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
                this.handleChunk(content)
            }
        }
        log.debug("\nStream ended")
        this.currentStream = null
    }

    handleChunk(content) {
        this.chunkHistory.push(content)
        this.pub("chunk", content)
        process.stdout.write(content)

    }
    abortStream() {
        if (this.currentStream) {
            this.currentStream.controller.abort()
            this.currentStream = null
        }
    }
}