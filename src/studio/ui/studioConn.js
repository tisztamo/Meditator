import A from "amanita";
import { getPref, setPref } from "./studioPrefs.js";

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
 *   - UP (commands): a pane dispatches a bubbling "studio-command" DOM event;
 *     studio-conn adds one listener (onConnect) that routes detail.cmd through
 *     run() to the transport wrapper below. Panes no longer reach in and call the
 *     hub — the browser mirror of a faculty raising interrupt-request for the
 *     arbiter (see doc/architecture/interrupts.md). The wrappers still send the
 *     existing supervisor message verbatim; the wire protocol is unchanged from
 *     the old monolithic studio.html.
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
  // The highest stream-timeline seq we have rendered for the focused mind. Sent as
  // `sinceSeq` so the supervisor can reply with just the delta on a live reconnect;
  // null means "fresh — give me the recent tail". Reset when focus changes.
  highestSeq = null;
  roster = [];
  _restored = false;
  _onVis = null;
  // Consecutive connect attempts that never reached `open`. Behind HTTPS this most
  // likely means the auth cookie expired and the WS upgrade is now rejected (401);
  // past a threshold we reload so the HTTP gate can redirect to /login (A4).
  failedConnects = 0;
  _opened = false;

  onConnect() {
    this.connect();
    // UP path: panes dispatch a bubbling "studio-command"; we are its single
    // listener — the analogue of m-interrupts hearing interrupt-request — and
    // route each to its transport wrapper via run(). Another listener (a logger,
    // a confirm gate) can interpose ahead of us without any pane knowing.
    this.addEventListener("studio-command", e => this.run(e.detail));
    // Tell the stream when the tab is hidden so it stops the rAF reveal (which a
    // background tab throttles to ~0 Hz, letting the queue grow unbounded) and
    // appends live text instantly instead. Returning needs no animated catch-up.
    // Coming back also kicks a reconnect (see resume()) so the view isn't stale.
    this._onVis = () => { this.pub("hidden", typeof document !== "undefined" && document.hidden === true); this.resume(); };
    // pageshow with persisted=true is a back/forward-cache restore: the socket was
    // closed entering the cache, so force it gone before reconnecting.
    this._onShow = e => { if (e && e.persisted && this.ws) { try { this.ws.close(); } catch { /* gone */ } this.ws = null; } this.resume(); };
    this._onOnline = () => this.resume();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this._onVis);
    if (typeof window !== "undefined") { window.addEventListener("pageshow", this._onShow); window.addEventListener("online", this._onOnline); }
    this.pub("hidden", typeof document !== "undefined" && document.hidden === true);
  }

  onDisconnect() {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this._onVis && typeof document !== "undefined") document.removeEventListener("visibilitychange", this._onVis);
    if (typeof window !== "undefined") { window.removeEventListener("pageshow", this._onShow); window.removeEventListener("online", this._onOnline); }
    try { this.ws && this.ws.close(); } catch { /* already gone */ }
  }

  /** Resume hook (tab shown again / bfcache restore / network returned). A frozen
   *  mobile tab usually has a dead socket while its reconnect timer was frozen too,
   *  so the dashboard looks stale; drop the dead socket and reconnect *now*. The
   *  supervisor then resends the roster and re-runs the focus backfill, so live
   *  state catches up at once instead of waiting out the backoff. */
  resume() {
    if (typeof document !== "undefined" && document.hidden) return;          // still hidden — wait
    if (this.ws && this.ws.readyState !== WebSocket.OPEN && this.ws.readyState !== WebSocket.CONNECTING) {
      try { this.ws.close(); } catch { /* already gone */ }
      this.ws = null;                                                        // a CLOSED socket would block connect()'s guard
    }
    if (!this.ws) {
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      this.reconnectDelay = 250;
      this.connect();
    }
  }

  // ----------------------------------------------------- connection lifecycle
  connect() {
    if (this.ws) return;
    this.manualClose = false;
    this._opened = false;
    this.pub("connMeta", "connecting…");
    let ws;
    // Match the page's scheme: a plain ws:// is blocked as mixed content behind
    // HTTPS, which is how the Studio is served remotely (wss:// at the edge).
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    try { ws = new WebSocket(`${scheme}://${location.host}`); }
    catch { this.pub("connState", false); this.scheduleReconnect(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectDelay = 250;
      this._opened = true;
      this.failedConnects = 0;
      this.pub("connState", true);
      this.pub("connMeta", "studio · " + location.host);
      // Restore the view after a drop: the supervisor forgets a reconnecting
      // client's focus, so re-arm it and ask it to reconstitute the last mind.
      if (this.focusedId) this.refocus(this.focusedId);
    };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onMsg(m); };
    ws.onerror = () => { this.pub("connState", false); };
    ws.onclose = () => {
      const opened = this._opened;
      this.ws = null;
      this.pub("connState", false);
      this.pub("connMeta", this.manualClose ? "disconnected" : "connection lost");
      if (this.manualClose) return;
      // A handshake that never opened, repeated, points at an expired cookie (the
      // upgrade is rejected before `open`). Reload once we've backed off enough —
      // GET / then redirects to /login — instead of looping the reconnect forever.
      if (!opened && ++this.failedConnects >= 6 && typeof location !== "undefined") {
        this.pub("connMeta", "session expired — reloading…");
        location.reload();
        return;
      }
      this.scheduleReconnect();
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
      case "hello":
        this.publicPort = (m.data && m.data.publicPort) || 7627;
        this.pub("publicPort", this.publicPort);
        this.pub("profiles", (m.data && m.data.profiles) || []);
        this.pub("defaultProfile", (m.data && m.data.modelProfile) || null);
        this.pub("voice", (m.data && m.data.voice) || { enabled: false });
        break;
      case "architectures": this.pub("architectures", (m.data && m.data.list) || []); break;
      case "roster":        this.roster = (m.data && m.data.minds) || []; this.pub("roster", this.roster); this._maybeRestoreFocus(); break;
      case "woke":          if (m.data && m.data.id) this.focus(m.data.id); break;
      case "lifecycle":     this.pub("lifecycle", m.data || {}); break;
      case "state":         this.onState(m.data); break;
      case "backfill":      this.onBackfill(m.data); break;
      case "mind":          this.onMindMsg(m.data); break;
      case "log":           if (m.data && m.data.id === this.focusedId) this.pub("log", { stream: m.data.stream, line: m.data.line }); break;
      case "error":         this.pub("error", (m.data && m.data.message) || "error"); break;
    }
  }

  /** A focus reply: the current projection (structure + latest status/telemetry)
   *  for the header and tree. Fanned through the existing topics; the stream
   *  ignores these (it is awaiting its backfill batch). */
  onState(d) {
    if (!d || d.id !== this.focusedId) return;
    if (d.structure) this.pub("structure", d.structure);
    if (d.status) this.pub("streamState", d.status);
    for (const ev of d.snapshots || []) this.pub("event", ev);
  }

  /** The ordered stream timeline (tail on a fresh load, delta on reconnect). The
   *  stream paints it in one synchronous pass. */
  onBackfill(d) {
    if (!d || d.id !== this.focusedId) return;
    if (typeof d.lastSeq === "number") this.highestSeq = Math.max(this.highestSeq || 0, d.lastSeq);
    this.pub("backfill", d.entries || []);
  }

  /** A live telemetry message for the focused mind. The envelope may carry the
   *  timeline `seq` it advanced, which we track for the next reconnect's delta. */
  onMindMsg(d) {
    if (!d || d.id !== this.focusedId) return;
    if (typeof d.seq === "number") this.highestSeq = Math.max(this.highestSeq || 0, d.seq);
    this.routeMindMsg(d.msg);
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

  // --------------------------------------------------- outbound commands
  // Reached only by run() below (the "studio-command" listener), never across
  // components. Each wrapper sends the existing supervisor message verbatim — it
  // is the transport boundary, the browser counterpart of m-ws (see
  // doc/studio-wiring.md "Deliberately not inverted").

  /** The single command listener: map a "studio-command" event's detail to its
   *  wrapper. Mirrors the arbiter mapping an interrupt-request to its handling. */
  run(d) {
    if (!d || !d.cmd) return;
    switch (d.cmd) {
      case "speak":   this.speak(d.text); break;
      case "wake":    this.wake(d.file, d.dryRun, d.modelProfile, d.name, d.origin, d.projectRoot, d.interlocutor); break;
      case "refresh": this.refresh(); break;
      case "sleep":   this.sleep(d.id); break;
      case "force":   this.force(d.id); break;
      case "dismiss": this.dismiss(d.id); break;
      // Every focus *command* (a roster tap) pulses revealStream so the mobile pane
      // switcher can jump to the Stream — even when the tapped mind is already the
      // focused one (focus() below dedups same-id, so /conn/focused wouldn't re-fire).
      case "focus":   if (d.id) this.pub("revealStream", d.id); this.focus(d.id); break;
    }
  }

  wake(file, dryRun, modelProfile, name, origin, projectRoot, interlocutor) {
    if (file) this.send({ type: "wake", data: { file, dryRun: !!dryRun, modelProfile: modelProfile || null, name: name || null, origin: origin || null, projectRoot: projectRoot || null, interlocutor: interlocutor || null } });
  }
  refresh() { this.send({ type: "refresh" }); }
  sleep(id) { this.send({ type: "sleep", data: { id } }); }
  force(id) { this.send({ type: "force", data: { id } }); }

  dismiss(id) {
    if (id === this.focusedId) { this.focusedId = null; this.highestSeq = null; this.pub("focused", null); this.pub("focusReset", null); this._remember(null); }
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
    this.highestSeq = null;              // a different mind → reconstitute from its recent tail
    this._restored = true;
    this.refocus(id);
    this._remember(id);
  }

  /** (Re)assert focus on a mind. On a fresh focus (highestSeq null) we clear the
   *  panes and ask for the recent tail; on a live reconnect we keep what is shown
   *  and ask only for the delta since `highestSeq`. */
  refocus(id) {
    this.focusedId = id;
    this.pub("focused", id);
    if (this.highestSeq == null) this.pub("focusReset", id);   // fresh: clear + repaint tail
    else this.pub("replayResume", id);                          // reconnect: keep + append delta
    this.send({ type: "focus", data: { id, sinceSeq: this.highestSeq } });
  }

  // ----------------------------------------------- focus persistence (reload)
  /** Remember the focused mind by id AND durable home, so a reload re-opens it. */
  _remember(id) {
    if (!id) { setPref("focus", null); return; }
    const m = this.roster.find(x => x.id === id);
    setPref("focus", { id, home: m && m.home });
  }

  /** After a reload the page has no focus; re-open the last-focused mind if it is
   *  in the roster (match by id while the supervisor is the same run, else by its
   *  durable home). Runs once, when a matching mind first appears. */
  _maybeRestoreFocus() {
    if (this._restored || this.focusedId) return;
    const saved = getPref("focus", null);
    if (!saved) { this._restored = true; return; }
    const match = this.roster.find(x => x.id === saved.id) || this.roster.find(x => x.home && x.home === saved.home);
    if (match) { this._restored = true; this.focus(match.id); }
    // else: leave it pending so a later roster (the mind waking) can still restore.
  }
}
A.define("studio-conn", StudioConn);
