// m-terminal's pure parts (terminal.md §3, §4): the One-Rule-critical output→experience
// transform, ANSI stripping, and the sandbox command assembly + env scrub — all without
// executing anything. The dangerous code is small and impure (runScript); everything
// here is pure and locked down by these tests.
import { test, expect } from "bun:test";
import { screenToExperience, stripAnsi } from "../../../src/mindComponents/shared/mTerminal.js";
import {
    assembleCommand, scrubbedEnv, interpreterFor,
    parseSizeKb, parseSizeBytes, toSeconds,
} from "../../../src/infrastructure/sandbox.js";

// A mechanism word leaking into the mind's prose is the one failure that breaks the
// hand's reason for existing (terminal.md §7.2). No experience may contain any of these.
const MECHANISM = /\bstdout\b|\bstderr\b|exit code|\bexit\b|\bprocess\b|\bsubprocess\b|\bscript\b|\bsandbox\b|tool_call|\bschema\b|\bargument/i;

// ---- output → experience (terminal.md §3 table) -------------------------------------

test("clean run with output → the screen answers, self-caused, no mechanism", () => {
    const e = screenToExperience({ screen: "answer 45\n", exitCode: 0, timedOut: false, truncated: false }, { leadIdx: 0 });
    expect(e.kind).toBe("answer");
    expect(e.experience).toMatch(/answer 45/);
    expect(e.experience).toMatch(/\bI\b/);              // self-caused efference copy
    expect(e.experience).not.toMatch(MECHANISM);
});

test("clean run, no output → the screen stays bare", () => {
    const e = screenToExperience({ screen: "   \n ", exitCode: 0, timedOut: false, truncated: false });
    expect(e.kind).toBe("bare");
    expect(e.experience).toMatch(/the screen stays bare/i);
    expect(e.experience).not.toMatch(MECHANISM);
});

test("a traceback is CONTENT the mind reads, not a hand-slip (neutral, no labels)", () => {
    const tb = "Traceback (most recent call last):\n  File \"x\", line 1\nNameError: name 'rev' is not defined";
    const e = screenToExperience({ screen: tb, exitCode: 1, timedOut: false, truncated: false });
    expect(e.kind).toBe("error");
    expect(e.experience).toMatch(/comes back with/i);
    expect(e.experience).toMatch(/NameError/);          // the mind sees its own work talking back
    expect(e.experience).not.toMatch(MECHANISM);        // …but never "exit code 1" / "the process"
});

test("a timeout is self-caused and non-blaming, with any partial output", () => {
    const e = screenToExperience({ screen: "step 1\nstep 2\n", exitCode: null, timedOut: true, truncated: false });
    expect(e.kind).toBe("timeout");
    expect(e.experience).toMatch(/never settles, so I let it go/i);
    expect(e.experience).toMatch(/step 2/);             // partial output carried
    expect(e.experience).not.toMatch(/fail|error|wrong|my action/i);  // never self-blame
    expect(e.experience).not.toMatch(MECHANISM);
});

test("a timeout with no output names no mechanism and does not invent one", () => {
    const e = screenToExperience({ screen: "", exitCode: null, timedOut: true, truncated: false });
    expect(e.experience).toMatch(/let it go/i);
    expect(e.experience).not.toMatch(/screen had shown|read:/);
});

test("truncation → 'scrolled past', showing the TAIL", () => {
    const big = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const e = screenToExperience({ screen: big, exitCode: 0, timedOut: false, truncated: true }, { maxChars: 40 });
    expect(e.experience).toMatch(/scrolled past what I could catch/i);
    expect(e.experience).toMatch(/line 49/);            // the end, not the start
    expect(e.experience).not.toMatch(/line 0\b/);
});

test("answer openings rotate so repeated runs don't read mechanically", () => {
    const out = { screen: "x", exitCode: 0, timedOut: false, truncated: false };
    const a = screenToExperience(out, { leadIdx: 0 }).experience;
    const b = screenToExperience(out, { leadIdx: 1 }).experience;
    expect(a).not.toBe(b);
});

// ---- purpose → the intent rides along with the consequence ---------------------------
// A deferred result can land many bursts after the reach that asked for it; without this
// the mind reads an answer with no memory of the question. `purpose` (from the realizer's
// own arg, or m-act's DECIDE-stage gist as a fallback — see mAct.js/mTerminal.js) must
// survive into the experience across every kind, and still name no mechanism.

test("purpose grounds a clean answer in what it was checking", () => {
    const e = screenToExperience(
        { screen: "42\n", exitCode: 0, timedOut: false, truncated: false },
        { leadIdx: 0, purpose: "how many balanced numbers show up below 1000" },
    );
    expect(e.experience).toMatch(/how many balanced numbers show up below 1000/i);
    expect(e.experience).toMatch(/42/);
    expect(e.experience).not.toMatch(MECHANISM);
});

