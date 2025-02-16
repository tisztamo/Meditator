import {MBaseComponent} from "./mBaseComponent.js"

export class MMind extends MBaseComponent {
    onConnect() {
        this.pub("prompt", this.getPrompt())
    }
}

customElements.define("m-mind", MMind);