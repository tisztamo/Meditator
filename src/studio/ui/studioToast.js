import A from "amanita";

/**
 * studio-toast — the transient bottom toast (id="toast", inheriting the fixed
 * positioning from the existing CSS). Shows supervisor errors, and a crash
 * notice for the focused mind (matching the old monolith's onLifecycle toast).
 */
export class StudioToast extends A(HTMLElement) {
  timer = null;

  onConnect() {
    this.sub("/conn/error", msg => this.show(msg), 12);
    this.sub("/conn/lifecycle", d => {
      const conn = this.el("/conn/");
      if (d && d.state === "crashed" && conn && d.id === conn.focusedId) {
        this.show("mind crashed — see the process log");
      }
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
