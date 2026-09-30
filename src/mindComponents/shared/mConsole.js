import readline from 'node:readline';
import { MBaseComponent } from "./mBaseComponent.js"
import { stimulus } from '../../infrastructure/interruptRecord.js';
import { langOf } from "./i18n.js";
import { logger } from '../../infrastructure/logger.js';

const log = logger('mConsole.js');

/**
 * Console input: type a line into the terminal where Meditator runs and press
 * Enter — it arrives as an urgent external stimulus, superseding the current
 * burst. There is no "reply"; you hear the mind think about what you said.
 *
 * Events dispatched (bubbling): "interrupt-request" (urgent, salience 1);
 * "sleep-requested" {by: "console"} on `/sleep` (start.js ends the process).
 */
export class MConsole extends MBaseComponent {
    // A port: input arrives over it. An agent with one is a service (m-agent).
    static provides = { port: true }

    _rl = null

    onConnect() {
        // The mind's retained `identity` (its companion's name), mirrored, not asked for.
        this.sub("!scope/identity", id => { this._mindIdentity = id || null }).catch(() => {})
        if (!process.stdin.isTTY && process.env.MEDITATOR_STDIN !== "1") {
            log.debug("stdin is not a TTY; console input disabled")
            return
        }
        this._rl = readline.createInterface({ input: process.stdin })
        this._rl.on('line', line => {
            const text = line.trim()
            if (!text) return
            if (text === "/sleep") {
                // An intent, not a call on the mind (message-rule.md M1): the
                // process hears it and runs the sleep ritual for every mind in
                // it, then exits, reporting whether the sleep was confirmed.
                log.log("Sleep requested from console.")
                this.fire("sleep-requested", { by: "console" })
                return
            }
            // Raw words in `reason`, the mind's companion as `from`, the mind's
            // ambient language as `lang`; the framing "<from> says: …" (in that
            // language) is added by renderStimulus().
            const record = stimulus({
                source: 'External',
                type: 'ConsoleInput',
                reason: text,
                from: this._mindIdentity?.interlocutor || null,
                lang: langOf(this),
                salience: 1,
                urgent: true,
            })
            this.fire("interrupt-request", record)
        })
        log.debug("Console input ready — type to speak to the mind, /sleep to put it to bed.")
    }

    onDisconnect() {
        if (this._rl) this._rl.close()
    }
}
