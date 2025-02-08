import A from "amanita"

export class MMind extends A(HTMLElement) {
    constructor() {
        super()
        this.innerHTML = "🧠"
    }
}

customElements.define("m-mind", MMind);