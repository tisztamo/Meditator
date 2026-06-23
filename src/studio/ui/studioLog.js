import A from "amanita";

/**
 * studio-log — the collapsible per-mind process log (the focused child's
 * stdout/stderr). display:contents, so the <details> it renders sits directly in
 * the right column under the structure tree. Clears on focus change; caps at 500
 * lines. Ports appendLog from the old monolith.
 */
export class StudioLog extends A(HTMLElement) {
  count = 0;
  errCount = 0;
  _autoOpened = false;   // we pop the log open once per focus, on its first error

  onConnect() {
    this.innerHTML =
      `<details class="logs" id="logBox"><summary>process log <span id="logHint" style="color:var(--faint)"></span><span id="logErr" class="logerr"></span></summary><div id="log"></div></details>`;
    this.box = this.querySelector("#logBox");
    this.logEl = this.querySelector("#log");
    this.hintEl = this.querySelector("#logHint");
    this.errEl = this.querySelector("#logErr");
    this.sub("/conn/@focusReset", () => this.reset()).catch(() => {});
    this.sub("/conn/@log", e => { const d = e.detail; if (d) this.append(d.stream, d.line); }).catch(() => {});
  }

  reset() {
    this.logEl.innerHTML = "";
    this.hintEl.textContent = "";
    this.errEl.textContent = "";
    this.count = 0;
    this.errCount = 0;
    this._autoOpened = false;
  }

  append(stream, line) {
    const stick = this.logEl.scrollHeight - this.logEl.scrollTop - this.logEl.clientHeight < 40;
    const div = document.createElement("div");
    div.className = "ln" + (stream === "err" ? " err" : "");
    div.textContent = line;
    this.logEl.appendChild(div);
    while (this.logEl.children.length > 500) this.logEl.removeChild(this.logEl.firstChild);
    this.count++;
    this.hintEl.textContent = `· ${this.count}`;
    if (stream === "err") {
      this.errCount++;
      this.errEl.textContent = ` · ⚠ ${this.errCount} error${this.errCount === 1 ? "" : "s"}`;
      // Surface the trouble: open the log on its first error so the user actually
      // sees it, but only once — don't fight a user who deliberately closes it.
      if (!this._autoOpened) { this._autoOpened = true; this.box.open = true; }
    }
    if (stick) this.logEl.scrollTop = this.logEl.scrollHeight;
  }
}
A.define("studio-log", StudioLog);
