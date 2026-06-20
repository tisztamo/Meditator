import A from "amanita";
import { mk } from "./helpers.js";
import { firstChunk, lastChunk, lastWords, wordCount, fmtDur } from "./studioRunText.js";

// A run longer than this keeps its end as well as its beginning when a fold closes.
const MULTILINE_CHARS = 210;
// How many trailing words the live fold's ghost tail shows.
const GHOST_WORDS = 12;
// Roll the flowing render to a fresh paragraph once a paragraph passes this many
// chars (only checked at a burst seam), so unbroken flow still breaks for reading.
// Raw breaks at every burst boundary instead.
const SOFT_PARA = 2400;

const sep = () => mk("span", null, "·");

/**
 * studio-thought-run — a run of inner thinking: a maximal stretch of thought
 * fragments (with their burst boundaries) between two landmarks (speech, a stimulus,
 * an image, or the mind starting/stopping speech). It is the stream's one mode-aware
 * part: it holds its run verbatim and renders it three ways, switching whenever the
 * display mode changes — so what you see always reflects the CURRENT mode, never the
 * mode that happened to be active when the text arrived.
 *
 *   - fold: the run gathers into ONE fixed-height block. Live: an anchored opening +
 *     a ghosting tail + a breathing bursts·words status. Sealed: begin (and end, for
 *     a long run) + meta, with the whole transcript one click away.
 *   - flow: the run is one flowing monologue; its boundaries are barely-visible inline
 *     .seam pips; a long paragraph rolls past SOFT_PARA.
 *   - raw:  plain paragraphs, split at each burst boundary by a full-width .bnd divider.
 *
 * Its data lives on the component: `record = { text, bounds:[{at,reason}], thinned,
 * t0, t1, live, open }`, set by studio-stream before connect and grown via append() /
 * bump() / seal() while it is the live tail. The display mode is the parent stream's
 * retained `mode` topic, reached by the relative ref `../mode`: a fresh run paints in
 * the right mode synchronously (val on connect), and a mode switch re-renders every
 * run at once (the auto-subscription). A display:contents wrapper, so its inner DOM
 * keeps the existing #stream CSS.
 */
export class StudioThoughtRun extends A(HTMLElement) {
  _mode = null;
  // live editing anchors, set by whichever render path is active:
  _p = null; _caret = null;                                       // flow / raw: current paragraph + caret
  _begin = null; _ghost = null; _status = null; _gcaret = null;   // fold-live face

  onConnect() {
    if (!this.record) this.record = { text: "", bounds: [], thinned: false, t0: 0, t1: 0, live: true, open: false };
    // Sync first paint in the current mode (val() would throw if mounted with no
    // Amanita parent; el() resolves the parent stream, or null, without throwing).
    const parent = this.el("../");
    this.renderMode(parent ? parent.mode : null);
  }
  // Re-render in the new mode whenever the parent stream republishes it. This is the
  // whole fix: rendering is a function of (this run's data, the current mode), so a
  // switch repaints settled AND in-flight runs alike.
  "../mode" = m => this.renderMode(m);

  /** Logical size of the run, for studio-stream's prune budget. */
  get weight() { return this.record.text.length || 1; }
  get bursts() { return this.record.bounds.length; }

  // ----------------------------------------------- live growth (from the container)
  /** Grow the live run with a thought fragment, in whatever mode is showing. */
  append(text) {
    if (!text) return;
    this.record.text += text;
    if (this._mode === "fold") this._paintFoldLive();
    else this._growFlowing(text);
  }
  /** A burst boundary inside the run — record it; render it per the current mode. */
  bump(d) {
    this.record.bounds.push({ at: this.record.text.length, reason: d && d.reason });
    if (this._mode === "fold") this._paintFoldLive();
    else if (this._mode === "flow") this._seamHere(d);
    else this._dividerHere(d);
  }
  /** Settle the live run into the sealed face of the current mode, banking its end time. */
  seal(now) {
    if (!this.record.live) return;
    this.record.live = false;
    this.record.t1 = now;
    this.renderMode(this._mode);
  }

  // --------------------------------------------------- full render (mode / seal)
  renderMode(mode) {
    if (mode == null) mode = "fold";
    this._mode = mode;
    this.textContent = "";
    this._p = this._caret = this._begin = this._ghost = this._status = this._gcaret = null;
    if (mode === "fold") this.record.live ? this._renderFoldLive() : this._renderFoldSealed();
    else this._renderFlowing(mode);
  }

