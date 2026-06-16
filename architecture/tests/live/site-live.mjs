// Site live mode against a running Meditator on ws://localhost:7627 — opt-in only.
import { JSDOM } from "jsdom";
import fs from "node:fs/promises";
import { WebSocket as RealWebSocket } from "ws";

const html = await fs.readFile("docs/index.html", "utf8");
const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/",
    beforeParse(window) {
        window.matchMedia = () => ({ matches: false });
        window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
        window.WebSocket = RealWebSocket;
        window.navigator.clipboard = { writeText: async () => {} };
    },
});

await new Promise(resolve => setTimeout(resolve, 30_000));

const doc = dom.window.document;
const title = doc.getElementById("panelTitle").textContent;
const live = doc.getElementById("dot").classList.contains("live");
const text = doc.getElementById("stream").textContent;

let failures = 0;
function check(name, ok) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) failures += 1;
}
check(`went live (title: "${title}")`, live && /live/.test(title));
check(`received live thought (${text.length} chars)`, text.length > 100);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
