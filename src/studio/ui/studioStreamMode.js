import A from "amanita";
import { getPref, setPref } from "./studioPrefs.js";

/**
 * studio-streammode — the flow/raw toggle in the stream column header. It owns
 * the display-mode preference (remembered in localStorage) and publishes it as a
 * "mode" topic (true = flow, false = raw); studio-stream subscribes to
 * `/streammode/mode` and adapts its reveal engine. Promoting the control to its
 * own mesh component folds it in — studio-stream no longer reaches across the DOM
 * to find and wire the button (`closest(".col").querySelector("[data-streammode]")`).
 *
 * It carries class="streammode" so the existing CSS styles it directly.
 */
export class StudioStreamMode extends A(HTMLElement) {
  smooth = true;

  onConnect() {
    this.smooth = getPref("streamMode", "flow") !== "raw";
    this.addEventListener("click", () => this.toggle());
    this.render();
    this.pub("mode", this.smooth);
  }

  toggle() {
    this.smooth = !this.smooth;
    setPref("streamMode", this.smooth ? "flow" : "raw");
    this.render();
    this.pub("mode", this.smooth);
  }

  render() {
    this.textContent = this.smooth ? "flow" : "raw";
    this.classList.toggle("raw", !this.smooth);
    this.title = this.smooth
      ? "Stream display: flow — smoothed reveal, inline burst seams. Click for raw."
      : "Stream display: raw — instant fragments, full-width burst dividers. Click for flow.";
  }
}
A.define("studio-streammode", StudioStreamMode);
