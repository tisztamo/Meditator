import A from "amanita";

/**
 * studio-speak — the speak box under the stream. Enabled only while the focused
 * mind is awake; Enter or Send routes the line to studio-conn.speak(), which
 * sends it to the mind as an urgent stimulus and echoes it into the stream via
 * the "youSaid" topic. It is class="foot", inheriting the existing .foot CSS.
 */
export class StudioSpeak extends A(HTMLElement) {
  focusState = null;

  onConnect() {
    this.innerHTML =
      `<input type="text" maxlength="400" placeholder="Speak to the mind — words arrive as experience, not instruction" disabled autocomplete="off">` +
      `<button disabled>Send</button>`;
    this.input = this.querySelector("input");
    this.btn = this.querySelector("button");
    this.btn.addEventListener("click", () => this.speak());
    this.input.addEventListener("keydown", e => { if (e.key === "Enter") this.speak(); });

    this.sub("/conn/focused", id => {
      const conn = this.el("/conn/");
      const m = ((conn && conn.roster) || []).find(x => x.id === id);
      this.focusState = id ? (m ? m.state : "waking") : null;
      this.refresh();
    }, 12);
    this.sub("/conn/lifecycle", d => {
      const conn = this.el("/conn/");
      if (conn && d && d.id === conn.focusedId) { this.focusState = d.state; this.refresh(); }
    }, 12);
    this.sub("/conn/roster", () => {
      const conn = this.el("/conn/");
      const m = ((conn && conn.roster) || []).find(x => x.id === (conn && conn.focusedId));
      if (m) { this.focusState = m.state; this.refresh(); }
    }, 12);
  }

  refresh() {
    const on = this.focusState === "awake";
    this.input.disabled = !on;
    this.btn.disabled = !on;
  }

  speak() {
    const t = this.input.value.trim();
    if (!t) return;
    const conn = this.el("/conn/");
    if (conn) conn.speak(t);
    this.input.value = "";
  }
}
A.define("studio-speak", StudioSpeak);
