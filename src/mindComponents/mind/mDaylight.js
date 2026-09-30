import A from "amanita"
import { MSense } from "./mSense.js"
import { bandFor } from "../shared/senseMappers.js"

/**
 * m-daylight — the first afferent sense (lifecycle.md §Phase 5): the day's light.
 *
 * Every `timeout` (± `sigma`) it reads the REAL local clock and raises a
 * first-person sensation of the hour and the light it brings, giving the mind a
 * *day that passes* — an outside that is neither itself nor the human. Honest by
 * construction: the sensation tracks the actual wall clock, so over a real day
 * the band genuinely moves deep-night → dawn → day → dusk → night. A band CHANGE
 * is reliably salient; within a band the light is ambient and peripheral.
 *
 * It senses the WORLD's light, never the substrate — see m-sense.
 *
 * @interface  (plus MSense's timeout/sigma/salience/salienceShift)
 *   - name: labels the bid type as Sense-<name> (default "daylight")
 */
export class MDaylight extends MSense {
    _lineIdx = 0

    onSense() {
        const band = bandFor(new Date().getHours())
        const shifted = band.key !== this._lastKey

        // On a shift, open the band on its first line; within a band, walk on so
        // the same sentence is not repeated back to back.
        this._lineIdx = shifted ? 0 : (this._lineIdx + 1) % band.lines.length
        this.feel(band.lines[this._lineIdx], { key: band.key })
    }
}

A.define('m-daylight', MDaylight);
