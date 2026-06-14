// jsdom-setup.ts
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');

globalThis.window = window;
globalThis.document = window.document;
globalThis.navigator = window.navigator;
globalThis.HTMLElement = window.HTMLElement
globalThis.Event = window.Event
globalThis.CustomEvent = window.CustomEvent
globalThis.Document = window.Document;
globalThis.Node = window.Node;
globalThis.customElements = window.customElements

installCompactDomInspect(window);

/**
 * Teach console.log/error to print DOM nodes as compact one-liners instead of
 * dumping jsdom's entire internal object graph (every element transitively
 * holds a reference to the Window, so a single accidental `console.log(el)` —
 * or a framework warning like Amanita's "selects an element that is not an
 * Amanita component" — explodes into thousands of lines).
 *
 * We attach a Node.js `util.inspect.custom` hook (which Bun honours) to the
 * Element/Document prototypes, so the fix applies to every logger, including
 * third-party code in node_modules.
 *
 * Set MEDITATOR_DOM_INSPECT=full to opt back into the raw, exhaustive dump.
 */
function installCompactDomInspect(window) {
  if (process.env.MEDITATOR_DOM_INSPECT === "full") return;

  const inspectKey = Symbol.for("nodejs.util.inspect.custom");

  const describeElement = function () {
    try {
      const tag = this.localName || "element";
      const attrs = this.attributes
        ? Array.from(this.attributes)
            .map((a) => {
              const value = a.value.length > 50 ? `${a.value.slice(0, 47)}…` : a.value;
              return ` ${a.name}="${value}"`;
            })
            .join("")
        : "";
      const childCount = this.childElementCount || 0;
      const children = childCount ? ` …${childCount} child element${childCount === 1 ? "" : "ren"}` : "";
      return `<${tag}${attrs}>${children}`;
    } catch {
      return "<element>";
    }
  };

  // Element covers every HTML/custom element (defined or not), since
  // HTMLElement and upgraded custom elements inherit from it.
  if (window.Element) {
    window.Element.prototype[inspectKey] = describeElement;
  }
  // A bare HTMLDocument dump is just as huge; collapse it too.
  if (window.Document) {
    window.Document.prototype[inspectKey] = function () {
      return "[jsdom Document]";
    };
  }
}
