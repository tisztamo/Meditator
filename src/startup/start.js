import "amanita/stdlib"
import {readArchitectureFile} from "./architecture.js"
import { loadMindComponents } from "./loadMindComponents.js"

document.body.innerHTML = `${await readArchitectureFile()}`

console.log("Executing architecture:")
console.log(document.body.innerHTML)

loadMindComponents(document).then((components) => {
    console.log("Meditating... Press Ctrl+C to stop.");
    process.on("SIGINT", async function () {
        console.log('Goodbye...');
        process.exit();
    });
    setInterval(() => {}, 1000);
});