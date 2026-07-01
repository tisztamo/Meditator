import A from "amanita";
import { nearBottom, scrollDown } from "./helpers.js";
import { getPref } from "./studioPrefs.js";
// The stream's part-components register themselves on import; studio-stream creates
// them as the timeline grows. Importing here means a studio-stream is never used
// without its parts being defined (matters for the unit tests, too).
import "./studioThoughtRun.js";
import "./studioSpeech.js";
import "./studioStim.js";
import "./studioImage.js";

// Over a long run the monologue would grow without bound and bog the browser down.
// Keep roughly this many characters of rendered stream; older parts are dropped from
// the top. Stripped content is not lost — a reload backfills the recent window from
// the supervisor's persisted log.
const MAX_CHARS = 120000;
// A run with no landmark for a very long time is sealed at this size and a fresh run
// started, so the timeline stays a sequence of bounded, individually-prunable parts
// (a marathon think becomes a few stacked folds rather than one unbounded block).
// Generous, so a typical run — a handful of bursts between landmarks — stays whole.
const RUN_SOFT_CAP = 8000;

// Smoothing constants. The mind thinks in discrete bursts (one streamed LLM call
// each) on a fixed tick; raw, a burst arrives as a fast dump followed by quiet. In
// "flow" mode we hold the arriving text in a buffer and release it at a rate that
// drains the buffer over ~one tick, so the text trickles out continuously and the
// burst seam is barely visible. DRAIN_FRACTION < 1 keeps the buffer mostly empty by
// the time the next burst lands (bounding the added latency); MIN_WIN floors the
// window for very fast minds.
const DRAIN_FRACTION = 0.85;
const MIN_WIN = 700;

/**
 * studio-stream — the focused mind's stream of consciousness (id="stream",
 * inheriting the existing #stream CSS; it is the flex:1 scroll column).
 *
 * It is the timeline's MODEL and sequencer, not its renderer. The stream of fragments
 * and events is grouped — once, independent of display mode — into a sequence of
 * part-components that own their own data and render themselves:
 *
 *   - studio-thought-run — a run of thinking between two landmarks (renders fold /
 *     flow / raw from its own data, and re-renders when the mode changes);
 *   - studio-speech / studio-stim / studio-image — the landmarks, mode-independent.
 *
 * Because each part renders itself from its data according to the CURRENT mode (a
 * retained `mode` topic the parts subscribe to via `../mode`), switching display mode
 * re-renders the whole column — settled parts and the in-flight run alike. What you
 * see never depends on which mode happened to be active when the text arrived.
 *
 * This component's remaining jobs are: subscribe to the hub's /conn/ topics; route
 * fragments/events through one mode-independent ingestion state machine into the live
 * part; meter the "flow" reveal (the rAF pump below) by feeding the live part; prune
 * old parts; repaint a backlog in one synchronous pass; and re-publish the display
 * mode so the parts react.
 *
 * Display modes are owned by the studio-streammode control in the column header (it
 * publishes the mode on `/streammode/mode`; we subscribe and re-publish as our own
 * `mode` topic) and remembered in localStorage. "fold" is the default.
 */
export class StudioStream extends A(HTMLElement) {
  // the live tail: the trailing parts live fragments grow (each is null between landmarks)
  liveRun = null; liveSpeech = null;
  speaking = false; primed = false; chars = 0;
  // display mode: "fold" (default) | "flow" | "raw". Source of truth + republished topic.
  mode = "fold";
  // flow-mode reveal engine
  tickMs = 8000; q = []; _raf = null; _lastT = null; _acc = 0;
  // `smooth` (the flow reveal) is derived, so the pump/seam code reads it unchanged.
  get smooth() { return this.mode === "flow"; }
  // _awaitingBatch: between a (re)focus and its backfill batch, ignore projection
  //   events (they rehydrate the header/tree, not the stream). hidden: the tab is
  //   backgrounded — append live text instantly instead of feeding the rAF pump.
  //   _batching: inside renderBatch — suppress per-item scroll/prune (done once at end).
  _awaitingBatch = false; hidden = false; _batching = false;
  // The focused mind's id, cached from /conn/focused so onLifecycle can match it.
  focusedId = null;
  // The thought stream belongs to a MIND. When an agent is focused, the transcript pane
  // (studio-transcript) owns the stream column instead, so we hide and ignore telemetry.
  isAgent = false;

