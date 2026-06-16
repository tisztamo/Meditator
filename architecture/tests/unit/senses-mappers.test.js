// Pure mappers for afferent senses — deterministic, no DOM.
import { test, expect } from "bun:test";
import { bandFor } from "../../../src/mindComponents/mDaylight.js";
import { describeWeather } from "../../../src/mindComponents/mWeather.js";
import { parseFeedTitles } from "../../../src/mindComponents/mFeed.js";

const SUBSTRATE = /cursor|token|latency|\bprocess\b|runtime|\bprompt\b|\bmodel\b|gpu|cpu|\bmemory\b|buffer|\bbyte|\bthread\b|socket|interrupt/i;

const dayExpect = [
    [0, "deep-night"], [3, "deep-night"], [4, "predawn"], [6, "dawn"], [9, "morning"],
    [12, "midday"], [15, "afternoon"], [18, "golden"], [20, "dusk"], [22, "evening"], [23, "night"],
];

for (const [hour, key] of dayExpect) {
    test(`daylight hour ${hour} -> ${key}`, () => {
        expect(bandFor(hour).key).toBe(key);
    });
}

for (let h = 0; h < 24; h++) {
    test(`daylight hour ${h}: distinct world-facing lines`, () => {
        const lines = bandFor(h).lines;
        expect(lines.length).toBeGreaterThanOrEqual(2);
        expect(new Set(lines).size).toBe(lines.length);
        expect(lines.some(l => SUBSTRATE.test(l))).toBe(false);
    });
}

const wExpect = [
    [{ code: 0, temperature: 24, isDay: true }, "clear"],
    [{ code: 2, temperature: 12, isDay: true }, "fair"],
    [{ code: 3, temperature: 5, isDay: false }, "overcast"],
    [{ code: 45, temperature: 2, isDay: true }, "fog"],
    [{ code: 53, temperature: 9, isDay: true }, "drizzle"],
    [{ code: 65, temperature: 4, isDay: false }, "rain"],
    [{ code: 81, temperature: 7, isDay: true }, "rain"],
    [{ code: 73, temperature: -3, isDay: true }, "snow"],
    [{ code: 95, temperature: 18, isDay: false }, "thunder"],
];

for (const [input, key] of wExpect) {
    test(`weather code ${input.code} -> ${key}`, () => {
        const out = describeWeather(input);
        expect(out.key).toBe(key);
        expect(out.line.length).toBeGreaterThan(15);
        expect(SUBSTRATE.test(out.line)).toBe(false);
    });
}

test("weather reads cold rain and high wind", () => {
    expect(/cold/.test(describeWeather({ code: 65, temperature: 3 }).line)).toBe(true);
    expect(/wind/.test(describeWeather({ code: 0, temperature: 20, wind: 40 }).line)).toBe(true);
});

test("weather tolerates missing data", () => {
    expect(describeWeather({}).line.length).toBeGreaterThan(10);
});

test("weather shift keys differ between clear and rain", () => {
    expect(describeWeather({ code: 0 }).key).not.toBe(describeWeather({ code: 65 }).key);
});

const rss = `<?xml version="1.0"?><rss><channel>
  <title>The Channel Itself</title>
  <item><title>Quiet news from the reef</title><link>x</link></item>
  <item><title><![CDATA[Bees & the long summer]]></title></item>
  <item><title>A storm named &#39;Otto&#39; passes</title></item>
</channel></rss>`;
const atom = `<feed><title>Feed Level</title>
  <entry><title>On this day, a bridge opened</title></entry>
  <entry><title>A new moon over the coast</title></entry>
</feed>`;

test("parseFeedTitles reads RSS items", () => {
    const titles = parseFeedTitles(rss);
    expect(titles.includes("The Channel Itself")).toBe(false);
    expect(titles).toEqual([
        "Quiet news from the reef",
        "Bees & the long summer",
        "A storm named 'Otto' passes",
    ]);
});

test("parseFeedTitles reads Atom entries", () => {
    const titles = parseFeedTitles(atom);
    expect(titles).toEqual(["On this day, a bridge opened", "A new moon over the coast"]);
});

test("parseFeedTitles handles empty and garbage input", () => {
    expect(parseFeedTitles("")).toEqual([]);
    expect(parseFeedTitles("<x/>")).toEqual([]);
});
