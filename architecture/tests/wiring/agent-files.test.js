// The file tools as AGENT tools, exercised against the REAL filesystem in a temp
// workspace (agent-loop.md §8). This is the extensibility proof made concrete: each of
// <m-read-file> / <m-write-file> / <m-edit> registers itself with m-agent purely via the
// bubbling `capability` event (no core change), and returns an agent `observation`. We
// drive the registered tools directly (no model), exactly as agent-terminal.test.js does.
import "./setup.js";
import { test, expect, beforeAll, afterAll } from "bun:test";
import os from "node:os";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { delay } from "./setup.js";
import { loadMindComponents } from "../../../src/startup/loadMindComponents.js";

let agent, ws, savedDry;
const tool = name => agent._tools.find(t => t.name === name);

beforeAll(async () => {
    savedDry = process.env.MEDITATOR_DRY_RUN;
    process.env.MEDITATOR_DRY_RUN = "1";   // no model/sandbox in play; the FS ops are real

    ws = path.join(os.tmpdir(), "med-agent-files-" + Date.now());
    fs.mkdirSync(ws, { recursive: true });

    // A bare agent (no <m-reason> → the loop never starts, mirroring agent-terminal): we
    // only want the registered tools. Each file tool is rooted at the temp workspace,
    // inlined into the markup: a file tool reads its `root` in onConnect, and once these
    // tags are registered by an earlier test file, innerHTML upgrades them synchronously,
    // so a setAttribute after assignment would be too late.
    document.body.innerHTML = `
      <m-agent name="files-test" toolSettleMs="60">
        The agent.
        <m-read-file  name="read_file"  root="${ws}"></m-read-file>
        <m-write-file name="write_file" root="${ws}"></m-write-file>
        <m-edit       name="edit"       root="${ws}"></m-edit>
      </m-agent>
    `;

    await loadMindComponents(document);
    await delay(150);   // let the capabilities bubble up and register
    agent = document.querySelector("m-agent");
});

afterAll(() => {
    document.body.innerHTML = "";   // disconnect so the (never-started) loop can't linger
    if (savedDry === undefined) delete process.env.MEDITATOR_DRY_RUN; else process.env.MEDITATOR_DRY_RUN = savedDry;
    try { fs.rmSync(ws, { recursive: true, force: true }); } catch { /* best effort */ }
});

test("all three file tools register on the agent via the capability event", () => {
    expect(agent._tools.map(t => t.name).sort()).toEqual(["edit", "read_file", "write_file"]);
});

test("write_file creates a file (and its parents) and reports the bytes", async () => {
    const out = await tool("write_file").execute({ path: "src/greet.txt", content: "hello\nworld\n" });
    expect(out.isError).toBeFalsy();
    expect(out.observation).toMatch(/wrote 12 byte\(s\) to "src\/greet\.txt"/);
    expect(fs.readFileSync(path.join(ws, "src/greet.txt"), "utf8")).toBe("hello\nworld\n");
});

test("read_file returns the content with 1-indexed line numbers", async () => {
    const out = await tool("read_file").execute({ path: "src/greet.txt" });
    expect(out.isError).toBeFalsy();
    expect(out.observation).toBe("1\thello\n2\tworld\n3\t");   // trailing newline → an empty 3rd line
    expect(out.data).toEqual({ path: "src/greet.txt", bytes: 12 });
});

test("read_file caps at maxBytes and notes the remainder", async () => {
    await tool("write_file").execute({ path: "big.txt", content: "abcdefghij" });   // 10 bytes
    const out = await tool("read_file").execute({ path: "big.txt", maxBytes: 4 });
    expect(out.observation).toContain("abcd");
    expect(out.observation).toMatch(/6 more bytes/);
});

test("edit replaces a unique match and writes it back", async () => {
    const out = await tool("edit").execute({ path: "src/greet.txt", old: "world", new: "there" });
    expect(out.isError).toBeFalsy();
    expect(out.observation).toMatch(/edited "src\/greet\.txt" \(1 replacement\)/);
    expect(fs.readFileSync(path.join(ws, "src/greet.txt"), "utf8")).toBe("hello\nthere\n");
});

test("edit refuses an ambiguous match unless replace_all is set", async () => {
    await tool("write_file").execute({ path: "dup.txt", content: "x x x" });
    const ambiguous = await tool("edit").execute({ path: "dup.txt", old: "x", new: "y" });
    expect(ambiguous.isError).toBe(true);
    expect(ambiguous.observation).toMatch(/appears 3 times/);
    expect(fs.readFileSync(path.join(ws, "dup.txt"), "utf8")).toBe("x x x");   // untouched

    const all = await tool("edit").execute({ path: "dup.txt", old: "x", new: "y", replace_all: true });
    expect(all.isError).toBeFalsy();
    expect(all.observation).toMatch(/3 replacements/);
    expect(fs.readFileSync(path.join(ws, "dup.txt"), "utf8")).toBe("y y y");
});

test("edit surfaces a no-match and a no-op as clean errors", async () => {
    expect((await tool("edit").execute({ path: "src/greet.txt", old: "absent", new: "z" })).observation).toMatch(/no match/);
    expect((await tool("edit").execute({ path: "src/greet.txt", old: "same", new: "same" })).observation).toMatch(/identical/);
    expect((await tool("edit").execute({ path: "src/greet.txt", old: "", new: "z" })).observation).toMatch(/"old" is empty/);
});

test("containment: a path escaping the workspace is refused by every tool", async () => {
    const read = await tool("read_file").execute({ path: "../../../etc/passwd" });
    expect(read.isError).toBe(true);
    expect(read.observation).toMatch(/refused: .*outside the workspace/);

    const write = await tool("write_file").execute({ path: "../escape.txt", content: "nope" });
    expect(write.isError).toBe(true);
    expect(write.observation).toMatch(/outside the workspace/);
    expect(fs.existsSync(path.join(path.dirname(ws), "escape.txt"))).toBe(false);   // nothing written outside

    const edit = await tool("edit").execute({ path: "/etc/hosts", old: "a", new: "b" });
    expect(edit.isError).toBe(true);
    expect(edit.observation).toMatch(/outside the workspace/);
});

test("read_file surfaces a missing file as an error observation, not a throw", async () => {
    const out = await tool("read_file").execute({ path: "does-not-exist.txt" });
    expect(out.isError).toBe(true);
    expect(out.observation).toMatch(/could not read/);
});
