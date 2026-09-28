// What a component last published on a retained topic, observed the way a peer
// observes it: by subscribing (message rule M3, nothing read back off the element).
// Tests used to call memory's `getTail` method; memory publishes `tail` at every change, so
// a test watches that topic instead and reads the latest value it heard.
//
//     const tail = await watchTopic(memory, "tail");
//     expect(tail()).toContain("…");
//     await tail.until(t => t.includes("…"));   // when the value lands after a send
//
// Subscribing replays the current value on a microtask, so the reader is live once
// the promise resolves (undefined if nothing was ever published).
import { waitFor } from "./contracts/helpers.js";

export async function watchTopic(el, topic) {
    let value;
    const attention = el.on(topic, v => { value = v; });
    await new Promise(r => queueMicrotask(r));
    const read = () => value;
    /** Wait until the latest value satisfies `pred`; resolves to that value (or the last seen). */
    read.until = async (pred, timeout = 1000) => {
        await waitFor(() => value !== undefined && pred(value), timeout);
        return value;
    };
    read.stop = () => el.off(attention);
    return read;
}
