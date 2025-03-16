import {MBaseComponent} from "./mBaseComponent.js"
import { logger } from '../infrastructure/logger';

const log = logger('mCompress.js');

/**
 * Compresses text streams by receiving chunks and generating concise summaries.
 * Automatically compresses content when it exceeds a maximum length.
 * 
 * @interface
 * Attributes:
 *   - src: Input stream path (defaults to "/stream/chunk")
 *   - maxLength: Maximum length before compression triggers
 *   - targetLength: Desired length after compression (defaults to maxLength/1.618)
 *   - model: Optional model name for compression
 * 
 * Topics subscribed to:
 *   - Configured by "src" attribute (defaults to "/stream/chunk"): Receives text chunks
 * 
 * Topics published to:
 *   - "chunk": Published with all accumulated chunks
 *   - "compressed": Published when a compressed summary is created
 */
export class MCompress extends MBaseComponent {

    chunks = []
    lastCompressed = ""
    totalLength = 0
    isCompressing = false
    pendingChunks = []

    /**
     * Initializes the component by subscribing to the source stream
     */
    onConnect() {
        this.sub(this.attr("src") || "/stream/chunk", this["[src]"])
    }

    /**
     * Handles incoming chunks from the source stream
     * Accumulates chunks and triggers compression when total length exceeds maxLength
     * 
     * @param {string} chunk - The text chunk received from the stream
     */
    "[src]" = async chunk => {
        if (this.isCompressing) {
            this.pendingChunks.push(chunk)
            return
        }

        this.chunks.push(chunk)
        this.totalLength += chunk.length
        
        const maxLength = Number(this.attr("maxLength") || 100)
        const targetLength = Math.round(Number(this.attr("targetLength") || maxLength / 1.618))

        if (this.totalLength > maxLength) {
            await this.compress(targetLength)
        }
        
        this.pub("chunk", this.chunks)
    }

    /**
     * Compresses accumulated chunks to meet the target length
     * Attempts multiple compression passes if necessary
     * 
     * @param {number} targetLength - The desired length for the compressed content
     */
    async compress(targetLength) {
        log.debug(`Compressing to ${targetLength} chars, ${((targetLength / this.totalLength) * 100).toFixed(2)}% of the original length.`)
        this.isCompressing = true
        let lastPassResult = null
        
        try {
            while (this.totalLength > targetLength) {
                const compressed = await this.compressPass(this.chunks, lastPassResult, targetLength)
                if (compressed.length <= Math.max(targetLength + 30, targetLength * 1.2)) {
                    log.debug(`\x1b[32mCompression to ${compressed.length} chars accepted:`, compressed, '\x1b[0m')
                    this.lastCompressed = compressed
                    this.chunks = ["History: ", compressed, "\nRecent: "]
                    this.totalLength = compressed.length
                    this.pub("compressed", compressed)
                    break
                } else {
                    lastPassResult = compressed
                }
            }
        } finally {
            this.isCompressing = false
            this.pendingChunks.forEach(this["[src]"])
            this.pendingChunks = []
        }
    }

    /**
     * Performs a single compression pass on the content
     * 
     * @param {string[]} chunks - Array of text chunks to compress
     * @param {string|null} lastCompressed - Result of the previous compression attempt, if any
     * @param {number} targetLength - Desired length of the compressed content
     * @returns {Promise<string>} The compressed content
     */
    async compressPass(chunks, lastCompressed, targetLength = 200) {
        const { createCompletion } = await import('../modelAccess/model.js');
        const unCompressed = chunks.join("")
        
        const prompt = lastCompressed 
            ? this.subsequentPrompt(unCompressed, lastCompressed, targetLength)
            : this.initialPrompt(unCompressed, targetLength);

        log.debug("Compression prompt:", prompt, "\n\n")
        const compressed = await createCompletion(prompt, this.attr("model"));
        log.debug(`Compressed to ${compressed.length} chars, ${((compressed.length / unCompressed.length) * 100).toFixed(2)}% of the original length.`)
        return compressed
    }

    /**
     * Override of base method - returns the last compressed text
     * 
     * @param {string} promptName - Unused parameter
     * @returns {string} The last compressed text
     */
    async getPrompt(promptName) {
        return this.lastCompressed
    }

    /**
     * Creates the prompt for the initial compression attempt
     * 
     * @param {string} unCompressed - The original uncompressed text
     * @param {number} targetLength - Desired length after compression
     * @returns {string} Prompt for the language model
     */
    initialPrompt(unCompressed, targetLength) {
        return `You are compressing a stream of thoughts. 
Your task is to create a shorter version.

<original-text>${unCompressed}</original-text>

Provide a concise summary that preserves the key ideas and flow of thought.
Current length ${unCompressed.length} chars.
${this.formatPrompt(targetLength, unCompressed.length)}`;
    }

    /**
     * Creates the prompt for subsequent compression attempts
     * 
     * @param {string} unCompressed - The original uncompressed text
     * @param {string} lastCompressed - Result of the previous compression attempt
     * @param {number} targetLength - Desired length after compression
     * @returns {string} Prompt for the language model
     */
    subsequentPrompt(unCompressed, lastCompressed, targetLength) {
        return `You are iteratively compressing a stream of thoughts.
Original text for reference:

<original-text>${unCompressed}</original-text>

Current best compression is ${lastCompressed.length} chars, which is longer than expected with ${lastCompressed.length - targetLength} chars, or ${((lastCompressed.length / targetLength - 1) * 100).toFixed(2)}%.

<previous-compression>${lastCompressed}</previous-compression>

Your task is to create an even shorter version while maintaining coherence.
Create an even more concise version while preserving the core meaning.
${this.formatPrompt(targetLength, unCompressed.length)}`;
    }

    /**
     * Creates the common instruction part of the compression prompts
     * 
     * @param {number} targetLength - Desired length after compression
     * @param {number} unCompressedLength - Length of the original uncompressed text
     * @returns {string} Formatted prompt instructions
     */
    formatPrompt(targetLength, unCompressedLength) {
        return `The full text may be partly history, partly recent thoughts.
Target length: ${targetLength} chars, ${(targetLength / unCompressedLength * 100).toFixed(1)}% of the original.
Output only an updated historical part.
No need to mention recent thoughts if they have no historical relevance.
You are the judge of this part of history, so be humble and never lie.
Output only the compressed text, no other text.`;
    }
}