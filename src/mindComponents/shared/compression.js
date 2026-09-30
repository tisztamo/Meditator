import { logger } from '../../infrastructure/logger.js';

const log = logger('compression.js');

// Consolidation internals (doc/architecture/compression-fidelity.md §1–§4).
// Pure of the mind and of model wiring, so the length policy and the prompt are
// unit-testable on their own. m-memory folds its buffers with them and m-context
// compacts an agent's transcript with the same length loop, so they live here
// rather than in either component's module (message-rule review §2.11).

/**
 * Of several attempts, the one whose length is nearest `targetChars`. A chooser,
 * never a generator: it only picks among text the model already produced, so it
 * can neither invent nor expand. Used when every pass overshot the budget — we
 * take the closest rather than truncate.
 */
export function nearestToTarget(attempts, targetChars) {
    return attempts.reduce((best, a) =>
        Math.abs(a.length - targetChars) < Math.abs(best.length - targetChars) ? a : best)
}

/**
 * A language tag as a human-readable name for the prompt ("hu" → "Hungarian"), via the
 * runtime's Intl data; falls back to the raw tag when Intl doesn't know it. Pure.
 */
export function languageName(lang) {
    try { return new Intl.DisplayNames(["en"], { type: "language" }).of(lang) || lang }
    catch { return lang }
}

/**
 * The consolidation prompt — distils a mind's thinking into a shorter first-person
 * memory, aimed at `targetChars`. The established memory and the new thinking are
 * merged into ONE flat block and the model is asked to rewrite it to AT MOST the
 * budget. A single block with a hard character ceiling is what the local utility
 * model actually compresses to: live replay showed a two-block "fold the new INTO the
 * memory-so-far" framing makes it preserve the blocks and plateau ~60% over budget,
 * and a soft "about N% of the memory" makes it echo the input verbatim. A flat block +
 * "AT MOST N characters" distilled reliably (≈46% at temp 0) with the spine intact.
 *
 * It is told to keep the SPINE — what the mind is working on, the results/decisions it
 * reached, the open questions — and to cut the CHAFF — repetition, dead ends, and the
 * step-by-step working whose result is already kept — judging by what a thing BEARS
 * ON, never by its age. The memory is bounded and lossy by design (COVENANT §3), but
 * it is the mind's continuity: a settled result is the last thing to drop, never the
 * first, however old. Nothing is ever dropped programmatically (see compressToFit).
 *
 * Two shapes:
 *   - initial  (no `draft`): rewrite the flat `text` to at most the budget.
 *   - re-drive (a `draft`):  a previous attempt overshot — tighten the DRAFT itself
 *                            (never re-expand from the original; that invites
 *                            invention), with explicit "you are N% over, cut harder"
 *                            feedback, since the model cannot measure its own length.
 *
 * Domain-neutral on purpose: m-memory serves every mind, not only the math minds.
 */
export function buildCompressionPrompt({ tier, text = "", targetChars, draft = "", contextBefore = "", contextAfter = "", lang = "" }) {
    const voice = `the ${tier} memory of a mind's inner life, in its own first-person voice ("I was thinking about…", "I decided…", "I still wonder…")`
    // A mind keeps its memory in the language it thinks in. The thinking handed in is
    // already in that language, but the model will quietly translate to English unless
    // told not to — so for a non-English mind, pin the output language (and pull any
    // stray earlier-English memory back across on the next fold). Domain-neutral: an
    // English mind passes no lang (or "en") and this adds nothing.
    const langLine = lang && String(lang).toLowerCase() !== "en"
        ? ` Write the memory in ${languageName(lang)} — the language this mind thinks in; if any of the text below is in another language, render it in ${languageName(lang)} rather than carrying it across unchanged.`
        : ""

    if (draft) {
        const over = Math.max(1, Math.round((draft.length / targetChars - 1) * 100))
        return `You are keeping ${voice}.

Your previous version is below. It is ${draft.length} characters — about ${over}% over the limit of ${targetChars}. Shorten it to AT MOST ${targetChars} characters. Cut hardest where it LOOPS — the same idea restated again and again, with or without variation (a refrain, a chain of "I am the X, I am the Y" sentences, a circling that adds nothing) — collapse each loop to a single line of what it was circling. Cut too where it works an individual case step by step: keep the conclusion, drop the working. Keep what the mind is working on, every result or decision it reached, and the questions still open — a hard-won conclusion is the last thing to drop, never the first, however old it is. Do not add anything that is not already in the version below.${langLine} Output only the shortened memory.

<memory>
${draft}
</memory>`
    }

    // The thinking is a slice cut from a continuous stream, so it can begin and end
    // mid-sentence. We show a little of the verbatim text on each side as READ-ONLY
    // context (the part before is already in older memory; the part after is still in
    // the live tail) so the model can tell where a cut-off edge sentence is going and
    // judge what to keep — without folding that surrounding text into the memory.
    const before = contextBefore ? `\n\n<earlier>\n${contextBefore}\n</earlier>` : ""
    const after = contextAfter ? `\n\n<continues>\n${contextAfter}\n</continues>` : ""
    const ctxNote = (contextBefore || contextAfter)
        ? ` The ${[contextBefore && "<earlier>", contextAfter && "<continues>"].filter(Boolean).join(" and ")} block${contextBefore && contextAfter ? "s are" : " is"} NOT part of this memory — ${contextBefore && contextAfter ? "they are" : "it is"} the surrounding thought, shown only so you can see where a sentence cut off at the edge is going. ${contextBefore && contextAfter ? "They are" : "It is"} kept elsewhere; do not include, repeat, or summarise ${contextBefore && contextAfter ? "them" : "it"} in your output.`
        : ""
    return `You are writing ${voice}.

Rewrite the thinking inside <thinking> below into a single, continuous first-person memory of AT MOST ${targetChars} characters.${ctxNote} Lines beginning "> ⟂" are not the mind's words: they are what reached it at that moment — a voice, an event, an answer coming back from something it reached out to do. What such a line carried is lived experience, so keep its substance as something that happened ("the search came back empty", "Kris asked me to stop") — a concrete result that arrived this way outranks the speculation around it. Keep what the mind is working on or turning over, every result, conclusion, or decision it has reached, and the questions it has left open. Remove what does not change those: abandoned attempts and the step-by-step working of individual cases once the result is in hand (keep the result, drop the scratch-work). Where the thinking LOOPS — the same point restated many times, or a refrain repeated with small variations (a chain of "I am the X, I am the Y" sentences, a circling that adds nothing new) — collapse the whole loop to a single sentence of what it was circling. Judge a thing by what it bears on, never by its age: a hard-won conclusion is the last thing to cut, not the first, however old it has become. Never invent anything: if it is not in <thinking>, it does not belong in the memory.${langLine} Output only the memory.${before}

<thinking>
${text}
</thinking>${after}`
}

