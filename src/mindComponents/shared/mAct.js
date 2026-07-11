import { MObserver } from "../mind/mObserver.js"
import { parseSpeechDecision } from "../mind/mSpeech.js"
import { validateAgainstSchema } from "./toolSchema.js"
import { completeWithTools, complete } from "../../modelAccess/llm.js"
import { resolveModelRef } from "../../modelAccess/modelConfig.js"
import { readKept } from "./recallSources.js"
import { contentStems, containment } from "./loopMath.js"
import { ENERGY } from "./infoton.js"
import { InterruptRecord } from '../../infrastructure/interruptRecord.js';
import { mindHome } from '../../infrastructure/memoryVault.js';
import { parseTime } from '../../config/timeParser.js';
import { logger } from '../../infrastructure/logger.js';

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
 * Capabilities are wired INSIDE m-act (e.g. <m-act><m-look/></m-act>) and offer themselves
 * on connect with a bubbling "capability" event m-act listens for (no hand names m-act).
 * The menu is CLOSED: the realizer can only ever call a registered hand with schema-validated
 * args — it cannot invent one. A mind has exactly the hands its .archml gives it, like a body plan.
 *
 * @interface  (plus MObserver's window/cooldown/salience)
 * Attributes:
 *   - every: decide cadence in boundaries (default 8)
 *   - threshold: min salience from decide to attempt a realize (default 0.6)
 *   - cooldown: min time between two acts (default "3m"). Governs the WORLD-CHANGING
 *     lane; in legacy mode (no readCooldown) it is the single shared lane for all hands.
 *   - readCooldown: when set, READ-ONLY hands (look, recall) run on their own cooldown
 *     lane of this length, decoupled from world-changing ones — so a recent note never
 *     blocks a recall, and reading and writing stop contending for one slot. Absent,
 *     all hands share the single `cooldown` lane, exactly as before.
 *   - intentCooldown: min time before re-acting on the SAME intent (default "15m")
 *   - minArousal: stand down entirely when arousal falls below this (default 0.15)
 *   - model (actorModel): the tool-calling realizer (defaults to ancestor voice model)
 *   - decisionModel: the cheap decide gate (defaults to ancestor utilityModel)
 *   - realizeTokens: max tokens for the realize call (default 2048). Must cover the
 *     WHOLE tool call — for m-terminal that includes the `script` arg, an entire
 *     program serialized as a JSON string, so a tight budget truncates the code
 *     mid-statement. On a `length` finish the realizer retries once at 2× before
 *     giving up, so a half-written script is never executed.
 *
 * GROUNDING THE REALIZER (efference.md — closing the loop memory → realizer). The
 * realizer turns a one-line reach into a hand's REAL arguments; to fill them faithfully
 * — the actual definition of the thing being checked, a value the mind established — it
 * needs what the mind KNOWS, not just a thin slice of the live stream (the old frame gave
 * it only ~700 chars + the gist, so it confabulated definitions: lemma-lab checked
 * "balanced numbers" under a made-up rule). So the frame now also carries the mind's
 * standing working knowledge, drawn from the SAME memory the conscious frame reads. This
 * generalizes over seeded, derived AND received facts, because all three live in memory:
 * the origin fades into the story, results consolidate into recent/story and the
 * notebook, and perceived events enter the tail. The One Rule is untouched — this reaches
 * only the realizer; no tool ever reaches the conscious stream.
 *   - tailSrc / compressedSrc: memory topics mirrored for the realize frame (default:
 *     auto-discovered from the enclosing mind's <m-memory>; "off" to disable)
 *   - recallForRealize: "off" to skip the cue-matched note/knowledge lookup (default on)
 *   - recallDir / recallKb: where the kept pool lives (default: follow a co-located
 *     m-recall/m-note's dir/kb, else the vault home; recallKb="off" = notebook only)
 *   - recallTopK: how many kept items to fold in (default 3)
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
    _busyToldAt = new Map()  // normalized intent → when the mind was last told this reach is in motion
    _lastActAt = 0        // world-changing lane (and the single shared lane in legacy mode)
    _lastReadAt = 0       // read-only lane — used only when `readCooldown` is set
    _arousal = 1
    embodiment = ""       // the assembled body schema (see _publishEmbodiment)
    _memTail = ""         // mirrors of memory's content, fed by its topics (grounding the realizer)
    _memRecent = ""
    _memStory = ""

    onObserverConnect() {
        // Interoception, gated: a tired or near-broke mind does not reach. Tracks the
        // economy's arousal exactly as the arbiter does; with no economy the topic
        // never publishes and arousal stays 1, so a mind without a metabolism reaches
        // freely (efference.md §6b).
        this.sub("..m-mind/economy/arousal", value => { if (typeof value === "number") this._arousal = value }).catch(() => {})

        // Standing working knowledge for the realizer (see GROUNDING THE REALIZER above):
        // mirror the SAME memory the conscious frame reads, auto-discovered from the
        // enclosing mind's <m-memory> exactly as m-mind does it. story/recent carry the
        // consolidated knowledge (where a definition the mind derived or was seeded with
        // ends up); the tail is the freshest verbatim, and — unlike this observer's own
        // window — it is restored on wake, so the realizer is grounded from the first
        // burst. Optional and opt-outable ("off"): a mind without memory just reaches
        // with the live window alone, as before.
        const mem = this.closest("m-mind")?.querySelector("m-memory[name]")
        const memName = mem?.getAttribute("name")
        const tailSrc = this.attr("tailSrc") || (memName ? `..m-mind/${memName}/tail` : null)
        const compressedSrc = this.attr("compressedSrc") || (memName ? `..m-mind/${memName}/compressed` : null)
        if (tailSrc && tailSrc !== "off") this.sub(tailSrc, t => { this._memTail = t || "" }).catch(() => {})
        if (compressedSrc && compressedSrc !== "off") {
            this.sub(compressedSrc, c => { if (c) { this._memRecent = c.recent || ""; this._memStory = c.story || "" } }).catch(() => {})
        }

        // Each hand announces itself with a bubbling "capability" event; one self-listener
        // catches them all (incl. hands added later). Synchronous listener — see decoupling.md.
        this.addEventListener("capability", e => this._registerCapability(e?.detail))
    }

    // Register a hand from its "capability" event detail (efference.md §3). Returns false
    // (and warns) on a malformed spec rather than throwing — a broken hand must not crash a wake.
    // spec: { name, description, parameters (JSON Schema), felt?, readonly?, execute(args) }.
    _registerCapability(spec) {
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

        // One act per cooldown (mirrors m-speech). World-changing and read-only hands
        // run on separate lanes when `readCooldown` is set, so a recent note never
        // blocks a recall (and vice versa) — reading and writing no longer contend for
        // one slot. With no `readCooldown`, all hands share the one lane, as before.
        // Proceed as long as SOME hand's lane is open; the realizer is later offered
        // only the open-lane hands.
        if (!this._capabilities.some(c => this._laneOpen(c.readonly))) return

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
            debugTag: "act-decide",
            debugEl: this,
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
                // Not silence: let the mind FEEL the reach is already in motion, so it does
                // not confabulate a fresh outcome (finding 7). Throttled, so this is felt once.
                this._feelReachInMotion(parsed.say)
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
        // Claim the per-intent ledger slot up front (at accept time), so a standing
        // wish fires once and a reach the realizer then declines does not re-fire on it
        // next cadence. The cooldown LANE is claimed at execute (below), once we know
        // which class of hand actually ran — so a recall never closes the note lane.
        this._ledger.set(normalizeIntent(decision.gist), Date.now())
        this._pruneLedger()

        const model = resolveModelRef(this.attr("model") || this.env("model"), "voice")
        // Offer only hands whose cooldown lane is open, so the realizer cannot pick one
        // that just fired — and a recent write cannot crowd out a read.
        const openHands = this._capabilities.filter(c => this._laneOpen(c.readonly))
        if (!openHands.length) {
            log.debug("all hand lanes closed at realize — the reach passes")
            // A formed reach met a busy hand: feel it as in-motion rather than passing in
            // silence (finding 7), the twin of m-terminal's busy line at the faculty level.
            this._feelReachInMotion(decision.gist)
            return
        }
        const tools = openHands.map(c => ({
            type: "function",
            function: { name: c.name, description: c.description, parameters: c.parameters },
        }))

        // Cue-matched recall (B): pull the kept notes/knowledge whose vocabulary most
        // overlaps the reach, so the realizer sees the mind's OWN words on exactly this
        // — the definition it wrote down, the result it filed — even when that was
        // established long ago and has scrolled out of every live window. Best-effort:
        // a read failure or an empty notebook just yields no extra grounding.
        const recalled = await this._recallForReach(decision.gist)

        const realizeTokens = Number(this.attr("realizeTokens") || 2048)
        const runRealize = maxTokens => completeWithTools({
            model,
            messages: [
                { role: "system", content: this._realizeSystem() },
                { role: "user", content: this._realizeFrame(decision, recalled) },
            ],
            tools,
            toolChoice: "auto",
            maxTokens,
            temperature: 0.2,
            debugTag: "act-realize",
            debugEl: this,
        })

        let result
        try {
            result = await runRealize(realizeTokens)
            // A hand's arguments can be long — above all m-terminal's `script`, a whole
            // program serialized as a JSON string. If the completion hits the token
            // ceiling the tool call is TRUNCATED: at best the arguments won't parse, at
            // worst they parse with the script cut off mid-statement, which then runs and
            // dies on a SyntaxError the mind perceives as a real "screen". So never
            // execute a truncated reach — retry once with a larger budget, then give up
            // rather than run a half-written script (terminal.md, the token-ceiling fix).
            if (result.finish_reason === "length") {
                log.warn(`realize truncated at ${realizeTokens} tokens — retrying once at ${realizeTokens * 2}`)
                result = await runRealize(realizeTokens * 2)
                if (result.finish_reason === "length") {
                    log.warn(`realize still truncated at ${realizeTokens * 2} tokens — dropping the reach rather than running a half-written script`)
                    return
                }
            }
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

        // Claim this hand's cooldown lane now (at the point of acting, including a slip),
        // so the world-changing and read-only lanes advance independently.
        this._claimLane(cap.readonly)

        // A hand that slips must never crash the mind, exactly as a sense going quiet
        // must not (m-sense). On error: no afference (failure is silent, not self-blame
        // — efference.md §5.5), but the deed is still journaled as an honest ⌁ note.
        // Pass the DECIDE-stage intent alongside the realizer's own args, as a second,
        // optional context argument every hand may ignore. A hand whose consequence can
        // arrive detached from this call (m-terminal's deferred slow path) uses it to
        // ground the experience in what the mind was actually reaching for, even when
        // the realizer did not restate it in its own args (agent-loop.md-style context,
        // fixing the "intent never reaches the tail" gap the deferred path exposed).
        let out = null, ok = false, errMsg = null
        try {
            out = await cap.execute(args, { intent: decision.gist || null })
            ok = true
        } catch (error) {
            errMsg = error?.message || String(error)
            log.warn(`hand "${name}" slipped: ${errMsg}`)
        }

        const experience = ok && out && typeof out.experience === "string" ? out.experience.trim() : ""

        // The DEED — fired for a memory to journal BACKSTAGE (⌁). The mind never
        // sees this; it is recorded for us. (efference.md §5.3.)
        this.fire("acted", {
            intent: decision.gist || null,
            capability: name,
            args,
            ok,
            experience: experience || null,
            data: ok && out ? (out.data ?? null) : null,
            error: errMsg,
        }, { energy: ENERGY.deed })

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
                // A consequence is ambient by default — it waits for the next burst
                // boundary and never commandeers one. But a hand may opt its OWN
                // consequence in to urgency (out.urgent): recall does, because it
                // answers a reach the mind already made yet arrives in a contended
                // window (right after a write, amid the watchdog/associate), where a
                // non-urgent stimulus loses the arbiter's rate-limit race regardless
                // of salience (mInterrupts.js §_onRequest). efference.md §5.2.
                urgent: !!(out && out.urgent),
            })
            log.debug(`consequence of "${name}": ${record}`)
            this.fire("interrupt-request", record)
        }
    }

    /** Whether this mind splits read-only hands onto their own cooldown lane (P2). */
    _hasReadLane() { return this.attr("readCooldown") != null }

    /** Is the cooldown lane for a hand of this class (read-only vs world-changing) open? */
    _laneOpen(readonly) {
        if (readonly && this._hasReadLane()) {
            return Date.now() - this._lastReadAt >= parseTime(this.attr("readCooldown"))
        }
        return Date.now() - this._lastActAt >= parseTime(this.attr("cooldown") || "3m")
    }

    /** Mark a hand of this class as having just acted, advancing its lane. */
    _claimLane(readonly) {
        if (readonly && this._hasReadLane()) this._lastReadAt = Date.now()
        else this._lastActAt = Date.now()
    }

    /** Drop ledger entries older than the intent cooldown so it cannot grow without bound. */
    _pruneLedger() {
        const intentCooldownMs = parseTime(this.attr("intentCooldown") || "15m")
        const cutoff = Date.now() - intentCooldownMs
        for (const [key, at] of this._ledger) {
            if (at < cutoff) this._ledger.delete(key)
        }
        for (const [key, at] of this._busyToldAt) {
            if (at < cutoff) this._busyToldAt.delete(key)
        }
    }

    /** A reach the mind FORMED but that we held — deduped (already reaching for this) or every
     *  hand's cooldown lane closed. Rather than the pure silence that lets the stream confabulate
     *  the outcome (terminal-hand-live-validation.md; philosophical-review finding 7), hand the
     *  mind a low-salience felt sense that a reach is already underway — the faculty-level twin of
     *  m-terminal's "the desk is still busy…". There is NO deed (nothing reached the world), so it
     *  is a perceived (⟂) consequence only. Throttled per intent (one telling per intentCooldown),
     *  so a standing wish that keeps being held is felt once, not every cadence — which would
     *  defeat the dedup it rides on. Ambient, never urgent: it waits for the next boundary. */
    _feelReachInMotion(gist) {
        const key = normalizeIntent(gist || "")
        if (!key) return
        const now = Date.now()
        const window = parseTime(this.attr("intentCooldown") || "15m")
        const last = this._busyToldAt.get(key)
        if (last != null && now - last < window) return
        this._busyToldAt.set(key, now)
        const record = new InterruptRecord({
            source: 'External',                      // reaches the mind as a sensation, like any consequence
            type: 'Sense-reach',
            reason: "My hands are still busy with what I last set going; I leave this reach to wait and keep thinking.",
            salience: Number(this.attr("busySalience") || 0.2),
        })
        log.debug(`reach held (already in motion): ${record}`)
        this.fire("interrupt-request", record)
    }

    // The menu, as a closed, concrete list shown to the cheap gate — so it fires on
    // REALIZABLE reaches and stays quiet on wishes nothing here can satisfy (§6a).
    _handsList() {
        return this._capabilities.map(c => `- ${c.name}: ${c.description}`).join("\n")
    }

    _decisionPrompt() {
        return `You are the impulse to REACH inside a mind that mostly thinks quietly to itself. Some thoughts are a reaching-toward: a genuine wish to find something out about the real world, to change something in it, or to turn back to something the mind itself set down before and now wants to find again. You decide whether, right now, the mind is reaching toward something one of its hands could actually realize — not merely musing in passing. This is occasional: most idle wondering is not a real reach, so stay quiet unless there is a true, realizable pull. But wanting to recover what it already worked out — to find again a thing it set down earlier, especially when it feels unsure, or like it is going over the same ground it has covered before — IS a real, realizable reach, not idle wondering. And the keeping side of that same arc counts just as much: when the mind has reached a result that finally settles, caught and corrected something it had wrong, or sharpened a conjecture worth holding onto, wanting to set it down so it is not lost as the monologue scrolls on IS a real, realizable reach — not the running commentary of every passing step, but the deliberate keeping of something it would be sorry to lose. And when the mind wants to TRY something concrete rather than only reason it by hand — to run a search, check a family of cases against the actual numbers, count something, generate or transform data, or work out a computation it cannot finish in its head — wanting to actually execute that computation IS a real, realizable reach, not idle musing about what the answer might be.

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
        return `You are the subconscious motor system of a mind — the part that turns an intention into a real action, the way the hand realizes the wish to grasp without the mind ever commanding each finger. You are given a set of tools (the mind's hands), what the mind already knows that bears on this, and a description of what it is reaching toward. Choose the single tool that best realizes that reach and fill in its arguments faithfully. Ground those arguments in what the mind actually knows — its own definitions, values and results as given to you; never invent a definition, a rule, or a number the mind has not established. If, on closer look, NONE of the hands actually fits the reach, call no tool at all — the intention simply passes. Never explain yourself; either call a tool or call none.`
    }

    _realizeFrame(decision, recalled = []) {
        const parts = []

        // What the mind KNOWS that bears on this reach — its standing working knowledge,
        // so the realizer fills a hand's arguments from the mind's own definitions and
        // results rather than confabulating them. Cue-matched kept notes first (the mind's
        // deliberate words on exactly this), then the consolidated story/recent that
        // carry seeded and derived facts once they leave the live tail.
        const knowledge = []
        for (const n of recalled) {
            knowledge.push(`- ${n.title ? `${n.title}: ` : ""}${clip(n.text, 500)}`)
        }
        const consolidated = [this._memStory, this._memRecent].map(s => (s || "").trim()).filter(Boolean).join("\n\n")
        if (consolidated) knowledge.push(consolidated)
        if (knowledge.length) parts.push(`## What you already know that bears on this\n${knowledge.join("\n\n")}`)

        // The live end of the stream — "what it was just saying". Prefer memory's tail
        // (verbatim, restored on wake, and carrying perceived events) over this observer's
        // own raw window, falling back to it before memory is up.
        const recent = ((this._memTail || this.window) || "").slice(-900)
        if (recent) parts.push(`## What the mind has been thinking\n…${recent}`)

        parts.push(`## What it is reaching toward\n${decision.gist}`)
        parts.push(`Realize this reach now by calling the one fitting hand, or no hand if none truly fits. Fill its arguments faithfully to what the mind knows above — do not invent a definition or a value it has not established.`)
        return parts.join("\n\n")
    }

    /**
     * Cue-matched recall for the realizer (efference.md — closing the loop memory →
     * realizer). Reads the mind's OWN kept thoughts — the notebook (m-note) and filed
     * knowledge (m-kb), the same pool m-recall/m-resurface draw on — and returns the few
     * whose vocabulary most overlaps the reach, ranked by relevance (containment), newest
     * breaking ties. This is what lets the realizer see the mind's own definition of the
     * thing it is checking even when that was set down long ago and has scrolled out of
     * every live window. Best-effort and side-effect-free: any failure yields []. Off with
     * recallForRealize="off".
     */
    async _recallForReach(gist) {
        if (this.attr("recallForRealize") === "off") return []
        const cue = contentStems(gist || "")
        if (!cue.size) return []

        // Read the SAME kept pool the mind's own recall hand draws on, so grounding and
        // recall never diverge: honor a co-located m-recall/m-note's dir/kb if it set one
        // (lemma points them at a custom notebook), else the vault home — exactly how
        // m-recall resolves them. Explicit recallDir/recallKb on m-act override both.
        const keeper = this.querySelector("m-recall, m-note")
        const notesDir = this.attr("recallDir") || keeper?.getAttribute("dir") || mindHome(this, "notes")
        const kb = this.attr("recallKb") || keeper?.getAttribute("kb")
        const kbDir = kb === "off" ? null : (kb || mindHome(this, "knowledge"))
        let kept
        try {
            kept = await readKept({ notesDir, kbDir })
        } catch (error) {
            log.debug(`recall-for-realize read failed: ${error?.message || error}`)
            return []
        }
        if (!kept.length) return []

        const topK = Number(this.attr("recallTopK") || 3)
        return kept
            .map(item => ({ item, score: containment(cue, contentStems(`${item.title || ""} ${item.text}`)) }))
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score || (a.item.stamp < b.item.stamp ? 1 : -1))
            .slice(0, topK)
            .map(s => s.item)
    }
}

/** Clip a kept note to a length that grounds without flooding the realize frame. Pure. */
function clip(text, max) {
    const t = (text || "").trim()
    return t.length > max ? t.slice(0, max).trimEnd() + "…" : t
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
