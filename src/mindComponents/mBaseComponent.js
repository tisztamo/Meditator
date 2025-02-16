import A from "amanita"

export class MBaseComponent extends A(HTMLElement) {
    getPrompt() {
        const promptAttr = this.attr("prompt")
        if (promptAttr) {
            return promptAttr
        }
        const promptEl = this.querySelector("m-prompt")
        if (promptEl) {
            return promptEl.textContent
        }
    }
}
