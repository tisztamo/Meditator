import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * The Studio's telemetry store — supervisor-owned observability, NOT mind memory.
 *
 * It is a durable, ordered record of what each mind streamed (so a reloading or
 * reconnecting browser can repaint the recent window instantly instead of
 * re-animating it) and a retained archive of every generated image (so they are
 * still here after a restart and the next day). It lives entirely under
 * `.run/studio/` (gitignored) — the supervisor still never touches `memory/`.
 *
 * Three tables, keyed by the durable **home** (`memory/<slug>`), never the
 * ephemeral supervisor id (m1, m2… reassigned per wake):
 *   - session : one wake→sleep of a mind.
 *   - entry   : the append-only, seq-ordered stream timeline (thought/speech runs
 *               interleaved with boundaries, stimuli, speaking transitions and
 *               image placements). seq is monotonic within a session.
 *   - image   : metadata for each generated image; the bytes live on disk under
 *               images/<home-slug>/<id>.<ext> and are served by an HTTP route.
 *
 * Writes are run-granular (one row per text run, sealed at a burst boundary or a
 * thought↔speech switch) so the table stays small and a backfill is few-and-large.
 */
export class StudioStore {
  /**
   * @param {object} [opts]
   * @param {string} [opts.dir]      directory for the db + images (default .run/studio)
   * @param {string} [opts.dbPath]   explicit db path (":memory:" for tests)
   * @param {string} [opts.imagesDir] explicit images dir (for tests)
   */
  constructor({ dir, dbPath, imagesDir } = {}) {
    const base = dir || path.join(process.cwd(), ".run", "studio");
    this.dbPath = dbPath || path.join(base, "studio.db");
    this.imagesDir = imagesDir || path.join(base, "images");
    if (this.dbPath !== ":memory:") fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.mkdirSync(this.imagesDir, { recursive: true });

    this.db = new Database(this.dbPath, { create: true });
    if (this.dbPath !== ":memory:") {
      try { this.db.exec("PRAGMA journal_mode = WAL;"); } catch { /* fine without */ }
    }
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this._migrate();
    this._prepare();
  }

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        home          TEXT NOT NULL,
        mind_name     TEXT,
        arch_file     TEXT,
        model_profile TEXT,
        started_at    TEXT NOT NULL,
        ended_at      TEXT,
        end_state     TEXT
      );
      CREATE INDEX IF NOT EXISTS ix_session_home ON session(home, started_at);

      CREATE TABLE IF NOT EXISTS entry (
        session_id INTEGER NOT NULL,
        seq        INTEGER NOT NULL,
        at         TEXT NOT NULL,
        kind       TEXT NOT NULL,         -- thought | speech | boundary | stim | speaking | image
        route      TEXT,                  -- event route, for provenance
        text       TEXT,                  -- displayed text (thought/speech run, stim label)
        payload    TEXT,                  -- JSON extras (reason / cls / on / imageId / prompt) — never base64
        image_id   INTEGER,
        chars      INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, seq)
      );

      CREATE TABLE IF NOT EXISTS image (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        home           TEXT NOT NULL,
        session_id     INTEGER,
        seq            INTEGER,
        created_at     TEXT NOT NULL,
        prompt         TEXT,
        revised_prompt TEXT,
        model          TEXT,
        size           TEXT,
        mime           TEXT,
        path           TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_image_home_day ON image(home, created_at);
    `);
  }

  _prepare() {
    this._insSession = this.db.query(
      `INSERT INTO session (home, mind_name, arch_file, model_profile, started_at)
       VALUES (?, ?, ?, ?, ?)`);
    this._endSession = this.db.query(
      `UPDATE session SET ended_at = ?, end_state = ? WHERE id = ?`);
    this._insEntry = this.db.query(
      `INSERT OR IGNORE INTO entry (session_id, seq, at, kind, route, text, payload, image_id, chars)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    this._insImage = this.db.query(
      `INSERT INTO image (home, session_id, seq, created_at, prompt, revised_prompt, model, size, mime, path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    this._setImagePath = this.db.query(`UPDATE image SET path = ? WHERE id = ?`);
    this._getImage = this.db.query(`SELECT id, mime, path FROM image WHERE id = ?`);
    // Newest-first slices; callers reverse to ascending. We over-read a little and
    // trim by the char budget in JS (cheaper than a window function here).
    this._tailDesc = this.db.query(
      `SELECT seq, at, kind, route, text, payload, image_id, chars
       FROM entry WHERE session_id = ? ORDER BY seq DESC`);
    this._sinceAsc = this.db.query(
      `SELECT seq, at, kind, route, text, payload, image_id, chars
       FROM entry WHERE session_id = ? AND seq > ? ORDER BY seq ASC`);
    this._imagesByHome = this.db.query(
      `SELECT id, session_id, seq, created_at, prompt, model, size, mime
       FROM image WHERE home = ? ORDER BY created_at DESC LIMIT ?`);
  }

  // ----------------------------------------------------------------- sessions
  startSession({ home, mindName, archFile, modelProfile, startedAt }) {
    const info = this._insSession.run(home, mindName || null, archFile || null, modelProfile || null, startedAt);
    return Number(info.lastInsertRowid);
  }

  endSession(sessionId, { endedAt, endState }) {
    if (sessionId == null) return;
    this._endSession.run(endedAt, endState || null, sessionId);
  }

  // ----------------------------------------------------------------- entries
  /** Append one sealed timeline row. `entry` = {seq, at, kind, route?, text?, payload?, imageId?, chars}. */
  appendEntry(sessionId, e) {
    if (sessionId == null) return;
    this._insEntry.run(
      sessionId, e.seq, e.at, e.kind, e.route || null,
      e.text != null ? e.text : null,
      e.payload != null ? JSON.stringify(e.payload) : null,
      e.imageId != null ? e.imageId : null,
      e.chars || 0);
  }

  // ------------------------------------------------------------------ images
  /** Persist image bytes to disk + a metadata row. Returns {id, path}. */
  saveImage({ home, sessionId, seq, createdAt, prompt, revisedPrompt, model, size, mime, bytes }) {
    const info = this._insImage.run(
      home, sessionId ?? null, seq ?? null, createdAt,
      prompt || null, revisedPrompt || null, model || null, size || null, mime || null, "");
    const id = Number(info.lastInsertRowid);
    const ext = extForMime(mime);
    const sub = path.join(this.imagesDir, safeSlug(home));
    fs.mkdirSync(sub, { recursive: true });
    const file = path.join(sub, `${id}.${ext}`);
    fs.writeFileSync(file, bytes);
    this._setImagePath.run(file, id);
    return { id, path: file };
  }

  getImage(id) {
    const row = this._getImage.get(Number(id));
    return row || null;
  }

  imagesForHome(home, limit = 200) {
    return this._imagesByHome.all(home, limit);
  }

  // ------------------------------------------------------------- backfill reads
  /** Most-recent rows whose displayed chars sum to ~maxChars, ascending by seq. */
  tail(sessionId, maxChars) {
    if (sessionId == null) return [];
    const desc = this._tailDesc.all(sessionId);
    return trimToBudget(desc, maxChars);
  }

  /** Rows with seq > sinceSeq, ascending; trimmed to the most recent ~maxChars
   *  so a long absence can't return a giant batch. */
  since(sessionId, sinceSeq, maxChars) {
    if (sessionId == null) return [];
    const asc = this._sinceAsc.all(sessionId, sinceSeq | 0);
    if (sumChars(asc) <= maxChars) return asc;
    return trimToBudget(asc.slice().reverse(), maxChars);
  }

  close() { try { this.db.close(); } catch { /* already closed */ } }
}

// ------------------------------------------------------------------ helpers

function sumChars(rows) { let n = 0; for (const r of rows) n += r.chars || 0; return n; }

/** Given rows newest-first, keep from the top until the char budget is met, then
 *  return them oldest-first (ascending by seq) for in-order rendering. */
function trimToBudget(descRows, maxChars) {
  const kept = [];
  let chars = 0;
  for (const r of descRows) {
    kept.push(r);
    chars += r.chars || 0;
    if (chars >= maxChars) break;
  }
  kept.reverse();
  return kept;
}

function extForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "img";
}

/** A filesystem-safe leaf from a home like "memory/basic-stream" -> "basic-stream". */
function safeSlug(home) {
  const leaf = String(home || "mind").split("/").pop();
  return leaf.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "mind";
}

/** Parse a data: URL into {mime, bytes:Buffer} or null. */
export function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || "");
  if (!m) return null;
  const mime = m[1] || "application/octet-stream";
  const isB64 = !!m[2];
  const bytes = isB64 ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf-8");
  return { mime, bytes };
}
