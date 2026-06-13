import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

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

// ----------------------------------------------------------------- utilities

const log = (...a) => console.log("[studio]", ...a);
const slugify = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mind";

/** Tolerant parse of a .chml: the first <m-mind> attributes, whether it has an
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
  return {
    name: attr("name"),
    memory: attr("memory"),
    model: attr("model"),
    pace: attr("pace"),
    hasWs: /<m-ws\b/i.test(content),
    description: comment ? comment[1].trim().replace(/\s+/g, " ").slice(0, 200) : null,
  };
}

/** What memory home a base slug maps to, and whether it exists on disk. */
function homeInfo(slug) {
  const dir = path.join(VAULT_ROOT, slug);
  let exists = false, files = 0;
  try {
    const st = fs.statSync(dir);
    if (st.isDirectory()) { exists = true; files = fs.readdirSync(dir).length; }
  } catch { /* no home yet */ }
  return { exists, files };
}

/** The architecture catalog: every .chml under architecture/ (tests/ flagged),
 *  each resolved to its mind name and memory home, with collision flags. */
function listArchitectures() {
  const out = [];
  const scan = (dir, group) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".chml")) {
        const full = path.join(dir, e.name);
        const rel = path.relative(ARCH_DIR, full).split(path.sep).join("/");
        let meta;
        try { meta = parseArchitecture(fs.readFileSync(full, "utf-8")); }
        catch { meta = { name: null, memory: null, model: null, pace: null, hasWs: false, description: null }; }
        const slug = slugify(meta.memory || meta.name || "mind");
        out.push({
          file: rel, group,
          name: meta.name, memory: meta.memory, model: meta.model, pace: meta.pace,
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
    port: m.port, public: m.port === PORT_BASE, dryRun: m.dryRun,
    state: m.state, since: m.since, hasWindow: !!(m.upstream && m.upstream.readyState === WebSocket.OPEN),
    energy: m.energy, spent: m.spent, detail: m.detail || null,
  }));
}

// --------------------------------------------------------------- the clients

const app = express();
app.use(express.static(path.dirname(fileURLToPath(import.meta.url))));
// Serve the Amanita framework source to the browser so the Studio UI (an Amanita
// component mesh) can `import A from "amanita"` build-free, via an importmap in
// studio.html. The package is pure relative-imported ESM, so static-serving its
// src/ is enough; unused files (worker/*, stdlib) are simply never fetched.
app.use("/amanita", express.static(path.join(ROOT, "node_modules", "amanita", "src")));
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
  sendJSON(client, { type: "hello", data: { studioPort: STUDIO_PORT, publicPort: PORT_BASE } });
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
    case "wake":    try { const id = wake(d.file, !!d.dryRun); sendJSON(client, { type: "woke", data: { id, file: d.file } }); } catch (e) { sendJSON(client, { type: "error", data: { message: e.message } }); } break;
    case "sleep":   sleepMind(d.id); break;
    case "force":   forceMind(d.id); break;
    case "dismiss": dismissMind(d.id); break;
    case "input":   speakTo(d.id, d.message); break;
    case "focus":   focusClient(client, d.id); break;
    case "refresh": sendJSON(client, { type: "architectures", data: { list: listArchitectures() } }); break;
  }
}

function focusClient(client, id) {
  client.focusedId = id;
  const m = minds.get(id);
  if (!m) return;
  // Reconstitute the focused mind from cache: structure, last stream state, the
  // latest snapshot of every telemetry kind, then the recent stream text.
  sendJSON(client, { type: "focus-reset", data: { id } });
  if (m.structure) sendJSON(client, { type: "mind", data: { id, msg: m.structure } });
  if (m.lastStatus) sendJSON(client, { type: "mind", data: { id, msg: m.lastStatus } });
  for (const msg of m.snapshots.values()) sendJSON(client, { type: "mind", data: { id, msg } });
  for (const msg of m.recentStream) sendJSON(client, { type: "mind", data: { id, msg } });
  // backfill recent logs too
  for (const entry of m.logs) sendJSON(client, { type: "log", data: { id, stream: entry.s, line: entry.l } });
}

// ------------------------------------------------------------------- waking

function wake(file, dryRun) {
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

  const port = allocPort();
  const id = `m${++mindSeq}`;
  const relForSpawn = path.relative(ROOT, resolved).split(path.sep).join("/");
  const child = spawn(process.execPath, [MEDITATOR_ENTRY, "-a", relForSpawn], {
    cwd: ROOT,
    env: {
      ...process.env,
      MEDITATOR_WS_PORT: String(port),        // place this child's m-ws on its own port
      MEDITATOR_WS_CONTROL: "1",              // let us request the sleep ritual over that socket
      ...(dryRun ? { MEDITATOR_DRY_RUN: "1" } : {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const m = {
    id, file, name: meta.name || slugify(meta.memory || "mind"), dryRun,
    home: `memory/${baseHome}`, baseHome, hasWs: meta.hasWs,
    port, child, state: "waking", since: new Date().toISOString(),
    energy: null, spent: null, detail: "waking…",
    upstream: null, structure: null, lastStatus: null, snapshots: new Map(),
    recentStream: [], recentChars: 0, logs: [], stderrTail: [], sleepRequestedAt: null,
  };
  minds.set(id, m);
  log(`waking ${id} ← ${file}  (port ${port}${port === PORT_BASE ? ", public" : ""}${dryRun ? ", dry-run" : ""})  → memory/${baseHome}`);

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

  if (msg.type === "structure") {
    m.structure = msg;
  } else if (msg.type === "status" && msg.data && msg.data.state) {
    m.lastStatus = msg;
  } else if (msg.type === "event" && msg.data) {
    m.snapshots.set(`${msg.data.process}/${msg.data.kind}`, msg);
    if (msg.data.process === "economy" && msg.data.kind === "energy") {
      m.energy = msg.data.energy; m.spent = msg.data.spent; broadcastRoster();
    }
  } else if (msg.type === "thought_fragment" || msg.type === "speech_fragment") {
    const text = (msg.data && msg.data.content) || "";
    m.recentStream.push(msg); m.recentChars += text.length;
    while (m.recentChars > 60000 && m.recentStream.length) {
      const dropped = m.recentStream.shift();
      m.recentChars -= ((dropped.data && dropped.data.content) || "").length;
    }
  }

  // Live-forward to clients focused on this mind.
  for (const c of clients) if (c.focusedId === m.id) sendJSON(c, { type: "mind", data: { id: m.id, msg } });
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
