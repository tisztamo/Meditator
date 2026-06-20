import A from "amanita";
import { mk } from "./helpers.js";

// How much a generated image counts toward studio-stream's char/prune budget: it is
// a heavy DOM node even though its caption is short, so it can trigger pruning too.
export const IMAGE_WEIGHT = 1500;

/**
 * studio-image — a generated-image card landmark in the stream. studio-stream sets
 * `record = { src, prompt }` before connect; we prefer a served URL (light DOM) over
 * an inline data URL. Mode-independent and one-shot, like studio-stim. A
 * display:contents wrapper keeps the inner .image-card on the existing #stream CSS.
 */
export class StudioImage extends A(HTMLElement) {
  onConnect() {
    if (!this.record) this.record = { src: null, prompt: "generated image" };
    this._render();
  }

  get weight() { return (this.record.prompt || "").length + IMAGE_WEIGHT; }

  _render() {
    this.textContent = "";
    const src = this.record.src;
    const prompt = this.record.prompt || "generated image";
    const card = mk("figure", "image-card");
    card.appendChild(mk("figcaption", "lbl", "generated image"));
    if (src) {
      const img = document.createElement("img");
      img.alt = prompt;
      img.loading = "lazy";
      img.src = src;
      card.appendChild(img);
    }
    card.appendChild(mk("figcaption", "prompt", prompt));
    this.appendChild(card);
  }
}
A.define("studio-image", StudioImage);
