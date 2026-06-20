import A from "amanita";
import { mk } from "./helpers.js";

/**
 * studio-stim — a stimulus marker (⟂) in the stream: an urgent signal, an accepted
 * decision, an image-generation failure, or the operator's own message ("You said:").
 *
 * A landmark, like studio-speech: it never folds and looks the same in every display
 * mode, so it doesn't subscribe to the mode. studio-stream sets `record = { text,
 * cls }` before connect (cls picks the accent: "you" | "warn"). A one-shot card —
 * no live growth. A display:contents wrapper keeps the inner .stim on the #stream CSS.
 */
export class StudioStim extends A(HTMLElement) {
  onConnect() {
    if (!this.record) this.record = { text: "", cls: null };
    this._render();
  }

  get weight() { return ("⟂ " + this.record.text).length; }

  _render() {
    this.textContent = "";
    const d = mk("div", "stim" + (this.record.cls ? " " + this.record.cls : ""));
    d.textContent = "⟂ " + this.record.text;
    this.appendChild(d);
  }
}
A.define("studio-stim", StudioStim);
