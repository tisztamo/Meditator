import A from "amanita";
import { mk, esc, nearBottom, scrollDown } from "./helpers.js";
import { getPref, setPref } from "./studioPrefs.js";
import { Recorder, SpeechQueue, transcribe, micSupported, primeAudio } from "./voiceClient.js";

/**
 * studio-voice — Voice Mode: a full-screen, large-button conversation surface for
 * talking with the focused mind by voice. It is built for a phone and for an
 * elderly user, deliberately apart from the dense developer cockpit underneath:
 * big targets, large type, plain words, high contrast.
 *
 * Two halves, both routed through the supervisor's gated /studio/voice proxy so
 * the OpenAI key never reaches the browser (src/studio/voice.js):
 *   - you SPEAK: a big microphone records, the clip is transcribed, and the text
 *     is sent to the mind exactly as the typed speak box does (an urgent stimulus,
 *     echoed back on /conn/youSaid);
 *   - the mind's VOICE: when "read aloud" is on, each passage the mind says *out
 *     loud* (its speech channel) is synthesized and played. Inner thinking is not
 *     spoken — faithful to the mind, which voices things only sometimes; while it
 *     is only thinking, a calm cue shows instead of audio.
 *
 * The launch button lives in the header (#voicebtn, static in studio.html); this
 * component owns it, revealing it only when the supervisor reports voice is usable
 * (/conn/voice) and the browser can capture a mic. Voice Mode is "on" only while
 * the overlay is open, so nothing is recorded or spoken behind a closed surface.
 */
export class StudioVoice extends A(HTMLElement) {
  active = false;
  focusedId = null;
  roster = [];
  voices = [];
  defaultVoice = null;
  streaming = false;
  micState = "idle";          // idle | recording | busy
  rec = null;
  queue = null;
  liveMind = null;            // { row, span, text } while the mind is speaking aloud
  playing = false;            // TTS audio currently sounding

  onConnect() {
    this.innerHTML = `
      <div class="voice-card" role="dialog" aria-modal="true" aria-label="Voice Mode">
        <div class="voice-top">
          <button class="voice-back" type="button" aria-label="Close Voice Mode">‹ Back</button>
          <div class="voice-who">
            <span class="voice-name">no mind in focus</span>
            <span class="voice-st"><i class="vdot"></i><span class="vstate">—</span></span>
          </div>
          <div class="voice-opts">
            <label class="voice-aloud"><input type="checkbox"> <span>🔊 Read aloud</span></label>
            <select class="voice-pick" aria-label="Choose the voice"></select>
          </div>
        </div>
        <div class="voice-convo"><div class="voice-empty">Tap the microphone and say something to begin.</div></div>
        <div class="voice-status" hidden></div>
        <div class="voice-foot">
          <button class="voice-mic" type="button" aria-label="Tap to speak">🎙</button>
          <div class="voice-hint">Tap to speak</div>
        </div>
      </div>`;
    this.card = this.querySelector(".voice-card");
    this.nameEl = this.querySelector(".voice-name");
    this.dotEl = this.querySelector(".vdot");
    this.stateEl = this.querySelector(".vstate");
    this.convo = this.querySelector(".voice-convo");
    this.emptyEl = this.querySelector(".voice-empty");
    this.statusEl = this.querySelector(".voice-status");
    this.micBtn = this.querySelector(".voice-mic");
    this.hintEl = this.querySelector(".voice-hint");
    this.aloudBox = this.querySelector(".voice-aloud input");
    this.pick = this.querySelector(".voice-pick");

    this.aloudBox.checked = getPref("voiceAloud", true) !== false;

    this.querySelector(".voice-back").addEventListener("click", () => this.close());
    this.micBtn.addEventListener("click", () => this.toggleMic());
    this.aloudBox.addEventListener("change", () => this.onAloudToggle());
    this.pick.addEventListener("change", () => this.onPickVoice());
    this._onKey = e => { if (e.key === "Escape" && this.active) this.close(); };
    document.addEventListener("keydown", this._onKey);

    // The launch button is static in the header; we own it.
    this.launch = (typeof document !== "undefined") ? document.getElementById("voicebtn") : null;
    if (this.launch) this.launch.addEventListener("click", () => this.toggle());

    this.sub("/conn/voice", v => this.onVoiceInfo(v));
    this.sub("/conn/focused", id => this.onFocused(id));
    this.sub("/conn/roster", arr => this.onRoster(arr));
    this.sub("/conn/@lifecycle", e => this.onLifecycle(e.detail));
    this.sub("/conn/@focusReset", () => { if (this.active) this.resetConvo(); }).catch(() => {});
    this.sub("/conn/streamState", s => { this.streaming = (s === "streaming"); this.renderStatus(); });
    this.sub("/conn/@streamFragment", e => this.onFragment(e.detail));
    this.sub("/conn/@event", e => this.onEvent(e.detail)).catch(() => {});
    this.sub("/conn/@youSaid", e => { if (this.active) this.addYou(e.detail); });
  }

