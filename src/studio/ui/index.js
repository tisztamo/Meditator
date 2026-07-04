// Studio UI — the entry module loaded by studio.html. Each import registers one custom
// element via A.define, which auto-defines the batch in document order on the next
// microtask — so importing them here and declaring the body in studio.html is enough
// (studio-conn, first in the body, upgrades before the panes that reference it).
import "./studioConn.js";
import "./studioHeader.js";
import "./studioWake.js";
import "./studioRefresh.js";
import "./studioRoster.js";
import "./studioStream.js";
// The stream's part-components (studio-stream creates one per timeline block). Also
// imported by studioStream.js; listed here so the registry stays the full picture.
import "./studioThoughtRun.js";
import "./studioSpeech.js";
import "./studioStim.js";
import "./studioImage.js";
import "./studioStreamMode.js";
import "./studioTranscript.js";
import "./studioTree.js";
import "./studioLog.js";
import "./studioSpeak.js";
import "./studioVoice.js";
import "./studioPlenum.js";
import "./studioToast.js";
import "./studioPanes.js";
import "./studioCovenant.js";

// Make the Studio installable to the home screen. The worker (studio-sw.js) caches
// no app state — it only enables install and an honest offline page — so it can't
// strand a phone on a stale view. Secure-context only (https / localhost); a
// plain-IP LAN dev origin simply skips registration.
if ("serviceWorker" in navigator && window.isSecureContext) {
  addEventListener("load", () => navigator.serviceWorker.register("/studio-sw.js").catch(() => {}));
}