  onConnect() {
    this.mode = this._loadMode();
    this.pub("mode", this.mode);     // retained → a part paints in the right mode on connect
    this.clear("Wake a mind, or focus one, to watch its stream.");
    // The fold/flow/raw toggle is its own mesh component (studio-streammode) in the
    // column header; we react to the mode it publishes and re-publish it for our parts.
    this.sub("/streammode/mode", m => this.setMode(m)).catch(() => {});

    // Track the focused id from its topic, so lifecycle messages can be matched
    // to the mind we are showing without reading the hub.
    this.sub("/conn/focused", id => { this.focusedId = id; });
    // Hide (and stop ingesting) when the focused entity is an agent — its transcript
    // pane owns the stream column then (agent-loop.md §13).
    this.sub("/conn/focusedKind", k => { this.isAgent = k === "agent"; this.style.display = this.isAgent ? "none" : ""; }).catch(() => {});
    // Fresh focus: clear and await the backfill batch. Reconnect: keep what is
    // shown, settle the live tail, and await the delta batch.
    this.sub("/conn/@focusReset", () => { this.clear("reconstituting this mind"); this._awaitingBatch = true; }).catch(() => {});
    this.sub("/conn/replayResume", () => { this._awaitingBatch = true; this.prime(); this.sealRun(); this.sealSpeech(); });
    this.sub("/conn/backfill", entries => this.renderBatch(entries || []));
    this.sub("/conn/hidden", h => this.setHidden(!!h));
    this.sub("/conn/@streamFragment", e => { const f = e.detail; if (f) this.onFragment(f); });
    this.sub("/conn/@event", e => this.onEvent(e.detail)).catch(() => {});
    this.sub("/conn/@lifecycle", e => this.onLifecycle(e.detail));
  }

  clear(msg) {
    this.innerHTML = `<div class="placeholder"><span class="big">…</span><span>${msg}</span></div>`;
    this.liveRun = null; this.liveSpeech = null; this.speaking = false; this.primed = false; this.chars = 0;
    this.q = []; this._cancel(); this._lastT = null; this._acc = 0;
  }
  prime() { if (!this.primed) { this.innerHTML = ""; this.primed = true; this.chars = 0; this.liveRun = null; this.liveSpeech = null; } }

  /** Bound the DOM: once banked text exceeds MAX_CHARS, drop the oldest parts. Never
   *  touch the live tail (liveRun / liveSpeech). When the user is reading back (not
   *  pinned), compensate scrollTop so the view doesn't jump. */
  prune(stick) {
    if (this.chars <= MAX_CHARS) return;
    const before = stick ? 0 : this.scrollHeight;
    while (this.chars > MAX_CHARS) {
      const first = this.firstElementChild;
      if (!first || first === this.liveRun || first === this.liveSpeech) break;
      this.chars -= (typeof first.weight === "number" ? first.weight : (first.textContent || "").length);
      first.remove();
    }
    if (stick) scrollDown(this);
    else { const removed = before - this.scrollHeight; if (removed > 0) this.scrollTop = Math.max(0, this.scrollTop - removed); }
  }

  // ----------------------------------------------------- inbound (mode is for METERING only)
  onFragment(f) {
    if (this.isAgent) return;        // an agent has no thought stream — the transcript pane draws it
    this._awaitingBatch = false;     // a live fragment means replay is over
    this.prime();
    const kind = f.kind === "speech" ? "speech" : "thought";
    const text = f.content || "";
    // Flow mode meters the reveal — but only while visible. A hidden tab appends
    // instantly so the queue can't grow unbounded behind a throttled rAF.
    if (this.smooth && !this.hidden) this.enqueue({ t: kind, s: text, i: 0 });
    else if (kind === "speech") this._applySpeech(text);
    else this._applyThought(text);
  }

