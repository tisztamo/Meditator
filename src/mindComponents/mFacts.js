import fs from 'node:fs/promises';
import path from 'node:path';
import { MBaseComponent } from "./mBaseComponent.js"
import { mindHome } from '../infrastructure/memoryVault.js';
import { logger } from '../infrastructure/logger.js';

const log = logger('mFacts.js');

/**
 * m-facts — verbatim, keyed knowing beside narrative memory.
 *
 * Stores one exact fact per key under memory/<mind>/facts/, publishes pinned facts
 * as a retained `pinned` topic for m-mind's frame, and registers two hands with
 * m-act when present:
 *   - remember{key,value,pin?}: write a verbatim fact
 *   - recall-fact{key}: read one exact/unique-prefix fact back whole
 *
 * Seeded facts can be authored either as:
 *   <m-facts><m-fact key="puzzle" pin>...</m-fact></m-facts>
 * or, for the compact origin-as-reference-data case:
 *   <m-origin name="origin" key="puzzle" pin>...</m-origin>
 */
export class MFacts extends MBaseComponent {
    facts = new Map()
    loaded = false
    _registeredHands = false

    onConnect() {
        this._loadAndSeed()
            .catch(error => log.warn(`Fact memory could not finish loading/seeding: ${error.message}`))
            .finally(() => {
                this.loaded = true
                this._publishPinned()
                this._registerHandsSoon()
            })
    }

    _dir() {
        const dir = this.attr("dir") || mindHome(this, "facts")
        return dir === "off" ? null : dir
    }

    async _loadAndSeed() {
        await this._load()
        for (const seed of this._seededFacts()) {
            await this._rememberFact(seed, { seed: true })
        }
    }

