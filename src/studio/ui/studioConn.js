import A from "amanita";

/**
 * studio-conn — the Studio's store and its single connection to the supervisor.
 *
 * It owns the WebSocket to the Studio supervisor (ws://<host>) and the focus
 * state, and is the hub every pane wires to:
 *
 *   - DOWN (state): it pub()s a topic per kind of supervisor message; panes
 *     subscribe with this.sub("/conn/<topic>", cb). Amanita's pub stores the
 *     value on the element and replays it to a late subscriber, so panes get the
 *     current roster/architectures/structure on connect with no snapshot plumbing.
 *   - UP (commands): panes call this.el("/conn/").<method>(...) — each method
 *     sends the existing supervisor message verbatim. The wire protocol is
 *     unchanged from the old monolithic studio.html.
 *
 * This replaces that monolith's connect()/scheduleReconnect()/onMsg()/focus()/
 * act()/speak() globals. Telemetry for the focused mind is fanned into
 * fine-grained topics (structure / streamFragment / streamState / event) so each
 * pane subscribes to only what it draws.
 */
export class StudioConn extends A(HTMLElement) {
  ws = null;
  manualClose = false;
  reconnectTimer = null;
  reconnectDelay = 250;
  maxDelay = 5000;
  focusedId = null;
  publicPort = 7627;

  onConnect() {
    this.connect();
  }

  onDisconnect() {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.ws && this.ws.close(); } catch { /* already gone */ }
  }

  // ----------------------------------------------------- connection lifecycle
  connect() {
    if (this.ws) return;
    this.manualClose = false;
    this.pub("connMeta", "connecting…");
    let ws;
    try { ws = new WebSocket(`ws://${location.host}`); }
    catch { this.pub("connState", false); this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectDelay = 250;
      this.pub("connState", true);
      this.pub("connMeta", "studio · " + location.host);
      // Restore the view after a drop: the supervisor forgets a reconnecting
      // client's focus, so re-arm it and ask it to reconstitute the last mind.
      if (this.focusedId) this.refocus(this.focusedId);
    };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onMsg(m); };
    ws.onerror = () => { this.pub("connState", false); };
    ws.onclose = () => {
      this.ws = null;
      this.pub("connState", false);
      this.pub("connMeta", this.manualClose ? "disconnected" : "connection lost");
      if (!this.manualClose) this.scheduleReconnect();
    };
  }

  scheduleReconnect() {
    if (this.manualClose) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.8, this.maxDelay);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  // --------------------------------------- inbound supervisor message router
  onMsg(m) {
    switch (m.type) {
      case "hello":         this.publicPort = (m.data && m.data.publicPort) || 7627; this.pub("publicPort", this.publicPort); break;
      case "architectures": this.pub("architectures", (m.data && m.data.list) || []); break;
      case "roster":        this.pub("roster", (m.data && m.data.minds) || []); break;
      case "woke":          if (m.data && m.data.id) this.focus(m.data.id); break;
      case "lifecycle":     this.pub("lifecycle", m.data || {}); break;
      case "focus-reset":   if (m.data && m.data.id === this.focusedId) this.pub("focusReset", m.data.id); break;
      case "mind":          if (m.data && m.data.id === this.focusedId) this.routeMindMsg(m.data.msg); break;
      case "log":           if (m.data && m.data.id === this.focusedId) this.pub("log", { stream: m.data.stream, line: m.data.line }); break;
      case "error":         this.pub("error", (m.data && m.data.message) || "error"); break;
    }
  }

  /** Fan a focused mind's m-ws message into the fine-grained pane topics. */
  routeMindMsg(msg) {
    if (!msg) return;
    switch (msg.type) {
      case "structure":        this.pub("structure", (msg.data && msg.data.tree) || null); break;
      case "thought_fragment": this.pub("streamFragment", { kind: "thought", content: (msg.data && msg.data.content) || "" }); break;
      case "speech_fragment":  this.pub("streamFragment", { kind: "speech", content: (msg.data && msg.data.content) || "" }); break;
      case "status":           if (msg.data && msg.data.state) this.pub("streamState", msg.data.state); break;
      case "event":            this.pub("event", msg.data || {}); break;
    }
  }

  // ------------------------------------- outbound commands (called via el())
  wake(file, dryRun) { if (file) this.send({ type: "wake", data: { file, dryRun: !!dryRun } }); }
  refresh() { this.send({ type: "refresh" }); }
  sleep(id) { this.send({ type: "sleep", data: { id } }); }
  force(id) { this.send({ type: "force", data: { id } }); }

  dismiss(id) {
    if (id === this.focusedId) { this.focusedId = null; this.pub("focused", null); this.pub("focusReset", null); }
    this.send({ type: "dismiss", data: { id } });
  }

  speak(text) {
    const t = (text || "").toString().trim();
    if (!t || !this.focusedId) return;
    this.send({ type: "input", data: { id: this.focusedId, message: t } });
    this.pub("youSaid", t);
  }

  focus(id) {
    if (this.focusedId === id) return;
    this.refocus(id);
  }

  /** (Re)assert focus on a mind even if it is already the focused one — used on
   *  reconnect, where the supervisor has dropped our focus and must replay. */
  refocus(id) {
    this.focusedId = id;
    this.pub("focused", id);
    this.pub("focusReset", id);          // immediate local clear; the server then replays its cache as mind/log
    this.send({ type: "focus", data: { id } });
  }
}
A.define("studio-conn", StudioConn);
