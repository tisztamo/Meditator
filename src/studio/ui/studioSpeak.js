import A from "amanita";
import { command } from "./helpers.js";

/**
 * studio-speak — the speak box under the stream. Enabled only while the focused
 * mind is awake; Enter or Send dispatch a "speak" studio-command, which the hub
 * sends to the mind as an urgent stimulus and echoes into the stream via the
 * "youSaid" topic. It is class="foot", inheriting the existing .foot CSS.
 *
 * It derives the focused mind's state purely from its subscriptions — caching
 * /conn/roster and /conn/focused — so it never reads the hub's fields.
 */
export class StudioSpeak extends A(HTMLElement) {
  focusState = null;
  roster = [];
  focusedId = null;

  onConnect() {
    this.innerHTML =
      `<input type="text" maxlength="400" placeholder="Speak to the mind — words arrive as experience, not instruction" disabled autocomplete="off">` +
      `<button disabled>Send</button>`;
    this.input = this.querySelector("input");
    this.btn = this.querySelector("button");
    this.btn.addEventListener("click", () => this.speak());
    this.input.addEventListener("keydown", e => { if (e.key === "Enter") this.speak(); });

    this.sub("/conn/focused", id => {
      this.focusedId = id;
      const m = this.roster.find(x => x.id === id);
      this.focusState = id ? (m ? m.state : "waking") : null;
      this.refresh();
    }, 12);
    this.sub("/conn/lifecycle", d => {
      if (d && d.id === this.focusedId) { this.focusState = d.state; this.refresh(); }
    }, 12);
    this.sub("/conn/roster", arr => {
      this.roster = arr || [];
      const m = this.roster.find(x => x.id === this.focusedId);
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
    command(this, "speak", { text: t });
    this.input.value = "";
  }
}
A.define("studio-speak", StudioSpeak);
