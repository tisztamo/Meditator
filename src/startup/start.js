import "./jsdom.js"
import "amanita/stdlib"
import {readArchitectureFile} from "./architecture.js"
import { loadMindComponents } from "./loadMindComponents.js"
import { initializeDebugMode } from "../config/debug.js";
import { loadModelConfig } from "../modelAccess/modelConfig.js";
import { isDryRun } from "../modelAccess/llm.js";
import { logger } from '../infrastructure/logger';
import { registerGracefulShutdown } from '../infrastructure/gracefulShutdown.js';
import { registerCrashHandlers } from '../infrastructure/crashHandlers.js';

initializeDebugMode();
await loadModelConfig();

const log = logger('start.js');

// Crash honesty (Covenant §2/§3), registered early so it also covers a throw during
// startup. On an uncaught error the mind did not sleep — leave an honest journal
// trail on every live mind (its memory.md already carries endedCleanly:false), then
// exit non-zero. OOM/SIGKILL escapes this; the memory.md marker is the fallback.
registerCrashHandlers({
    label: "Runtime",
    onCrash: () => {
        for (const mem of document.querySelectorAll("m-memory")) {
            try { mem.markCrashSync?.(); } catch { /* best-effort */ }
        }
    },
});

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

    registerGracefulShutdown({
        label: "Runtime",
        sleepAll: async () => {
            // Sleep EVERY mind AND agent in the architecture — a society runs several
            // minds at once, and an <m-agent> root sleeps/persists on Ctrl-C too
            // (agent-loop.md §5) — in parallel, under one shared deadline.
            const entities = Array.from(document.querySelectorAll("m-mind, m-agent"));
            await Promise.all(entities.map(m => Promise.resolve(m?.sleep?.())));
        },
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