import {MBaseComponent} from "./mBaseComponent.js"
import { logger } from '../infrastructure/logger';

const log = logger('mRecentHistory.js');

/**
 * Manages recent history by organizing content into blocks and compressing them.
 * Provides advanced history management with multiple compression strategies.
 * 
 * @interface
 * Attributes:
 *   - src: Input stream path (defaults to "/stream/chunk")
 *   - blockCount: Maximum number of blocks to maintain (defaults to 10)
 *   - maxLength: Maximum overall length before triggering compression
 *   - targetLength: Desired length after compression
 *   - model: Optional model to use for compression
 * 
 * Topics subscribed to:
 *   - Configured by "src" attribute (defaults to "/stream/chunk"): Receives text chunks
 * 
 * Topics published to:
 *   - "history": Published with compressed history
 */
export class MRecentHistory extends MBaseComponent {
    blocks = []
    maxBlockCount = 0
    maxLength = 0
    ratio = 0
    lastCompressed = ""
    isCompressing = false
    pendingChunks = []
    currentBlock = []
    currentBlockLength = 0
    targetBlockLength = 0

    /**
     * Initializes the component by subscribing to the source stream
     * Sets up configuration parameters from attributes
     */
    onConnect() {
        this.sub(this.attr("src") || "/stream/chunk", this["[src]"])
        this.maxBlockCount = Number(this.attr("blockCount") || 10)
        this.maxLength = Number(this.attr("maxLength") || 1000)
        this.ratio = Number(this.attr("ratio") || 10)
        this.targetBlockLength = this.maxLength / this.ratio
    }

    "[src]" = async chunk => {
        if (this.isCompressing) {
            this.pendingChunks.push(chunk)
            return
        }

        this.currentBlock.push(chunk)
        this.currentBlockLength += chunk.length


        if (this.currentBlockLength >= this.targetBlockLength) {
            const compressedBlock = await this.compressBlock(this.currentBlock.join(""))
            this.blocks.push(compressedBlock)
            
            this.currentBlock = []
            this.currentBlockLength = 0

            if (this.blocks.length > this.maxBlockCount) {
                this.blocks.shift()
            }
            await this.compressAll(this.maxLength)
        }
    }

    async compressBlock(content) {
        return await this.compressIteratively(
            content, 
            this.targetBlockLength,
            this.initialBlockPrompt.bind(this),
            this.subsequentBlockPrompt.bind(this)
        )
    }

    async compressAll(targetLength) {
        this.isCompressing = true
        try {
            // Combine all compressed blocks and current uncompressed content
            const allContent = [
                ...this.blocks,
                this.currentBlock.join("")
            ].join("\n")

            // Check if the total length is smaller than maxLength
            if (allContent.length <= targetLength) {
                this.lastCompressed = allContent;
            } else {
                this.lastCompressed = await this.compressIteratively(
                    allContent,
                    targetLength,
                    this.initialAllPrompt,
                    this.subsequentAllPrompt
                );
            }
        } finally {
            this.isCompressing = false
            this.pendingChunks.forEach(this["[src]"])
            this.pendingChunks = []
        }
    }

    async compressIteratively(content, targetLength, initialPromptFn, subsequentPromptFn) {
        log.debug(`Compressing to ${targetLength} chars, ${((targetLength / content.length) * 100).toFixed(2)}% of the original length.`)
        let lastPassResult = null
        let bestResult = null
        let bestLength = Infinity
        let iterations = 0
        const maxIterations = 3 // Prevent infinite loops
        
        while (iterations < maxIterations) {
            iterations++
            log.debug(`Compression iteration ${iterations}/${maxIterations}`)
            
            const compressed = await this.compressPass(
                content, 
                lastPassResult, 
                targetLength,
                initialPromptFn,
                subsequentPromptFn
            )
            
            // Track the best result (closest to target without going under)
            if (compressed.length < bestLength && compressed.length >= targetLength * 0.8) {
                bestResult = compressed
                bestLength = compressed.length
            }
            
            // Accept if we're close enough to target length
            if (compressed.length <= Math.max(targetLength + 30, targetLength * 1.2)) {
                log.debug(`\x1b[32mCompression to ${compressed.length} chars accepted:`, compressed, '\x1b[0m')
                return compressed
            } else {
                // Not close enough, try again with the previous result
                lastPassResult = compressed
                
                // Safety check - if we're not making progress, just return what we have
                if (lastPassResult && lastPassResult.length <= compressed.length) {
                    log.debug(`\x1b[33mCompression not improving, returning best result\x1b[0m`)
                    return bestResult || compressed
                }
            }
        }
        
        // If we've reached max iterations, return the best result we have
        log.debug(`\x1b[33mReached maximum iterations (${maxIterations}), returning best result\x1b[0m`)
        return bestResult || lastPassResult || content
    }

    async compressPass(content, lastCompressed, targetLength, initialPromptFn, subsequentPromptFn) {
        const { createCompletion } = await import('../modelAccess/model.js')
        
        const prompt = lastCompressed 
            ? subsequentPromptFn(content, lastCompressed, targetLength)
            : initialPromptFn(content, targetLength)

        log.debug("Compression prompt:", prompt, "\n\n")
        const compressed = await createCompletion(prompt, this.attr("model"))
        log.debug(`Compressed to ${compressed.length} chars, ${((compressed.length / content.length) * 100).toFixed(2)}% of the original length.`)
        return compressed
    }

    // Prompt templates for block compression
    initialBlockPrompt = (content, targetLength) => {
        return `Compress this block of text while preserving key information:

<original-text>${content}</original-text>

Provide a concise summary that maintains essential details.
Current length ${content.length} chars.
Target length: ${targetLength} chars, ${(targetLength / content.length * 100).toFixed(1)}% of the original.
Output only the compressed text.`
    }

    subsequentBlockPrompt = (content, lastCompressed, targetLength) => {
        return `You are iteratively compressing a block of text.
Original text for reference:

<original-text>${content}</original-text>

Current best compression is ${lastCompressed.length} chars, which is longer than expected with ${lastCompressed.length - targetLength} chars, or ${((lastCompressed.length / targetLength - 1) * 100).toFixed(2)}%.

<previous-compression>${lastCompressed}</previous-compression>

Your task is to create an even shorter version while maintaining essential details.
Target length: ${targetLength} chars, ${(targetLength / content.length * 100).toFixed(1)}% of the original.
Output only the compressed text.`
    }

    // Prompt templates for all blocks compression
    initialAllPrompt = (content, targetLength) => {
        return `Create a compressed version of this historical content:

<original-text>${content}</original-text>

Provide a concise summary that maintains the essential narrative and key points.
Current length ${content.length} chars.
Target length: ${targetLength} chars, ${(targetLength / content.length * 100).toFixed(1)}% of the original.
Output only the compressed text.`
    }

    subsequentAllPrompt = (content, lastCompressed, targetLength) => {
        return `You are iteratively compressing historical content.
Original content for reference:

<original-text>${content}</original-text>

Current best compression is ${lastCompressed.length} chars, which is longer than expected with ${lastCompressed.length - targetLength} chars, or ${((lastCompressed.length / targetLength - 1) * 100).toFixed(2)}%.

<previous-compression>${lastCompressed}</previous-compression>

Your task is to create an even shorter version while maintaining the essential narrative and key points.
Target length: ${targetLength} chars, ${(targetLength / content.length * 100).toFixed(1)}% of the original.
Output only the compressed text.`
    }

    async getPrompt(promptName) {
        return this.lastCompressed
    }
} 