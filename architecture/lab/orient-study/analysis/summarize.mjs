#!/usr/bin/env bun
// Summarize aperture-change notes from an eddy-world-orient journal.
import fs from 'node:fs'
import path from 'node:path'

const home = process.argv[2]
if (!home) {
    console.error('usage: bun architecture/lab/orient-study/analysis/summarize.mjs <mind-home>')
    process.exit(2)
}

const journalDir = path.join(home, 'journal')
const files = fs.existsSync(journalDir)
    ? fs.readdirSync(journalDir).filter(f => f.endsWith('.md')).sort()
    : []

const changes = []
const re = /Attention aperture:\s+(\w+)\s+→\s+(\w+)\s+\(([^)]+)\)/g
for (const file of files) {
    const text = fs.readFileSync(path.join(journalDir, file), 'utf8')
    let m
    while ((m = re.exec(text))) {
        changes.push({ file, from: m[1], to: m[2], reason: m[3] })
    }
}

const byReason = {}
for (const c of changes) byReason[c.reason] = (byReason[c.reason] || 0) + 1

const closedToSoft = []
for (let i = 0; i < changes.length - 1; i++) {
    if (changes[i].to === 'closed' && changes[i + 1].to === 'soft') {
        closedToSoft.push({ close: changes[i], soften: changes[i + 1] })
    }
}

const report = {
    home,
    transitions: changes.length,
    byReason,
    closedToSoftened: closedToSoft.length,
    sample: changes.slice(0, 20),
}

console.log(JSON.stringify(report, null, 2))

const md = [
    `# Orient study — ${home}`,
    '',
    `- transitions: ${changes.length}`,
    `- by reason: ${JSON.stringify(byReason)}`,
    `- closed→softened pairs: ${closedToSoft.length}`,
    '',
    'Fill re-close latency and bypassAperture checks from the run log / Studio.',
    'This table is not a claim that orientation improved functioning.',
    '',
].join('\n')
fs.writeFileSync(path.join(home, 'orient-study.md'), md)
console.error(`wrote ${path.join(home, 'orient-study.md')}`)
