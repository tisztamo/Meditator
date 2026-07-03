// withPerceivedEvents — THE one rendering of perception in the stream record
// (perception-not-compressible.md, option 1, chosen 2026-07-03). m-mind composes the
// burst's prefill with it and m-memory appends the identical block to the durable
// tail, so the prompt the model continues, the tail it wakes from, and the journal a
// human reads never drift apart. These tests pin the rendering and that equivalence.
import { test, expect } from "bun:test";
import { withPerceivedEvents } from "../../../src/infrastructure/interruptRecord.js";

test("appends a perceived event after the mind's last words, journal-rendered", () => {
    const out = withPerceivedEvents("…and the harbor was quiet.", ["A bell rang."]);
    expect(out).toBe("…and the harbor was quiet.\n\n> ⟂ A bell rang.\n\n");
});

test("the event lands AFTER the words even when the thought broke off mid-sentence", () => {
    const out = withPerceivedEvents("the difference is 999a - 90", ["The screen shows: []"]);
    expect(out.indexOf("999a - 90")).toBeLessThan(out.indexOf("> ⟂ The screen shows: []"));
    expect(out.endsWith("\n\n")).toBe(true);   // the continuation starts as fresh prose
});

test("several stimuli in one frame become one block, each on its own ⟂ line", () => {
    const out = withPerceivedEvents("thinking.", ["First thing.", "Second thing."]);
    expect(out).toBe("thinking.\n\n> ⟂ First thing.\n\n> ⟂ Second thing.\n\n");
});

test("a freshly-born mind's stream may BEGIN with the event (the origin seed)", () => {
    expect(withPerceivedEvents("", ["The problem you are working on: …"]))
        .toBe("> ⟂ The problem you are working on: …\n\n");
});

test("no stimuli → the text passes through untouched", () => {
    expect(withPerceivedEvents("unchanged tail", [])).toBe("unchanged tail");
    expect(withPerceivedEvents("unchanged tail", null)).toBe("unchanged tail");
    expect(withPerceivedEvents("", [])).toBe("");
});

test("trailing whitespace is normalized so both composers produce identical text", () => {
    // m-mind's mirrored tail and m-memory's own tail can differ in trailing
    // whitespace (a chunk boundary); the append must erase that difference.
    const a = withPerceivedEvents("same words.", ["Ping."]);
    const b = withPerceivedEvents("same words.\n \n", ["Ping."]);
    expect(a).toBe(b);
});
