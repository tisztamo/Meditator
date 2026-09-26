// Contract: Studio focus change (review §3.4, the focusedKind / focusReset ordering).
//
// The hub publishes `focusedKind` (a retained topic — delivered on a microtask) and
// fires `focusReset` (an event — delivered inside the call today). The old comment
// promised the kind lands first; it never did. Nothing read the kind at reset time
// yet, so the bug was latent. Under the message rule (M5, "order is carried, not
// assumed") the reset CARRIES what a pane needs to act on it: `{ id, kind }`.
//
// Pinned outcomes, which must hold under any delivery order:
//   - a focus change fires focusReset with the new entity's id and kind
//   - a pane reacting to the reset already knows the kind (from the payload)
//   - after mind → agent → mind, the stream and transcript panes end in the right
//     visibility, whichever of focusedKind / focusReset lands first
//   - dismissing the focused entity resets with { id: null, kind: null }
import { test, expect } from "bun:test";
import { waitFor, quiet } from "./helpers.js";
import { mountHub } from "../studioHarness.js";
import "../../../../src/studio/ui/studioTranscript.js";
import "../../../../src/studio/ui/studioStream.js";

const ROSTER = [{ id: "m1", kind: "mind" }, { id: "a1", kind: "agent" }];

function mountPanes() {
  const { hub } = mountHub(`<studio-stream id="stream"></studio-stream><studio-transcript id="transcript"></studio-transcript>`);
  hub.roster = ROSTER;
  return {
    hub,
    stream: hub.querySelector("studio-stream"),
    transcript: hub.querySelector("studio-transcript"),
  };
}

test("focusReset carries the focused id and kind", async () => {
  const { hub } = mountPanes();
  await quiet(20);
  const resets = [];
  hub.addEventListener("focusReset", e => resets.push(e.detail));
  hub.focus("a1");
  await waitFor(() => resets.length === 1);
  expect(resets[0]).toMatchObject({ id: "a1", kind: "agent" });
  hub.focus("m1");
  await waitFor(() => resets.length === 2);
  expect(resets[1]).toMatchObject({ id: "m1", kind: "mind" });
});

test("a pane handling the reset already knows the new kind", async () => {
  const { hub, transcript, stream } = mountPanes();
  await quiet(20);
  hub.focus("m1");
  await quiet();
  // Observe each pane's own view of the kind in the same dispatch as its reset
  // handler (the panes subscribed first, so their listeners have just run).
  const seen = [];
  hub.addEventListener("focusReset", () => seen.push({ transcript: transcript.isAgent, stream: stream.isAgent }));
  hub.focus("a1");
  await waitFor(() => seen.length === 1);
  expect(seen[0]).toEqual({ transcript: true, stream: true });
});

test("mind → agent → mind leaves the column to the right pane", async () => {
  const { hub, stream, transcript } = mountPanes();
  await quiet(20);
  hub.focus("m1");
  await waitFor(() => stream.style.display === "" && transcript.style.display === "none");
  hub.focus("a1");
  await waitFor(() => stream.style.display === "none" && transcript.style.display === "");
  expect(stream.style.display).toBe("none");
  expect(transcript.style.display).toBe("");
  hub.focus("m1");
  await waitFor(() => stream.style.display === "" && transcript.style.display === "none");
  expect(stream.style.display).toBe("");
  expect(transcript.style.display).toBe("none");
});

test("dismissing the focused entity resets with no id and no kind", async () => {
  const { hub } = mountPanes();
  await quiet(20);
  hub.focus("a1");
  await quiet();
  const resets = [];
  hub.addEventListener("focusReset", e => resets.push(e.detail));
  hub.dismiss("a1");
  await waitFor(() => resets.length === 1);
  expect(resets[0]).toEqual({ id: null, kind: null });
});
