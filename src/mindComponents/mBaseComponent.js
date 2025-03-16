import A from "amanita"

/**
 * Base component class for all mind components.
 * Extends the Amanita-enhanced HTMLElement with common functionality.
 * 
 * @interface
 * Topics published to:
 *   - "prompt": Published on connect with the component's prompt content
 */
export class MBaseComponent extends A(HTMLElement) {
    /**
     * Called when the component is connected to the DOM
     * Publishes the component's prompt content
     */
    onConnect() {
        this.pub("prompt", this.getPrompt())
    }
    
    /**
     * Retrieves prompt content from various sources
     * Checks named components, prompt attribute, m-prompt child, or direct text content
     * 
     * @param {string} [promptName] - Optional name of a child component to get prompt from
     * @returns {string} The prompt content
     */
    getPrompt(promptName) {
        if (promptName) {
            const namedEl = this.querySelector(`[name="${promptName}"]`)
            if (namedEl && namedEl.getPrompt) {
                return namedEl.getPrompt()
            }
            console.debug(`Could not find element with name "${promptName}" that has getPrompt() method`)
        }

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

/**
 * Extracts only the direct text content from an element, ignoring child elements
 * 
 * @param {Element} element - The element to extract text from
 * @returns {string} The extracted text content
 */
function getDirectTextContent(element) {
    let text = ""
    for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent.trim() + "\n"
        }
    }
    return text
}
