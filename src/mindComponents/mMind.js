import {MBaseComponent} from "./mBaseComponent.js"
import { logger } from '../infrastructure/logger';

const log = logger('mMind.js');

export class MMind extends MBaseComponent {
    "@interrupt" = async e => {
        log.debug("\x1b[31mInterrupt received in m-mind, generating new prompt\x1b[0m")

        const recentHistory = this.getRecentHistory()

        // Build the new prompt with original prompt, history and interrupt details
        const prompt = [
            "Original prompt: " + this.getPrompt(),
            "History: " + await this.getPrompt("history"), 
            "Recent: " + recentHistory.join(""),
            "Interrupt caused by: " + e.detail
        ].join("\n\n")

        // Publish the new prompt
        this.pub("prompt", prompt)

    }
    
   getRecentHistory(maxChars = 1000) {
        const streamEl = this.querySelector('m-stream')
        if (!streamEl) {
            log.error("No m-stream found in m-mind")
            return "Error: No m-stream found in m-mind"
        }
        let totalLength = 0
        let startIndex = streamEl.chunkHistory.length - 1
        
        // Work backwards through chunks until we have enough chars or reach the start
        while (startIndex >= 0 && totalLength < maxChars) {
            totalLength += streamEl.chunkHistory[startIndex].length
            startIndex--
        }
        
        // Adjust startIndex to include the chunk that put us over maxChars
        startIndex = Math.max(0, startIndex + 1)
        
        return streamEl.chunkHistory.slice(startIndex)
    }
}