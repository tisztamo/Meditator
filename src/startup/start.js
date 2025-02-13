import "amanita/stdlib"
import {readArchitectureFile} from "./architecture.js"
import { loadMindComponents } from "./loadMindComponents.js"
import { initializeDebugMode } from "../config/debug.js";

initializeDebugMode();

document.body.innerHTML = `${await readArchitectureFile()}`

console.debug("Executing architecture:")
console.debug(document.body.innerHTML)

loadMindComponents(document).then((components) => {
    console.log("Meditating... Press Ctrl+C to stop.\n");
    process.on("SIGINT", async function () {
        console.log('Goodbye...');
        console.debug(document.body.innerHTML)
        process.exit();
    });
    setInterval(() => {}, 1000);
});