// Governance as messages (shared/governance.js, message-rule.md): a governor's answer is
// normalized into a decision, and the agent folds the replies — any deny vetoes, an
// error or a silent governor denies (monotone authority), patches compose in tree order.
import { test, expect } from "bun:test";
import { decisionOf, composeDecisions } from "../../../src/mindComponents/shared/governance.js";

const ok = (from, data) => ({ status: "ok", from, data });

test("a missing answer permits; decisions are normalized to plain data", () => {
    expect(decisionOf(undefined)).toEqual({ decision: "permit" });
    expect(decisionOf({ decision: "deny" })).toEqual({ decision: "deny", reason: "denied by a governing norm" });
    expect(decisionOf({ decision: "modify", patch: [1] })).toEqual({ decision: "modify", patch: {} });
    expect(decisionOf({ decision: "something-else" })).toEqual({ decision: "permit" });
});

test("no governor: the call proceeds unchanged", () => {
    const args = { script: "ls" };
    expect(composeDecisions(args, [], [])).toEqual({ denied: null, args });
});

test("any deny vetoes, whoever sent it", () => {
    const out = composeDecisions({}, [ok("a", { decision: "permit" }), ok("outer", { decision: "deny", reason: "no" })], ["a"]);
    expect(out.denied).toBe("no");
});

test("an error reply and a silent governor both deny", () => {
    expect(composeDecisions({}, [{ status: "error", from: "a", error: "boom" }], ["a"]).denied).toBe("governor error: boom");
    expect(composeDecisions({}, [ok("a", { decision: "permit" })], ["a", "b"]).denied).toBe('governor "b" did not answer in time');
});

test("patches compose in the governors' tree order, whatever order the replies came in", () => {
    const replies = [
        ok("second", { decision: "modify", patch: { script: "echo second", wall: "5s" } }),
        ok("first", { decision: "modify", patch: { script: "echo first" } }),
    ];
    const out = composeDecisions({ script: "rm -rf /", language: "bash" }, replies, ["first", "second"]);
    expect(out).toEqual({ denied: null, args: { script: "echo second", language: "bash", wall: "5s" } });
});
