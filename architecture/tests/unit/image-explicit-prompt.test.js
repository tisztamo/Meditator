// explicitImagePrompt: the "the mind wrote the prompt out loud, the hand
// implements it" path. It scans the tail for a line that names itself as an
// image/picture/chart prompt and returns its content — or null, and never the
// same prompt the hand already drew.
import { test, expect } from "bun:test";
import { explicitImagePrompt } from "../../../src/mindComponents/mind/mImage.js";

test("finds a quoted out-loud prompt", () => {
    const tail = `I keep coming back to the field.
image prompt: "A bar chart of the top 24h movers: BTC $118,420 (+2.1%), SOL $312 (-4.8%), ENA $2.31 (+22.7%); breadth 61 up of 100."
Let me see what the wind does with that.`;
    const p = explicitImagePrompt(tail, null);
    expect(p).toBe("A bar chart of the top 24h movers: BTC $118,420 (+2.1%), SOL $312 (-4.8%), ENA $2.31 (+22.7%); breadth 61 up of 100.");
});

test("finds an unquoted out-loud prompt", () => {
    const tail = `image prompt: A quiet chart, breadth 61 up, ENA standing out at +22.7% while the field sits at +3.9%.`;
    const p = explicitImagePrompt(tail, null);
    expect(p).toBe("A quiet chart, breadth 61 up, ENA standing out at +22.7% while the field sits at +3.9%.");
});

test("picture/chart/drawing prompt prefixes also count", () => {
    expect(explicitImagePrompt(`picture prompt: A line of the field's median, +3.9%, with ENA far above.`, null))
        .toBe("A line of the field's median, +3.9%, with ENA far above.");
    expect(explicitImagePrompt(`chart prompt: breadth 61 up of 100, median +3.9%.`, null))
        .toBe("breadth 61 up of 100, median +3.9%.");
});

test("returns null when no out-loud prompt is present", () => {
    expect(explicitImagePrompt(`The field is lifting. ENA is going somewhere on its own.`, null)).toBeNull();
    expect(explicitImagePrompt(``, null)).toBeNull();
});

test("returns null for a too-short prompt", () => {
    expect(explicitImagePrompt(`image prompt: a chart.`, null)).toBeNull();
});

test("never returns the prompt the hand already drew", () => {
    const p = "A bar chart of the top 24h movers: BTC $118,420 (+2.1%), breadth 61 up of 100.";
    const tail = `image prompt: "${p}"`;
    expect(explicitImagePrompt(tail, p)).toBeNull();
    // A DIFFERENT out-loud prompt still fires.
    const other = "A fresh chart: breadth 70 up, SOL leading at +5.2%, the field median at +4.1%.";
    expect(explicitImagePrompt(`image prompt: "${other}"`, p)).toBe(other);
});

test("takes the most recent out-loud prompt", () => {
    const tail = `image prompt: "An old chart, breadth 55 up."
the market turned
image prompt: "A new chart, breadth 72 up, the field lifting."`;
    expect(explicitImagePrompt(tail, null)).toBe("A new chart, breadth 72 up, the field lifting.");
});
