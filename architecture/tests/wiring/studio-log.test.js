// studio-log surfaces a focused mind's process log. An error line (child stderr)
// must be visible even when the log is collapsed: it is tallied on the summary and
// the log is popped open on the first error — but only once, so a user who closes
// it again is not fought.
import "./setup.js";
import { test, expect } from "bun:test";
import { StudioLog } from "../../../src/studio/ui/studioLog.js";

// A fresh studio-log; its /conn subscriptions resolve to null with no supervisor
// present (harmless), and we drive append()/reset() directly.
function mk() {
    document.body.innerHTML = `<studio-log></studio-log>`;
    return document.querySelector("studio-log");
}

test("ordinary output updates the line count but raises no error indicator", () => {
    const el = mk();
    el.append("out", "thinking...");
    el.append("out", "still thinking");
    expect(el.count).toBe(2);
    expect(el.hintEl.textContent).toBe("· 2");
    expect(el.errEl.textContent).toBe("");
    expect(el.box.open).toBe(false);
});

test("an error line is tallied and opens the log so the user sees it", () => {
    const el = mk();
    el.append("out", "fine");
    expect(el.box.open).toBe(false);
    el.append("err", "Error: boom");
    expect(el.errCount).toBe(1);
    expect(el.errEl.textContent).toContain("1 error");
    expect(el.box.open).toBe(true);            // auto-opened on first error
    el.append("err", "  at thing");
    expect(el.errEl.textContent).toContain("2 errors");
});

test("auto-open happens once — a user can re-close the log after the first error", () => {
    const el = mk();
    el.append("err", "Error: one");
    expect(el.box.open).toBe(true);
    el.box.open = false;                        // user closes it
    el.append("err", "Error: two");
    expect(el.box.open).toBe(false);            // not forced back open
    expect(el.errEl.textContent).toContain("2 errors");
});

test("reset clears the log, the tallies, and re-arms auto-open", () => {
    const el = mk();
    el.append("err", "Error: boom");
    expect(el.box.open).toBe(true);
    el.reset();
    expect(el.count).toBe(0);
    expect(el.errCount).toBe(0);
    expect(el.hintEl.textContent).toBe("");
    expect(el.errEl.textContent).toBe("");
    expect(el.logEl.children.length).toBe(0);
    el.box.open = false;
    el.append("err", "Error: again");           // re-armed: opens again
    expect(el.box.open).toBe(true);
});
