/**
 * Traverses the given DOM and returns an array of unique unregistered custom element tag names.
 * A custom element is identified by having a hyphen in its tag name.
 *
 * @param {Document|Element} root - The DOM root element to traverse.
 * @returns {string[]} An array of unregistered custom element tag names.
 */
export function getUnregisteredCustomElements(root) {
    const unregisteredTags = new Set();
  
    // Check if the root node itself is an Element and might be a custom element.
    if (root.nodeType === Node.ELEMENT_NODE) {
      const tagName = root.localName; // localName returns the tag name in lowercase.
      if (tagName.includes('-') && !customElements.get(tagName)) {
        unregisteredTags.add(tagName);
      }
    }
  
    // Use querySelectorAll to traverse all descendant elements.
    const elements = root.querySelectorAll('*');
    elements.forEach(el => {
      const tagName = el.localName;
      if (tagName.includes('-') && !customElements.get(tagName)) {
        unregisteredTags.add(tagName);
      }
    });
  
    return Array.from(unregisteredTags);
  }
  