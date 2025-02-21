import A from "amanita"

export class MBaseComponent extends A(HTMLElement) {
    onConnect() {
        this.pub("prompt", this.getPrompt())
    }
    
    getPrompt() {
        const promptAttr = this.attr("prompt")
        if (promptAttr) {
            return promptAttr
        }
        const promptEl = this.querySelector("m-prompt")
        if (promptEl) {
            return promptEl.textContent
        }
        return getDirectTextContent(this)
    }
}

function getDirectTextContent(element) {
    let text = ""
    for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent.trim() + "\n"
        }
    }
    return text
}
