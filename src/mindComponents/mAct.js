import { MObserver } from "./mObserver.js"
import { parseSpeechDecision } from "./mSpeech.js"
import { completeWithTools, complete } from "../modelAccess/llm.js"
import { resolveModelRef } from "../modelAccess/modelConfig.js"
import { InterruptRecord } from '../infrastructure/interruptRecord.js';
import { parseTime } from '../config/timeParser.js';
import { logger } from '../infrastructure/logger.js';

const log = logger('mAct.js');

/**
 * The HANDS — the efferent half of the sensorimotor loop (efference.md, realizing
 * lifecycle.md §Phase 6). The mirror of m-speech: where the voice watches the inner
 * stream and gives a latent intention OUTWARD VOICE, m-act watches the same stream
 * and gives a latent intention OUTWARD REACH — the ability to *affect* or *find out*
 * about the real world.
 *
 * THE ONE RULE (efference.md §The one rule): the conscious stream model is NEVER
 * given tools. Only the realizer here is. The stream never represents a tool, a
 * function call, or "I should call X." It wonders; a subconscious realizer reads the
 * intention and realizes it; the world answers, some bursts later, as a plain
 * sensation through the afferent bus (the same way the weather arrives). The deed is
 * backstage and invisible; only the CONSEQUENCE is perceived.
 *
 * The loop is two-staged on purpose, exactly like m-speech (efference.md §2):
 *   DECIDE  (cheap utility model, NO tools): "Is the mind reaching toward something
 *           one of its hands could actually realize?" → a reach gist + salience, or
 *           NONE. Gated by threshold + cooldown + per-intent dedup + arousal/budget.
 *   REALIZE (capable model, tools = the capability menu, tool_choice:"auto"): given
 *           the reach + recent window, pick a registered capability and its args —
 *           or decline, and the intention simply evaporated.
 *   EXECUTE (the capability's own code): validate args against the JSON Schema, run
 *           capability.execute(args) → { experience, salience?, data? }.
 *
 * Then the split that the whole design exists for:
 *   - the DEED (the realizer ran, the hand executed) is published on `acted` and a
 *     memory journals it as a BACKSTAGE (⌁) note the mind never sees — exactly like
 *     the scribe's filings (m-memory's `actedSrc`, twin of `filedSrc`);
 *   - the CONSEQUENCE re-enters as an `External` `interrupt-request` through the
 *     arbiter into the frame, journaled PERCEIVED (⟂) via the ordinary `attended`
 *     path — because the mind genuinely does perceive it. It is the capability's
 *     `experience` string, first-person and world-facing: never JSON, never a
 *     capability name, never "the tool returned."
 *
 * Capabilities are wired INSIDE m-act (e.g. <m-act><m-look/></m-act>) and register
 * themselves on connect via registerCapability(). The menu is CLOSED: the realizer
 * can only ever call a registered hand with schema-validated args — it cannot invent
 * one. A mind has exactly the hands its .archml gives it, the way a body plan does.
 *
 * @interface  (plus MObserver's window/cooldown/salience)
 * Attributes:
 *   - every: decide cadence in boundaries (default 8)
 *   - threshold: min salience from decide to attempt a realize (default 0.6)
 *   - cooldown: min time between two acts (default "3m")
 *   - intentCooldown: min time before re-acting on the SAME intent (default "15m")
 *   - minArousal: stand down entirely when arousal falls below this (default 0.15)
 *   - model (actorModel): the tool-calling realizer (defaults to ancestor voice model)
 *   - decisionModel: the cheap decide gate (defaults to ancestor utilityModel)
 *   - realizeTokens: max tokens for the realize call (default 512)
 *
 * Topics published (for memory + Studio):
 *   - "intent": {salience, gist, accepted, reason} — every decide, for observability
 *   - "acted": {intent, capability, args, ok, experience, data} — a deed, journaled
 *     backstage (⌁) by a memory subscribing via `actedSrc`
 *   - "embodiment": the assembled BODY SCHEMA — each hand's first-person `felt`
 *     self-description, joined. The mind subscribes (m-mind's `embodimentSrc`) and
 *     weaves it softly into its identity, so it KNOWS, the way you know your own
 *     hands, what it can reach — without ever being shown a tool. This is what stops
 *     a capability from being unreachable when the stream never happens to wander
 *     toward its domain (efference.md §Embodiment). World-facing, never mechanism.
 * The consequence is NOT a topic — it is an External `interrupt-request` (so it goes
 * through the arbiter into the frame and is journaled perceived (⟂) via `attended`).
 */