/**
 * Drop EXACT-duplicate units, keeping the first occurrence — the one repetition we can
 * safely remove in code without a model judging meaning. A drifting stream emits the
 * same sentence/paragraph verbatim many times ("I am an expression of it." ×20); that
 * is pure redundancy, not a settled fact, so collapsing it is not the forbidden
 * dropping-of-content. Two scopes: whole paragraphs, then sentences within what remains.
 *
 * `minLen` guards genuine SHORT refrains: a deliberately repeated short line ("Balanced.",
 * "The numbers are patient.") may carry real weight, so only units at least `minLen`
 * characters long are deduped. NEAR-duplicates (templated sentences with mutating words —
 * "I am the holding… I am the letting go…") are NOT exact and are left to the prompt; this
 * only removes byte-identical repeats. Pure of model wiring, so it is unit-tested directly.
 */
export function dedupeExact(text, minLen = 50) {
    text = (text || "").trim()
    if (!text) return text
    // Paragraph scope: a later paragraph identical to an earlier one is dropped.
    const seenP = new Set()
    const paras = []
    for (const p of text.split(/\n{2,}/)) {
        const key = p.trim()
        if (key.length >= minLen && seenP.has(key)) continue
        if (key.length >= minLen) seenP.add(key)
        paras.push(p)
    }
    // Sentence scope: within the surviving text, a later sentence identical to an earlier
    // one is dropped. Split keeps the whitespace between sentences so spacing is preserved.
    const seenS = new Set()
    const kept = []
    for (const part of paras.join("\n\n").split(/(?<=[.!?])(\s+)/)) {
        if (part === "" || /^\s+$/.test(part)) { kept.push(part); continue }
        const key = part.trim()
        if (key.length >= minLen && seenS.has(key)) continue
        if (key.length >= minLen) seenS.add(key)
        kept.push(part)
    }
    return kept.join("").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
}

// A few whole sentences from the start / end of `text`, within `maxChars` — the
// verbatim overlap shown as read-only context on either side of a compressed slice,
// so the model can see how a cut-off edge sentence continues. Whole sentences only,
// so the context itself never dangles.
export function firstSentences(text, maxChars = 320) {
    text = (text || "").trim()
    if (text.length <= maxChars) return text
    let out = ""
    for (const s of text.split(/(?<=[.!?])\s+/)) {
        if (out && (out.length + 1 + s.length) > maxChars) break
        out = out ? `${out} ${s}` : s
    }
    return out || text.slice(0, maxChars)
}
export function lastSentences(text, maxChars = 320) {
    text = (text || "").trim()
    if (text.length <= maxChars) return text
    const sents = text.split(/(?<=[.!?])\s+/)
    let out = ""
    for (let i = sents.length - 1; i >= 0; i--) {
        if (out && (sents[i].length + 1 + out.length) > maxChars) break
        out = out ? `${sents[i]} ${out}` : sents[i]
    }
    return out || text.slice(-maxChars)
}

