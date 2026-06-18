import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadModelConfig, resolveModelRef, resolveModelRefForProfile, getActiveProfile, getResolvedRoles, listProfiles } from "../modelAccess/modelConfig.js";
import { tierOf } from "../infrastructure/manifest.js";
import { StudioStore, parseDataUrl } from "./store.js";

await loadModelConfig();

/**
 * The Studio supervisor — the integrated environment for tending minds.
 *
 * Run once (`bun studio.js`) and open http://localhost:7600. From the browser you
 * can wake any architecture, watch a roster of live minds, focus one to see its
 * stream / structure / speak to it, and put it to sleep with the proper ritual —
 * the terminal becomes optional.
 *
 * It is a *supervisor*, not a mind: it spawns `meditator.js` as a child process
 * per mind and never touches `memory/` itself. Each child runs its own m-ws on a
 * distinct port (via MEDITATOR_WS_PORT); the supervisor connects to that port as
 * a client and fans the telemetry back to the browser, tagged by mind id. The
 * public site (docs/index.html → ws://localhost:7627) is unaffected: a child still
 * serves its own port directly, and the supervisor is just another client of it.
 *
 *   browser ─ws→ supervisor(:7600) ─ws→ child m-ws(:7627..) ─ memory vault
 *
 * Sleep is the covenant's announced ritual: the supervisor writes "/sleep" to the
 * child's stdin (m-console honors it when MEDITATOR_STDIN=1), the mind closes its
 * thought, finalizes and commits memory, then exits on its own. Force-kill is a
 * deliberate, separate action.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARCH_DIR = path.join(ROOT, "architecture");
const VAULT_ROOT = path.join(ROOT, "memory");
const MEDITATOR_ENTRY = "meditator.js";              // resolved against cwd=ROOT when spawning
const STUDIO_PORT = parseInt(process.env.STUDIO_PORT || "7600", 10);
const PORT_BASE = 7627;                              // the public port; first woken mind takes it
const PORT_SPAN = 64;
const SLEEP_GRACE_MS = 60000;                        // how long a graceful sleep may take before Force is meaningful
const BACKFILL_CHARS = 120000;                       // recent-window size a reconnecting client repaints at once
const IMAGE_WEIGHT = 1500;                           // how much an image counts toward the backfill char budget

// The Studio's telemetry store: a durable, ordered record of each mind's stream
// plus a retained archive of generated images. Supervisor-owned observability —
// it lives under .run/studio/ and never touches the memory vault.
const store = new StudioStore();

// ----------------------------------------------------------------- utilities

const log = (...a) => console.log("[studio]", ...a);
const slugify = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mind";

function specLabel(spec) {
  return spec.provider === "local" ? `local/${spec.model}` : spec.model;
}

/** Tolerant parse of a .archml: the first <m-mind> attributes, whether it has an
 *  m-ws live window, and a leading <!-- … --> comment used as a description. */
function parseArchitecture(content) {
  const mindTag = (content.match(/<m-mind\b[^>]*>/i) || [""])[0];
  const attr = name => {
    const m = mindTag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
    return m ? m[1] : null;
  };
  const mindAt = content.search(/<m-mind\b/i);
  const head = mindAt >= 0 ? content.slice(0, mindAt) : content;
  const comment = head.match(/<!--([\s\S]*?)-->/);
  let resolvedVoice = null;
  let resolvedUtility = null;
  try { resolvedVoice = specLabel(resolveModelRef(attr("model"), "voice")); } catch { /* unknown ref */ }
  try { resolvedUtility = specLabel(resolveModelRef(attr("utilityModel"), "utility")); } catch { /* unknown ref */ }
  return {
    name: attr("name"),
    memory: attr("memory"),
    model: attr("model"),
    utilityModel: attr("utilityModel"),
    resolvedVoice,
    resolvedUtility,
    pace: attr("pace"),
    hasWs: /<m-ws\b/i.test(content),
    description: comment ? comment[1].trim().replace(/\s+/g, " ").slice(0, 200) : null,
  };
}

