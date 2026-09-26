// CONTRACT — Studio commands (message-rule-async-review.md §3.1 row "Studio commands":
// helpers.js command() → a bubbling "studio-command" → studioConn.js run() → the
// supervisor message on the wire).
//
// The observable outcome that must survive the migration (§5, M1/M5: a pane states its
// intent as a plain-data message and never reads anything back; order that matters is
// carried, not assumed):
//   1. A command a pane fires reaches the wire — eventually — in the supervisor's shape.
//   2. Two consecutive commands reach the wire in the order the panes sent them, and a
//      command that depends on the hub state an earlier one set (speak after a focus
//      tap: `input` is addressed to the focused mind) sees that state.
//
// Why it could break under async delivery: the hub's run() executes INSIDE the pane's
// fire(). Nothing is read back from the event, though — command() ignores the return,
// the pane clears its own input without asking the hub — so deferral changes only WHEN
// the wire sees the message. Under FIFO deferral (microtask, macrotask) the order of
// two commands is preserved, so this protocol is expected to SURVIVE; the focus → speak
// pair depends on per-channel FIFO and would need a carried order (or the target id in
// the speak command) under reordering delivery (MEDITATOR_DELIVERY=jitter).
//
// Real panes (studio-roster, studio-speak, studio-refresh) and the real StudioConn
// routing (studioHarness TestConn: socket stubbed, send() recorded in hub.sent). The
// supervisor's roster arrives through the hub's inbound router, onMsg — the socket's
// only consumer.
import { test, expect } from "bun:test";
import { waitFor, quiet } from "./helpers.js";
import { mountHub } from "../studioHarness.js";
import "../../../../src/studio/ui/studioRoster.js";
import "../../../../src/studio/ui/studioSpeak.js";
import "../../../../src/studio/ui/studioRefresh.js";

const MINDS = [
    { id: "m1", state: "awake", file: "a.archml", port: 1, home: "h1" },
    { id: "m2", state: "awake", file: "b.archml", port: 2, home: "h2" },
];

async function mount(inner) {
    const { hub } = mountHub(inner);
    await quiet(20);
    hub.onMsg({ type: "roster", data: { minds: MINDS } });      // what the supervisor sent
    const roster = hub.querySelector("studio-roster");
    if (roster) expect(await waitFor(() => roster.querySelector('[data-id="m2"]'))).toBeTruthy();
    return hub;
}

test("a pane's command reaches the wire in the supervisor's shape", async () => {
    const hub = await mount(`<studio-roster></studio-roster><studio-refresh></studio-refresh>`);
    const roster = hub.querySelector("studio-roster");
    roster.querySelector('[data-id="m1"] button[action="sleep"]').click();
    expect(await waitFor(() => hub.sent.length >= 1)).toBeTruthy();
    hub.querySelector("studio-refresh").click();
    expect(await waitFor(() => hub.sent.length >= 2)).toBeTruthy();
    await quiet();
    expect(hub.sent).toEqual([
        { type: "sleep", data: { id: "m1" } },
        { type: "refresh" },
    ]);
});

test("two consecutive commands from one pane reach the wire in send order", async () => {
    const hub = await mount(`<studio-roster></studio-roster>`);
    const roster = hub.querySelector("studio-roster");
    roster.querySelector('[data-id="m1"] button[action="sleep"]').click();
    roster.querySelector('[data-id="m2"] button[action="sleep"]').click();       // same tick
    expect(await waitFor(() => hub.sent.length >= 2)).toBeTruthy();
    await quiet();
    expect(hub.sent).toEqual([
        { type: "sleep", data: { id: "m1" } },
        { type: "sleep", data: { id: "m2" } },
    ]);
});

test("focus tap then speak, from two panes in one tick: the wire says focus m2, then input to m2", async () => {
    const hub = await mount(`<studio-roster></studio-roster><studio-speak class="foot"></studio-speak>`);
    const roster = hub.querySelector("studio-roster");
    const speak = hub.querySelector("studio-speak");

    // Focus m1 through the roster (a pane command, not a poke at the hub) and let the
    // speak box learn it is talking to an awake mind.
    roster.querySelector('[data-id="m1"]').click();
    expect(await waitFor(() => hub.sent.some(m => m.type === "focus"))).toBeTruthy();
    expect(await waitFor(() => !speak.btn.disabled)).toBeTruthy();
    const base = hub.sent.length;

    // Now: tap m2 and send a line in the same tick.
    roster.querySelector('[data-id="m2"]').click();
    speak.input.value = "hello over there";
    speak.btn.click();
    expect(await waitFor(() => hub.sent.length >= base + 2)).toBeTruthy();
    await quiet();
    expect(hub.sent.slice(base)).toEqual([
        { type: "focus", data: { id: "m2", sinceSeq: null } },
        { type: "input", data: { id: "m2", message: "hello over there" } },
    ]);
    expect(speak.input.value).toBe("");          // the pane cleared its own box; it read nothing back
});
