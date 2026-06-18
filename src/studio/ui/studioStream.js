import A from "amanita";
import { nearBottom, scrollDown } from "./helpers.js";
import { getPref, setPref } from "./studioPrefs.js";

// Over a long run the monologue would grow without bound and bog the browser
// down. Keep roughly this many characters of rendered stream; older blocks are
// dropped from the top. Stripped content is not lost — a reload backfills the
// recent window from the supervisor's persisted log.
const MAX_CHARS = 120000;
// How much a generated image counts toward the char budget above (it is a heavy
// DOM node even though its text is short), so images can trigger pruning too.
const IMAGE_WEIGHT = 1500;

// Smoothing constants. The mind thinks in discrete bursts (one streamed LLM call
// each) on a fixed tick; raw, a burst arrives as a fast dump followed by quiet.
// In "flow" mode we hold the arriving text in a buffer and release it at a rate
// that drains the buffer over ~one tick, so the text trickles out continuously
// and the burst seam is barely visible. DRAIN_FRACTION < 1 keeps the buffer
// mostly empty by the time the next burst lands (bounding the added latency);
// MIN_WIN floors the window for very fast minds.
const DRAIN_FRACTION = 0.85;
const MIN_WIN = 700;
// Roll to a fresh paragraph at a seam once the current one gets this long, so
// the flowing-but-unbroken text still prunes. Most seams stay inline.
const SOFT_PARA = 2400;

/**
 * studio-stream — the focused mind's stream of consciousness (id="stream",
 * inheriting the existing #stream CSS; it is the flex:1 scroll column).
 *
 * It renders inner thought as flowing paragraphs, spoken-aloud passages as .say
 * blocks, and stimuli / burst boundaries as markers — concatenating fragments
 * into one continuous monologue with a live caret.
 *
 * Two display modes, toggled by the [data-streammode] control in the column
 * header and remembered in localStorage:
 *   - "flow" (default): incoming fragments are buffered and revealed at a metered
 *     rate that drains over ~one burst tick (learned from the mind's "pace"
 *     telemetry), so a burst trickles out instead of dumping and its boundary is
 *     a barely-visible inline seam. The reveal slows as the buffer empties and
 *     speeds up when it is behind — a slight, self-pacing latency.
 *   - "raw": the original behaviour — fragments append the instant they arrive
 *     and each boundary is a full-width divider.
 *
 * Ports addThought / addSpeech / addStim / addBoundary / newPara / moveCaret /
 * setSpeaking and friends. The state pill lives in studio-header; this pane only
 * tracks `speaking` locally to thin the thinking stream while the mind talks.
 */
export class StudioStream extends A(HTMLElement) {
  curP = null; caret = null; speaking = false; sayEl = null; saySpan = null; primed = false; chars = 0;
  // flow-mode reveal engine
  smooth = true; tickMs = 8000; q = []; _raf = null; _lastT = null; _acc = 0; _modeCtl = null;
  // _awaitingBatch: between a (re)focus and its backfill batch, ignore projection
  //   events (they rehydrate the header/tree, not the stream). hidden: the tab is
  //   backgrounded — append live text instantly instead of feeding the rAF pump.
  _awaitingBatch = false; hidden = false;

  onConnect() {
    this.smooth = this._loadMode();
    this.clear("Wake a mind, or focus one, to watch its stream.");
    // The flow/raw toggle lives in the column header (outside the scroll area).
    const ctl = (this.closest(".col") || this.parentElement);
    const btn = ctl && ctl.querySelector && ctl.querySelector("[data-streammode]");
    if (btn) { this._modeCtl = btn; btn.addEventListener("click", () => this.toggleMode()); this._renderMode(); }

    // Fresh focus: clear and await the backfill batch. Reconnect: keep what is
    // shown, start a fresh paragraph, and await the delta batch.
    this.sub("/conn/focusReset", () => { this.clear("reconstituting this mind"); this._awaitingBatch = true; }, 12);
    this.sub("/conn/replayResume", () => { this._awaitingBatch = true; this.prime(); this.endThought(); }, 12);
    this.sub("/conn/backfill", entries => this.renderBatch(entries || []), 12);
    this.sub("/conn/hidden", h => this.setHidden(!!h), 12);
    this.sub("/conn/streamFragment", f => { if (f) this.onFragment(f); }, 12);
    // The transient idle between bursts must NOT end the paragraph in flow mode —
    // that is exactly the seam we want to make continuous. (Raw mode keeps the break.)
    this.sub("/conn/streamState", s => { if (this._awaitingBatch) return; if (s !== "streaming" && !this.smooth) this.endThought(); }, 12);
    this.sub("/conn/event", d => this.onEvent(d), 12);
    this.sub("/conn/lifecycle", d => this.onLifecycle(d), 12);
    this.sub("/conn/youSaid", t => this.stim(`You said: "${t}"`, "you"), 12);
  }

