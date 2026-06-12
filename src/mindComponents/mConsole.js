import readline from 'node:readline';
import { MBaseComponent } from "./mBaseComponent.js"
import { InterruptRecord } from '../infrastructure/interruptRecord.js';
import { logger } from '../infrastructure/logger.js';

const log = logger('mConsole.js');

/**
 * Console input: type a line into the terminal where Meditator runs and press
 * Enter — it arrives as an urgent external stimulus, superseding the current
 * burst. There is no "reply"; you hear the mind think about what you said.
 *
 * Events dispatched (bubbling): "interrupt-request" (urgent, salience 1)
 */
export class MConsole extends MBaseComponent {
    _rl = null

    onConnect() {
        if (!process.stdin.isTTY && process.env.MEDITATOR_STDIN !== "1") {
            log.debug("stdin is not a TTY; console input disabled")
            return
        }
        this._rl = readline.createInterface({ input: process.stdin })
        this._rl.on('line', line => {
            const text = line.trim()
            if (!text) return
            if (text === "/sleep") {
                log.log("Sleep requested from console.")
                const mind = this.closest('m-mind')
                Promise.resolve(mind?.sleep?.())
                    .catch(error => log.warn("Sleep ritual error:", error.message))
                    .finally(() => { log.log("Asleep. Goodbye."); process.exit(0) })
                return
            }
            const record = new InterruptRecord({
                source: 'External',
                type: 'ConsoleInput',
                reason: `A voice from outside says: "${text}"`,
                salience: 1,
                urgent: true,
            })
            this.dispatchEvent(new CustomEvent("interrupt-request", { bubbles: true, detail: record }))
        })
        log.debug("Console input ready — type to speak to the mind, /sleep to put it to bed.")
    }

    onDisconnect() {
        if (this._rl) this._rl.close()
    }
}
