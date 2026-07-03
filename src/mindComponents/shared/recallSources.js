import fs from 'node:fs/promises';
import path from 'node:path';
import { parseNotebook } from "./mNote.js";

/**
 * The mind's own kept thoughts, gathered from BOTH places it sets them down, so the
 * read-back path (m-recall, m-resurface) can surface either (compression-fidelity.md §5):
 *
 *   - notes/notebook.md  — what the conscious mind deliberately marked to keep (m-note)
 *   - knowledge/**.md     — what the scribe (m-kb) distilled as durable knowledge
 *
 * The scribe's knowledge base used to be write-only: m-kb filed conclusions there and
 * nothing ever read them back, so a mind that had already settled a question would
 * circle it again with the answer sitting unread on disk (the lemma runs lost a proved
 * result exactly this way). Folding `knowledge/` into the same candidate pool as the
 * notebook closes that gap with no model call — the same recency / cue-overlap pick
 * logic now ranks notes and filed knowledge together.
 *
 * Every item has the same shape so the pickers need not care where it came from:
 *   key    — stable identity for dedup (a note's stamp; a KB file's path). A note's
 *            stamp is unique per write; KB files can share an mtime when filed in one
 *            scribe run, so they key on path instead.
 *   stamp  — ISO time for recency ordering (the note's write time / the file's mtime)
 *   title  — a few words naming it (the note's title, or the KB file's heading/path)
 *   text   — the kept words themselves
 *   source — "note" | "knowledge", so a recall can be FELT differently by where it came
 *            from (set down vs. come to understand) without leaking the mechanism
 *
 * Sorted oldest-first, matching parseNotebook's document order, so "freshest is last"
 * and the recency tiebreak hold across the merged pool.
 */
export async function readKept({ notesDir, kbDir } = {}) {
    const [notes, knowledge] = await Promise.all([
        readNotes(notesDir),
        readKnowledge(kbDir),
    ]);
    return mergeKept(notes, knowledge);
}

/** Merge and order two already-parsed pools oldest-first (ISO stamps sort lexically). */
export function mergeKept(notes, knowledge) {
    return [...notes, ...knowledge].sort((a, b) =>
        a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : 0);
}

/**
 * Turn one knowledge-base markdown file into a kept item (pure, so it is testable
 * without the filesystem). The title is the file's first heading if it has one, else
 * a readable form of its path; the body drops a leading top-of-file heading so a
 * recalled line reads as prose rather than as a markdown header, while interior
 * structure is left as the mind kept it. Returns null for an empty file.
 */
export function knowledgeItem(rel, content, stampISO) {
    const trimmed = (content || "").trim();
    if (!trimmed) return null;
    const heading = trimmed.match(/^#{1,6}\s+(.+?)\s*$/m);
    const title = heading
        ? heading[1].trim()
        : rel.replace(/\.md$/i, "").replace(/[/_-]+/g, " ").trim();
    const body = trimmed.replace(/^#{1,6}\s+.+(?:\r?\n)+/, "").trim() || trimmed;
    return { key: `kb:${rel}`, stamp: stampISO, title, text: body, source: "knowledge" };
}

async function readNotes(dir) {
    if (!dir) return [];
    let raw;
    try {
        raw = await fs.readFile(path.join(dir, "notebook.md"), "utf8");
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
    return parseNotebook(raw).map(n => ({ ...n, key: n.stamp, source: "note" }));
}

async function readKnowledge(dir) {
    if (!dir) return [];
    const files = await mdFiles(dir);
    const items = [];
    for (const rel of files) {
        try {
            const abs = path.join(dir, rel);
            const content = await fs.readFile(abs, "utf8");
            const stamp = (await fs.stat(abs)).mtime.toISOString();
            const item = knowledgeItem(rel, content, stamp);
            if (item) items.push(item);
        } catch { /* a file vanished or is unreadable — skip it, never fail the read */ }
    }
    return items;
}

/**
 * Every *.md under the KB root, recursively. Skips hidden files and `index.md` (a map
 * of the tree, not a conclusion the mind would "remember"). Bounded depth — the KB is
 * shallow by construction — and silent on a missing dir, so a mind with no KB yet
 * simply contributes nothing.
 */
async function mdFiles(dir, prefix = "", depth = 0) {
    if (depth > 3) return [];
    let entries;
    try {
        entries = await fs.readdir(path.join(dir, prefix), { withFileTypes: true });
    } catch {
        return [];
    }
    const out = [];
    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) out.push(...await mdFiles(dir, rel, depth + 1));
        else if (entry.name.endsWith(".md") && entry.name !== "index.md") out.push(rel);
    }
    return out;
}
