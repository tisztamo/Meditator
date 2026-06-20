// Studio UI — the entry module loaded by studio.html.
//
// Each import below defines one custom element (via A.define at module load).
// studio-conn is defined first so the store/connection element upgrades before
// the panes resolve their /conn/ references; the panes also pass a raised
// trycount to sub(), so resolveRef's retry covers any residual upgrade-order
// race. The <body> is a declarative Amanita tree (like a .archml mind), so once
// these are defined the elements upgrade and wire themselves.
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
import "./studioTree.js";
import "./studioLog.js";
import "./studioSpeak.js";
import "./studioToast.js";
import "./studioPanes.js";
import "./studioCovenant.js";