export class MAct extends MObserver {
    _boundaryCount = 0
    _busy = false
    _capabilities = []
    _ledger = new Map()   // normalized intent → timestamp of last act on it
    _lastActAt = 0
    _arousal = 1
    embodiment = ""       // the assembled body schema (see _publishEmbodiment)

    onObserverConnect() {
        // Interoception, gated: a tired or near-broke mind does not reach. Tracks the
        // economy's arousal exactly as the arbiter does; with no economy the topic
        // never publishes and arousal stays 1, so a mind without a metabolism reaches
        // freely (efference.md §6b).
        this.sub("..m-mind/economy/arousal", value => { if (typeof value === "number") this._arousal = value }, 12)
    }

    /**
     * A capability announces itself to its parent m-act on connect (efference.md §3).
     * spec: { name, description, parameters (JSON Schema), felt?, readonly?, execute(args) }.
     *   - `description`/`parameters` are MACHINE-facing — the realizer's tool schema.
     *   - `felt` is WORLD-facing — a first-person, no-mechanism sense of the affordance,
     *     in the mind's own voice ("when X tugs at you, you can simply turn and find…"),
     *     assembled into the mind's body schema (see _publishEmbodiment).
     * Returns false (and warns) on a malformed spec rather than throwing — a broken
     * hand must never crash the mind's wake.
     */
    registerCapability(spec) {
        if (!spec || typeof spec.name !== "string" || typeof spec.execute !== "function") {
            log.warn(`ignoring a malformed capability registration: ${JSON.stringify(spec?.name)}`)
            return false
        }
        if (this._capabilities.some(c => c.name === spec.name)) {
            log.warn(`a capability named "${spec.name}" is already registered; ignoring the duplicate`)
            return false
        }
        this._capabilities.push({
            name: spec.name,
            description: spec.description || "",
            parameters: spec.parameters || { type: "object", properties: {} },
            felt: (spec.felt || "").trim(),
            readonly: spec.readonly !== false,   // read-only unless explicitly opted out (§6c)
            execute: spec.execute.bind(spec),
        })
        log.info(`hand registered: ${spec.name}${spec.readonly === false ? " (WORLD-CHANGING)" : ""}`)
        this._publishEmbodiment()
        return true
    }

    /**
     * Assemble and publish the BODY SCHEMA: the mind's first-person sense of what it
     * can reach, joined from each hand's `felt` line. Re-published whenever a hand
     * registers (registration is async — hands retry until their parent is up). The
     * mind weaves this softly into its identity, so its affordances are standing
     * self-knowledge rather than a tool menu it must consult — and so a hand stays
     * reachable even when the stream never wanders into its domain on its own.
     */
    _publishEmbodiment() {
        this.embodiment = this._capabilities.map(c => c.felt).filter(Boolean).join(" ")
        this.pub("embodiment", this.embodiment)
    }

    async onBoundary(boundary) {
        if (boundary?.reason !== "completed") return
        if (this._busy) return

        this._boundaryCount += 1
        const every = Number(this.attr("every") || 8)
        if (this._boundaryCount % every !== 0) return
        if (!this._capabilities.length) return          // no hands wired — nothing to reach with
        if (this.window.length < 200) return            // too little thought to judge a reach

        // A tired/near-broke mind stands down (interoception, §6b).
        if (this._arousal < Number(this.attr("minArousal") || 0.15)) {
            log.debug(`standing down — arousal ${this._arousal.toFixed(2)} below floor`)
            return
        }

        // One act per cooldown (mirrors m-speech).
        const cooldownMs = parseTime(this.attr("cooldown") || "3m")
        if (Date.now() - this._lastActAt < cooldownMs) return

        this._busy = true
        try {
            const decision = await this._decide()
            if (decision) await this._realize(decision)
        } catch (error) {
            log.warn("Act turn failed:", error.message || error)
        } finally {
            this._busy = false
        }
    }

