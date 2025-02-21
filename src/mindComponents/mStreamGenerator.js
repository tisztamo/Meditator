import { MBaseComponent } from "./mBaseComponent.js";

export class MStreamGenerator extends MBaseComponent {
    async onConnect() {
        // Get the text to split into chunks
        const text = this.getPrompt() || "This is a default test message that will be split into chunks. ".repeat(10);
        
        // Split into words and create chunks of roughly 10-20 characters
        const words = text.split(" ");
        let currentChunk = "";
        
        // Simulate async streaming of chunks
        for (const word of words) {
            currentChunk += word + " ";
            
            if (currentChunk.length >= 15 || word === words[words.length - 1]) {
                // Add random delay to simulate real-time input (100-500ms)
                await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
                
                // Publish the chunk
                this.pub("chunk", currentChunk.trim());
                currentChunk = "";
            }
        }
    }
}

// Register the component
customElements.define("m-stream-generator", MStreamGenerator); 