  clear(msg) {
    this.innerHTML = `<div class="placeholder"><span class="big">…</span><span>${msg}</span></div>`;
    this.curP = null; this.caret = null; this.speaking = false; this.sayEl = null; this.saySpan = null; this.primed = false; this.chars = 0;
    this.q = []; this._cancel(); this._lastT = null; this._acc = 0;
  }
  prime() { if (!this.primed) { this.innerHTML = ""; this.primed = true; this.chars = 0; } }

  /** Bound the DOM: once the rendered text exceeds MAX_CHARS, drop the oldest
   *  top-level blocks. Never touch the live tail (curP / sayEl). When the user is
   *  reading back (not pinned), compensate scrollTop so the view doesn't jump. */
  prune(stick) {
    if (this.chars <= MAX_CHARS) return;
    const before = stick ? 0 : this.scrollHeight;
    while (this.chars > MAX_CHARS) {
      const first = this.firstElementChild;
      if (!first || first === this.curP || first === this.sayEl) break;
      this.chars -= (first.dataset && first.dataset.w != null) ? Number(first.dataset.w) : (first.textContent || "").length;
      first.remove();
    }
    if (stick) scrollDown(this);
    else { const removed = before - this.scrollHeight; if (removed > 0) this.scrollTop = Math.max(0, this.scrollTop - removed); }
  }

  // ----------------------------------------------------- inbound (mode-aware)
  onFragment(f) {
    this._awaitingBatch = false;     // a live fragment means replay is over
    this.prime();
    const kind = f.kind === "speech" ? "speech" : "thought";
    // Flow mode meters the reveal — but only while visible. A hidden tab appends
    // instantly so the queue can't grow unbounded behind a throttled rAF.
    if (this.smooth && !this.hidden) this.enqueue({ kind, s: f.content || "", i: 0 });
    else if (kind === "speech") this.addSpeech(f.content);
    else this.addThought(f.content);
  }

  onLifecycle(d) {
    const conn = this.el("/conn/");
    if (!conn || !d || d.id !== conn.focusedId) return;
    if (d.state === "exited" || d.state === "crashed" || d.state === "sleeping") {
      if (this.smooth) this.enqueue({ t: "stop" });
      else { this.endThought(); this.setSpeaking(false); }
    }
  }

  onEvent(d) {
    const route = `${d.process}/${d.kind}`;
    // The mind's burst tick — size the reveal window from it. (Always honoured,
    // even mid-replay, since it only tunes the live pump.)
    if (route === "mind/pace") { if (d.tickMs > 0) this.tickMs = d.tickMs; return; }
    // During replay, projection snapshot events rehydrate the header/tree only;
    // the stream's content comes from its backfill batch.
    if (this._awaitingBatch) return;
    if (this.smooth && !this.hidden) {
      switch (route) {
        case "stream/boundary":    this.prime(); this.enqueue({ t: "bnd", d }); break;
        case "attention/urgent":   this.stim(d.reason || "urgent stimulus"); break;
        case "attention/decision": if (d.accepted && !d.urgent) this.stim(d.reason || d.type); break;
        case "speech/speaking":    this.enqueue({ t: "speaking", on: d.speaking }); break;
        case "image/generated":    this.prime(); this.enqueue({ t: "image", d }); break;
        case "image/error":        this.stim(`Image generation failed: ${d.message || "error"}`, "warn"); break;
      }
      return;
    }
    switch (route) {
      case "stream/boundary":    this.prime(); this.addBoundary(d); break;
      case "attention/urgent":   this.addStim(d.reason || "urgent stimulus"); break;
      case "attention/decision": if (d.accepted && !d.urgent) this.addStim(d.reason || d.type); break;
      case "speech/speaking":    this.setSpeaking(d.speaking); break;
      case "image/generated":    this.addImage(d); break;
      case "image/error":        this.addStim(`Image generation failed: ${d.message || "error"}`, "warn"); break;
    }
  }

  /** A stimulus marker, ordered into the reveal in flow mode (instant when hidden). */
  stim(text, cls) { if (this.smooth && !this.hidden) this.enqueue({ t: "stim", text, cls }); else this.addStim(text, cls); }