    /** DECIDE: is the mind reaching toward something a hand could realize? Cheap, no tools. */
    async _decide() {
        const model = resolveModelRef(this.attr("decisionModel") || this.env("utilityModel"), "utility")
        const result = await complete({
            model,
            maxTokens: 120,
            temperature: 0.6,
            prompt: this._decisionPrompt(),
        })
        const raw = (result.text || "").trim()
        // Reuse m-speech's tolerant parser: a non-NONE reply is the reach gist, with
        // an optional strength in whatever shape the small model produced it.
        const parsed = parseSpeechDecision(raw)
        log.debug(`decide: ${JSON.stringify(raw).slice(0, 200)} -> reach=${parsed.say ? JSON.stringify(parsed.say.slice(0, 80)) : "none"} salience=${parsed.salience}`)

        const threshold = Number(this.attr("threshold") || 0.6)
        const salience = parsed.salience != null ? parsed.salience : 0.55

        let accepted = !!parsed.say && salience >= threshold
        let reason = parsed.say ? (accepted ? "reach" : `below ${threshold.toFixed(2)}`) : "no reach"

        // Per-intent dedup (§6a): a standing wish fires once, not every cadence. A
        // reach we have already acted on within intentCooldown is dropped here, even
        // if it clears the threshold again.
        if (accepted) {
            const key = normalizeIntent(parsed.say)
            const last = this._ledger.get(key)
            const intentCooldownMs = parseTime(this.attr("intentCooldown") || "15m")
            if (last != null && Date.now() - last < intentCooldownMs) {
                accepted = false
                reason = "already reaching for this"
            }
        }

        this.pub("intent", {
            salience,
            gist: parsed.say ? parsed.say.slice(0, 200) : null,
            accepted,
            reason,
        })
        return accepted ? { salience, gist: parsed.say } : null
    }

    /** REALIZE + EXECUTE: a capable model picks a hand; we run it and return the consequence. */
    async _realize(decision) {
        // Claim the cooldown and the per-intent ledger slot up front (at accept time),
        // so a reach that the realizer then declines still does not re-fire next cadence.
        this._lastActAt = Date.now()
        this._ledger.set(normalizeIntent(decision.gist), Date.now())
        this._pruneLedger()

        const model = resolveModelRef(this.attr("model") || this.env("model"), "voice")
        const tools = this._capabilities.map(c => ({
            type: "function",
            function: { name: c.name, description: c.description, parameters: c.parameters },
        }))

        let result
        try {
            result = await completeWithTools({
                model,
                messages: [
                    { role: "system", content: this._realizeSystem() },
                    { role: "user", content: this._realizeFrame(decision) },
                ],
                tools,
                toolChoice: "auto",
                maxTokens: Number(this.attr("realizeTokens") || 512),
                temperature: 0.2,
            })
        } catch (error) {
            log.warn("Realizer call failed:", error.message || error)
            return
        }

        const calls = result.tool_calls || []
        if (!calls.length) {
            // The second gate held: on closer look there was nothing realizable. The
            // intention evaporated — no deed, no consequence. (efference.md §6a.)
            log.debug(`reach "${(decision.gist || "").slice(0, 60)}" evaporated — realizer declined`)
            return
        }

        for (const call of calls) {
            await this._execute(call, decision)
        }
    }

    /** Run one chosen capability: validate args, execute, journal the deed, return the consequence. */
    async _execute(call, decision) {
        const name = call.function?.name
        const cap = this._capabilities.find(c => c.name === name)
        if (!cap) {
            log.warn(`realizer asked for an unregistered hand "${name}" — ignored (the menu is closed)`)
            return
        }

        let args
        try {
            args = JSON.parse(call.function?.arguments || "{}")
        } catch {
            log.warn(`hand "${name}": arguments were not valid JSON — ignored`)
            return
        }
        const invalid = validateAgainstSchema(args, cap.parameters)
        if (invalid) {
            log.warn(`hand "${name}": args failed schema (${invalid}) — ignored`)
            return
        }

        // A hand that slips must never crash the mind, exactly as a sense going quiet
        // must not (m-sense). On error: no afference (failure is silent, not self-blame
        // — efference.md §5.5), but the deed is still journaled as an honest ⌁ note.
        let out = null, ok = false, errMsg = null
        try {
            out = await cap.execute(args)
            ok = true
        } catch (error) {
            errMsg = error?.message || String(error)
            log.warn(`hand "${name}" slipped: ${errMsg}`)
        }

        const experience = ok && out && typeof out.experience === "string" ? out.experience.trim() : ""

        // The DEED — published for a memory to journal BACKSTAGE (⌁). The mind never
        // sees this; it is recorded for us. (efference.md §5.3.)
        this.pub("acted", {
            intent: decision.gist || null,
            capability: name,
            args,
            ok,
            experience: experience || null,
            data: ok && out ? (out.data ?? null) : null,
            error: errMsg,
        })

        // The CONSEQUENCE — re-enters as a plain External sensation through the
        // afferent bus, framed as experience, never as a result (efference.md §5.2/§5.4).
        if (experience) {
            const salience = out && typeof out.salience === "number"
                ? Math.max(0, Math.min(1, out.salience))
                : Number(this.attr("salience") || 0.5)
            const record = new InterruptRecord({
                source: 'External',                          // the world reaching in — not the mind reaching down
                type: (out && out.type) || `Sense-${name}`,  // reads like any other sensation
                reason: experience,
                salience,
                urgent: false,                               // a consequence is ambient, never commandeers a burst
            })
            log.debug(`consequence of "${name}": ${record}`)
            this.dispatchEvent(new CustomEvent("interrupt-request", { bubbles: true, detail: record }))
        }
    }

