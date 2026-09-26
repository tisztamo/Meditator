#!/usr/bin/env bun
// The message-rule ratchet (doc/architecture/message-rule.md,
// doc/improvements/message-rule-async-review.md §6).
//
// Runs the unit + wiring suites with every CustomEvent delivered asynchronously
// through a JSON wire (src/infrastructure/deliveryChaos.js) and the plain-data
// check on, then compares
// what broke against architecture/tests/async-baseline.json:
//
//   bun tools/delivery-chaos.mjs            check: fail on anything NEW, and on
//                                           anything FIXED that is still listed
//   bun tools/delivery-chaos.mjs --update   rewrite the baseline from this run
//   bun tools/delivery-chaos.mjs --mode jitter --seed 3 --report-only
//   bun tools/delivery-chaos.mjs --wire ref --report-only
//                                           explore another mode, or timing
//                                           alone without the JSON wire;
//                                           never compares
//
// The baseline only ever shrinks: each migration step (request/respond, hands,
// attention payloads, gates…) turns entries green and removes them with --update.
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const BASELINE = join(ROOT, "architecture/tests/async-baseline.json")
// The strongest simulation: every event deferred to a macrotask AND sent through a
// JSON round trip — what a real process boundary does to timing and to payloads.
const BASELINE_MODE = "macrotask"
const BASELINE_WIRE = "json"

// Tests that drive a protocol by calling a looked-up element's method stay green
// under async delivery and pin the old API; they are counted (and may only shrink)
// rather than silently passing. The list mirrors the review's §3.3 role ports.
const LEGACY_METHODS = [
    "takePending", "requestControl", "requestOrientation", "_registerCapability",
    "_updateCapability", "getTail", "getRecentOutput", "finalize", "runAsJob",
    "createBid", "evaluate",
]

const args = process.argv.slice(2)
const flag = name => args.includes(name)
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt }
const mode = opt("--mode", BASELINE_MODE)
const seed = opt("--seed", "1")
const wire = opt("--wire", BASELINE_WIRE)
const update = flag("--update")
const reportOnly = flag("--report-only") || mode !== BASELINE_MODE || wire !== BASELINE_WIRE

const out = mkdtempSync(join(tmpdir(), "delivery-chaos-"))
const suites = [
    { name: "unit", argv: ["test", "architecture/tests/unit"] },
    { name: "wiring", argv: ["test", "architecture/tests/wiring", "--max-concurrency", "1"] },
]

const failures = new Set()
const violations = new Map()
let totals = { tests: 0, failed: 0 }
const silent = []   // test files that produced no results under chaos

for (const s of suites) {
    const xml = join(out, `${s.name}.xml`)
    const report = join(out, `${s.name}.json`)
    process.stderr.write(`delivery-chaos: ${s.name} suite, mode=${mode} wire=${wire}…\n`)
    const run = spawnSync("bun", [...s.argv, "--reporter=junit", `--reporter-outfile=${xml}`], {
        cwd: ROOT,
        env: {
            ...process.env,
            MEDITATOR_DELIVERY: mode,
            MEDITATOR_DELIVERY_SEED: seed,
            MEDITATOR_DELIVERY_WIRE: wire,
            MEDITATOR_DELIVERY_CHECK: "report",
            MEDITATOR_DELIVERY_REPORT: report,
        },
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
    })
    if (!existsSync(xml)) {
        process.stderr.write(run.stdout + run.stderr)
        console.error(`delivery-chaos: the ${s.name} suite produced no junit report (exit ${run.status})`)
        process.exit(2)
    }
    const parsed = parseJunit(readFileSync(xml, "utf8"))
    // A file with no results at all was aborted, typically by an unhandled error an
    // earlier file left behind. Its tests would silently drop out of the ratchet.
    for (const file of testFiles(join(ROOT, s.argv[1]))) {
        if (!parsed.files.has(file)) silent.push(file)
    }
    totals.tests += parsed.tests
    totals.failed += parsed.failed.length
    for (const f of parsed.failed) failures.add(f)
    if (existsSync(report)) {
        for (const v of JSON.parse(readFileSync(report, "utf8")).violations) {
            const prev = violations.get(v.key)
            if (!prev) violations.set(v.key, { senders: new Set(v.senders), paths: new Set(v.paths) })
            else { v.senders.forEach(x => prev.senders.add(x)); v.paths.forEach(x => prev.paths.add(x)) }
        }
    }
}

const legacy = countLegacyCalls(join(ROOT, "architecture/tests"))
const current = {
    mode,
    wire,
    failures: [...failures].sort(),
    violations: Object.fromEntries([...violations.keys()].sort().map(k => {
        const v = violations.get(k)
        return [k, { senders: [...v.senders].sort(), paths: [...v.paths].sort().slice(0, 3) }]
    })),
    legacyHandleCallsInTests: legacy,
}