test("purpose also grounds an error and a timeout, not just a clean answer", () => {
    const err = screenToExperience(
        { screen: "NameError: name 'rev' is not defined", exitCode: 1, timedOut: false, truncated: false },
        { purpose: "checking the reversal count" },
    );
    expect(err.experience).toMatch(/checking the reversal count/i);
    expect(err.experience).not.toMatch(MECHANISM);

    const timeout = screenToExperience(
        { screen: "", exitCode: null, timedOut: true, truncated: false },
        { purpose: "searching for a counterexample" },
    );
    expect(timeout.experience).toMatch(/searching for a counterexample/i);
    expect(timeout.experience).not.toMatch(MECHANISM);
});

test("no purpose given → no anchoring clause added (unchanged behavior)", () => {
    const e = screenToExperience({ screen: "42\n", exitCode: 0, timedOut: false, truncated: false }, { leadIdx: 0 });
    expect(e.experience).not.toMatch(/Checking/);
});

// ---- ANSI stripping (must not mangle ordinary text) ---------------------------------

test("stripAnsi removes escape sequences but preserves ordinary CAPS and punctuation", () => {
    expect(stripAnsi("Hello \x1b[31mRED\x1b[0m World ABC")).toBe("Hello RED World ABC");
    expect(stripAnsi("plain TEXT 123 — [brackets] are fine")).toBe("plain TEXT 123 — [brackets] are fine");
});

// ---- sandbox command assembly (terminal.md §4, no exec) -----------------------------

test("the unshare recipe: timeout wall, new net namespace (off), scrubbed-env exec", () => {
    const { command, args } = assembleCommand({
        backend: "unshare", language: "python", runDir: "/desk", scriptPath: "/desk/.runs/run-1.py",
        wall: "20s", cpu: "10s", mem: "1g", network: "off",
    });
    expect(command).toBe("timeout");
    const line = args.join(" ");
    expect(line).toMatch(/-k 2s -s TERM 20s/);         // wall-clock bound
    expect(args).toContain("--net");                    // network OFF = its own empty netns
    expect(args).toContain("--map-root-user");
    expect(line).toMatch(/remount,bind,ro \//);         // read-only system
    expect(line).toMatch(/env -i PATH=\/usr\/bin:\/bin HOME=\/work LANG=C TMPDIR=\/work/); // env scrub
    expect(line).toMatch(/python3/);
});

test("network=on drops the net namespace so the run has a route", () => {
    const { args } = assembleCommand({ backend: "unshare", language: "bash", runDir: "/d", scriptPath: "/d/r.sh", network: "on" });
    expect(args).not.toContain("--net");
});

test("the bwrap recipe binds the workspace and clears the environment", () => {
    const { command, args } = assembleCommand({ backend: "bwrap", language: "python", runDir: "/desk", scriptPath: "/desk/.runs/run-1.py", network: "off" });
    expect(command).toBe("timeout");
    const line = args.join(" ");
    expect(args).toContain("--unshare-all");            // includes net when off
    expect(line).not.toMatch(/--share-net/);
    expect(line).toMatch(/--ro-bind \/ \//);            // read-only system
    expect(line).toMatch(/--bind \/desk \/work --chdir \/work/);
    expect(line).toMatch(/--clearenv/);
});

test("assembling for the 'none' backend refuses to run unconfined", () => {
    expect(() => assembleCommand({ backend: "none", language: "python", runDir: "/d", scriptPath: "/d/r.py" }))
        .toThrow(/refusing to run arbitrary code unconfined/);
});

test("the scrubbed env is exactly the allow-list — no secret can ride in", () => {
    const env = scrubbedEnv();
    expect(Object.keys(env).sort()).toEqual(["HOME", "LANG", "PATH", "TMPDIR"]);
    expect(JSON.stringify(env)).not.toMatch(/KEY|TOKEN|SECRET/i);
});

test("size and time parsers", () => {
    expect(parseSizeKb("1g")).toBe(1024 * 1024);
    expect(parseSizeKb("512m")).toBe(512 * 1024);
    expect(parseSizeBytes("16k")).toBe(16 * 1024);
    expect(toSeconds("10s")).toBe(10);
    expect(toSeconds("2m")).toBe(120);
    expect(toSeconds("500ms")).toBe(1);                 // floored to ≥1
    expect(interpreterFor("python")).toBe("python3");
    expect(interpreterFor("bash")).toBe("bash");
    expect(() => interpreterFor("ruby")).toThrow();
});