/** Does the graveyard hold a bundle for this slug? (a retired mind, §3) */
function graveyardHas(slug) {
  try {
    return fs.readdirSync(path.join(VAULT_ROOT, ".graveyard"))
      .some(b => b === slug || b.startsWith(slug + "-"));
  } catch { return false; }
}

/** What memory home a base slug maps to, whether it exists on disk, and the
 *  lifecycle tier it presents — resident / transient / retired / none (§2). */
function homeInfo(slug) {
  const dir = path.join(VAULT_ROOT, slug);
  let exists = false, files = 0;
  try {
    const st = fs.statSync(dir);
    if (st.isDirectory()) { exists = true; files = fs.readdirSync(dir).length; }
  } catch { /* no home yet */ }
  return { exists, files, tier: tierOf(dir, graveyardHas) };
}

/** The architecture catalog: every .archml under architecture/ (tests/ flagged),
 *  each resolved to its mind name and memory home, with collision flags. */
function listArchitectures() {
  const out = [];
  const scan = (dir, group) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".archml")) {
        const full = path.join(dir, e.name);
        const rel = path.relative(ARCH_DIR, full).split(path.sep).join("/");
        let meta;
        try { meta = parseArchitecture(fs.readFileSync(full, "utf-8")); }
        catch { meta = { name: null, memory: null, model: null, utilityModel: null, resolvedVoice: null, resolvedUtility: null, pace: null, hasWs: false, description: null }; }
        const slug = slugify(meta.memory || meta.name || "mind");
        out.push({
          file: rel, group,
          name: meta.name, memory: meta.memory, model: meta.model, utilityModel: meta.utilityModel,
          resolvedVoice: meta.resolvedVoice, resolvedUtility: meta.resolvedUtility,
          profileResolution: archProfileResolution(meta),
          pace: meta.pace,
          hasWs: meta.hasWs, description: meta.description,
          homeSlug: slug, home: `memory/${slug}`, homeInfo: homeInfo(slug),
        });
      }
    }
  };
  scan(ARCH_DIR, "main");
  scan(path.join(ARCH_DIR, "tests"), "test");

  // Flag architectures that resolve to the same home (would share a brain), and
  // whether that home is currently held by a running mind (would race the vault).
  const bySlug = new Map();
  for (const a of out) {
    if (!bySlug.has(a.homeSlug)) bySlug.set(a.homeSlug, []);
    bySlug.get(a.homeSlug).push(a.file);
  }
  for (const a of out) {
    const sharers = (bySlug.get(a.homeSlug) || []).filter(f => f !== a.file);
    a.sharesHomeWith = sharers;
    a.busy = [...minds.values()].some(m => isAlive(m) && m.baseHome === a.homeSlug);
  }
  out.sort((a, b) => (a.group === b.group ? a.file.localeCompare(b.file) : a.group === "main" ? -1 : 1));
  return out;
}

// ------------------------------------------------------------- mind registry

/** id -> mind record. A mind is a supervised child process plus its live window. */
const minds = new Map();
let mindSeq = 0;
const usedPorts = new Set();

const isAlive = m => m.state === "waking" || m.state === "awake" || m.state === "sleeping";

function allocPort() {
  for (let p = PORT_BASE; p < PORT_BASE + PORT_SPAN; p++) if (!usedPorts.has(p)) { usedPorts.add(p); return p; }
  throw new Error("no free port in the pool");
}

function rosterSummary() {
  return [...minds.values()].map(m => ({
    id: m.id, file: m.file, name: m.name, home: m.home, baseHome: m.baseHome,
    port: m.port, public: m.port === PORT_BASE, dryRun: m.dryRun, modelProfile: m.modelProfile || null,
    state: m.state, since: m.since, hasWindow: !!(m.upstream && m.upstream.readyState === WebSocket.OPEN),
    energy: m.energy, spent: m.spent, detail: m.detail || null,
  }));
}

function archProfileResolution(meta) {
  const out = {};
  for (const profile of listProfiles()) {
    let resolvedVoice = null;
    let resolvedUtility = null;
    try { resolvedVoice = specLabel(resolveModelRefForProfile(meta.model, "voice", profile)); } catch { /* unknown ref */ }
    try { resolvedUtility = specLabel(resolveModelRefForProfile(meta.utilityModel, "utility", profile)); } catch { /* unknown ref */ }
    out[profile] = { resolvedVoice, resolvedUtility };
  }
  return out;
}

