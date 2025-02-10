import A from "amanita"
import {createStream} from "../modelAccess/streamingModel.js"

export class MStream extends A(HTMLElement) {
    stream = null

    async onConnect() {
        this.stream = await createStream()
        console.log("Stream created," , this.stream)
        for await (const chunk of this.stream) {
            console.log(chunk.choices[0]?.delta?.content || '');
        }
    }
}

customElements.define("m-stream", MStream)