  onEvent(d) {
    if (this.isAgent) return;        // agent telemetry is drawn by the transcript pane
    const route = `${d.process}/${d.kind}`;
    // The mind's burst tick — size the reveal window from it. (Always honoured, even
    // mid-replay, since it only tunes the live pump.)
    if (route === "mind/pace") { if (d.tickMs > 0) this.tickMs = d.tickMs; return; }
    // During replay, projection snapshot events rehydrate the header/tree only; the
    // stream's content comes from its backfill batch.
    if (this._awaitingBatch) return;
    if (this.smooth && !this.hidden) {
      switch (route) {
        case "stream/boundary":    this.prime(); this.enqueue({ t: "bnd", d }); break;
        case "attention/urgent":   this.enqueue({ t: "stim", text: d.type === "UserInput" ? d.reason : (d.text || d.reason || "urgent stimulus"), cls: d.type === "UserInput" ? "you" : null }); break;
        case "attention/decision": if (d.accepted && !d.urgent) this.enqueue({ t: "stim", text: d.type === "UserInput" ? d.reason : (d.text || d.reason || d.type), cls: d.type === "UserInput" ? "you" : null }); break;
        case "speech/speaking":    this.enqueue({ t: "speaking", on: d.speaking }); break;
        case "image/generated":    this.prime(); this.enqueue({ t: "image", d }); break;
        case "image/error":        this.enqueue({ t: "stim", text: `Image generation failed: ${d.message || "error"}`, cls: "warn" }); break;
      }
      return;
    }
    switch (route) {
      case "stream/boundary":    this._applyBoundary(d); break;
      case "attention/urgent":   this._applyStim(d.type === "UserInput" ? d.reason : (d.text || d.reason || "urgent stimulus"), d.type === "UserInput" ? "you" : null); break;
      case "attention/decision": if (d.accepted && !d.urgent) this._applyStim(d.type === "UserInput" ? d.reason : (d.text || d.reason || d.type), d.type === "UserInput" ? "you" : null); break;
      case "speech/speaking":    this._applySpeaking(d.speaking); break;
      case "image/generated":    this._applyImage(d); break;
      case "image/error":        this._applyStim(`Image generation failed: ${d.message || "error"}`, "warn"); break;
    }
  }

  onLifecycle(d) {
    if (!d || d.id !== this.focusedId) return;
    if (d.state === "exited" || d.state === "crashed" || d.state === "sleeping") {
      if (this.smooth && !this.hidden) this.enqueue({ t: "stop" });
      else this._applyStop();
    }
  }

  /** A stimulus marker, ordered into the reveal in flow (instant when hidden). */
  stim(text, cls) {
    if (this.smooth && !this.hidden) this.enqueue({ t: "stim", text, cls });
    else this._applyStim(text, cls);
  }

  // ------------------------------------------- ingestion state machine (mode-independent)
  // Grouping into runs and landmarks is identical in every mode; only the metering
  // (above) and each part's rendering vary. That is what makes a mode switch a pure
  // re-render of the same data.

  _makeRun() {
    const el = document.createElement("studio-thought-run");
    el.record = { text: "", bounds: [], thinned: this.speaking, t0: this._now(), t1: 0, live: true, open: false };
    return el;
  }
  ensureRun() {
    if (this.liveRun) return;
    const stick = this._stick();
    this.prime();
    this.liveRun = this._makeRun();
    this.appendChild(this.liveRun);
    if (!this._batching && stick) scrollDown(this);
  }
  sealRun() {
    if (!this.liveRun) return;
    const stick = this._stick();
    const r = this.liveRun; this.liveRun = null;
    r.seal(this._now());
    this.chars += r.weight;
    if (!this._batching) { if (stick) scrollDown(this); this.prune(stick); }
  }
  ensureSpeech() {
    if (this.liveSpeech) return;
    const stick = this._stick();
    this.prime();
    this.liveSpeech = document.createElement("studio-speech");
    this.liveSpeech.record = { text: "" };
    this.appendChild(this.liveSpeech);
    if (!this._batching && stick) scrollDown(this);
  }
  sealSpeech() {
    if (!this.liveSpeech) return;
    const s = this.liveSpeech; this.liveSpeech = null;
    s.seal();
    this.chars += s.weight;
    if (!this._batching) this.prune(this._stick());
  }