// --------------------------------------------------------------- the clients

const app = express();
app.use(express.static(path.dirname(fileURLToPath(import.meta.url))));
// Serve the Amanita framework source to the browser so the Studio UI (an Amanita
// component mesh) can `import A from "amanita"` build-free, via an importmap in
// studio.html. The package is pure relative-imported ESM, so static-serving its
// src/ is enough; unused files (worker/*, stdlib) are simply never fetched.
app.use("/amanita", express.static(path.join(ROOT, "node_modules", "amanita", "src")));
// Serve a retained generated image by id. The stream carries only this small URL
// (not the base64 data) so the DOM stays light, and the bytes persist on disk so
// they are still here after a restart and the next day.
app.get("/studio/image/:id", (req, res) => {
  const img = store.getImage(req.params.id);
  if (!img || !fs.existsSync(img.path)) return res.status(404).end();
  res.setHeader("Content-Type", img.mime || "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(img.path);
});
// Serve the Covenant (repo root) so the Studio's startup dialog can link to it.
// As text/plain so it opens inline in the browser instead of downloading.
app.get("/COVENANT.md", (_req, res) =>
  res.sendFile(path.join(ROOT, "COVENANT.md"), { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
app.get("/", (_req, res) => res.sendFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "studio.html")));
const httpServer = app.listen(STUDIO_PORT, () => log(`Studio at http://localhost:${STUDIO_PORT}`));
const wss = new WebSocketServer({ server: httpServer });

const clients = new Set();

const sendJSON = (client, obj) => {
  if (client.readyState === WebSocket.OPEN) {
    try { client.send(JSON.stringify(obj)); } catch (e) { log("send failed:", e.message); }
  }
};
const broadcast = obj => { for (const c of clients) sendJSON(c, obj); };

let rosterTimer = null;
function broadcastRoster() {                          // coalesced; energy ticks shouldn't spam
  if (rosterTimer) return;
  rosterTimer = setTimeout(() => { rosterTimer = null; broadcast({ type: "roster", data: { minds: rosterSummary() } }); }, 120);
}
function broadcastArchitectures() { broadcast({ type: "architectures", data: { list: listArchitectures() } }); }
function broadcastLifecycle(m, state, detail) {
  m.detail = detail || null;
  broadcast({ type: "lifecycle", data: { id: m.id, state, detail: detail || null, public: m.port === PORT_BASE } });
}

wss.on("connection", client => {
  client.focusedId = null;
  clients.add(client);
  sendJSON(client, { type: "hello", data: { studioPort: STUDIO_PORT, publicPort: PORT_BASE, modelProfile: getActiveProfile(), profiles: listProfiles(), resolvedRoles: getResolvedRoles() } });
  sendJSON(client, { type: "architectures", data: { list: listArchitectures() } });
  sendJSON(client, { type: "roster", data: { minds: rosterSummary() } });
  client.on("message", raw => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    handleClientMessage(client, msg);
  });
  client.on("close", () => clients.delete(client));
  client.on("error", () => {});
});

function handleClientMessage(client, msg) {
  const d = msg.data || {};
  switch (msg.type) {
    case "wake":    try { const id = wake(d.file, !!d.dryRun, d.modelProfile, !!d.forceTransient); sendJSON(client, { type: "woke", data: { id, file: d.file } }); } catch (e) { sendJSON(client, { type: "error", data: { message: e.message } }); } break;
    case "sleep":   sleepMind(d.id); break;
    case "force":   forceMind(d.id); break;
    case "dismiss": dismissMind(d.id); break;
    case "input":   speakTo(d.id, d.message); break;
    case "focus":   focusClient(client, d.id, d.sinceSeq == null ? null : d.sinceSeq); break;
    case "refresh": sendJSON(client, { type: "architectures", data: { list: listArchitectures() } }); break;
  }
}

/** A persisted timeline row → the compact wire entry that studio-stream's
 *  renderBatch paints synchronously. The ordering across kinds is preserved, so
 *  thought/speech/stimuli/boundaries/images replay exactly as they happened. */
function rowToWire(r) {
  const p = r.payload ? JSON.parse(r.payload) : {};
  switch (r.kind) {
    case "thought":  return { k: "thought", t: r.text || "" };
    case "speech":   return { k: "speech", t: r.text || "" };
    case "boundary": return { k: "boundary", reason: p.reason };
    case "stim":     return { k: "stim", t: r.text || "", cls: p.cls || null };
    case "speaking": return { k: "speaking", on: !!p.on };
    case "image":    return { k: "image", src: p.url || (r.image_id != null ? `/studio/image/${r.image_id}` : null), prompt: p.prompt || "" };
    default:         return { k: r.kind, t: r.text || "" };
  }
}

/**
 * Reconstitute a focused mind for one client. The browser tells us how far it has
 * already rendered (`sinceSeq`); we reply with the current projection (structure +
 * latest status/telemetry, for the header and tree) and ONE backfill batch of the
 * stream timeline — the recent tail on a fresh load (`sinceSeq == null`), or just
 * the delta since `sinceSeq` on a live reconnect — both bounded so a long absence
 * can't return a giant batch. The browser paints the batch in one synchronous pass
 * (no animated re-stream), then live forwarding resumes. Answered per-client.
 */
function focusClient(client, id, sinceSeq) {
  const m = minds.get(id);
  if (!m) {
    // Unknown mind (e.g. focus restored after a supervisor restart). Clear the
    // client's replay-wait with an empty batch so it isn't stuck awaiting one.
    client.focusedId = id;
    sendJSON(client, { type: "backfill", data: { id, entries: [], lastSeq: sinceSeq || 0 } });
    return;
  }
  client.focusedId = null;             // hold live forwarding while we reconstruct
  // 1. projection for the header/tree (latest-per-kind; sanitized — no base64).
  sendJSON(client, { type: "state", data: { id, structure: m.structure, status: m.lastStatus, snapshots: [...m.snapshots.values()] } });
  // 2. the stream timeline, tail or delta, plus the in-progress (unsealed) run.
  const fresh = sinceSeq == null;
  const rows = fresh ? store.tail(m.sessionId, BACKFILL_CHARS) : store.since(m.sessionId, sinceSeq, BACKFILL_CHARS);
  const entries = rows.map(rowToWire);
  if (m.pending && m.pending.text) entries.push({ k: m.pending.kind, t: m.pending.text });
  const lastSeq = rows.length ? rows[rows.length - 1].seq : (sinceSeq || 0);
  sendJSON(client, { type: "backfill", data: { id, entries, lastSeq } });
  // 3. recent process logs (unchanged).
  for (const entry of m.logs) sendJSON(client, { type: "log", data: { id, stream: entry.s, line: entry.l } });
  // 4. resume live forwarding to this client.
  client.focusedId = id;
}

// ------------------------------------------------------------------- waking

function wake(file, dryRun, modelProfile, forceTransient) {
  const profile = modelProfile || getActiveProfile();
  if (!listProfiles().includes(profile)) throw new Error(`unknown model profile: ${profile}`);
  // Path safety: only architectures inside architecture/.
  const resolved = path.resolve(ARCH_DIR, file || "");
  if (resolved !== ARCH_DIR && !resolved.startsWith(ARCH_DIR + path.sep)) throw new Error("architecture must live under architecture/");
  if (!fs.existsSync(resolved)) throw new Error(`no such architecture: ${file}`);

  const meta = parseArchitecture(fs.readFileSync(resolved, "utf-8"));
  const baseHome = (dryRun ? "dry-" : "") + slugify(meta.memory || meta.name || "mind");

  // Covenant guard: never let two live minds write the same memory home.
  const resident = [...minds.values()].find(m => isAlive(m) && m.home === `memory/${baseHome}`);
  if (resident) {
    throw new Error(`memory/${baseHome} is already held by "${resident.name || resident.file}" (${resident.state}). ` +
      `Sleep it first, or give this architecture a different name/memory= so it gets its own home.`);
  }

  // Covenant guard: refuse to restart a transient mind with existing memory.
  // Transient minds are low-continuity by construction; re-waking them into an
  // existing home loads old memory without committing new, creating an illusion
  // of a continuing subject. Override with forceTransient (testing exception).
  if (!dryRun && !forceTransient) {
    const homeTier = tierOf(path.join(VAULT_ROOT, baseHome), graveyardHas);
    if (homeTier === "transient") {
      const memPath = path.join(VAULT_ROOT, baseHome, "memory.md");
      if (fs.existsSync(memPath)) {
        throw new Error(
          `memory/${baseHome} is a transient mind with existing memory. ` +
          `Restarting a transient loads old memory without committing new, creating an illusion of continuity. ` +
          `To force for testing: MEDITATOR_FORCE_TRANSIENT=1 bun run meditator.js -a ${file}`
        );
      }
    }
  }

  const port = allocPort();
  const id = `m${++mindSeq}`;
  const relForSpawn = path.relative(ROOT, resolved).split(path.sep).join("/");
  const child = spawn(process.execPath, [MEDITATOR_ENTRY, "-a", relForSpawn], {
    cwd: ROOT,
    env: {
      ...process.env,
      MEDITATOR_WS_PORT: String(port),        // place this child's m-ws on its own port
      MEDITATOR_WS_CONTROL: "1",              // let us request the sleep ritual over that socket
      MEDITATOR_MODEL_PROFILE: profile,
      ...(dryRun ? { MEDITATOR_DRY_RUN: "1" } : {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const startedAt = new Date().toISOString();
  const home = `memory/${baseHome}`;
  const name = meta.name || slugify(meta.memory || "mind");
  // Open a durable session for this wake, keyed by the mind's home (not the
  // ephemeral id), so its stream and images are findable across restarts/days.
  let sessionId = null;
  try { sessionId = store.startSession({ home, mindName: name, archFile: file, modelProfile: profile, startedAt }); }
  catch (e) { log(`store.startSession failed: ${e.message}`); }

  const m = {
    id, file, name, dryRun, modelProfile: profile,
    home, baseHome, hasWs: meta.hasWs,
    port, child, state: "waking", since: startedAt,
    energy: null, spent: null, detail: "waking…",
    // Live window + telemetry. structure/lastStatus/snapshots are the projection
    // (latest-per-kind) used to rehydrate the header/tree instantly on focus; the
    // ordered stream timeline lives in the store, sealed run-by-run via `pending`.
    upstream: null, structure: null, lastStatus: null, snapshots: new Map(),
    sessionId, seq: 0, pending: null, _replayGuard: false, _replayTimer: null,
    logs: [], stderrTail: [], sleepRequestedAt: null,
  };
  minds.set(id, m);
  log(`waking ${id} ← ${file}  (port ${port}${port === PORT_BASE ? ", public" : ""}${dryRun ? ", dry-run" : ""}, profile ${profile})  → memory/${baseHome}`);

  pipeLines(child.stdout, "out", m);
  pipeLines(child.stderr, "err", m);
  child.on("error", err => { onLog(m, "err", `spawn error: ${err.message}`); });
  child.on("exit", (code, signal) => onChildExit(m, code, signal));

  broadcastLifecycle(m, "waking", "waking…");
  broadcastRoster();
  broadcastArchitectures();                            // 'busy' flags changed
  if (meta.hasWs) {
    connectUpstream(m);
  } else {
    // No m-ws to connect to: the mind is running but has no live window and no
    // control channel — it reads as awake, and can only be stopped with Force.
    m.state = "awake";
    m.detail = "running · no live window (no m-ws)";
    broadcastLifecycle(m, "awake", m.detail);
    broadcastRoster();
  }
  return id;
}

function onChildExit(m, code, signal) {
  usedPorts.delete(m.port);
  try { m.upstream && m.upstream.close(); } catch {}
  m.upstream = null;
  const graceful = m.state === "sleeping" || code === 0;
  // A deliberate Force is a stop, not a crash — but it skipped the ritual, so
  // memory wasn't finalized. Only an unexpected non-zero exit is a "crash".
  m.state = (graceful || m.forced) ? "exited" : "crashed";
  if (m._replayTimer) { clearTimeout(m._replayTimer); m._replayTimer = null; }
  flushPending(m);                                     // seal any in-progress run
  try { store.endSession(m.sessionId, { endedAt: new Date().toISOString(), endState: m.forced ? "forced" : m.state }); } catch {}
  const detail = graceful ? "asleep — memory committed" :
    m.forced ? "force-stopped — memory was not finalized" :
    `exited (code ${code}${signal ? `, ${signal}` : ""})${m.stderrTail.length ? `: ${m.stderrTail[m.stderrTail.length - 1]}` : ""}`;
  log(`${m.id} ${m.state}: ${detail}`);
  broadcastLifecycle(m, m.state, detail);
  broadcastRoster();
  broadcastArchitectures();
}

// ----------------------------------------------------------- upstream window

/** Connect to the child's m-ws, retrying until it binds (it awaits a dynamic
 *  import and a readiness poll), or the child dies, or we give up. */
function connectUpstream(m) {
  let attempts = 0;
  const tryOnce = () => {
    if (m.state === "exited" || m.state === "crashed") return;
    const ws = new WebSocket(`ws://127.0.0.1:${m.port}`);
    ws.on("open", () => {
      m.upstream = ws;
      // On (re)connect the child replays its latest-per-kind snapshot. Treat that
      // brief burst as projection-only so a reconnect doesn't inject stale events
      // into the ordered timeline; real new content (a fragment) ends the window.
      m._replayGuard = true;
      if (m._replayTimer) clearTimeout(m._replayTimer);
      m._replayTimer = setTimeout(() => { m._replayGuard = false; }, 800);
      if (m.state === "waking") { m.state = "awake"; broadcastLifecycle(m, "awake", "awake"); broadcastRoster(); }
    });
    ws.on("message", data => onUpstreamMessage(m, data));
    ws.on("error", () => {});                           // not up yet, or gone
    ws.on("close", () => {
      const wasUpstream = m.upstream === ws;
      m.upstream = null;
      // Keep trying while the child is meant to be alive (covers the bind delay
      // and brief drops); the exit handler ends the loop when the child dies.
      if ((m.state === "waking") || (m.state === "awake" && wasUpstream)) retry();
    });
  };
  const retry = () => { if (++attempts <= 200 && isAlive(m)) setTimeout(tryOnce, 150); };
  tryOnce();
}

function onUpstreamMessage(m, data) {
  let msg; try { msg = JSON.parse(data.toString()); } catch { return; }

  switch (msg.type) {
    case "structure":
      m.structure = (msg.data && msg.data.tree) || null;
      forwardLive(m, msg);
      return;
    case "status":
      if (msg.data && msg.data.state) m.lastStatus = msg.data.state;
      forwardLive(m, msg);
      return;
    case "thought_fragment":
    case "speech_fragment": {
      m._replayGuard = false;                          // real content → snapshot replay is over
      const kind = msg.type === "speech_fragment" ? "speech" : "thought";
      appendToPending(m, kind, (msg.data && msg.data.content) || "");
      forwardLive(m, msg);                             // rendered live by the pump; no seq
      return;
    }
    case "event":
      if (msg.data) return onUpstreamEvent(m, msg);
      forwardLive(m, msg);
      return;
    default:
      forwardLive(m, msg);
  }
}

/** Forward one upstream message to every client focused on this mind, optionally
 *  tagged with the timeline `seq` it advanced (so a client can ask for the delta
 *  since it on reconnect). Non-timeline messages carry no seq. */
function forwardLive(m, msg, seq) {
  const env = { type: "mind", data: { id: m.id, msg } };
  if (seq != null) env.data.seq = seq;
  for (const c of clients) if (c.focusedId === m.id) sendJSON(c, env);
}

/** Accumulate streamed text into the current run; flush (seal) it on a type switch. */
function appendToPending(m, kind, text) {
  if (!text) return;
  if (m.pending && m.pending.kind !== kind) flushPending(m);
  if (!m.pending) m.pending = { kind, text: "", chars: 0, at: new Date().toISOString() };
  m.pending.text += text;
  m.pending.chars += text.length;
}

/** Seal the in-progress run as one ordered timeline row (one row per burst/type,
 *  not per token). Returns the assigned seq, or null if nothing was pending. */
function flushPending(m) {
  if (!m.pending || !m.pending.text) { m.pending = null; return null; }
  const seq = ++m.seq;
  try {
    store.appendEntry(m.sessionId, { seq, at: m.pending.at, kind: m.pending.kind, text: m.pending.text, chars: m.pending.chars });
  } catch (e) { onLog(m, "err", `store append failed: ${e.message}`); }
  m.pending = null;
  return seq;
}

/** Which event kinds become part of the stream timeline (vs. tree/header only). */
function streamTimelineKind(d) {
  const route = `${d.process}/${d.kind}`;
  if (route === "stream/boundary") return "boundary";
  if (route === "speech/speaking") return "speaking";
  if (route === "image/error") return "stim";
  if (route === "attention/urgent") return "stim";
  if (route === "attention/decision") return (d.accepted && !d.urgent) ? "stim" : null;
  return null;
}

function stimTextFor(d) {
  const route = `${d.process}/${d.kind}`;
  if (route === "image/error") return `Image generation failed: ${d.message || "error"}`;
  if (route === "attention/urgent") return d.reason || "urgent stimulus";
  if (route === "attention/decision") return d.reason || d.type || "stimulus";
  return d.reason || "";
}

function onUpstreamEvent(m, msg) {
  const d = msg.data;
  const route = `${d.process}/${d.kind}`;

  // Energy drives the roster gauge regardless of focus.
  if (route === "economy/energy") { m.energy = d.energy; m.spent = d.spent; broadcastRoster(); }

  // Images: persist bytes to disk and rewrite the data URL to a light URL on the
  // browser hop (the child's direct clients still got the raw data URL untouched).
  if (route === "image/generated") return onUpstreamImage(m, msg);

  // Projection snapshot for the header/tree (latest-per-kind).
  m.snapshots.set(route, d);

  const kind = streamTimelineKind(d);
  if (kind && !m._replayGuard) {
    flushPending(m);                                   // seal preceding text first → order
    const seq = ++m.seq;
    const entry = { seq, at: d.at || new Date().toISOString(), kind, route, chars: 0 };
    if (kind === "boundary") entry.payload = { reason: d.reason };
    else if (kind === "speaking") entry.payload = { on: !!d.speaking };
    else if (kind === "stim") { entry.text = stimTextFor(d); entry.payload = { cls: route === "image/error" ? "warn" : null }; entry.chars = entry.text.length; }
    try { store.appendEntry(m.sessionId, entry); } catch (e) { onLog(m, "err", `store append failed: ${e.message}`); }
    forwardLive(m, msg, seq);
  } else {
    forwardLive(m, msg);
  }
}

function onUpstreamImage(m, msg) {
  const d = msg.data;
  if (m._replayGuard) return;                          // stale snapshot replay — already persisted

  let url = d.url || null;                             // an external URL (older API) passes through
  let imageId = null;
  const seq = (() => { flushPending(m); return ++m.seq; })();
  const parsed = d.dataUrl ? parseDataUrl(d.dataUrl) : null;
  if (parsed) {
    try {
      const saved = store.saveImage({
        home: m.home, sessionId: m.sessionId, seq, createdAt: d.at || new Date().toISOString(),
        prompt: d.prompt || d.originalPrompt, revisedPrompt: d.revisedPrompt, model: d.model, size: d.size,
        mime: parsed.mime, bytes: parsed.bytes,
      });
      imageId = saved.id; url = `/studio/image/${saved.id}`;
    } catch (e) { onLog(m, "err", `image persist failed: ${e.message}`); }
  }
  // A light, base64-free copy for the timeline, projection and live forward.
  const clean = { ...d, url, imageId }; delete clean.dataUrl;
  m.snapshots.set("image/generated", clean);
  try {
    store.appendEntry(m.sessionId, {
      seq, at: d.at || new Date().toISOString(), kind: "image", route: "image/generated",
      imageId, payload: { imageId, url, prompt: d.prompt || d.originalPrompt || "" }, chars: IMAGE_WEIGHT,
    });
  } catch (e) { onLog(m, "err", `store append failed: ${e.message}`); }
  forwardLive(m, { type: "event", data: clean }, seq);
}

// ------------------------------------------------------------------- sleep

function sleepMind(id) {
  const m = minds.get(id);
  if (!m || !isAlive(m)) return;
  if (m.state !== "sleeping") {
    m.state = "sleeping"; m.sleepRequestedAt = Date.now();
    log(`${m.id} sleeping — sending the ritual`);
    broadcastLifecycle(m, "sleeping", "asking the mind to fall asleep — its last thought, then memory is committed.");
    broadcastRoster();
    // The graceful ritual travels over the mind's own m-ws control channel
    // (stdin is unreliable for this under bun). The mind closes its thought,
    // finalizes + commits memory, then exits on its own → onChildExit.
    if (m.upstream && m.upstream.readyState === WebSocket.OPEN) {
      try { m.upstream.send(JSON.stringify({ type: "control", action: "sleep" })); }
      catch (e) { onLog(m, "err", `could not send sleep: ${e.message}`); }
    } else {
      broadcastLifecycle(m, "sleeping", "no live window to receive the ritual — use Force to stop this mind.");
    }
    // If the ritual hangs past the grace window, surface that Force is the way out.
    setTimeout(() => {
      if (m.state === "sleeping") broadcastLifecycle(m, "sleeping", "still settling… use Force if it will not sleep.");
    }, SLEEP_GRACE_MS);
  }
}

function forceMind(id) {
  const m = minds.get(id);
  if (!m || !m.child) return;
  log(`${m.id} FORCE kill`);
  m.forced = true;
  try { m.child.stdin && m.child.stdin.end(); } catch {}
  try { m.child.kill(); } catch {}
  setTimeout(() => { try { if (isAlive(m)) m.child.kill("SIGKILL"); } catch {} }, 1500);
}

/** Remove a stopped mind from the roster (only when it is no longer alive). */
function dismissMind(id) {
  const m = minds.get(id);
  if (m && !isAlive(m)) { minds.delete(id); broadcastRoster(); broadcastArchitectures(); }
}

function speakTo(id, message) {
  const m = minds.get(id);
  const text = (message || "").toString().trim();
  if (!text || !m || !m.upstream || m.upstream.readyState !== WebSocket.OPEN) return;
  try { m.upstream.send(JSON.stringify({ type: "input", data: { message: text } })); } catch {}
}

// -------------------------------------------------------------------- logs

function pipeLines(stream, kind, m) {
  if (!stream) return;
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", chunk => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line.length) onLog(m, kind, line);
    }
  });
}

function onLog(m, kind, line) {
  m.logs.push({ s: kind, l: line });
  while (m.logs.length > 400) m.logs.shift();
  if (kind === "err") { m.stderrTail.push(line); while (m.stderrTail.length > 20) m.stderrTail.shift(); }
  for (const c of clients) if (c.focusedId === m.id) sendJSON(c, { type: "log", data: { id: m.id, stream: kind, line } });
}

// --------------------------------------------------------- supervisor exit

// On Ctrl-C, ask every awake mind to sleep over its control channel. Each mind
// runs its own ritual to completion and exits independently, so we can step
// aside once the messages are delivered.
let shuttingDown = false;
process.on("SIGINT", () => {
  if (shuttingDown) process.exit(1);
  shuttingDown = true;
  const alive = [...minds.values()].filter(isAlive);
  log(`\nStudio shutting down — asking ${alive.length} mind(s) to sleep. Ctrl-C again to force.`);
  for (const m of alive) {
    try { if (m.upstream && m.upstream.readyState === WebSocket.OPEN) m.upstream.send(JSON.stringify({ type: "control", action: "sleep" })); } catch {}
  }
  setTimeout(() => process.exit(0), alive.length ? 2500 : 0);
});
