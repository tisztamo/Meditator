import A from "amanita";

/**
 * studio-toast — the transient bottom toast (id="toast", inheriting the fixed
 * positioning from the existing CSS). Shows supervisor errors, and a crash
 * notice for the focused mind (matching the old monolith's onLifecycle toast).
 */
export class StudioToast extends A(HTMLElement) {
  timer = null;
  focusedId = null;   // cached from /conn/focused, so we never read the hub's field
  _lastErrAt = 0;   // throttle stack-trace bursts to one toast

  onConnect() {
    this.sub("/conn/error", msg => this.show(msg), 12);
    this.sub("/conn/focused", id => { this.focusedId = id; }, 12);
    this.sub("/conn/lifecycle", d => {
      if (d && d.state === "crashed" && d.id === this.focusedId) {
        this.show("mind crashed — see the process log");
      }
    }, 12);
    // An error line on the focused mind's process log (child stderr) is surfaced
    // even if the log is collapsed or out of view. A stack trace arrives as many
    // lines at once, so throttle to the first line of a burst.
    this.sub("/conn/log", d => {
      if (!d || d.stream !== "err") return;
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      if (now - this._lastErrAt < 4000) return;
      this._lastErrAt = now;
      const line = String(d.line || "").trim();
      this.show("⚠ error in process log — " + (line.length > 90 ? line.slice(0, 89) + "…" : line));
    }, 12);
  }

  show(msg) {
    this.textContent = msg;
    this.classList.add("show");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.classList.remove("show"), 5200);
  }
}
A.define("studio-toast", StudioToast);