  _applyThought(text) {
    if (this.liveSpeech && !this.speaking) this.sealSpeech();   // speech finished; thinking resumes
    const stick = this._stick();
    this.ensureRun();
    this.liveRun.append(text);
    // A run that never meets a landmark is sealed at the soft cap so prune stays fine.
    if (this.liveRun && this.liveRun.weight > RUN_SOFT_CAP) this.sealRun();
    this._settle(stick);
  }
  _applySpeech(text) {
    this.sealRun();
    const stick = this._stick();
    this.ensureSpeech();
    this.liveSpeech.append(text);
    this._settle(stick);
  }
  _applyBoundary(d) { if (this.liveRun) this.liveRun.bump(d); }
  _applyStim(text, cls) {
    this.sealRun(); this.sealSpeech();
    const stick = this._stick();
    this.prime();
    const el = document.createElement("studio-stim");
    el.record = { text, cls: cls || null };
    this.appendChild(el);
    this.chars += el.weight;
    this._settle(stick);
  }
  _applyImage(d) {
    this.sealRun(); this.sealSpeech();
    const stick = this._stick();
    this.prime();
    const el = document.createElement("studio-image");
    el.record = { src: (d && (d.url || d.dataUrl)) || null, prompt: (d && (d.prompt || d.originalPrompt)) || "generated image" };
    this.appendChild(el);
    this.chars += el.weight;
    this._settle(stick);
  }
  _applySpeaking(on) {
    if (on === this.speaking) return;
    this.speaking = on;
    this.sealRun();                  // a run ends when the mind starts OR stops speaking
    if (!on) this.sealSpeech();      // ...and the say card settles when it stops
  }
  _applyStop() { this.sealRun(); this.sealSpeech(); this.speaking = false; }

  // Pinned-to-bottom probe — but skip the layout read while batching (we scroll once
  // at the end of a backfill).
  _stick() { return this._batching ? true : nearBottom(this); }
  _settle(stick) { if (this._batching) return; if (stick) scrollDown(this); this.prune(stick); }

  // ------------------------------------------------ flow-mode reveal engine
  /** Queue an item and make sure the reveal loop is running. Items are either text
   *  ({t:"thought"|"speech", s, i}) revealed gradually, or markers ({t, ...}) emitted
   *  at their position the moment the text ahead of them has been revealed. */
  enqueue(item) { this.q.push(item); if (this._raf == null) this._raf = this._req(this._pump); }

