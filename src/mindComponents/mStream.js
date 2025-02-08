import A from "amanita"
import {createStream} from "../modelAccess/streamingModel.js"

export class MStream extends A(HTMLElement) {
    stream = null

    onConnect() {
        this.stream = createStream()
        this.stream.on("data", (data) => {
            console.log(data)
        })

        //for await (const chunk of stream) {
            //  process.stdout.write(chunk.choices[0]?.delta?.content || '');
            //}
    }
}

customElements.define("m-stream", MStream)