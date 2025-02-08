import {readArchitectureFile} from "./startup/architecture.js"
import "amanita/stdlib"

document.body.innerHTML = `${await readArchitectureFile()}`

console.log("Executing architecture:")
console.log(document.body.innerHTML)

console.log("Meditating... Press Ctrl+C to stop.");
process.on("SIGINT", async function () {
    console.log('Goodbye...');
    process.exit();
});

setInterval(() => {}, 1000);
