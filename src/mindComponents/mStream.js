import {MBaseComponent} from "./mBaseComponent.js"
import {createContinuationStream} from "../modelAccess/streamingModel.js"
import { logger } from '../infrastructure/logger';

const log = logger('mStream.js');

/**
 * Generates and manages a stream of text from a language model.
 * Must be a direct child of m-mind or another root-level mind component.
 * 
 * @interface
 * Attributes:
 *   - model: The model to use for streaming (defaults to "deepseek-chat")
 * 
 * Subscriptions:
 *   - "../prompt": Receives prompts from parent component
 *   - "../@interrupt": Handles interruption events
 * 
 * Topics published to:
 *   - "chunk": Published when new content is received from the stream
 */
export class MStream extends MBaseComponent {
    currentStream = null
    chunkHistory = []

    /**
     * Handles prompt events from parent component
     * Aborts any existing stream and creates a new one with the provided prompt
     * 
     * @param {string} prompt - The prompt to send to the model
     */
    "../prompt" = async prompt => {
        this.abortStream()
        await this.createStream(prompt)
        this.processStream()
    }

    /**
     * Handles interrupt events from parent component
     * Aborts the current stream when an interrupt is received
     * 
     * @param {CustomEvent} e - The interrupt event
     */
    "../@interrupt" = e => {
        log.debug("\x1b[31mInterrupt received in m-stream, aborting stream\x1b[0m")
        this.abortStream()
    }

    /**
     * Creates a new stream using the provided prompt
     * 
     * @param {string} prompt - The prompt to send to the model
     */
    async createStream(prompt) {
        this.currentStream = await createContinuationStream(prompt ||this.getPrompt(), this.attr("model") || "deepseek-chat")
    }

    /**
     * Processes the current stream, handling each chunk as it arrives
     */
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

    /**
     * Handles a content chunk from the stream
     * Adds it to history and publishes it
     * 
     * @param {string} content - The content chunk from the stream
     */
    handleChunk(content) {
        this.chunkHistory.push(content)
        this.pub("chunk", content)
        process.stdout.write(content)

    }
    
    /**
     * Aborts the current stream if one exists
     */
    abortStream() {
        if (this.currentStream) {
            this.currentStream.controller.abort()
            this.currentStream = null
        }
    }
}