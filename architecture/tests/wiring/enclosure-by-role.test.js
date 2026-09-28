// Enclosure by role — the M1 slice: derived `provides`, lookup helpers, and
// the five membrane lookups. Fixtures R1 (upgrade race) and A1 (authored
// provides cannot grant a role). Composition of gates is not in this file.
import "./setup.js";
import { test, expect, afterEach } from "bun:test";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";
import { enclosingOf, enclosingAllOf, membraneOf, closestRole, part, providesOf } from "../../../src/mindComponents/shared/enclosure.js";
import { mindHome, mindWorkspace } from "../../../src/infrastructure/memoryVault.js";
import { isDryRun } from "../../../src/modelAccess/llm.js";
import { MMind } from "../../../src/mindComponents/mind/mMind.js";
import { MSense } from "../../../src/mindComponents/mind/mSense.js";

afterEach(() => {
    document.body.replaceChildren();
});

function rolesOf(el) {
    return (el?.getAttribute("provides") || "").split(/\s+/).filter(Boolean);
}

async function mount(html) {
    document.body.innerHTML = html;
    await loadMindComponents(document);
    await delay(50);
}

test("R1: nested arbiter and sense resolve enclosures when a top-level m-interrupts precedes the first m-region", async () => {
    // Same shape as nested-attention.test.js: the first m-interrupts in the file
    // precedes the first m-region, so define() upgrades the nested arbiter while
    // its region is still an HTMLElement. Role lookup has to work on the
    // reflected attribute, not the upgraded class.
    await mount(`
      <m-interrupts name="attention" threshold="0.35" rateLimit="0s" keep="9"></m-interrupts>
      <m-region name="drift">
        <m-interrupts name="nested" gain="0.5" threshold="0.4" rateLimit="0s"></m-interrupts>
        <m-region name="sight" modality="text">
          <span name="src"></span>
          <m-feed name="news"></m-feed>
        </m-region>
      </m-region>
    `);

    const faculty = document.querySelector('m-region[name="drift"]');
    const aperture = document.querySelector('m-region[name="sight"]');
    const nestedArbiter = document.querySelector('m-interrupts[name="nested"]');
    const src = document.querySelector('[name="src"]');
    const sense = document.querySelector("m-feed");

    expect(nestedArbiter.enclosing("faculty")).toBe(faculty);
    expect(nestedArbiter._region).toBe(faculty);
    expect(enclosingOf(src, "aperture")).toBe(aperture);
    expect(sense).toBeInstanceOf(MSense);
    expect(sense.enclosing("aperture")).toBe(aperture);
    expect(rolesOf(faculty)).toEqual(["faculty"]);
    expect(rolesOf(aperture)).toEqual(["faculty", "aperture"]);
    expect(aperture.provides("faculty")).toBe(true);
    expect(aperture.provides("aperture")).toBe(true);
    expect(faculty.provides("aperture")).toBe(false);
});

test("A1: authored provides on a plain element is overwritten and grants no role", async () => {
    document.body.innerHTML = `<p id="impostor" provides="aperture">plain</p>`;
    const warnings = [];
    const orig = console.warn;
    console.warn = (...args) => {
        warnings.push(args.map(String).join(" "));
        orig.apply(console, args);
    };
    try {
        await loadMindComponents(document);
        await delay(20);
    } finally {
        console.warn = orig;
    }

    const impostor = document.getElementById("impostor");
    expect(impostor.hasAttribute("provides")).toBe(false);
    expect(impostor.matches("[provides~='aperture']")).toBe(false);
    expect(document.querySelector("[provides~='aperture']")).toBeNull();
    expect(providesOf(impostor, "aperture")).toBe(false);
    const granted = warnings.filter(w => w.includes("provides=") && w.includes("overwritten"));
    expect(granted.length).toBe(1);
});

