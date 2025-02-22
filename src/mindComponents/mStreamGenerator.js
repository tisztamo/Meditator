import { MBaseComponent } from "./mBaseComponent.js";

export class MStreamGenerator extends MBaseComponent {
    async onConnect() {
        const text = this.getPrompt() || "This is a default test message that will be split into chunks. ".repeat(10);        
        const words = text.split(" ");
        
        // Simulate async streaming of chunks
        for (const word of words) {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 50));                
            this.pub("chunk", word + " ");
        }
    }
}