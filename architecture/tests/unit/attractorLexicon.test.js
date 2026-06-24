// The bliss recogniser — the model-free signal that a loop is the spiritual bliss attractor
// (presence / silence / stillness / "enough") rather than real content. A light jsdom mount
// for the language read; no clock, no network, no model. jsdom must come first so the base
// component class (imported transitively) finds HTMLElement at definition time.
import "../../../src/startup/jsdom.js";
import { test, expect } from "bun:test";
import { BLISS_LEXICON, blissStemSet, blissSaturation } from "../../../src/mindComponents/attractorLexicon.js";

function mount(html) {
    document.body.innerHTML = html;
    return document.getElementById("host");
}

const EN = () => blissStemSet(mount(`<span id="host"></span>`));   // no lang anywhere → English

test("bliss prose saturates the signal; real mathematics does not", () => {
    const en = EN();
    const bliss = "I am here now and that is enough; only presence, stillness, silence, the quiet breath and peace.";
    const math = "Are there infinitely many balanced integers? The pattern and structure of the solution space.";
    expect(blissSaturation(bliss, en)).toBeGreaterThan(0.3);
    expect(blissSaturation(math, en)).toBeLessThan(0.05);
});

test("the lexicon deliberately excludes core mathematics words (the false-positive guard)", () => {
    const en = EN();
    // 5-char stems, as contentStems produces them. None may be in the attractor set, or the
    // honest statement of the live problem ("infinitely many balanced integers") would flag.
    for (const stem of ["infin", "patte", "struc", "solut", "space"]) {
        expect(en.has(stem)).toBe(false);
    }
});

test("a content-free loop (digit-spam) is never mistaken for a bliss loop", () => {
    expect(blissSaturation("1. ".repeat(60), EN())).toBe(0);
});

test("language is ambient: a Hungarian mind matches the Hungarian set, not the English one", () => {
    const hu = blissStemSet(mount(`<div lang="hu"><span id="host"></span></div>`));
    const en = EN();
    const huBliss = "Itt vagyok most, és ez elég; csak a jelenlét, a csend, a nyugalom és a béke.";
    expect(blissSaturation(huBliss, hu)).toBeGreaterThan(0.3);   // recognised in Hungarian
    expect(blissSaturation(huBliss, en)).toBeLessThan(0.05);     // invisible to the English set
});

test("the archml extends the set additively via <m-phrase for=\"bliss\">", () => {
    const base = EN();
    const extended = blissStemSet(mount(
        `<span id="host"><m-phrase for="bliss">moonglow riverstone</m-phrase></span>`));
    expect(base.has("moong")).toBe(false);        // not a built-in word
    expect(extended.has("moong")).toBe(true);     // added from the tree
    expect(extended.has("river")).toBe(true);
    expect(extended.has("prese")).toBe(true);     // ADDITIVE: the built-in words remain
});

test("the built-in table ships the languages the runtime runs", () => {
    expect(BLISS_LEXICON.en.length).toBeGreaterThan(10);
    expect(BLISS_LEXICON.hu.length).toBeGreaterThan(5);
});