  onDisconnect() {
    if (this._onKey) document.removeEventListener("keydown", this._onKey);
    if (this.rec) this.rec.cancel();
    if (this.queue) this.queue.stop();
  }

  // ------------------------------------------------------------- voice config
  onVoiceInfo(v) {
    const enabled = !!(v && v.enabled) && micSupported();
    this.voices = (v && v.voices) || [];
    this.defaultVoice = (v && v.defaultVoice) || (this.voices[0] || null);
    if (this.launch) this.launch.hidden = !enabled;
    if (!enabled && this.active) this.close();
    this.buildVoicePicker();
  }

  buildVoicePicker() {
    if (!this.voices.length) { this.pick.hidden = true; return; }
    this.pick.hidden = false;
    const chosen = getPref("voiceName", null) || this.defaultVoice;
    this.pick.innerHTML = this.voices
      .map(name => `<option value="${esc(name)}"${name === chosen ? " selected" : ""}>${esc(name[0].toUpperCase() + name.slice(1))}</option>`)
      .join("");
    if (this.queue) this.queue.voice = this.pick.value;
  }

  onAloudToggle() {
    setPref("voiceAloud", this.aloudBox.checked);
    if (!this.aloudBox.checked && this.queue) this.queue.stop();   // silence at once
    this.renderStatus();
  }

  onPickVoice() {
    setPref("voiceName", this.pick.value);
    if (this.queue) this.queue.voice = this.pick.value;
  }

  // ----------------------------------------------------------- focus / state
  onFocused(id) {
    const changed = id !== this.focusedId;
    this.focusedId = id;
    if (this.active && changed) this.resetConvo();
    this.renderWho();
    this.renderMic();
  }

  onRoster(arr) {
    this.roster = arr || [];
    this.renderWho();
    this.renderMic();
  }

  onLifecycle(d) {
    if (!d || !d.id) return;
    const m = this.roster.find(x => x.id === d.id);
    if (m) m.state = d.state;
    if (d.id === this.focusedId) { this.renderWho(); this.renderMic(); }
  }

  focusedMind() { return this.roster.find(x => x.id === this.focusedId) || null; }
  focusState() { const m = this.focusedMind(); return this.focusedId ? (m ? m.state : "waking") : null; }

  // --------------------------------------------------------- open / close
  toggle() { this.active ? this.close() : this.open(); }

  open() {
    primeAudio();                                   // a real gesture — unlock audio for the mind's voice
    this.active = true;
    this.classList.add("show");
    if (!this.queue) {
      this.queue = new SpeechQueue({
        voice: (this.pick && this.pick.value) || this.defaultVoice,
        onState: on => { this.playing = on; this.renderStatus(); },
        onError: () => {},
      });
    }
    this.resetConvo();
    this.renderWho();
    this.renderMic();
    this.renderStatus();
  }

  close() {
    this.active = false;
    this.classList.remove("show");
    if (this.rec) { this.rec.cancel(); this.rec = null; }
    if (this.queue) this.queue.stop();
    this.setMic("idle");
  }

  resetConvo() {
    this.liveMind = null;
    if (this.queue) this.queue.stop();
    for (const n of [...this.convo.children]) if (n !== this.emptyEl) n.remove();
    this.emptyEl.hidden = false;
    this.renderStatus();
  }

  // ------------------------------------------------------- the conversation
  addYou(text) {
    const t = (text || "").trim();
    if (!t) return;
    this.sealMind();                                // your turn closes any open spoken passage
    this.emptyEl.hidden = true;
    // Show the raw words the user spoke, not the internal narrative framing.
    // The model sees "A voice arrives from outside: ..." via renderForFrame(),
    // but the user reads their own words in the bubble.
    const row = mk("div", "voice-row you");
    row.appendChild(mk("div", "voice-lbl", "You"));
    row.appendChild(mk("div", "voice-bubble", t));
    this.convo.appendChild(row);
    this.scroll();
  }

