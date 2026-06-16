// Shared jsdom bootstrap for wiring tests.
import "../../../src/startup/jsdom.js";

export const delay = ms => new Promise(r => setTimeout(r, ms));
