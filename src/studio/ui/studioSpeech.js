import A from "amanita";
import { mk } from "./helpers.js";

/**
 * studio-speech — a spoken-aloud passage: the .say card landmark in the stream.
 *
 * One of the stream's part-components. studio-stream owns the timeline and creates
 * one of these per speech block, setting `record = { text }` before it connects;
 * live speech grows via append() until the container seals it (the mind stops
 * speaking, or another landmark intervenes).
 *
 * Speech is mode-independent — it reads the same whether the surrounding thinking is
 * folded, flowing, or raw — so unlike studio-thought-run it never subscribes to the
 * mode. A display:contents wrapper, so the inner .say keeps the existing #stream CSS.
 */
export class StudioSpeech extends A(HTMLElement) {
  onConnect() {
    if (!this.record) this.record = { text: "" };
    this._render();
  }

  /** Logical size, for studio-stream's prune budget. */
  get weight() { return this.record.text.length; }

  /** Grow the live say card with a speech fragment. */
  append(text) {
    if (!text) return;
    this.record.text += text;
    this._span.appendChild(document.createTextNode(text));
  }
  /** A say card is identical live or settled — nothing to change on seal. */
  seal() {}

  _render() {
    this.textContent = "";
    const say = mk("div", "say");
    say.appendChild(mk("span", "lbl", "spoken aloud"));
    this._span = mk("span");
    this._span.textContent = this.record.text;
    say.appendChild(this._span);
    this.appendChild(say);
  }
}
A.define("studio-speech", StudioSpeech);
