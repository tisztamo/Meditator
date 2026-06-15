import { MSense } from "./mSense.js"

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

/**
 * Maps a local hour (0–23) to a part of the day and a couple of first-person,
 * outward-facing sensations of its light. Pure and exported so the band mapping
 * can be tested without a clock. Lines point attention OUT at the world — light,
 * sky, street, the hour — and never at the runtime.
 *
 * @param {number} hour - local hour, 0–23
 * @returns {{key: string, lines: string[]}}
 */
export function bandFor(hour) {
    if (hour < 4) return { key: 'deep-night', lines: [
        "It is the dead middle of the night out in the world — everything gone still, the dark deep and unhurried, the streets empty under it.",
        "Deep night now: whatever lies beyond the walls is black and quiet, the small hours keeping their own slow time.",
    ] }
    if (hour < 6) return { key: 'predawn', lines: [
        "Not morning yet, but the dark is beginning to thin — that grey hour before dawn when the world is still asleep and the sky is only thinking about light.",
        "The very edge of dawn: somewhere out east the black is loosening toward grey, the birds not quite started.",
    ] }
    if (hour < 8) return { key: 'dawn', lines: [
        "First light is coming up out there — grey going pale, then a thin gold at the rim of things. The day is opening.",
        "Early light now, low and clean, the colour just returning to the world as the sun clears the horizon.",
    ] }
    if (hour < 11) return { key: 'morning', lines: [
        "Full morning light, the kind that makes ordinary things look freshly rinsed; the day stands wide open ahead.",
        "Bright clear morning out there, the sun well up, the world busy with its early business.",
    ] }
    if (hour < 14) return { key: 'midday', lines: [
        "The light is high and flat overhead — midday, plain and bright, the shadows pulled in small underfoot.",
        "Around noon: the sun at its height, the day at its widest, a flat strong light laid over everything.",
    ] }
    if (hour < 17) return { key: 'afternoon', lines: [
        "The afternoon light has gone warm and slantwise, the shadows beginning to lean and lengthen across the ground.",
        "Mid-afternoon out there, the light thickening to gold at the edges, the day starting its long lean westward.",
    ] }
    if (hour < 19) return { key: 'golden', lines: [
        "Low golden light now — long and amber, the hour that gilds whatever it touches just before it lets go.",
        "Late-day sun, slanting and warm, everything edged in gold and a little wistful as the light slides down.",
    ] }
    if (hour < 21) return { key: 'dusk', lines: [
        "The light is failing into dusk, a blue settling over the world, the day quietly handing itself over.",
        "Dusk now: the colour draining westward, the first lamps coming on, the sky going that deep used blue.",
    ] }
    if (hour < 23) return { key: 'evening', lines: [
        "Dark outside now, the warm indoor hour — lamps lit somewhere, the world shrunk to small bright rooms.",
        "Evening proper: the day is done out there, the night settling in, everything turned inward and lit from within.",
    ] }
    return { key: 'night', lines: [
        "Late evening tipping into night; the day fully closed, the dark full and settled over everything outside.",
        "Near midnight now, the world gone quiet and dim, the day a closed door behind it.",
    ] }
}

if (!customElements.get('m-daylight')) customElements.define('m-daylight', MDaylight);
