// Shared jsdom bootstrap for wiring tests.
import "../../../src/startup/jsdom.js";

export const delay = ms => new Promise(r => setTimeout(r, ms));

// Amanita retries unresolved refs for seconds after replaceChildren(). Leftover
// stream binds must not fail a later file. Swallow only that class of error.
window.addEventListener("unhandledrejection", event => {
    if (event.reason?.name === "RefResolutionError") event.preventDefault()
})
