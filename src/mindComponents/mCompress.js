import {MBaseComponent} from "./mBaseComponent.js"

export class MCompress extends MBaseComponent {

    chunks = []
    totalLength = 0
    isCompressing = false
    pendingChunks = []

    onConnect() {
        this.sub(this.attr("src") || "..[name=stream]/chunk", this["[src]"])
    }

    "[src]" = async chunk => {
        if (this.isCompressing) {
            this.pendingChunks.push(chunk)
            return
        }

        this.chunks.push(chunk)
        this.totalLength += chunk.length
        
        const maxLength = this.attr("maxLength") || 100
        const targetLength = this.attr("targetLength") || maxLength / 1.618

        if (this.totalLength > maxLength) {
            await this.compress(targetLength)
        }
        
        this.pub("chunk", this.chunks)
    }

    async compress(targetLength) {
        console.debug(`Compressing to ${targetLength} chars, ${((targetLength / this.totalLength * 100).toFixed(2))}% of the original length.`)
        this.isCompressing = true
        let lastCompressed = null
        
        try {
            while (this.totalLength > targetLength) {
                const compressed = await this.compressPass(this.chunks, lastCompressed, targetLength)
                if (compressed.length <= targetLength) {
                    this.log("Compression accepted.")
                    this.pub("compressed", compressed)
                    this.chunks = [compressed]
                    this.totalLength = compressed.length
                    break
                } else {
                    lastCompressed = compressed
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

        const compressed = await createCompletion(prompt, this.attr("model"));
        console.debug(`Compressed to ${compressed.length} chars, ${((compressed.length / targetLength - 1) * 100).toFixed(2)}% of the original length.`)
        return compressed
    }

    initialPrompt(unCompressed, targetLength) {
        return `You are compressing a stream of thoughts. 
Your task is to create a shorter version (${targetLength} chars, ${(targetLength / unCompressed.length * 100).toFixed(2)}% of the original length) that captures the essential meaning.
Here is the text to compress:

${unCompressed}

Provide a concise summary that preserves the key ideas and flow of thought.
${this.formatPrompt(targetLength)}`;
    }

    subsequentPrompt(unCompressed, lastCompressed, targetLength) {
        return `You are iteratively compressing a stream of thoughts.
Previous compression: ${lastCompressed}

Your task is to compress this further while maintaining coherence.

Previous compression was ${lastCompressed.length} chars, which is longer with ${lastCompressed.length - targetLength} chars, or +${((lastCompressed.length / targetLength - 1) * 100).toFixed(2)}%.
Original text for reference:

${unCompressed}

Create an even more concise version while preserving the core meaning.
${this.formatPrompt(targetLength)}`;
    }

    formatPrompt(targetLength) {
        return `The full text is partly history, partly recent thoughts.
Output only an updated historical part.
No need to mention recent thoughts if they have no historical relevance.
You are the judge of this part of history, so be humble and never lie.
Target length: ${targetLength} characters
Output only the compressed text, no other text.`;
    }
}