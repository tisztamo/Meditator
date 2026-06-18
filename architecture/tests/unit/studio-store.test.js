// The Studio telemetry store: ordered append, the bounded backfill reads (tail /
// since) that let a reconnecting browser repaint just the recent window, and the
// image round-trip (bytes to disk, metadata in the db). Uses an in-memory db and
// a throwaway images dir so it leaves nothing behind.
import { test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StudioStore, parseDataUrl } from "../../../src/studio/store.js";

let store, imagesDir;

beforeEach(() => {
  imagesDir = path.join(os.tmpdir(), `studio-store-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  store = new StudioStore({ dbPath: ":memory:", imagesDir });
});
afterEach(() => {
  try { store.close(); } catch {}
  try { fs.rmSync(imagesDir, { recursive: true, force: true }); } catch {}
});

function seedRuns(sessionId, count, charsEach = 100) {
  for (let seq = 1; seq <= count; seq++) {
    store.appendEntry(sessionId, { seq, at: `2026-06-18T00:00:${String(seq).padStart(2, "0")}Z`, kind: "thought", text: "x".repeat(charsEach), chars: charsEach });
  }
}

test("a session round-trips and entries come back in order", () => {
  const id = store.startSession({ home: "memory/test", mindName: "test", startedAt: "2026-06-18T00:00:00Z" });
  expect(typeof id).toBe("number");
  seedRuns(id, 3);
  const rows = store.tail(id, 10000);
  expect(rows.map(r => r.seq)).toEqual([1, 2, 3]);
  expect(rows[0].kind).toBe("thought");
});

test("tail keeps only the most recent rows within the char budget, ascending", () => {
  const id = store.startSession({ home: "memory/test", startedAt: "2026-06-18T00:00:00Z" });
  seedRuns(id, 5, 100);          // seqs 1..5, 100 chars each
  const rows = store.tail(id, 250);
  // Newest-first until >=250 chars (5,4,3 = 300), returned oldest-first.
  expect(rows.map(r => r.seq)).toEqual([3, 4, 5]);
});

test("since returns only the delta after a seq, ascending", () => {
  const id = store.startSession({ home: "memory/test", startedAt: "2026-06-18T00:00:00Z" });
  seedRuns(id, 5, 100);
  expect(store.since(id, 2, 10000).map(r => r.seq)).toEqual([3, 4, 5]);
  expect(store.since(id, 5, 10000)).toEqual([]);
});

test("a giant since-delta is still trimmed to the recent window", () => {
  const id = store.startSession({ home: "memory/test", startedAt: "2026-06-18T00:00:00Z" });
  seedRuns(id, 5, 100);
  const rows = store.since(id, 0, 250);   // everything since 0, but capped at ~250 chars
  expect(rows.map(r => r.seq)).toEqual([3, 4, 5]);
});

test("images are written to disk and resolved by id; data URLs parse", () => {
  const id = store.startSession({ home: "memory/test", startedAt: "2026-06-18T00:00:00Z" });
  const bytes = Buffer.from("PNGBYTES");
  const { id: imageId, path: file } = store.saveImage({
    home: "memory/test", sessionId: id, seq: 7, createdAt: "2026-06-18T00:01:00Z",
    prompt: "a quiet room", model: "gpt-image-1", size: "1024x1024", mime: "image/png", bytes,
  });
  expect(fs.existsSync(file)).toBe(true);
  expect(fs.readFileSync(file).toString()).toBe("PNGBYTES");
  const got = store.getImage(imageId);
  expect(got.mime).toBe("image/png");
  expect(got.path).toBe(file);
  expect(store.imagesForHome("memory/test").length).toBe(1);

  const parsed = parseDataUrl("data:image/png;base64," + Buffer.from("hi").toString("base64"));
  expect(parsed.mime).toBe("image/png");
  expect(parsed.bytes.toString()).toBe("hi");
});
