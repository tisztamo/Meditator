import "./jsdom.js"
import "amanita/stdlib"
import {readArchitectureFile} from "./architecture.js"
import { loadMindComponents } from "./loadMindComponents.js"
import { initializeDebugMode } from "../config/debug.js";
import { loadModelConfig } from "../modelAccess/modelConfig.js";
import { logger } from '../infrastructure/logger';

initializeDebugMode();
await loadModelConfig();

const log = logger('start.js');

document.body.innerHTML = `${await readArchitectureFile()}`

log.debug("Executing architecture:")
log.debug(document.body.innerHTML)

loadMindComponents(document).then((components) => {
    log.log("Meditating... Ctrl+C (or typing /sleep) puts the mind to sleep gracefully.\n");

    let sleeping = false;
    process.on("SIGINT", async function () {
        if (sleeping) {
            log.log("\nForced quit — memory may miss the last moments.");
            process.exit(1);
        }
        sleeping = true;
        log.log("\n\nAsking the mind to fall asleep — Ctrl+C again to force quit.");
        const mind = document.querySelector("m-mind");
        try {
            await Promise.race([
                mind?.sleep?.(),
                new Promise(resolve => setTimeout(resolve, 45000)),
            ]);
        } catch (error) {
            log.warn("Sleep ritual error:", error.message);
        }
        log.log("Asleep. Goodbye.");
        process.exit(0);
    });
    setInterval(() => {}, 1000);
});