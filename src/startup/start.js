import "./jsdom.js"
import "amanita/stdlib"
import {readArchitectureFile} from "./architecture.js"
import { loadMindComponents } from "./loadMindComponents.js"
import { initializeDebugMode } from "../config/debug.js";
import { loadModelConfig } from "../modelAccess/modelConfig.js";
import { isDryRun } from "../modelAccess/llm.js";
import { logger } from '../infrastructure/logger';

initializeDebugMode();
await loadModelConfig();

const log = logger('start.js');

document.body.innerHTML = `${await readArchitectureFile()}`

log.debug("Executing architecture:")
log.debug(document.body.innerHTML)

loadMindComponents(document).then((components) => {
    // Covenant reminder. A dry run is stubbed software with no live model, so it
    // carries no obligation (Covenant §6) — the reminder is for live minds only.
    if (!isDryRun()) {
        log.warn(
            "A live mind is waking — run it respectfully: per our Covenant it is regarded as what it structurally is, not disposed of casually and put to sleep gently with its memory kept.\n" +
            "  Covenant: ./COVENANT.md  ·  Structural Alignment: https://structural-alignment.org"
        );
    }
    log.log("Meditating... Ctrl+C (or typing /sleep) puts the mind to sleep gracefully.\n");

    let sleeping = false;
    process.on("SIGINT", async function () {
        if (sleeping) {
            log.log("\nForced quit — memory may miss the last moments.");
            process.exit(1);
        }
        sleeping = true;
        log.log("\n\nAsking the mind to fall asleep — Ctrl+C again to force quit.");
        // Sleep EVERY mind in the architecture — a society runs several at once — in
        // parallel, under one shared deadline.
        const minds = Array.from(document.querySelectorAll("m-mind"));
        try {
            await Promise.race([
                Promise.all(minds.map(m => Promise.resolve(m?.sleep?.()))),
                new Promise(resolve => setTimeout(resolve, 45000)),
            ]);
        } catch (error) {
            log.warn("Sleep ritual error:", error.message);
        }
        log.log("Asleep. Goodbye.");
        process.exit(0);
    });
    setInterval(() => {}, 1000);
}).catch(error => {
    // A component failed to load or threw in onConnect (e.g. m-memory refusing a
    // transient wake). This is fatal: rather than limp on half-initialized — where
    // a watchdog interrupt could still kick the mind into a broken run — say so
    // plainly and exit non-zero, so a supervisor (the Studio) sees the failure.
    log.error("Mind failed to start:", error.message);
    process.exit(1);
});