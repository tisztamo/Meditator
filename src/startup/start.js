import "amanita/stdlib"
import {readArchitectureFile} from "./architecture.js"
import { loadMindComponents } from "./loadMindComponents.js"
import { initializeDebugMode } from "../config/debug.js";
import { logger } from '../infrastructure/logger';

initializeDebugMode();

const log = logger('start.js');

document.body.innerHTML = `${await readArchitectureFile()}`

log.debug("Executing architecture:")
log.debug(document.body.innerHTML)

loadMindComponents(document).then((components) => {
    log.log("Meditating... Press Ctrl+C to stop.\n");
    process.on("SIGINT", async function () {
        log.log('\n\nGoodbye...');
        log.debug(document.body.innerHTML)
        process.exit();
    });
    setInterval(() => {}, 1000);
});