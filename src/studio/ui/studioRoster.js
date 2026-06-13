import A from "amanita";
import { esc } from "./helpers.js";

/**
 * studio-roster — the live roster of minds. One card per mind with its state
 * badge, port (+ public tag), memory home, detail line, energy meter and $spend,
 * and the lifecycle buttons (Sleep / Force / Dismiss). Clicking a card focuses
 * that mind. Buttons carry an action= attribute and are dispatched via
 * env("action", …) — the stereotic delegation idiom. Ports renderRoster.
 */
export class StudioRoster extends A(HTMLElement) {
  minds = []; focusedId = null;

  onConnect() {
    this.sub("/conn/roster", arr => { this.minds = arr || []; this.render(); }, 12);
    this.sub("/conn/focused", id => { this.focusedId = id; this.render(); }, 12);
    this.addEventListener("click", e => this.onClick(e));
  }

  conn() { return this.el("/conn/"); }

  onClick(e) {
    const action = this.env("action", e.target);
    const card = e.target.closest("[data-id]");
    const id = card && card.getAttribute("data-id");
    if (action) {
      e.stopPropagation();
      if (!id) return;
      if (action === "sleep") this.conn().sleep(id);
      else if (action === "force") { if (confirm("Force-kill this mind? Its last moments may be lost (the graceful ritual is already in progress).")) this.conn().force(id); }
      else if (action === "dismiss") this.conn().dismiss(id);
      return;
    }
    if (id) {
      const m = this.minds.find(x => x.id === id);
      const alive = m && (m.state === "waking" || m.state === "awake" || m.state === "sleeping");
      if (alive || id === this.focusedId) this.conn().focus(id);
    }
  }

  render() {
    this.innerHTML = "";
    if (!this.minds.length) { this.innerHTML = `<div class="empty">No minds yet.<br>Choose an architecture above and Wake one.</div>`; return; }
    for (const m of this.minds) {
      const card = document.createElement("div");
      card.className = "mind" + (m.id === this.focusedId ? " focused" : "");
      card.setAttribute("data-id", m.id);
      const alive = m.state === "waking" || m.state === "awake" || m.state === "sleeping";
      const e = typeof m.energy === "number" ? Math.max(0, Math.min(1, m.energy)) : null;
      const acts = [];
      if (typeof m.spent === "number") acts.push(`<span style="font-family:var(--mono);font-size:.7rem;color:var(--dim);margin-right:auto;align-self:center">$${m.spent.toFixed(3)}</span>`);
      if (m.state === "awake" || m.state === "waking") acts.push(`<button action="sleep">Sleep</button>`);
      if (m.state === "sleeping") acts.push(`<button action="force" class="force">Force</button>`);
      if (!alive) acts.push(`<button action="dismiss">Dismiss</button>`);
      card.innerHTML =
        `<div class="top"><span class="nm">${esc(m.name || m.file)}</span><span class="badge ${m.state}">${m.state}</span></div>` +
        `<div class="sub">${esc(m.file)} · :${m.port}${m.public ? ` <span class="pub">public</span>` : ""}${m.dryRun ? ` · dry` : ""}</div>` +
        `<div class="sub">→ <span class="home">${esc(m.home)}</span></div>` +
        (m.detail ? `<div class="det">${esc(m.detail)}</div>` : "") +
        (e !== null ? `<div class="meter"><i style="width:${(e * 100).toFixed(0)}%"></i></div>` : "") +
        `<div class="acts">${acts.join("")}</div>`;
      this.appendChild(card);
    }
  }
}
A.define("studio-roster", StudioRoster);