    async _load() {
        const dir = this._dir()
        if (!dir) return
        let entries
        try { entries = await fs.readdir(dir, { withFileTypes: true }) }
        catch (error) {
            if (error.code !== 'ENOENT') log.warn(`Could not read facts in "${dir}": ${error.message}`)
            return
        }
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith(".md")) continue
            try {
                const raw = await fs.readFile(path.join(dir, entry.name), "utf8")
                const fact = parseFactFile(raw)
                if (fact?.key) this.facts.set(fact.key, fact)
            } catch (error) {
                log.warn(`Could not load fact "${entry.name}": ${error.message}`)
            }
        }
    }

    _seededFacts() {
        const out = []
        for (const el of Array.from(this.children || [])) {
            if (el.localName !== "m-fact") continue
            const key = (el.getAttribute("key") || el.getAttribute("name") || "").trim()
            if (!key) { log.warn("Ignoring seeded <m-fact> without key/name"); continue }
            out.push({
                key,
                value: factElementText(el),
                pinned: isTruthyAttr(el, "pin") || isTruthyAttr(el, "pinned"),
                source: el.getAttribute("source") || "seeded",
            })
        }

        const mind = this.closest("m-mind")
        if (mind) {
            for (const el of Array.from(mind.querySelectorAll("m-origin[pin], m-origin[pinned]"))) {
                const key = (el.getAttribute("key") || el.getAttribute("name") || "origin").trim()
                out.push({
                    key,
                    value: factElementText(el),
                    pinned: true,
                    source: el.getAttribute("source") || "seeded",
                })
            }
        }
        return out
    }

    async _rememberFact({ key, value, pinned = false, source = "earned" } = {}, { seed = false } = {}) {
        const cleanKey = (key || "").trim()
        if (!cleanKey) throw new Error("fact key is required")
        if (value == null || String(value).length === 0) throw new Error("fact value is required")

        const prior = this.facts.get(cleanKey) || null
        const fact = {
            key: cleanKey,
            value: String(value),
            pinned: !!pinned,
            source: source || (seed ? "seeded" : "earned"),
            at: prior?.at || new Date().toISOString(),
            supersedes: prior && prior.value !== String(value) ? prior.at || null : prior?.supersedes || null,
        }

        if (prior && prior.value === fact.value && prior.pinned === fact.pinned && prior.source === fact.source) {
            return prior
        }

        if (prior) fact.at = new Date().toISOString()
        const dir = this._dir()
        if (dir) {
            await fs.mkdir(dir, { recursive: true })
            await fs.writeFile(path.join(dir, factFileName(cleanKey)), renderFactFile(fact))
        }
        this.facts.set(cleanKey, fact)
        this._publishPinned()
        log.info(`${seed ? "seeded" : "remembered"} fact "${cleanKey}" (${fact.value.length} chars${fact.pinned ? ", pinned" : ""})`)
        return fact
    }

    _findFact(key) {
        const cleanKey = (key || "").trim()
        if (!cleanKey) throw new Error("fact key is required")
        const exact = this.facts.get(cleanKey)
        if (exact) return exact
        const matches = [...this.facts.values()].filter(f => f.key.startsWith(cleanKey))
        if (matches.length === 1) return matches[0]
        if (matches.length > 1) throw new Error(`fact key "${cleanKey}" is ambiguous: ${matches.map(f => f.key).join(", ")}`)
        throw new Error(`no fact found for key "${cleanKey}"`)
    }

    _publishPinned() {
        const pinned = [...this.facts.values()].filter(f => f.pinned).sort((a, b) => a.key.localeCompare(b.key))
        const text = pinned.map(f => `[${f.key}]\n${f.value}`).join("\n\n")
        const budget = Number(this.attr("pinnedBudget") || 30000)
        if (budget > 0 && text.length > budget) {
            log.warn(`Pinned facts are ${text.length} chars, over pinnedBudget=${budget}; publishing anyway (never silently dropping facts).`)
        }
        this.pub("pinned", text)
    }

    _registerHandsSoon(tries = 0) {
        if (this._registeredHands) return
        const act = this.closest("m-act") || this.closest("m-mind")?.querySelector("m-act")
        if (act && typeof act._registerCapability === "function") {
            this._registeredHands = true
            this._offerTo(act, this._rememberSpec())
            this._offerTo(act, this._recallSpec())
            return
        }
        if (tries < 50) setTimeout(() => this._registerHandsSoon(tries + 1), 20)
    }

    _offerTo(act, spec) {
        if (act === this.parentElement) this.offerCapability(spec)
        else act.dispatchEvent(new CustomEvent("capability", { detail: spec, bubbles: false }))
    }

    _rememberSpec() {
        return {
            name: this.attr("rememberName") || "remember",
            description: "Set down a keyed fact exactly as written, preserving data or a verdict verbatim. "
                + "Use for reference data, confirmed results, definitions, constants, and verdicts that must not drift.",
            felt: this.attr("rememberFelt") || "When a fact, datum, or verdict must stay exact, you can set it down by name and know it will not be paraphrased away.",
            parameters: {
                type: "object",
                properties: {
                    key: { type: "string", description: "stable key for the fact, such as puzzle, verdict:crop-rule, const:bg-ex0" },
                    value: { type: "string", description: "the exact value to preserve verbatim" },
                    pin: { type: "boolean", description: "whether this fact must stay in every attention frame" },
                },
                required: ["key", "value"],
            },
            readonly: false,
            execute: async args => this._rememberHand(args),
        }
    }

    _recallSpec() {
        return {
            name: this.attr("recallName") || "recall-fact",
            description: "Recall one keyed fact exactly and whole. Use an exact key or an unambiguous prefix.",
            felt: this.attr("recallFelt") || "And facts you have set down by name can be brought back whole, exactly as they were written.",
            parameters: {
                type: "object",
                properties: {
                    key: { type: "string", description: "exact fact key, or an unambiguous prefix" },
                },
                required: ["key"],
            },
            readonly: true,
            execute: async args => this._recallHand(args),
        }
    }

    async _rememberHand({ key, value, pin } = {}) {
        const fact = await this._rememberFact({ key, value, pinned: !!pin, source: "earned" })
        return {
            experience: `I set down the fact "${fact.key}" exactly, so it will stay as written.`,
            salience: Number(this.attr("rememberSalience") || 0.55),
            data: { key: fact.key, chars: fact.value.length, pinned: fact.pinned },
        }
    }

    async _recallHand({ key } = {}) {
        const fact = this._findFact(key)
        return {
            experience: `I find the fact "${fact.key}" exactly as it was kept:\n${fact.value}`,
            salience: Number(this.attr("recallSalience") || 0.85),
            urgent: this.attr("urgent") !== "false",
            data: { key: fact.key, chars: fact.value.length, pinned: fact.pinned, source: fact.source },
        }
    }
}

export function factFileName(key) {
    return Buffer.from(String(key), "utf8").toString("base64url") + ".md"
}

export function renderFactFile(fact) {
    const meta = {
        key: fact.key,
        pinned: !!fact.pinned,
        source: fact.source || "earned",
        at: fact.at || new Date().toISOString(),
        supersedes: fact.supersedes || null,
    }
    return `<!-- fact: ${JSON.stringify(meta)} -->\n${fact.value}`
}

export function parseFactFile(raw) {
    const nl = raw.indexOf("\n")
    const first = nl === -1 ? raw : raw.slice(0, nl)
    const match = first.match(/^<!-- fact: (.*?) -->$/)
    if (!match) return null
    const meta = JSON.parse(match[1])
    return {
        key: meta.key,
        value: nl === -1 ? "" : raw.slice(nl + 1),
        pinned: !!meta.pinned,
        source: meta.source || "earned",
        at: meta.at || null,
        supersedes: meta.supersedes || null,
    }
}

function isTruthyAttr(el, name) {
    if (!el.hasAttribute(name)) return false
    const value = el.getAttribute(name)
    return value == null || value === "" || !/^(false|0|no)$/i.test(value)
}

function factElementText(el) {
    return (el.textContent || "").trim()
}