  // ---- fold ----
  _renderFoldLive() {
    const el = mk("div", "fold live" + (this.record.thinned ? " thinned" : ""));
    el.appendChild(mk("span", "glyph", "›"));
    this._begin = el.appendChild(mk("div", "begin", ""));
    this._ghost = el.appendChild(mk("div", "ghost", ""));
    this._gcaret = mk("span", "gcaret", "");
    this._status = el.appendChild(mk("div", "status", ""));
    this.appendChild(el);
    this._paintFoldLive();
  }
  // Live face: stable opening (anchors the top), the latest words ghosting along the
  // bottom, and a breathing status with running counts — so the top never moves yet
  // you can see it is alive.
  _paintFoldLive() {
    const t = this.record.text;
    this._begin.textContent = t ? firstChunk(t) : "…";
    this._ghost.textContent = t ? "…" + lastWords(t, GHOST_WORDS) + " " : "";
    this._ghost.appendChild(this._gcaret);
    const s = this._status;
    s.textContent = "";
    const think = mk("span", "think");
    think.appendChild(mk("span", "pdot"));
    think.appendChild(document.createTextNode("thinking"));
    s.appendChild(think);
    s.appendChild(sep());
    const b = this.bursts;
    s.appendChild(mk("span", null, `${b} burst${b === 1 ? "" : "s"}`));
    s.appendChild(sep());
    s.appendChild(mk("span", null, `~${wordCount(t)} words`));
  }
  // Closed face: beginning (and end, for a long run), a meta line, and a click-to-open
  // full transcript — all drawn verbatim from the run's own words.
  _renderFoldSealed() {
    const t = this.record.text.trim();
    const b = Math.max(1, this.bursts);
    const el = mk("div", "fold" + (this.record.thinned ? " thinned" : ""));
    el.dataset.w = String(t.length || 1);
    const glyph = mk("span", "glyph", "›");
    const begin = mk("div", "begin", firstChunk(t));
    el.appendChild(glyph);
    el.appendChild(begin);
    if (t.length > MULTILINE_CHARS) {
      const end = mk("div", "end");
      end.appendChild(mk("span", "lead", "⋯"));
      end.appendChild(mk("span", null, lastChunk(t)));
      el.appendChild(end);
    }
    const meta = mk("div", "meta");
    meta.appendChild(mk("span", "b", `${b} burst${b === 1 ? "" : "s"}`));
    meta.appendChild(sep());
    meta.appendChild(mk("span", null, `~${wordCount(t)} words`));
    meta.appendChild(sep());
    meta.appendChild(mk("span", null, fmtDur(this.record.t1 - this.record.t0)));
    el.appendChild(meta);
    const full = mk("div", "full");
    t.split(/\n+/).forEach(par => full.appendChild(mk("p", null, par)));
    el.appendChild(full);
    // Click to expand the full transcript — remembered on the record so a later mode
    // switch (which re-renders) doesn't snap it shut.
    const toggle = () => { this.record.open = el.classList.toggle("open"); };
    glyph.addEventListener("click", toggle);
    begin.addEventListener("click", toggle);
    if (this.record.open) el.classList.add("open");
    this.appendChild(el);
  }

  // ---- flow / raw (paragraphs; they differ only in how a boundary renders) ----
  _renderFlowing(mode) {
    const t = this.record.text;
    let p = this._newP(), last = 0;
    for (const bnd of this.record.bounds) {
      this._appendText(p, t.slice(last, bnd.at));
      last = bnd.at;
      if (mode === "raw") {
        this.appendChild(this._bndEl(bnd));     // full-width divider between paragraphs
        p = this._newP();
      } else {
        p.appendChild(this._seamEl(bnd));        // inline pip; keep flowing
        if ((p.textContent || "").length > SOFT_PARA) p = this._newP();
      }
    }
    this._appendText(p, t.slice(last));
    this._p = p;
    if (this.record.live) { this._caret = mk("span", "caret"); p.appendChild(this._caret); }
  }
  _newP() { const p = mk("p", this.record.thinned ? "thinned" : null); this.appendChild(p); return p; }
  _appendText(p, s) { if (s) p.appendChild(document.createTextNode(s)); }

  // light live updates (current paragraph already built by _renderFlowing)
  _growFlowing(text) {
    if (!this._p) return this._renderFlowing(this._mode);
    if (this._caret) this._caret.before(text);
    else this._p.appendChild(document.createTextNode(text));
  }
  _seamHere(d) {
    if (!this._p) return this._renderFlowing(this._mode);
    const seam = this._seamEl({ reason: d && d.reason });
    if (this._caret) this._caret.before(seam); else this._p.appendChild(seam);
    if ((this._p.textContent || "").length > SOFT_PARA) {   // roll to a fresh paragraph
      const np = this._newP();
      if (this._caret) np.appendChild(this._caret);
      this._p = np;
    }
  }
  _dividerHere(d) {
    if (this._caret) { this._caret.remove(); this._caret = null; }
    this.appendChild(this._bndEl({ reason: d && d.reason }));
    const np = this._newP();
    if (this.record.live) { this._caret = mk("span", "caret"); np.appendChild(this._caret); }
    this._p = np;
  }

  _bndEl(bnd) {
    const el = mk("div", "bnd");
    el.textContent = (bnd && bnd.reason && bnd.reason !== "completed") ? bnd.reason : "burst";
    return el;
  }
  _seamEl(bnd) {
    const ok = !bnd || !bnd.reason || bnd.reason === "completed";
    const seam = mk("span", ok ? "seam" : "seam warn");
    seam.title = ok ? "burst seam" : bnd.reason;
    return seam;
  }
}
A.define("studio-thought-run", StudioThoughtRun);
