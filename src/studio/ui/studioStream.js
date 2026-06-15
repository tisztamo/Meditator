import A from "amanita";
import { nearBottom, scrollDown } from "./helpers.js";

// Over a long run the monologue would grow without bound and bog the browser
// down. Keep roughly this many characters of rendered stream; older blocks are
// dropped from the top. A few hundred KB is comfortable for the DOM.
const MAX_CHARS = 400000;

/**
 * studio-stream — the focused mind's stream of consciousness (id="stream",
 * inheriting the existing #stream CSS; it is the flex:1 scroll column).
 *
 * It renders inner thought as flowing paragraphs, spoken-aloud passages as .say
 * blocks, and stimuli / burst boundaries as markers — concatenating fragments
 * into one continuous monologue with a live caret. Ports addThought / addSpeech /
 * addStim / addBoundary / newPara / moveCaret / setSpeaking and friends. The
 * state pill lives in studio-header; this pane only tracks `speaking` locally to
 * thin the thinking stream while the mind talks.
 */
export class StudioStream extends A(HTMLElement) {
  curP = null; caret = null; speaking = false; sayEl = null; saySpan = null; primed = false; chars = 0;

  onConnect() {
    this.clear("Wake a mind, or focus one, to watch its stream.");
    this.sub("/conn/focusReset", () => this.clear("reconstituting this mind"), 12);
    this.sub("/conn/streamFragment", f => { if (f) this.onFragment(f); }, 12);
    this.sub("/conn/streamState", s => { if (s !== "streaming") this.endThought(); }, 12);
    this.sub("/conn/event", d => this.onEvent(d), 12);
    this.sub("/conn/lifecycle", d => this.onLifecycle(d), 12);
    this.sub("/conn/youSaid", t => this.addStim(`You said: "${t}"`, "you"), 12);
  }

  clear(msg) {
    this.innerHTML = `<div class="placeholder"><span class="big">…</span><span>${msg}</span></div>`;
    this.curP = null; this.caret = null; this.speaking = false; this.sayEl = null; this.saySpan = null; this.primed = false; this.chars = 0;
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
      this.chars -= (first.textContent || "").length;
      first.remove();
    }
    if (stick) scrollDown(this);
    else { const removed = before - this.scrollHeight; if (removed > 0) this.scrollTop = Math.max(0, this.scrollTop - removed); }
  }

  onFragment(f) {
    this.prime();
    if (f.kind === "speech") this.addSpeech(f.content); else this.addThought(f.content);
  }

  onLifecycle(d) {
    const conn = this.el("/conn/");
    if (!conn || !d || d.id !== conn.focusedId) return;
    if (d.state === "exited" || d.state === "crashed" || d.state === "sleeping") { this.endThought(); this.setSpeaking(false); }
  }

  onEvent(d) {
    switch (`${d.process}/${d.kind}`) {
      case "stream/boundary":    this.prime(); this.addBoundary(d); break;
      case "attention/urgent":   this.addStim(d.reason || "urgent stimulus"); break;
      case "attention/decision": if (d.accepted && !d.urgent) this.addStim(d.reason || d.type); break;
      case "speech/speaking":    this.setSpeaking(d.speaking); break;
    }
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
  addStim(text, cls) { const stick = nearBottom(this); this.endThought(); this.prime(); const d = document.createElement("div"); d.className = "stim" + (cls ? (" " + cls) : ""); d.textContent = "⟂ " + text; this.appendChild(d); this.chars += d.textContent.length; if (stick) scrollDown(this); this.prune(stick); }
  addBoundary(d) { const stick = nearBottom(this); this.endThought(); const el = document.createElement("div"); el.className = "bnd"; el.textContent = d.reason === "completed" ? "burst" : d.reason; this.appendChild(el); this.chars += el.textContent.length; if (stick) scrollDown(this); this.prune(stick); }
  setSpeaking(on) { if (on === this.speaking) return; this.speaking = on; if (!on) this.endSpeech(); this.endThought(); }
}
A.define("studio-stream", StudioStream);
