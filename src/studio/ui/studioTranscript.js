import A from "amanita";
import { esc, nearBottom, scrollDown } from "./helpers.js";

/**
 * studio-transcript — the focused AGENT's tool-calling transcript (id="transcript",
 * the flex:1 scroll column, sharing the stream column with studio-stream). It is the
 * operational twin of studio-stream: where a mind's stream shows thought/speech, an
 * agent's transcript shows the LOOP — each completed step as the model's text, the
 * tool calls it made, and the raw observations that came back — plus the final answer
 * (agent-loop.md §13 milestone 4).
 *
 * It shows itself only when the focused entity is an agent (/conn/focusedKind ===
 * "agent") and hides otherwise, so the two panes never both fill the column. Its data
 * arrives exactly like the stream's: a backfill batch on (re)focus (rows the supervisor
 * persisted, kinds "agent-step" / "agent-answer"), then live "agent/*" telemetry events.
 * The tool palette and the step/budget status are projection (shown even during replay);
 * step/answer come from the batch during replay, so their live snapshot echo is ignored.
 */
export class StudioTranscript extends A(HTMLElement) {
  focusedId = null;
  isAgent = false;
  _awaitingBatch = false;
  tools = [];

  onConnect() {
    this._show(false);
    this.clear("Focus an agent to watch it work.");
    this.sub("/conn/focusedKind", k => this._onKind(k)).catch(() => {});
    this.sub("/conn/focused", id => { this.focusedId = id; });
    this.sub("/conn/@focusReset", () => { this._awaitingBatch = true; this.tools = []; this.clear("reconstituting this agent"); }).catch(() => {});
    this.sub("/conn/replayResume", () => { this._awaitingBatch = true; }).catch(() => {});
    this.sub("/conn/backfill", entries => this.renderBatch(entries || []));
    this.sub("/conn/@event", e => this.onEvent(e && e.detail)).catch(() => {});
  }

  _onKind(k) {
    this.isAgent = k === "agent";
    this._show(this.isAgent);
  }
  _show(on) { this.style.display = on ? "" : "none"; }

  // ------------------------------------------------------------------- scaffold
  clear(msg) {
    this.innerHTML = `<div class="placeholder"><span class="big">⚙</span><span>${esc(msg)}</span></div>`;
    this._body = null; this._headEl = null; this._toolsEl = null; this._statusEl = null;
  }

  /** Build the head (tool palette + status) and the scrolling body once. */
  _prime() {
    if (this._body) return;
    this.innerHTML =
      `<div class="ag-head"><span class="ag-tools" data-tools></span><span class="ag-status" data-status></span></div>` +
      `<div class="ag-body" data-body></div>`;
    this._body = this.querySelector("[data-body]");
    this._toolsEl = this.querySelector("[data-tools]");
    this._statusEl = this.querySelector("[data-status]");
    this._renderTools();
  }

  // -------------------------------------------------------------------- inbound
  renderBatch(entries) {
    if (!this.isAgent) return;                 // a mind's backfill is the stream's, not ours
    this._awaitingBatch = false;
    if (!entries || !entries.length) return;
    this._prime();
    for (const e of entries) {
      if (!e || !e.k) continue;
      if (e.k === "agent-step") this._appendStep(e);
      else if (e.k === "agent-answer") this._appendAnswer(e);
    }
    scrollDown(this);
  }

  onEvent(d) {
    if (!this.isAgent || !d) return;
    const route = `${d.process}/${d.kind}`;
    // Projection — always applied, even mid-replay (idempotent).
    if (route === "agent/tools")  { this.tools = d.names || []; this._renderTools(); return; }
    if (route === "agent/status") { this._renderStatus(d); return; }
    // Transcript rows — during replay these come from the backfill batch, so skip the
    // snapshot echo the supervisor replays on focus (mirrors studio-stream's guard).
    if (this._awaitingBatch) return;
    if (route === "agent/step")   { this._prime(); this._appendStep(d); }
    else if (route === "agent/answer") { this._prime(); this._appendAnswer(d); }
  }

  // ------------------------------------------------------------------- rendering
  _renderTools() {
    if (!this._toolsEl) return;
    this._toolsEl.innerHTML = (this.tools || []).length
      ? this.tools.map(n => `<span class="ag-tool">${esc(n)}</span>`).join("")
      : "";
  }

  _renderStatus(d) {
    if (!this._statusEl) { this._prime(); }
    if (!this._statusEl) return;
    const step = typeof d.step === "number" ? d.step : null;
    const parts = [];
    if (d.state) parts.push(esc(d.state));
    if (step != null && d.maxSteps) parts.push(`step ${step}/${esc(String(d.maxSteps))}`);
    else if (step != null) parts.push(`step ${step}`);
    this._statusEl.textContent = parts.join(" · ");
  }

  /** Append one step: its assistant text, its tool calls, and the observations back. */
  _appendStep(s) {
    const stick = nearBottom(this);
    const el = document.createElement("div");
    el.className = "ag-step";
    const idx = typeof s.index === "number" ? s.index + 1 : null;
    let html = `<div class="ag-step-h">▸ step${idx != null ? ` ${idx}` : ""}</div>`;
    if (s.assistantText) html += `<div class="ag-say">${esc(s.assistantText)}</div>`;
    for (const c of s.calls || []) {
      html += `<div class="ag-call">→ <b>${esc(c.name || "?")}</b>(${esc(argPreview(c.args))})</div>`;
    }
    for (const o of s.observations || []) {
      html += `<div class="ag-obs${o.isError ? " err" : ""}">` +
              `<span class="ag-obs-h">${esc(o.name || "tool")}${o.isError ? " · error" : ""}</span>` +
              `<pre>${esc(o.observation || "")}</pre></div>`;
    }
    el.innerHTML = html;
    this._body.appendChild(el);
    if (stick) scrollDown(this);
  }

  /** Append the final answer block (once per task). */
  _appendAnswer(a) {
    const stick = nearBottom(this);
    const text = a.answer != null ? a.answer : (a.t || "");
    const el = document.createElement("div");
    el.className = "ag-answer";
    el.innerHTML = `<span class="lbl">answer${a.reason ? ` · ${esc(a.reason)}` : ""}</span>${esc(text)}`;
    this._body.appendChild(el);
    if (stick) scrollDown(this);
  }
}

/** Compact one-line preview of a tool call's arguments. */
function argPreview(args) {
  if (args == null) return "";
  let s;
  try { s = typeof args === "string" ? args : JSON.stringify(args); } catch { s = String(args); }
  s = s.replace(/\s+/g, " ");
  return s.length > 240 ? s.slice(0, 240) + "…" : s;
}

A.define("studio-transcript", StudioTranscript);
