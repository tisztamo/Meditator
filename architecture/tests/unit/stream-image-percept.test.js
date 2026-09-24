// The image-percept path: a generated image's pixels ride the NEXT burst's user
// turn as an image_url content part (the local voice is a VLM, so the mind sees
// the picture it drew). buildBurstMessages is pure, so the part's presence and
// position are testable without a stream.
import { test, expect } from "bun:test";
import { buildBurstMessages } from "../../../src/mindComponents/mind/mStream.js";

test("no image: plain string user turn and assistant prefill (unchanged path)", () => {
    const m = buildBurstMessages({
        system: "sys", userTurn: "instr", prefill: "the tail", thinking: false, image: null,
    });
    expect(m).toEqual([
        { role: "system", content: "sys" },
        { role: "user", content: "instr" },
        { role: "assistant", content: "the tail" },
    ]);
});

test("image: user turn becomes a content array with text + image_url part", () => {
    const m = buildBurstMessages({
        system: "sys", userTurn: "instr", prefill: "the tail", thinking: false,
        image: { dataUrl: "data:image/png;base64,AAA" },
    });
    expect(m[0]).toEqual({ role: "system", content: "sys" });
    expect(m[1].role).toBe("user");
    expect(Array.isArray(m[1].content)).toBe(true);
    expect(m[1].content[0]).toEqual({ type: "text", text: "instr" });
    expect(m[1].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAA" } });
    expect(m[2]).toEqual({ role: "assistant", content: "the tail" });
});

test("thinking mode: the folded user turn carries the image part", () => {
    const m = buildBurstMessages({
        system: null, userTurn: "instr", prefill: "the tail", thinking: true,
        image: { dataUrl: "data:image/png;base64,AAA" },
    });
    expect(m.length).toBe(1);
    expect(m[0].role).toBe("user");
    expect(Array.isArray(m[0].content)).toBe(true);
    expect(m[0].content[0].text).toContain("The monologue so far");
    expect(m[0].content[0].text).toContain("…the tail");
    expect(m[0].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AAA" } });
});

test("thinking mode, no image: stays a plain string (no empty part)", () => {
    const m = buildBurstMessages({
        system: null, userTurn: "instr", prefill: "the tail", thinking: true, image: null,
    });
    expect(m.length).toBe(1);
    expect(typeof m[0].content).toBe("string");
});

test("image with no dataUrl is ignored (no part)", () => {
    const m = buildBurstMessages({
        system: null, userTurn: "instr", prefill: null, thinking: false,
        image: { dataUrl: null },
    });
    expect(m).toEqual([{ role: "user", content: "instr" }]);
});