  // ------------------------------------------------ flow-mode reveal engine
  /** Queue an item and make sure the reveal loop is running. Items are either
   *  text ({kind, s, i}) revealed gradually, or markers ({t, ...}) emitted at
   *  their position the moment the text ahead of them has been revealed. */
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
        if (it.kind === "speech") this.addSpeech(piece); else this.addThought(piece);
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
      case "bnd":      this.addBoundaryInline(it.d); break;
      case "stim":     this.addStim(it.text, it.cls); break;
      case "image":    this.addImage(it.d); break;
      case "speaking": this.setSpeaking(it.on); break;
      case "stop":     this.endThought(); this.setSpeaking(false); break;
    }
  }

  /** Reveal everything buffered at once (used when switching out of flow mode so
   *  no text is stranded). */
  _flush() {
    for (const it of this.q) {
      if (it.s != null) { const piece = it.s.slice(it.i); it.i = it.s.length; if (it.kind === "speech") this.addSpeech(piece); else this.addThought(piece); }
      else this._applyMarker(it);
    }
    this.q = []; this._cancel(); this._lastT = null; this._acc = 0;
  }

  /** The tab's visibility changed. Going hidden, drain the buffer instantly (so
   *  nothing is stranded mid-reveal) and switch to instant appends; the rAF pump
   *  a background tab would throttle never runs, so the queue can't pile up. */
  setHidden(h) {
    if (h === this.hidden) return;
    this.hidden = h;
    if (h) this._flush();
  }

  // ------------------------------------------------------- batch replay (instant)
  /**
   * Paint a whole backlog of timeline entries in ONE synchronous pass — no rAF,
   * no per-item layout reads — then continue live in the last paragraph. This is
   * what makes a reload / tab-return repaint instantly instead of re-animating the
   * stream token by token. Entries are appended to whatever is already shown
   * (empty after a fresh focus-reset; the existing tail on a reconnect), so it
   * serves both the recent-tail and the delta cases.
   *
   * Entry kinds: {k:"thought"|"speech", t} · {k:"boundary", reason} ·
   * {k:"stim", t, cls} · {k:"speaking", on} · {k:"image", src, prompt}.
   */
  renderBatch(entries) {
    this._awaitingBatch = false;
    if (!entries || !entries.length) { if (this.curP) this.moveCaret(this.curP); return; }
    this.prime();
    this.endThought(); this.endSpeech();
    const frag = document.createDocumentFragment();
    let p = null, say = null, saySpan = null, added = 0;
    const endP = () => { p = null; };
    const endSay = () => { say = null; saySpan = null; };
    for (const e of entries) {
      if (!e || !e.k) continue;
      switch (e.k) {
        case "thought": {
          if (!p) { endSay(); p = document.createElement("p"); if (this.speaking) p.className = "thinned"; frag.appendChild(p); }
          p.appendChild(document.createTextNode(e.t || "")); added += (e.t || "").length;
          break;
        }
        case "speech": {
          if (!say) {
            endP();
            say = document.createElement("div"); say.className = "say";
            const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = "spoken aloud"; say.appendChild(lbl);
            saySpan = document.createElement("span"); say.appendChild(saySpan); frag.appendChild(say);
          }
          saySpan.appendChild(document.createTextNode(e.t || "")); added += (e.t || "").length;
          break;
        }
        case "boundary": {
          if (this.smooth) {
            if (p) { p.appendChild(this._seamEl(e.reason === "completed" ? null : { reason: e.reason })); if ((p.textContent || "").length > SOFT_PARA) endP(); }
          } else {
            endP();
            const el = document.createElement("div"); el.className = "bnd"; el.textContent = e.reason === "completed" ? "burst" : (e.reason || "burst");
            frag.appendChild(el); added += el.textContent.length;
          }
          break;
        }
        case "stim": {
          endP(); endSay();
          const el = document.createElement("div"); el.className = "stim" + (e.cls ? (" " + e.cls) : ""); el.textContent = "⟂ " + (e.t || "");
          frag.appendChild(el); added += el.textContent.length;
          break;
        }
        case "speaking": {
          this.speaking = !!e.on; if (!e.on) endSay(); endP();
          break;
        }
        case "image": {
          endP(); endSay();
          const card = this._imageCard(e.src, e.prompt);
          frag.appendChild(card); added += Number(card.dataset.w);
          break;
        }
      }
    }
    this.appendChild(frag);
    this.chars += added;
    // Continue the live tail where the batch left off.
    this.curP = p; this.sayEl = say; this.saySpan = saySpan;
    if (this.curP) this.moveCaret(this.curP);
    scrollDown(this);
    this.prune(true);
  }

  // -------------------------------------------------------- rendering (ported)
  moveCaret(host) { if (this.caret) this.caret.remove(); this.caret = document.createElement("span"); this.caret.className = "caret"; (host || this).appendChild(this.caret); }
  newPara() { this.curP = document.createElement("p"); if (this.speaking) this.curP.className = "thinned"; this.appendChild(this.curP); this.moveCaret(this.curP); }
  addThought(text) { const stick = nearBottom(this); if (!this.curP) this.newPara(); this.caret ? this.caret.before(text) : this.curP.appendChild(document.createTextNode(text)); this.chars += text.length; if (stick) scrollDown(this); this.prune(stick); }
  endThought() { this.curP = null; if (this.caret) { this.caret.remove(); this.caret = null; } }
  addSpeech(text) {
    const stick = nearBottom(this);
    if (!this.sayEl) {
      this.endThought();
      this.sayEl = document.createElement("div"); this.sayEl.className = "say";
      const lbl = document.createElement("span"); lbl.className = "lbl"; lbl.textContent = "spoken aloud"; this.sayEl.appendChild(lbl);
      this.saySpan = document.createElement("span"); this.sayEl.appendChild(this.saySpan);
      this.appendChild(this.sayEl);
    }
    this.saySpan.appendChild(document.createTextNode(text));
    this.chars += text.length;
    if (stick) scrollDown(this);
    this.prune(stick);
  }
  endSpeech() { this.sayEl = null; this.saySpan = null; }
  /** Build a generated-image card. Prefers a served URL (light DOM) over an inline
   *  data URL. Stamps its char weight on the node so prune accounts for it. */
  _imageCard(src, prompt) {
    const p = prompt || "generated image";
    const card = document.createElement("figure");
    card.className = "image-card";
    card.dataset.w = String(p.length + IMAGE_WEIGHT);
    const lbl = document.createElement("figcaption");
    lbl.className = "lbl";
    lbl.textContent = "generated image";
    card.appendChild(lbl);
    if (src) {
      const img = document.createElement("img");
      img.alt = p;
      img.loading = "lazy";
      img.src = src;
      card.appendChild(img);
    }
    const cap = document.createElement("figcaption");
    cap.className = "prompt";
    cap.textContent = p;
    card.appendChild(cap);
    return card;
  }
  addImage(d) {
    const src = d && (d.url || d.dataUrl);
    const prompt = (d && (d.prompt || d.originalPrompt)) || "generated image";
    const stick = nearBottom(this);
    this.endThought();
    this.prime();
    const card = this._imageCard(src, prompt);
    this.appendChild(card);
    this.chars += Number(card.dataset.w);
    if (stick) scrollDown(this);
    this.prune(stick);
  }
  addStim(text, cls) { const stick = nearBottom(this); this.endThought(); this.prime(); const d = document.createElement("div"); d.className = "stim" + (cls ? (" " + cls) : ""); d.textContent = "⟂ " + text; this.appendChild(d); this.chars += d.textContent.length; if (stick) scrollDown(this); this.prune(stick); }
  /** Raw-mode boundary: a full-width labelled divider ("like now"). */
  addBoundary(d) { const stick = nearBottom(this); this.endThought(); const el = document.createElement("div"); el.className = "bnd"; el.textContent = d.reason === "completed" ? "burst" : d.reason; this.appendChild(el); this.chars += el.textContent.length; if (stick) scrollDown(this); this.prune(stick); }
  /** Flow-mode boundary: a barely-visible inline seam inside the flowing text.
   *  Occasionally rolls to a fresh paragraph so the unbroken text still prunes. */
  addBoundaryInline(d) {
    if (!this.curP) this.newPara();
    const stick = nearBottom(this);
    const seam = this._seamEl(d);
    if ((this.curP.textContent || "").length > SOFT_PARA) {
      if (this.caret) this.caret.before(seam); else this.curP.appendChild(seam);
      this.endThought();   // next thought starts a fresh paragraph
    } else if (this.caret) {
      this.caret.before(seam);
    } else {
      this.curP.appendChild(seam);
    }
    if (stick) scrollDown(this);
  }
  _seamEl(d) {
    const seam = document.createElement("span");
    const ok = !d || d.reason === "completed";
    seam.className = ok ? "seam" : "seam warn";
    seam.title = ok ? "burst seam" : (d.reason || "burst");
    return seam;
  }
  setSpeaking(on) { if (on === this.speaking) return; this.speaking = on; if (!on) this.endSpeech(); this.endThought(); }

  // ---------------------------------------------------------------- mode
  toggleMode() {
    this._flush();          // never strand buffered text across a mode switch
    this.smooth = !this.smooth;
    this._saveMode();
    this._renderMode();
  }
  _renderMode() {
    if (!this._modeCtl) return;
    this._modeCtl.textContent = this.smooth ? "flow" : "raw";
    this._modeCtl.classList.toggle("raw", !this.smooth);
    this._modeCtl.title = this.smooth
      ? "Stream display: flow — smoothed reveal, inline burst seams. Click for raw."
      : "Stream display: raw — instant fragments, full-width burst dividers. Click for flow.";
  }
  _loadMode() { return getPref("streamMode", "flow") !== "raw"; }
  _saveMode() { setPref("streamMode", this.smooth ? "flow" : "raw"); }
}
A.define("studio-stream", StudioStream);
