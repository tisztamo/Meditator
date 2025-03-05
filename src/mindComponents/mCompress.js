import {MBaseComponent} from "./mBaseComponent.js"
import { logger } from '../infrastructure/logger';

const log = logger('mCompress.js');

export class MCompress extends MBaseComponent {

    chunks = []
    lastCompressed = ""
    totalLength = 0
    isCompressing = false
    pendingChunks = []

    onConnect() {
        this.sub(this.attr("src") || "/stream/chunk", this["[src]"])
    }

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

    async getPrompt(promptName) {
        return this.lastCompressed
    }

    initialPrompt(unCompressed, targetLength) {
        return `You are compressing a stream of thoughts. 
Your task is to create a shorter version.

<original-text>${unCompressed}</original-text>

Provide a concise summary that preserves the key ideas and flow of thought.
Current length ${unCompressed.length} chars.
${this.formatPrompt(targetLength, unCompressed.length)}`;
    }

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

    formatPrompt(targetLength, unCompressedLength) {
        return `The full text may be partly history, partly recent thoughts.
Target length: ${targetLength} chars, ${(targetLength / unCompressedLength * 100).toFixed(1)}% of the original.
Output only an updated historical part.
No need to mention recent thoughts if they have no historical relevance.
You are the judge of this part of history, so be humble and never lie.
Output only the compressed text, no other text.`;
    }
}