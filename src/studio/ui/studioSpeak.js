import A from "amanita";
import { command } from "./helpers.js";
import { Recorder, transcribe, micSupported, primeAudio } from "./voiceClient.js";

/**
 * studio-speak — the speak box under the stream. Enabled only while the focused
 * mind is awake; Enter or Send dispatch a "speak" studio-command, which the hub
 * sends to the mind as an urgent stimulus and echoes into the stream via the
 * "youSaid" topic. It is class="foot", inheriting the existing .foot CSS.
 *
 * When the supervisor reports voice is available (/conn/voice), a microphone
 * button appears: tap to record, tap to stop — the clip is transcribed by the
 * supervisor's speech-to-text proxy and sent exactly as a typed line. (The roomy,
 * elderly-friendly version of this lives in studio-voice; here it is a quick
 * shortcut for the cockpit.)
 *
 * It derives the focused mind's state purely from its subscriptions — caching
 * /conn/roster and /conn/focused — so it never reads the hub's fields.
 */
export class StudioSpeak extends A(HTMLElement) {
  focusState = null;
  roster = [];
  focusedId = null;
  voiceOn = false;
  rec = null;
  micState = "idle";   // idle | recording | busy

  onConnect() {
    this.innerHTML =
      `<input type="text" maxlength="400" placeholder="Speak to the mind — words arrive as experience, not instruction" disabled autocomplete="off">` +
      `<button class="mic" title="Speak instead of typing" aria-label="Speak instead of typing" hidden>🎙</button>` +
      `<button class="send" disabled>Send</button>`;
    this.input = this.querySelector("input");
    this.mic = this.querySelector("button.mic");
    this.btn = this.querySelector("button.send");
    this.btn.addEventListener("click", () => this.speak());
    this.input.addEventListener("keydown", e => { if (e.key === "Enter") this.speak(); });
    this.mic.addEventListener("click", () => this.toggleMic());

    this.sub("/conn/voice", v => { this.voiceOn = !!(v && v.enabled) && micSupported(); this.refresh(); }, 12);
    this.sub("/conn/focused", id => {
      this.focusedId = id;
      const m = this.roster.find(x => x.id === id);
      this.focusState = id ? (m ? m.state : "waking") : null;
      this.refresh();
    }, 12);
    this.sub("/conn/lifecycle", d => {
      if (d && d.id === this.focusedId) { this.focusState = d.state; this.refresh(); }
    }, 12);
    this.sub("/conn/roster", arr => {
      this.roster = arr || [];
      const m = this.roster.find(x => x.id === this.focusedId);
      if (m) { this.focusState = m.state; this.refresh(); }
    }, 12);
  }

  onDisconnect() { if (this.rec) this.rec.cancel(); }

  refresh() {
    const on = this.focusState === "awake";
    this.input.disabled = !on;
    this.btn.disabled = !on;
    this.mic.hidden = !this.voiceOn;
    this.mic.disabled = !on || this.micState === "busy";
  }

  speak() {
    const t = this.input.value.trim();
    if (!t) return;
    command(this, "speak", { text: t });
    this.input.value = "";
  }

  async toggleMic() {
    if (this.micState === "recording") return this.finishMic();
    if (this.micState !== "idle" || this.focusState !== "awake") return;
    primeAudio();                                    // a real gesture — unlock audio for later TTS
    try {
      this.rec = new Recorder();
      await this.rec.start();
      this.setMic("recording");
    } catch {
      this.rec = null;
      this.input.placeholder = "Microphone unavailable — allow access, or just type.";
    }
  }

  async finishMic() {
    if (!this.rec) return;
    this.setMic("busy");
    let blob = null;
    try { blob = await this.rec.stop(); } catch { /* nothing recorded */ }
    this.rec = null;
    try {
      const text = blob ? await transcribe(blob) : "";
      if (text) command(this, "speak", { text });
    } catch (e) {
      this.input.placeholder = "Could not transcribe — try again, or type.";
      void e;
    }
    this.setMic("idle");
  }

  setMic(state) {
    this.micState = state;
    this.mic.classList.toggle("recording", state === "recording");
    this.mic.classList.toggle("busy", state === "busy");
    this.mic.textContent = state === "recording" ? "⏹" : state === "busy" ? "…" : "🎙";
    this.mic.title = state === "recording" ? "Stop and send" : "Speak instead of typing";
    this.refresh();
  }
}
A.define("studio-speak", StudioSpeak);