test("enclosing, enclosingAll, membrane, part, and provides on a nested tree", async () => {
    if (!customElements.get("x-inner-mind")) {
        customElements.define("x-inner-mind", class extends HTMLElement {
            static provides = { mind: true };
        });
    }

    await mount(`
      <m-society name="lab">
        <m-interrupts name="attention" threshold="0.35" rateLimit="0s" keep="9"></m-interrupts>
        <m-region name="wrap">
          <m-interrupts name="nested" gain="0.5" threshold="0.4" rateLimit="0s"></m-interrupts>
          <m-region name="sight" modality="text">
            <span name="src"></span>
            <m-region name="inner" modality="text">
              <span name="inner-src"></span>
            </m-region>
          </m-region>
        </m-region>
        <m-region name="other" modality="text"></m-region>
        <x-inner-mind>
          <m-region name="secret" modality="text"></m-region>
        </x-inner-mind>
      </m-society>
    `);

    const society = document.querySelector("m-society");
    const wrap = document.querySelector('m-region[name="wrap"]');
    const sight = document.querySelector('m-region[name="sight"]');
    const inner = document.querySelector('m-region[name="inner"]');
    const other = document.querySelector('m-region[name="other"]');
    const secret = document.querySelector('m-region[name="secret"]');
    const src = document.querySelector('[name="src"]');
    const innerSrc = document.querySelector('[name="inner-src"]');
    const nestedArbiter = document.querySelector('m-interrupts[name="nested"]');
    const globalArbiter = document.querySelector('m-interrupts[name="attention"]');
    const innerMind = document.querySelector("x-inner-mind");

    expect(wrap.provides("faculty")).toBe(true);
    expect(wrap.provides("aperture")).toBe(false);
    expect(sight.provides("faculty")).toBe(true);
    expect(sight.provides("aperture")).toBe(true);

    expect(nestedArbiter.enclosing("faculty")).toBe(wrap);
    expect(src && enclosingOf(src, "aperture")).toBe(sight);
    expect(inner.enclosing("aperture")).toBe(sight);
    expect(enclosingAllOf(innerSrc, "aperture")).toEqual([inner, sight]);
    expect(inner.enclosingAll("aperture")).toEqual([sight]);
    expect(sight.enclosing("aperture")).toBeNull();

    expect(society.membrane()).toBe(society);
    expect(sight.membrane()).toBe(society);
    expect(membraneOf(src)).toBe(society);
    expect(secret.membrane()).toBe(innerMind);

    expect(part(society, "aperture")).toEqual([sight, other]);
    expect(society.part("aperture")).toEqual([sight, other]);
    expect(part(society, "aperture")).not.toContain(inner);
    expect(part(society, "aperture")).not.toContain(secret);

    expect(secret.enclosing("faculty")).toBeNull();
    expect(rolesOf(innerMind)).toEqual(["mind"]);

    expect(globalArbiter.enclosing("faculty")).toBeNull();
    expect(MMind.prototype._arbiter.call(society)?.getAttribute("name")).toBe("attention");
});

test("runtime-created m-region reflects provides in connectedCallback", async () => {
    if (!customElements.get("m-region")) {
        await mount("<m-region></m-region>");
        document.body.replaceChildren();
    }

    const bare = document.createElement("m-region");
    expect(bare.hasAttribute("provides")).toBe(false);
    expect(bare.provides("faculty")).toBe(true);
    expect(bare.provides("aperture")).toBe(false);

    const gated = document.createElement("m-region");
    gated.setAttribute("modality", "text");
    expect(gated.hasAttribute("provides")).toBe(false);
    expect(gated.provides("aperture")).toBe(true);

    document.body.append(bare, gated);
    expect(rolesOf(bare)).toEqual(["faculty"]);
    expect(rolesOf(gated)).toEqual(["faculty", "aperture"]);
    expect(gated.getAttribute("provides")).toContain("aperture");
});

test("closestRole finds identity roots by role, custom tags included (review §2.6)", async () => {
    // A custom identity root used to get no home, no society and no Plenum root,
    // because those lookups were closest('m-mind') / closest('m-society').
    for (const [tag, provides] of [["x-self", { mind: true }], ["x-guild", { society: true }], ["x-worker", { agent: true }]]) {
        if (!customElements.get(tag)) customElements.define(tag, class extends HTMLElement { static provides = provides });
    }
    document.body.innerHTML = `
      <x-guild name="Lab Guild">
        <x-self name="Iris">
          <span id="faculty"></span>
          <x-worker name="helper"><span id="tool"></span></x-worker>
        </x-self>
        <x-self name="Echo" memory="echo-home"></x-self>
      </x-guild>`;
    const guild = document.querySelector("x-guild");
    const [iris, echo] = document.querySelectorAll("x-self");
    const worker = document.querySelector("x-worker");
    const faculty = document.getElementById("faculty");
    const tool = document.getElementById("tool");

    expect(closestRole(faculty, "mind")).toBe(iris);
    expect(closestRole(iris, "mind")).toBe(iris);
    // It crosses membranes: from inside the agent it still finds the mind around it.
    expect(closestRole(tool, "mind")).toBe(iris);
    expect(closestRole(tool, "mind", "agent")).toBe(worker);
    expect(closestRole(faculty, "society")).toBe(guild);
    expect(closestRole(guild, "mind")).toBeNull();
    expect(closestRole(null, "mind")).toBeNull();
    expect(part(guild, "mind")).toEqual([iris, echo]);

    const dry = isDryRun() ? "dry-" : "";
    expect(mindHome(faculty)).toBe(`memory/${dry}lab-guild/iris`);
    expect(mindHome(tool, "workspace")).toBe(`memory/${dry}lab-guild/helper/workspace`);
    expect(mindWorkspace(tool)).toBe(`memory/${dry}lab-guild/iris/workspace`);
    expect(mindHome(echo)).toBe(`memory/${dry}lab-guild/echo-home`);
});