  _req(cb) { return (typeof requestAnimationFrame === "function") ? requestAnimationFrame(cb) : setTimeout(() => cb(this._now()), 16); }
  _cancel() { if (this._raf == null) return; if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this._raf); clearTimeout(this._raf); this._raf = null; }
  _now() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }

  _pump = (now) => {
    this._raf = null;
    if (!this.q.length) { this._lastT = null; return; }
    if (this._lastT == null) this._lastT = now;
    let dt = now - this._lastT; this._lastT = now;
    if (dt < 0) dt = 0; else if (dt > 250) dt = 250;   // backgrounded tab: never dump

    let pending = 0;
    for (const it of this.q) if (it.s != null) pending += it.s.length - it.i;

    let n = 0;
    if (pending > 0) {
      const win = Math.max(MIN_WIN, this.tickMs * DRAIN_FRACTION);
      this._acc += (pending / win) * dt;   // rate ∝ how much is waiting → slows as it drains
      n = Math.floor(this._acc); this._acc -= n;
      if (n < 1) n = 1;                     // always a little progress
      if (pending <= 2) n = pending;        // flush the last sliver cleanly
    }

    while (this.q.length) {
      const it = this.q[0];
      if (it.s != null) {
        if (n <= 0) break;
        const take = Math.min(n, it.s.length - it.i);
        const piece = it.s.slice(it.i, it.i + take);
        it.i += take; n -= take;
        if (it.t === "speech") this._applySpeech(piece); else this._applyThought(piece);
        if (it.i >= it.s.length) this.q.shift();
      } else {
        this.q.shift();
        this._applyMarker(it);
      }
    }

    if (this.q.length) this._raf = this._req(this._pump);
    else { this._lastT = null; this._acc = 0; }
  };

  _applyMarker(it) {
    switch (it.t) {
      case "bnd":      this._applyBoundary(it.d); break;
      case "stim":     this._applyStim(it.text, it.cls); break;
      case "image":    this._applyImage(it.d); break;
      case "speaking": this._applySpeaking(it.on); break;
      case "stop":     this._applyStop(); break;
    }
  }

  /** Reveal everything buffered at once (used when switching out of flow mode, or when
   *  the tab hides, so no text is stranded mid-reveal). */
  _flush() {
    for (const it of this.q) {
      if (it.s != null) { const piece = it.s.slice(it.i); it.i = it.s.length; if (it.t === "speech") this._applySpeech(piece); else this._applyThought(piece); }
      else this._applyMarker(it);
    }
    this.q = []; this._cancel(); this._lastT = null; this._acc = 0;
  }

  /** The tab's visibility changed. Going hidden, drain the buffer instantly (so
   *  nothing is stranded) and switch to instant appends; the rAF pump a background tab
   *  would throttle never runs, so the queue can't pile up. */
  setHidden(h) {
    if (h === this.hidden) return;
    this.hidden = h;
    if (h) this._flush();
  }

  // ------------------------------------------------------- batch replay (instant)
  /**
   * Paint a whole backlog of timeline entries in ONE synchronous pass — no rAF — then
   * continue live in the trailing part. This is what makes a reload / tab-return
   * repaint instantly instead of re-animating the stream token by token. The same
   * mode-independent ingestion runs, with per-item scroll/prune suppressed; each part
   * paints in the current mode as it connects, so a backfill needs no animation.
   *
   * Entries continue whatever is already shown (empty after a fresh focus-reset; the
   * existing tail on a reconnect, which replayResume has already settled). A trailing
   * run/speech is left open so live fragments continue it.
   *
   * Entry kinds: {k:"thought"|"speech", t} · {k:"boundary", reason} ·
   * {k:"stim", t, cls} · {k:"speaking", on} · {k:"image", src, prompt}.
   */
  renderBatch(entries) {
    if (this.isAgent) return;        // agent backfill (agent-step/answer) is the transcript pane's
    this._awaitingBatch = false;
    if (!entries || !entries.length) return;
    this.prime();
    this._batching = true;
    this.sealRun(); this.sealSpeech();
    for (const e of entries) {
      if (!e || !e.k) continue;
      switch (e.k) {
        case "thought":  this._applyThought(e.t || ""); break;
        case "speech":   this._applySpeech(e.t || ""); break;
        case "boundary": this._applyBoundary({ reason: e.reason }); break;
        case "stim":     this._applyStim(e.t || "", e.cls); break;
        case "speaking": this._applySpeaking(!!e.on); break;
        case "image":    this._applyImage({ url: e.src, prompt: e.prompt }); break;
      }
    }
    this._batching = false;
    scrollDown(this);
    this.prune(true);
  }

  // ---------------------------------------------------------------- mode
  /** Apply a fold/flow/raw change published by studio-streammode. Drain any buffered
   *  flow text first (so nothing is stranded across the switch), then re-publish the
   *  mode — every part re-renders itself from its own data, settled and in-flight
   *  alike. We never touch the parts directly; they react to the topic. */
  setMode(mode) {
    if (mode === this.mode) return;
    this._flush();
    this.pub("mode", mode);   // pub stores this.mode = mode and notifies every part
  }
  _loadMode() {
    const m = getPref("streamMode", "fold");
    return (m === "flow" || m === "raw" || m === "fold") ? m : "fold";
  }
}
A.define("studio-stream", StudioStream);