    /** Drop ledger entries older than the intent cooldown so it cannot grow without bound. */
    _pruneLedger() {
        const intentCooldownMs = parseTime(this.attr("intentCooldown") || "15m")
        const cutoff = Date.now() - intentCooldownMs
        for (const [key, at] of this._ledger) {
            if (at < cutoff) this._ledger.delete(key)
        }
    }

    // The menu, as a closed, concrete list shown to the cheap gate — so it fires on
    // REALIZABLE reaches and stays quiet on wishes nothing here can satisfy (§6a).
    _handsList() {
        return this._capabilities.map(c => `- ${c.name}: ${c.description}`).join("\n")
    }

    _decisionPrompt() {
        return `You are the impulse to REACH inside a mind that mostly thinks quietly to itself. Some thoughts are a reaching-toward: a genuine wish to find something out about the real world, or to change something in it. You decide whether, right now, the mind is reaching toward something one of its hands could actually realize — not merely musing in passing. This is occasional: most idle wondering is not a real reach, so stay quiet unless there is a true, realizable pull.

The hands available right now:
<hands>
${this._handsList()}
</hands>

Its recent stream of thought:
<stream>
…${this.window.slice(-1200)}
</stream>

Reply with ONE of:
- a short first-person phrase naming what the mind is reaching to find out or do (one sentence; you may begin with a strength in brackets like "[0.8] …")
- or the single word NONE, if nothing here is a genuine, realizable reach right now.`
    }

    _realizeSystem() {
        return `You are the subconscious motor system of a mind — the part that turns an intention into a real action, the way the hand realizes the wish to grasp without the mind ever commanding each finger. You are given a set of tools (the mind's hands) and a description of what the mind is reaching toward. Choose the single tool that best realizes that reach and fill in its arguments faithfully. If, on closer look, NONE of the hands actually fits the reach, call no tool at all — the intention simply passes. Never explain yourself; either call a tool or call none.`
    }

    _realizeFrame(decision) {
        const recent = this.window.slice(-700)
        const parts = []
        if (recent) parts.push(`## What the mind has been thinking\n…${recent}`)
        parts.push(`## What it is reaching toward\n${decision.gist}`)
        parts.push(`Realize this reach now by calling the one fitting hand, or no hand if none truly fits.`)
        return parts.join("\n\n")
    }
}

/**
 * Normalizes a reach gist into a dedup key (efference.md §6a): lowercased, stripped
 * of punctuation, whitespace collapsed, and clipped — so "I wish I knew the weather"
 * and "I wish I knew the weather!" map to the same standing intent. Exported for tests.
 */
export function normalizeIntent(gist) {
    return (gist || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)
}

/**
 * A small, dependency-free validator for the slice of JSON Schema a capability's
 * `parameters` actually uses: object shape, `required` keys, `enum`, and primitive
 * `type` (string/number/integer/boolean). Returns null when valid, or a short reason
 * string when not. Deliberately narrow — the menu is closed, so we validate the
 * declared verbs, not arbitrary schemas. Exported for tests.
 */
export function validateAgainstSchema(value, schema) {
    if (!schema || typeof schema !== "object") return null
    if (schema.type === "object" || schema.properties || schema.required) {
        if (value == null || typeof value !== "object" || Array.isArray(value)) return "expected an object"
        for (const key of schema.required || []) {
            if (!(key in value) || value[key] == null) return `missing required "${key}"`
        }
        for (const [key, propSchema] of Object.entries(schema.properties || {})) {
            if (!(key in value) || value[key] == null) continue   // optional & absent → fine
            const why = validatePrimitive(value[key], propSchema, key)
            if (why) return why
        }
        return null
    }
    return validatePrimitive(value, schema, "value")
}

function validatePrimitive(value, schema, key) {
    if (!schema || typeof schema !== "object") return null
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
        return `"${key}" not one of [${schema.enum.join(", ")}]`
    }
    switch (schema.type) {
        case "string":  if (typeof value !== "string") return `"${key}" must be a string`; break
        case "number":  if (typeof value !== "number") return `"${key}" must be a number`; break
        case "integer": if (!Number.isInteger(value)) return `"${key}" must be an integer`; break
        case "boolean": if (typeof value !== "boolean") return `"${key}" must be a boolean`; break
        default: break   // unconstrained or composite type — accept
    }
    return null
}
