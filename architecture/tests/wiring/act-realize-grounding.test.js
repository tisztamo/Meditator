// Grounding the realizer (efference.md — closing the loop memory → realizer). The
// realizer turns a one-line reach into a hand's REAL arguments, so it must know what the
// mind knows — the actual definition of the thing it is checking — or it confabulates one
// (lemma-lab checked "balanced numbers" under a made-up rule because only ~700 chars of
// stream + the gist reached it). This exercises the two channels that now carry the mind's
// standing knowledge into the realize frame, without ever showing the conscious stream a
// tool (the One Rule): (A) the story/recent/tail mirrored from memory, and (B) a
// cue-matched lookup over the mind's own kept notebook + filed knowledge.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import A from "amanita";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let mind, act, note, notesDir;

beforeAll(async () => {
    if (!customElements.get("m-mind")) {
        customElements.define("m-mind", class extends A(HTMLElement) {});
    }
    notesDir = path.join(os.tmpdir(), "med-realize-grounding-" + Date.now());

    document.body.innerHTML = `
      <m-mind name="g">
        <m-stream name="stream"></m-stream>
        <m-memory name="memory"></m-memory>
        <m-act name="hands" every="1">
          <m-note name="note"></m-note>
          <m-recall name="recall"></m-recall>
        </m-act>
      </m-mind>
    `;
    document.querySelector('[name="note"]').setAttribute("dir", notesDir);
    document.querySelector('[name="recall"]').setAttribute("dir", notesDir);

    await loadMindComponents(document);
    await delay(160);   // let the hands retry-register with their parent m-act

    mind = document.querySelector("m-mind");
    act = mind.querySelector('[name="hands"]');
    note = mind.querySelector('[name="note"]');
});

afterAll(() => {
    try { fs.rmSync(notesDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

// ── (B) cue-matched recall over the kept pool ───────────────────────────────
test("(B) _recallForReach surfaces the mind's own definition, ranked by relevance", async () => {
    // Two kept notes: one is the definition the reach is really about, one is unrelated.
    await note._note({
        text: "A number n is balanced when both n + r(n) and n - r(n) are perfect squares, where r(n) is the digit reversal of n.",
        title: "balanced definition",
    });
    await note._note({
        text: "The weather today is bright and cold; the wind is from the north.",
        title: "weather",
    });

    const hits = await act._recallForReach("check whether balanced numbers have a reversal-sum that is a perfect square");
    expect(hits.length).toBeGreaterThan(0);
    // The definition note (overlapping vocabulary: balanced/reversal/perfect/square) ranks
    // first; the unrelated weather note does not lead.
    expect(hits[0].title).toBe("balanced definition");
    expect(hits[0].text).toMatch(/both n \+ r\(n\) and n - r\(n\) are perfect squares/);
});

test("(B) it reads the SAME notebook the mind's note/recall hand uses (custom dir)", async () => {
    // m-act was given no recallDir — it must follow the co-located note/recall's dir.
    const notebook = fs.readFileSync(path.join(notesDir, "notebook.md"), "utf8");
    expect(notebook).toMatch(/balanced when both/);       // the note really lives in notesDir
    const hits = await act._recallForReach("balanced numbers");
    expect(hits.some(h => h.title === "balanced definition")).toBe(true);
});

test("(B) recallForRealize=off disables the lookup", async () => {
    act.setAttribute("recallForRealize", "off");
    expect(await act._recallForReach("balanced numbers")).toEqual([]);
    act.removeAttribute("recallForRealize");
});

// ── (A) standing memory context folded into the frame ───────────────────────
test("(A)+(B) the realize frame carries the mind's knowledge, not just the gist", async () => {
    // Simulate what memory publishes (story/recent) and the live tail.
    act._memStory = "This mind is settling whether infinitely many balanced integers exist.";
    act._memRecent = "It found the palindrome family n = 2(10^k+1)^2 gives n - r(n) = 0.";
    act._memTail = "So for a palindrome, n is balanced exactly when 2n is a perfect square.";

    const recalled = await act._recallForReach("check whether balanced numbers have a reversal-sum that is a perfect square");
    const frame = act._realizeFrame(
        { gist: "I want to check whether three-digit palindromes are balanced by testing the actual numbers." },
        recalled,
    );

    // The knowledge section leads, carrying (B) the recalled definition and (A) the
    // consolidated story/recent.
    expect(frame).toMatch(/## What you already know that bears on this/);
    expect(frame).toMatch(/both n \+ r\(n\) and n - r\(n\) are perfect squares/);  // recalled note
    expect(frame).toMatch(/infinitely many balanced integers/);                    // story
    expect(frame).toMatch(/palindrome family n = 2\(10\^k\+1\)\^2/);               // recent
    // The live tail is still there…
    expect(frame).toMatch(/## What the mind has been thinking/);
    expect(frame).toMatch(/2n is a perfect square/);
    // …and the reach itself, with the do-not-invent instruction.
    expect(frame).toMatch(/## What it is reaching toward/);
    expect(frame).toMatch(/three-digit palindromes/);
    expect(frame).toMatch(/do not invent a definition or a value/i);
});

test("(A) with no memory and no kept match, the frame degrades to the old shape", async () => {
    act._memStory = "";
    act._memRecent = "";
    act._memTail = "";
    // A gist whose vocabulary matches nothing kept.
    const recalled = await act._recallForReach("xylophone quokka zeppelin");
    const frame = act._realizeFrame({ gist: "I want to xylophone the quokka." }, recalled);
    expect(frame).not.toMatch(/## What you already know that bears on this/);
    expect(frame).toMatch(/## What it is reaching toward/);
});

test("the One Rule holds: none of the hands' schemas leak into the conscious stream", () => {
    // Grounding is added to the REALIZER's frame only. The realizer's system prompt names
    // it as the subconscious motor system; the stream model is never handed a tool here.
    expect(act._realizeSystem()).toMatch(/subconscious motor system/i);
    expect(act._realizeSystem()).toMatch(/never invent a definition/i);
});
