import A from "amanita";
import { command } from "./helpers.js";

/**
 * studio-refresh — the roster rail's ⟳ control. A click dispatches a "refresh"
 * studio-command (rescan architectures), which the hub routes like any other
 * command. Self-contained, so no pane reaches across the DOM for it — it replaces
 * the loose `<span id="archRefresh">` that studio-wake wired by getElementById.
 */
export class StudioRefresh extends A(HTMLElement) {
  onConnect() {
    this.textContent = "⟳";
    this.title = "rescan architectures";
    this.addEventListener("click", () => command(this, "refresh"));
  }
}
A.define("studio-refresh", StudioRefresh);
