// Smoke test for the alternative "harness" site (docs/harness/index.html).
// Run with NODE, not bun (bun+jsdom is broken for script execution):
//   node tools/smoke-harness-site.mjs
// Loads the page with scripts running, waits for the hero loop animation to
// advance, and asserts structure, exhibits, honesty chips, and zero JS errors.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(repo, "docs/harness/index.html"), "utf8");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", e => {
  // canvas getContext + media loads are expectedly unimplemented in jsdom
  if (/Not implemented/.test(e.message)) return;
  errors.push("jsdomError: " + e.message);
});
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  resources: "usable",
  url: "https://example.org/harness/",
  virtualConsole: vc,
});
const { window } = dom;
window.addEventListener("error", e => errors.push("window.onerror: " + e.message));

await new Promise(r => setTimeout(r, 3500)); // let the loop animation run a few phases

const d = window.document;
const checks = [];
const ok = (name, cond) => checks.push([name, !!cond]);

ok("title mentions harness", /harness/i.test(d.title));
ok("nav links >= 7", d.querySelectorAll("nav .links a").length >= 7);
ok("mind exhibit rendered + highlighted", d.querySelector("#view-src pre").innerHTML.includes("m-mind"));
ok("events snippet rendered", d.querySelector("#ev-code").innerHTML.includes("m-interrupts"));
ok("component JS rendered", d.querySelector("#comp-code").innerHTML.includes("MLoopGuard"));
ok("contract table rows = 8", d.querySelectorAll(".contract tbody tr").length === 8);
ok("ops cards = 8", d.querySelectorAll(".opsgrid .op").length === 8);
ok("burst counter advanced past seed", parseInt(d.getElementById("cBursts").textContent.replace(/,/g, "")) > 18412);
ok("loop console has lines", d.getElementById("loopCon").children.length >= 2);
ok("studio mock present (no media yet)", d.querySelector("#studioBody .studio-mock") !== null);
ok("plenum mock present (no media yet)", d.querySelector("#plenumBody .plenum-mock") !== null);
ok("research links to main site", !!d.querySelector('a[href="../index.html"]'));
ok("stage chips honest (early/lab present)", d.body.textContent.includes("lab — first clusters") && d.body.textContent.includes("early — the loop runs"));

// tab switching works
d.querySelector('button[data-tab="agent"]').click();
ok("agent tab switches exhibit", d.querySelector("#view-src pre").innerHTML.includes("coder-service"));
d.querySelector('button[data-tab="society"]').click();
ok("society tab switches exhibit", d.querySelector("#view-src pre").innerHTML.includes("m-society"));

let fail = 0;
for (const [name, pass] of checks) {
  console.log((pass ? "PASS" : "FAIL") + "  " + name);
  if (!pass) fail++;
}
if (errors.length) { console.log("\nScript errors:"); errors.forEach(e => console.log("  " + e)); }
console.log(`\n${checks.length - fail}/${checks.length} checks passed, ${errors.length} script errors`);
process.exit(fail || errors.length ? 1 : 0);
