// A thought fold — the leaf widget of the stream's "fold" display mode. While the
// mind thinks, an unbroken run of bursts gathers into ONE fixed-height block that
// holds its place, so the column stops scrolling faster than you can read; speech
// and stimuli never fold (the pane renders those full), so they stay the landmarks
// you scan for. When a landmark closes a fold it settles into a summary drawn
// verbatim from the run's own words — begin (and end, for a long run) — with the
// whole transcript one click away.
//
// This is a plain DOM widget, not an Amanita component: it is a transient leaf the
// stream pane creates many of and paints in a synchronous batch, with no cross-
// component state to publish. Like helpers.js / studioPrefs.js it is a pure,
// framework-free module the pane imports. studio-stream owns the wiring.

/** First sentence of a run (or a word-bounded ~108-char head). The fold's anchor. */
export function firstChunk(text) {
  const m = text.match(/^([\s\S]*?[.?!])(\s|$)/);
  if (m && m[1].length <= 150) return m[1];
  if (text.length <= 110) return text;
  const cut = text.slice(0, 108), sp = cut.lastIndexOf(" ");
  return (sp > 40 ? cut.slice(0, sp) : cut) + "…";
}
/** Last sentence of a run (or a word-bounded ~108-char tail). Where it landed. */
export function lastChunk(text) {
  const parts = text.match(/[^.?!]+[.?!]+/g);
  if (parts && parts.length) { const last = parts[parts.length - 1].trim(); if (last.length <= 150) return last; }
  if (text.length <= 110) return text;
  const cut = text.slice(-108), sp = cut.indexOf(" ");
  return "…" + (sp >= 0 && sp < 60 ? cut.slice(sp + 1) : cut);
}
/** The trailing `n` words — the live ghost tail, proof the run is still moving. */
export function lastWords(text, n) {
  const w = text.trim().split(/\s+/);
  return w.slice(Math.max(0, w.length - n)).join(" ");
}
export function wordCount(text) { return text.trim() ? text.trim().split(/\s+/).length : 0; }
/** "41s" / "2m 41s" — a run's duration for its meta line. */
export function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// A run longer than this keeps its end as well as its beginning when closed.
const MULTILINE_CHARS = 210;
// How many trailing words the live ghost tail shows.
const GHOST_WORDS = 12;

const mk = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};
const sep = () => mk("span", null, "·");

export class Fold {
  /** @param now () => ms clock (injected so duration is testable) */
  constructor(now = () => Date.now(), opts = {}) {
    this.full = "";
    this.bursts = 0;
    this._now = now;
    this._t0 = now();
    const el = mk("div", "fold live" + (opts.thinned ? " thinned" : ""));
    el.appendChild(mk("span", "glyph", "›"));
    this._begin = el.appendChild(mk("div", "begin", ""));
    this._ghost = el.appendChild(mk("div", "ghost", ""));
    this._gcaret = mk("span", "gcaret", "");
    this._status = el.appendChild(mk("div", "status", ""));
    this.el = el;
    this._paint();
  }

  /** Logical size of the run, for the pane's prune budget. */
  get chars() { return this.full.length; }

  /** Grow the live fold with a thought fragment. */
  append(text) { this.full += text; this._paint(); return this; }
  /** A burst boundary inside the run — count it; do not break the fold. */
  bump() { this.bursts += 1; this._paint(); return this; }

  // Live face: stable opening (anchors the top), a breathing status with running
  // counts, and the latest words ghosting along the bottom — both, so the top
  // never moves yet you can see it is alive.
  _paint() {
    const t = this.full;
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
    s.appendChild(mk("span", null, `${this.bursts} burst${this.bursts === 1 ? "" : "s"}`));
    s.appendChild(sep());
    s.appendChild(mk("span", null, `~${wordCount(t)} words`));
  }

  /** Settle the live fold into its closed summary, in place: beginning (and end,
   *  for a long run), a meta line, and a click-to-open full transcript. */
  close() {
    const t = this.full.trim();
    const bursts = Math.max(1, this.bursts);
    const el = this.el;
    el.className = "fold";
    el.dataset.w = String(t.length || 1);
    el.textContent = "";
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
    meta.appendChild(mk("span", "b", `${bursts} burst${bursts === 1 ? "" : "s"}`));
    meta.appendChild(sep());
    meta.appendChild(mk("span", null, `~${wordCount(t)} words`));
    meta.appendChild(sep());
    meta.appendChild(mk("span", null, fmtDur(this._now() - this._t0)));
    el.appendChild(meta);
    const full = mk("div", "full");
    t.split(/\n+/).forEach(par => full.appendChild(mk("p", null, par)));
    el.appendChild(full);
    const toggle = () => el.classList.toggle("open");
    glyph.addEventListener("click", toggle);
    begin.addEventListener("click", toggle);
    return this;
  }
}
