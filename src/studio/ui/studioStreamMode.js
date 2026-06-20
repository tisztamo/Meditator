import A from "amanita";
import { getPref, setPref } from "./studioPrefs.js";

/**
 * studio-streammode — the stream display toggle in the column header. It owns the
 * display-mode preference (remembered in localStorage) and publishes it as a
 * "mode" topic — the string "fold" | "flow" | "raw"; studio-stream subscribes to
 * `/streammode/mode` and adapts its renderer. A click cycles fold → flow → raw.
 * Promoting the control to its own mesh component folds it in — studio-stream no
 * longer reaches across the DOM to find and wire the button.
 *
 *   - fold (default) — thinking gathers into quiet, fixed-height blocks that hold
 *     their place; speech and stimuli stay full. The calm view.
 *   - flow — one smoothed monologue, revealed over each burst tick.
 *   - raw  — fragments append the instant they arrive; every boundary a divider.
 *
 * It carries class="streammode" so the existing CSS styles it directly.
 */
const MODES = ["fold", "flow", "raw"];
const TITLES = {
  fold: "Stream display: fold — thinking gathers into quiet blocks; speech and stimuli stay full. Click for flow.",
  flow: "Stream display: flow — one smoothed monologue revealed over each burst tick. Click for raw.",
  raw: "Stream display: raw — instant fragments, full-width burst dividers. Click for fold.",
};
const normalize = m => (MODES.includes(m) ? m : "fold");

export class StudioStreamMode extends A(HTMLElement) {
  mode = "fold";

  onConnect() {
    this.mode = normalize(getPref("streamMode", "fold"));
    this.addEventListener("click", () => this.cycle());
    this.render();
    this.pub("mode", this.mode);
  }

  cycle() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    setPref("streamMode", this.mode);
    this.render();
    this.pub("mode", this.mode);
  }

  render() {
    this.textContent = this.mode;
    this.classList.toggle("fold", this.mode === "fold");
    this.classList.toggle("raw", this.mode === "raw");
    this.title = TITLES[this.mode];
  }
}
A.define("studio-streammode", StudioStreamMode);