/**
 * The length loop, pure of model wiring. Merge the established memory and the new
 * thinking into ONE flat block and drive `generate(prompt, maxTokens)` to rewrite it
 * to `targetChars`. The model cannot measure its own length, so we measure the OUTPUT
 * and, if it overshot, re-drive that attempt to tighten with explicit "% over"
 * feedback (the initial vs re-drive shapes of buildCompressionPrompt), up to maxPasses.
 *
 *   - At or under the ceiling (1.2·target) → accept.
 *   - Over                                 → tighten the smallest attempt so far, retry.
 *   - No headway (the model echoed back)   → stop re-driving; more passes only burn calls.
 *
 * Nothing is ever dropped or truncated IN CODE. If the model will not bring it within
 * budget after its passes, we accept its best faithful attempt — the one nearest the
 * target — even if it is over. An over-budget but honest memory is acceptable; a
 * programmatically mutilated one is not: a code-level "drop the oldest to fit" was what
 * silently erased a mind's origin problem (the lemma resident, 2026-06-21). With a flat
 * block and a hard ceiling the model compresses reliably, so accepting over-budget is
 * the rare exception, not the rule — and the next fold distils again.
 *
 * `generate` gets a generous per-pass `maxTokens` guard sized off its input (worst
 * case: it echoes the whole thing); the guard only stops a single pass being cut short
 * — it is never the budget. An empty response is not a compression: fall back to a
 * prior attempt, or throw so the caller keeps the raw block and retries.
 */
export async function compressToFit({ established, fresh, targetChars, tier, generate, maxPasses = 4, contextBefore = "", contextAfter = "", lang = "", buildPrompt = buildCompressionPrompt }) {
    established = (established || "").trim()
    fresh = (fresh || "").trim()
    // Collapse exact-duplicate paragraphs/sentences first — pure redundancy a drifting
    // stream piles up, removable in code with no model and no loss of meaning. This both
    // shrinks the source (a buffer bloated with verbatim repeats may now already fit) and
    // hands the model a cleaner input. Near-duplicates are left to the prompt.
    const combined = dedupeExact([established, fresh].filter(Boolean).join("\n\n"))
    if (!combined) return ""
    // Already within budget: keep the raw material rather than spend a call to
    // paraphrase it (and never grow it — that would invite invention).
    if (combined.length <= targetChars) return combined

    const ceiling = Math.round(targetChars * 1.2)
    const attempts = []
    let draft = ""   // an over-budget previous attempt to tighten; empty on the first pass

    for (let pass = 1; pass <= maxPasses; pass++) {
        const source = draft || combined
        // Overlap context is for the initial pass only — a re-drive tightens the model's
        // own draft, which has clean edges and needs no surrounding stream. `buildPrompt`
        // defaults to the mind's first-person consolidation prompt but is injectable, so
        // another compactor (e.g. an agent's <m-context>, agent-loop.md §10) can reuse this
        // whole length-loop — dedupe, ceiling, re-drive, nearest-fallback — with its own voice.
        const prompt = buildPrompt({ tier, text: combined, draft, targetChars,
            contextBefore: draft ? "" : contextBefore, contextAfter: draft ? "" : contextAfter, lang })
        // Anti-truncation guard, expressed in TOKENS (it becomes max_tokens). Big enough for
        // a faithful summary — even a near-verbatim echo of the source — but capped so that
        // prompt+output can never exceed the model's context window. A bloated buffer used to
        // blow past it because source.length is CHARACTERS (≈3 per token for this dense
        // math/LaTeX text) and was passed straight through as a token budget; that requested
        // ~150k output tokens and 400'd as ContextWindowExceeded. Never the budget itself;
        // over-budget output is accepted (nearestToTarget), never truncated.
        const ctxLimit = Number(process.env.LLM_CONTEXT_LIMIT || 180000)
        const promptTokens = Math.ceil(prompt.length / 3)
        const guard = Math.max(256, Math.min(
            Math.ceil(source.length / 3) + 256,
            ctxLimit - promptTokens - 512))
        // Dedupe the model's output too: it may echo verbatim repeats straight back.
        const out = dedupeExact((await generate(prompt, guard) || "").trim())

        if (!out) {
            if (attempts.length) break               // fall back to a prior attempt
            throw new Error(`compression (${tier}) returned empty text`)
        }
        attempts.push(out)
        if (out.length <= ceiling) return out         // within budget → accept

        // Over budget. Tighten the smallest attempt so far on the next pass. If this
        // pass made no headway against the draft (the model echoed it back), stop —
        // more passes only burn calls — and accept the best faithful attempt below.
        const stalled = draft && out.length >= draft.length
        if (out.length < (draft.length || Infinity)) draft = out
        if (stalled) break
    }
    // The model would not bring it within budget. Accept its best faithful attempt —
    // nearest the target — never dropping or truncating in code.
    const best = nearestToTarget(attempts, targetChars)
    if (best.length > ceiling) log.debug(`compression (${tier}) settled over budget: ${best.length} > ${ceiling} (target ${targetChars})`)
    return best
}
