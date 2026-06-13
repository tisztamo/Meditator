import A from "amanita";

/**
 * studio-log — the collapsible per-mind process log (the focused child's
 * stdout/stderr). display:contents, so the <details> it renders sits directly in
 * the right column under the structure tree. Clears on focus change; caps at 500
 * lines. Ports appendLog from the old monolith.
 */
export class StudioLog extends A(HTMLElement) {
  count = 0;

  onConnect() {
    this.innerHTML =
      `<details class="logs" id="logBox"><summary>process log <span id="logHint" style="color:var(--faint)"></span></summary><div id="log"></div></details>`;
    this.logEl = this.querySelector("#log");
    this.hintEl = this.querySelector("#logHint");
    this.sub("/conn/focusReset", () => this.reset(), 12);
    this.sub("/conn/log", d => { if (d) this.append(d.stream, d.line); }, 12);
  }

  reset() { this.logEl.innerHTML = ""; this.hintEl.textContent = ""; this.count = 0; }

  append(stream, line) {
    const stick = this.logEl.scrollHeight - this.logEl.scrollTop - this.logEl.clientHeight < 40;
    const div = document.createElement("div");
    div.className = "ln" + (stream === "err" ? " err" : "");
    div.textContent = line;
    this.logEl.appendChild(div);
    while (this.logEl.children.length > 500) this.logEl.removeChild(this.logEl.firstChild);
    this.count++;
    this.hintEl.textContent = `· ${this.count}`;
    if (stick) this.logEl.scrollTop = this.logEl.scrollHeight;
  }
}
A.define("studio-log", StudioLog);