  /** Open (or reuse) the live spoken-aloud bubble and append text to it. */
  appendMind(text) {
    if (!text) return;
    if (!this.liveMind) {
      this.emptyEl.hidden = true;
      const row = mk("div", "voice-row mind");
      row.appendChild(mk("div", "voice-lbl", "the mind, aloud"));
      const bubble = mk("div", "voice-bubble");
      const span = mk("span", "voice-said");
      bubble.appendChild(span);
      row.appendChild(bubble);
      this.convo.appendChild(row);
      this.liveMind = { row, bubble, span, text: "" };
      this.renderStatus();                            // now speaking aloud, not thinking
    }
    this.liveMind.text += text;
    this.liveMind.span.appendChild(document.createTextNode(text));
    this.scroll();
  }

  /** Seal the spoken passage: add a replay button and, if reading aloud, voice it. */
  sealMind() {
    const lm = this.liveMind;
    this.liveMind = null;
    if (!lm) return;
    const text = lm.text.trim();
    if (!text) { lm.row.remove(); return; }
    const replay = mk("button", "voice-replay", "🔊");
    replay.type = "button";
    replay.title = "Play again";
    replay.setAttribute("aria-label", "Play this aloud again");
    replay.addEventListener("click", () => { primeAudio(); this.queue && this.queue.enqueue(text); });
    lm.bubble.appendChild(replay);
    if (this.active && this.aloudBox.checked && this.queue) this.queue.enqueue(text);
    this.renderStatus();
  }

  scroll() { if (nearBottom(this.convo, 200)) scrollDown(this.convo); }

  // --------------------------------------------------------- mind signals
  onFragment(f) {
    if (!this.active || !f) return;
    if (f.kind === "speech") this.appendMind(f.content || "");
    else if (f.kind === "thought") this.sealMind();   // a type switch ends the spoken passage
  }

  onEvent(d) {
    if (!this.active || !d) return;
    const route = `${d.process}/${d.kind}`;
    // Either edge of a spoken utterance seals the current passage: false ends this
    // one, true means the previous one is over and a new one is about to begin
    // (its first fragment opens a fresh bubble). A boundary seals it too.
    if (route === "speech/speaking" || route === "speech/boundary") this.sealMind();
  }

  // ------------------------------------------------------------- the mic
  async toggleMic() {
    if (this.micState === "recording") return this.finishMic();
    if (this.micState !== "idle" || this.focusState() !== "awake") return;
    primeAudio();
    try {
      this.rec = new Recorder();
      await this.rec.start();
      this.setMic("recording");
    } catch {
      this.rec = null;
      this.hint("Microphone blocked — allow access in your browser, then try again.");
    }
  }

  async finishMic() {
    if (!this.rec) return;
    this.setMic("busy");
    let blob = null;
    try { blob = await this.rec.stop(); } catch { /* nothing captured */ }
    this.rec = null;
    try {
      const text = blob ? await transcribe(blob) : "";
      if (text) this.fire("studio-command", { cmd: "speak", text });
      else this.hint("I didn't catch that — tap and try again.");
    } catch {
      this.hint("Couldn't hear that just now — please try again.");
    }
    this.setMic("idle");
  }

  setMic(state) {
    this.micState = state;
    this.micBtn.classList.toggle("recording", state === "recording");
    this.micBtn.classList.toggle("busy", state === "busy");
    this.micBtn.textContent = state === "recording" ? "⏹" : state === "busy" ? "…" : "🎙";
    this.renderMic();
    this.renderStatus();
  }

  // ------------------------------------------------------------- rendering
  renderWho() {
    const m = this.focusedMind();
    const state = this.focusState();
    this.nameEl.textContent = m ? (m.name || m.file) : "no mind in focus";
    this.stateEl.textContent = state || "—";
    this.dotEl.className = "vdot" + (state === "awake" ? " awake" : state === "sleeping" ? " sleeping" : state === "crashed" ? " err" : "");
  }

  renderMic() {
    const canSpeak = this.focusState() === "awake";
    this.micBtn.disabled = !canSpeak || this.micState === "busy";
    if (this.micState === "idle") {
      this.hint(!this.focusedId ? "Choose a mind to talk with first."
        : canSpeak ? "Tap to speak" : "Waiting for the mind to wake…");
    }
  }

  hint(msg) { this.hintEl.textContent = msg; }

  renderStatus() {
    if (this.micState === "recording") this.hint("Listening… tap to stop");
    else if (this.micState === "busy") this.hint("Letting the words settle…");
    // The status line speaks for the mind: speaking aloud, or quietly thinking.
    const speakingNow = this.playing || !!this.liveMind;
    let txt = "";
    if (speakingNow) txt = "🔊 the mind is speaking aloud…";
    else if (this.streaming) txt = "· the mind is thinking…";
    this.statusEl.textContent = txt;
    this.statusEl.hidden = !txt;
    this.statusEl.classList.toggle("speaking", speakingNow);
  }
}
A.define("studio-voice", StudioVoice);
