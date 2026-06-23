import A from "amanita";
import { esc } from "./helpers.js";

/**
 * studio-header — the top bar: connection dot, focused-mind identity, the
 * energy/spend gauge, and the state pill (thinking / speaking / asleep / …).
 *
 * It is display:contents, so the brand / focusmeta / state spans it renders
 * become the flex children of the surrounding <header> (the existing CSS is
 * untouched). It owns the pill, so it tracks the focused mind's stream state and
 * speaking flag (the stream pane tracks its own copy independently, for thinned
 * paragraphs). Ports updateFocusHeader / clearFocusHeader / updateStatePill /
 * the gauge half of onEnergy from the old monolith.
 */
export class StudioHeader extends A(HTMLElement) {
  byId = {};
  focusedId = null;
  publicPort = 7627;
  speaking = false;
  streamState = "idle";

  onConnect() {
    this.innerHTML = `
      <span class="brand"><span class="dot" data-dot></span><span class="mark">⟂</span> Meditator <span style="color:var(--faint);font-weight:400">Studio</span></span>
      <div class="focusmeta" data-focusmeta><span class="dim">no mind in focus</span></div>
      <div class="state">
        <span class="gauge" title="energy / spend">⚡<span class="bar"><i data-energybar></i></span><span data-energytxt>—</span></span>
        <span class="pill" data-pill>—</span>
        <span class="meta" data-connmeta style="font-family:var(--mono);font-size:.74rem;color:var(--faint)">connecting…</span>
      </div>`;
    this.dot = this.querySelector("[data-dot]");
    this.focusMeta = this.querySelector("[data-focusmeta]");
    this.energyBar = this.querySelector("[data-energybar]");
    this.energyTxt = this.querySelector("[data-energytxt]");
    this.pill = this.querySelector("[data-pill]");
    this.connMeta = this.querySelector("[data-connmeta]");

    this.sub("/conn/connState", on => this.dot.classList.toggle("live", !!on));
    this.sub("/conn/connMeta", txt => { if (txt != null) this.connMeta.textContent = txt; });
    this.sub("/conn/publicPort", p => { this.publicPort = p || 7627; });
    this.sub("/conn/roster", arr => this.onRoster(arr));
    this.sub("/conn/focused", id => this.onFocused(id));
    this.sub("/conn/@lifecycle", e => this.onLifecycle(e.detail));
    this.sub("/conn/streamState", s => { this.streamState = (s === "streaming") ? "thinking" : "idle"; this.updatePill(); });
    this.sub("/conn/@event", e => this.onEvent(e.detail)).catch(() => {});
  }

  onRoster(arr) {
    this.byId = {};
    for (const m of (arr || [])) this.byId[m.id] = m;
    if (this.focusedId && this.byId[this.focusedId]) this.renderFocus(this.byId[this.focusedId]);
  }

  onFocused(id) {
    this.focusedId = id;
    this.speaking = false; this.streamState = "idle";
    this.energyBar.style.width = "0"; this.energyTxt.textContent = "—";    // reset gauge; the new mind's snapshot refills it
    if (!id) { this.clearFocus(); return; }
    const m = this.byId[id];
    if (m) this.renderFocus(m);
  }

  onLifecycle(d) {
    if (!d || !d.id) return;
    const m = this.byId[d.id];
    if (m) { m.state = d.state; m.detail = d.detail; }
    if (d.id === this.focusedId) {
      if (d.state === "exited" || d.state === "crashed" || d.state === "sleeping") { this.speaking = false; this.streamState = "idle"; }
      if (m) this.renderFocus(m); else this.renderPillForState(d.state);
    }
  }

  onEvent(d) {
    const route = `${d.process}/${d.kind}`;
    if (route === "economy/energy") {
      const e = typeof d.energy === "number" ? d.energy : 1;
      this.energyBar.style.width = Math.max(0, Math.min(1, e)) * 100 + "%";
      this.energyTxt.textContent = e.toFixed(2) + (d.paceFactor > 1 ? ` ·x${d.paceFactor}` : "");
    } else if (route === "speech/speaking") {
      this.speaking = !!d.speaking; this.updatePill();
    }
  }

  renderFocus(m) {
    this.focusMeta.innerHTML =
      `<span class="nm">${esc(m.name || m.file)}</span>` +
      `<span>${esc(m.file)}</span><span>:${m.port}${m.public ? ` <span class="pub">public ${this.publicPort}</span>` : ""}</span>` +
      `<span>→ ${esc(m.home)}</span>`;
    this.renderPillForState(m.state);
  }

  renderPillForState(state) {
    if (state === "exited" || state === "crashed") { this.pill.className = "pill asleep"; this.pill.textContent = state === "crashed" ? "crashed" : "asleep"; }
    else if (state === "sleeping") { this.pill.className = "pill asleep"; this.pill.textContent = "sleeping…"; }
    else this.updatePill();
  }

  clearFocus() {
    this.focusMeta.innerHTML = `<span class="dim">no mind in focus</span>`;
    this.pill.className = "pill"; this.pill.textContent = "—";
    this.energyBar.style.width = "0"; this.energyTxt.textContent = "—";
  }

  updatePill() {
    const sp = this.speaking;
    this.pill.className = "pill " + (sp ? "speaking" : this.streamState === "thinking" ? "thinking" : "");
    this.pill.textContent = sp ? (this.streamState === "thinking" ? "speaking + thinking" : "speaking") : this.streamState;
  }
}
A.define("studio-header", StudioHeader);