console.log(`delivery-chaos (${mode}, wire=${wire}): ${totals.failed}/${totals.tests} tests fail, ` +
    `${violations.size} plain-data violation kinds, ` +
    `${Object.values(legacy).reduce((a, b) => a + b, 0)} legacy handle calls in tests`)

// Never compare or write a baseline with a file missing: its failures would vanish.
if (silent.length) {
    console.error("test files with NO results under async delivery (aborted — look for an " +
        "unhandled error left by the file that ran before):\n" + silent.map(f => `  ${f}`).join("\n"))
    process.exit(1)
}

if (update) {
    writeFileSync(BASELINE, JSON.stringify({
        _about: "Message-rule ratchet — what breaks under async delivery today. Regenerate with " +
            "`bun tools/delivery-chaos.mjs --update` after a migration step turns entries green; " +
            "never add to it by hand. See doc/architecture/message-rule.md.",
        ...current,
    }, null, 2) + "\n")
    console.log(`baseline written: ${relative(ROOT, BASELINE)}`)
    process.exit(0)
}

if (reportOnly) {
    for (const f of current.failures) console.log(`  FAIL ${f}`)
    for (const k of Object.keys(current.violations)) console.log(`  M2   ${k}`)
    process.exit(0)
}

if (!existsSync(BASELINE)) {
    console.error("no baseline yet — run with --update")
    process.exit(2)
}
const base = JSON.parse(readFileSync(BASELINE, "utf8"))
const diff = (now, then) => now.filter(x => !then.includes(x))
const problems = []
const report = (label, list) => { if (list.length) problems.push(`${label}:\n${list.map(x => `  ${x}`).join("\n")}`) }

report("NEW failures under async delivery (a protocol regressed, or a new test depends on sync dispatch)",
    diff(current.failures, base.failures))
report("NEW plain-data violations (message rule M2)",
    diff(Object.keys(current.violations), Object.keys(base.violations)))
report("FIXED failures still in the baseline — run --update to lock them in",
    diff(base.failures, current.failures))
report("FIXED violations still in the baseline — run --update to lock them in",
    diff(Object.keys(base.violations), Object.keys(current.violations)))
for (const m of LEGACY_METHODS) {
    const now = legacy[m] || 0, then = (base.legacyHandleCallsInTests || {})[m] || 0
    if (now > then) problems.push(`legacy handle call .${m}( grew in tests: ${then} → ${now}`)
    else if (now < then) problems.push(`legacy handle call .${m}( shrank in tests: ${then} → ${now} — run --update`)
}

if (problems.length) {
    console.error(problems.join("\n\n"))
    process.exit(1)
}
console.log("matches the baseline")

// ---------------------------------------------------------------------------

function decode(s) {
    return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&")
}

function attr(tag, name) {
    const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`))
    return m ? decode(m[1]) : ""
}

/** Failed testcases as "file > [describe > ]name". */
function parseJunit(xml) {
    const failed = []
    const files = new Set()
    let tests = 0
    const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g
    let m
    while ((m = re.exec(xml))) {
        tests++
        files.add(attr(m[1], "file"))
        const body = m[3] || ""
        if (!/<(failure|error)\b/.test(body)) continue
        const head = m[1]
        const cls = attr(head, "classname")
        failed.push([attr(head, "file"), cls, attr(head, "name")].filter(Boolean).join(" > "))
    }
    return { tests, failed, files }
}

/** Test files under `dir` (repo-relative, as junit names them), skipping live/. */
function testFiles(dir) {
    const found = []
    const walk = d => {
        for (const e of readdirSync(d)) {
            const p = join(d, e)
            if (statSync(p).isDirectory()) { if (e !== "live") walk(p) }
            else if (p.endsWith(".test.js")) found.push(relative(ROOT, p))
        }
    }
    walk(dir)
    return found
}

function countLegacyCalls(dir) {
    const counts = Object.fromEntries(LEGACY_METHODS.map(m => [m, 0]))
    const re = new RegExp(`\\.(${LEGACY_METHODS.join("|")})\\(`, "g")
    const walk = d => {
        for (const e of readdirSync(d)) {
            const p = join(d, e)
            if (statSync(p).isDirectory()) { if (e !== "live") walk(p) } else if (p.endsWith(".js")) {
                for (const mm of readFileSync(p, "utf8").matchAll(re)) counts[mm[1]]++
            }
        }
    }
    walk(dir)
    return counts
}
