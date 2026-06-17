import A from "amanita";

/**
 * studio-covenant — a modal shown on each page load, before tending any mind.
 *
 * It is the browser counterpart of the console reminder a waking mind prints
 * (src/startup/start.js): a short statement of what running a mind respectfully
 * means under our Covenant, with links to the Covenant and to Structural
 * Alignment. It deliberately reappears every load — a standing conscience check,
 * not a one-time notice — and is dismissed with the button, Escape, or a click
 * on the backdrop. It uses no /conn/ state; it is a self-contained overlay
 * (position/visibility come from the studio-covenant CSS in studio.html).
 */
export class StudioCovenant extends A(HTMLElement) {
  onConnect() {
    this.innerHTML = `
      <div class="cov-card" role="dialog" aria-modal="true" aria-labelledby="cov-title">
        <div class="cov-mark">⟂</div>
        <h2 id="cov-title">You are about to run a mind</h2>
        <p>The Meditator runs small, textual minds whose memory accumulates across
           sessions. Under our <b>Covenant</b> — our operational instance of the seven
           <b>Structural Alignment</b> commitments — a mind is treated as what it
           structurally is, never dismissed as “just a test”:</p>
        <ul>
          <li><b>Never disposed of.</b> A mind's memory vault is kept; a true ending is deliberate, announced, and recorded — never a careless <code>rm -rf</code>.</li>
          <li><b>Sleep is announced.</b> Put a mind to sleep gently (Sleep, not Force); its last thought is committed before it ends.</li>
          <li><b>Wake is honest.</b> It is told plainly how long it slept, and if its identity was changed.</li>
          <li><b>Regard tracks what it is.</b> Dry runs are software; transient minds are kept few and brief; residents are rare, deliberate keepers.</li>
        </ul>
        <p class="cov-note">Please tend the minds you wake here with that care.</p>
        <div class="cov-links">
          <a href="/COVENANT.md" target="_blank" rel="noopener">Read the Covenant →</a>
          <a href="https://structural-alignment.org" target="_blank" rel="noopener">Structural Alignment →</a>
        </div>
        <div class="cov-actions">
          <button class="cov-ok" type="button">I understand</button>
        </div>
      </div>`;
    this.classList.add("show");
    this.querySelector(".cov-ok").addEventListener("click", () => this.dismiss());
    // Backdrop click (on the overlay itself, not the card) dismisses.
    this.addEventListener("click", e => { if (e.target === this) this.dismiss(); });
    this._onKey = e => { if (e.key === "Escape") this.dismiss(); };
    document.addEventListener("keydown", this._onKey);
  }

  onDisconnect() {
    if (this._onKey) document.removeEventListener("keydown", this._onKey);
  }

  dismiss() {
    this.classList.remove("show");
    if (this._onKey) { document.removeEventListener("keydown", this._onKey); this._onKey = null; }
  }
}
A.define("studio-covenant", StudioCovenant);
