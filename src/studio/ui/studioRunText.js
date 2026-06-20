// Pure text helpers for the stream's thought-run rendering: slicing a run's own
// words into a fold's begin/end, the live ghost tail, and the meta counts. A run
// invents nothing — every visible phrase is sliced verbatim from what the mind
// actually thought, with no model call. Framework-free, like helpers.js;
// studio-thought-run imports these. (The old studioFold.js's `Fold` DOM widget is
// gone — its rendering moved into the studio-thought-run component, which renders
// the same run three ways and re-renders on a mode switch.)

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
