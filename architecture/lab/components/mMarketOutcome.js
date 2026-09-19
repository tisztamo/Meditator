import A from "amanita"
import fs from "node:fs"
import path from "node:path"
import { MSense } from "../../../src/mindComponents/mind/mSense.js"
import { logger } from "../../../src/infrastructure/logger.js"
import { parseTime } from "../../../src/config/timeParser.js"
import { mindHome } from "../../../src/infrastructure/memoryVault.js"
import {
    PREDICTION_EVENT, firePredictionSettlement,
} from "../../../src/infrastructure/predictionContracts.js"
import { fetchStereoticText } from "./stereoticFeed.js"

const log = logger("mMarketOutcome.js")

/**
 * m-market-outcome — the thing that tells the mind it was WRONG about the market.
 *
 * WHY THIS EXISTS. stereotic-lab already thinks in predictions: m-act runs with
 * prediction="on", m-compare indexes the live expectations, m-bid attenuates a
 * percept that matches one and amplifies a percept that contradicts it, and
 * m-expect-ledger writes every prediction down to predictions/ledger.jsonl. What
 * did NOT exist is the only part that makes any of it mean something: a path from
 * the world back to the claim. m-compare settles by exact text. m-judge settles by
 * asking a model whether two pieces of prose agree. Neither of them has ever looked
 * at a price. A prediction that can never be settled is not a prediction; it is a
 * sentence about the future with no consequences, and a mind that produces those
 * forever learns exactly nothing. This component closes that loop for the one kind
 * of claim that reality can actually adjudicate: "asset X will go up/down/nowhere
 * over the next N minutes."
 *
 * THE BLUNT PART, FIRST. The mind's predictions are PROSE, produced by a language
 * model during REALIZE, and most of them are not market claims at all. Read the
 * only prediction row a live run has produced so far:
 *
 *   {"kind":"prediction","capability":"hands","target":{"eventType":"Sense-look"},
 *    "expectText":"to stand on the hill and watch the wind, not be the anemometer"}
 *
 * That is an expectation about what an ACT will be like, not a claim about BTC.
 * m-act's prediction="on" envelope asks the realizer what it expects the act to
 * feel like, so the population of predictions in the ledger is dominated by act
 * expectations. This component is therefore not a settler of "the mind's
 * predictions": it is a settler of the SUBSET that happens to contain an
 * unambiguous market claim, and on the evidence so far that subset may well be
 * empty for long stretches. The right response to that is to report the number,
 * not to loosen the extractor until something matches.
 *
 * EXTRACTION IS DETERMINISTIC, AND IT REFUSES LOUDLY. No model is called. A claim
 * is extracted only when all three of its parts are unambiguous:
 *
 *   SYMBOL     exactly one of the declared `watchTickers` appears. The ticker is
 *              matched CASE-SENSITIVELY on word boundaries ("BTC", not "btc"), so
 *              ordinary English cannot be mistaken for a ticker — without that
 *              rule a mind watching SOL would have "sol" extracted out of a
 *              Spanish quotation, and a mind watching IN or ON would extract
 *              every sentence it ever thought. Lowercase names ("bitcoin") are
 *              matched only if the architecture declares them in `aliases`. Two
 *              different tickers in one sentence is a refusal, not a coin flip.
 *   DIRECTION  exactly one direction family appears (up / down / flat). Both
 *              families present is a refusal. A negator within four words before
 *              the direction word ("BTC will not rise") is a refusal, NOT a flip
 *              to the opposite — "not rise" includes "stay flat", and inferring
 *              "falls" from it would be the extractor inventing a claim. A
 *              conditional ("if", "unless", "depending", "either way") is a
 *              refusal: a conditional prediction cannot be settled
 *              unconditionally.
 *   HORIZON    an explicit duration: "in an hour", "over the next 30 minutes",
 *              "within 2 days", "15m". "today", "tomorrow", "soon" and "later"
 *              are REFUSED — they have no well-defined endpoint, and guessing one
 *              would decide the verdict by the guess rather than by the market.
 *              Two different durations in one sentence is a refusal.
 *
 * Everything refused is recorded as UNSETTLEABLE with the reason. "I could not
 * settle 60% of these, and here is exactly why each one failed" is a finding. A
 * settled-by-guess verdict is not.
 *
 * NO MODEL, ON PURPOSE. complete() on the utility role and the System-One decide()
 * primitive were both available. Neither is used, and adding one would be a net
 * loss here. decide() can only confirm a proposition someone else authored, so it
 * cannot supply the missing symbol/direction/horizon structure — it could only
 * re-grade a claim this extractor already understood. complete() could invent the
 * structure, which is precisely the failure mode to avoid: the extractor would
 * stop failing visibly and start failing invisibly, and every silent
 * hallucination would be laundered into a "settled" row that looks like evidence.
 * The honest artifact of this component is its refusal rate. A model would erase it.
 *
 * WHAT IT COMPARES AGAINST. https://stereotic.com/data/stats/top100_stat.json
 * (67 assets, hard ~100s publish tick), through the shared stereoticFeed cache, so
 * a mind that already runs m-stereotic-prices pays ZERO extra requests. The
 * component holds a BASIS PRICE taken at the moment the prediction was recorded
 * and compares it against the live price once the horizon elapses.
 *
 * THE -100 SENTINEL. In stereotic's change fields, exactly -100.0 is the
 * MISSING-DATA marker, not a -100% move; assets flip in and out of it between
 * ticks. Any change <= -99.999 is read as ABSENT here. It matters because of
 * `settleBy="auto"`: when the extracted horizon lands exactly on a feed window
 * (1h / 4h / 24h / 7d), the feed's own change field for that window is the better
 * measurement than basis-vs-live price — it is the move over exactly the window
 * ending now, whereas the basis price can be up to one publish tick stale. If that
 * field is the sentinel, "auto" falls back to the basis price rather than settling
 * a rise as a 100% collapse. Taken literally the sentinel would make almost every
 * settlement WRONG, and loudly so, which is the worst possible failure for a
 * component whose entire job is to be believed when it says "you were wrong".
 * The price of the rule, stated: a genuine -100% print is indistinguishable from
 * the sentinel and is silently treated as absent.
 *
 * BEING WRONG IS FELT, NOT LOGGED. A settled-wrong prediction becomes a PERCEPT —
 * MSense.perceive(), the same path an ambient price move takes, through the same
 * aperture and the same attention arbitration. That choice is deliberate:
 *
 *   - NOT a bare log line, because the brief asks for it to reach the stream, and
 *     because a mind that cannot feel its own errors is exactly the mind this lab
 *     is trying to stop building;
 *   - NOT a preempt / bypassAdmission interrupt, even though being wrong is the
 *     most informative event in this mind's life. Those powers are for bodily and
 *     urgent things. A market claim going the other way is not an emergency, and a
 *     channel that can seize the stream will eventually seize it during a stretch
 *     of noise. It goes through the gate like everything else and can be lost to a
 *     louder thought — that is correct;
 *   - NOT an m-bid attention bid, because m-bid rides an EXISTING percept's
 *     evaluations. There is no incoming percept here: the horizon elapsing is not
 *     something the senses saw. The outcome has to originate its own percept.
 *
 * SALIENCE, AND WHY RIGHT IS QUIETER THAN WRONG. Ambient price moves sit at
 * 0.30-0.80. A settled-WRONG outcome defaults to 0.92: above everything ambient,
 * so it is heard over a busy market, and it is a single non-repeating event rather
 * than a channel, so it cannot capture the mind the way a loud ambient source
 * could. A settled-RIGHT outcome defaults to 0.35 — quieter than a typical ambient
 * move and barely above the arbiter floor. Confirmation carries less information
 * than surprise, and a mind that gets congratulated at 0.9 every time it is right
 * learns to predict safe things loudly. Being right should feel like a small nod.
 * An UNSETTLEABLE outcome defaults to salience 0, which means it is recorded and
 * never felt: "I could not tell" is bookkeeping, not experience. Every
 * market-settled row carries `felt`, so the record never claims an experience
 * the mind did not have.
 *
 * The felt line is first-person and world-facing, always. It says "I was wrong
 * about BTC", never "the comparator settled ledger row 7". The mechanism must not
 * appear in the mind's own experience, and the ledger row id is mechanism.
 *
 * WHERE TO MOUNT IT. Anywhere, but preferably NOT inside the "market" aperture. If
 * it sits under the market gate, closing the market to think also silences the
 * mind's own accountability — it could shut its eyes precisely when the horizon on
 * a wrong prediction elapses and never learn. Mounting it beside the market region
 * (or at mind level, where MSense degrades to the eager feel() path) keeps
 * "withdraw from the market" and "be told you were wrong" separate. It still
 * honours `bypassAperture` if an architecture insists.
 *
 * RESTART. Open watches are persisted to predictions/market-outcome.json in the
 * mind's home and reloaded on connect, so a horizon spanning a restart still
 * settles: the basis price was written down, and the live price is fetched now.
 * The honest exception: if the process was down for longer than `lateTolerance`
 * past the horizon, the window cannot be reconstructed — this surface only offers
 * fixed windows ENDING NOW, so there is no way to ask what the price was two hours
 * ago. Those are dropped as unsettleable with reason "missed-horizon" rather than
 * settled against a window that is not the one predicted.
 *
 * DORMANT BY DEFAULT. With no `watchTickers` the component does nothing at all: no
 * listener, no fetch, no file, no percept. A mind can mount it and be unchanged.
 *
 * LIMITATIONS, all of them:
 *   - it settles only prose containing one ticker, one direction family and one
 *     explicit duration. Everything else is refused, and on the live evidence so
 *     far that is nearly everything;
 *   - `Prediction.validUntil` is capped at 15 minutes by the contract
 *     (MAX_PREDICTION_LIFETIME_MS), so a prediction saying "in 6 hours" is already
 *     formally expired by m-act long before this component settles it. The horizon
 *     used here is the one the mind SAID, not validUntil. A late "matched" row and
 *     an earlier "expired" row for the same prediction id can therefore both exist
 *     in the ledger. That is a real inconsistency in the record and is why
 *     `fireSettlement` is OFF by default — by default this component writes its own
 *     market-settled rows and does not contradict m-act's lifecycle events;
 *   - price is compared point-to-point. There is no intra-horizon path, so "BTC
 *     will touch 70k" or "BTC will be volatile" cannot be settled and is refused;
 *   - no magnitude claims: "BTC will rise 5%" settles as a rise of any size. The
 *     "5%" is read and discarded;
 *   - one basis price per prediction, taken up to one publish tick (~100s) after
 *     the prediction. For a 15-minute horizon that is up to 11% of the window;
 *   - ONE percept per settling tick. A region admits the first candidate offered
 *     in a burst and drops the rest (measured), so several settlements landing in
 *     the same tick would otherwise let iteration order decide which one the mind
 *     feels. The most informative one is offered (wrong before right before
 *     unsettleable) and the others are recorded with felt:false. A tick holding
 *     two wrong predictions therefore lets the mind feel only one of them;
 *   - it never re-reads ledger.jsonl. Its state is its own store file. Deleting
 *     that file loses every open watch (they are simply never settled).
 *
 * @interface  (plus MSense's name / provenance / timeout / sigma / bypass*)
 *   - watchTickers: comma-separated tickers this component will settle claims
 *     about, e.g. "BTC,ETH,SOL". Default "" — and with no tickers the component is
 *     DORMANT. There is no "all assets" mode: an extractor that matches any of 67
 *     symbols in free prose is an extractor that matches noise.
 *   - aliases: extra lowercase names mapped to a ticker, e.g.
 *     "BTC=bitcoin,xbt; ETH=ether,ethereum". Default "". Aliases are matched
 *     case-insensitively; bare tickers are matched case-sensitively.
 *   - url: the price surface. Default
 *     "https://stereotic.com/data/stats/top100_stat.json".
 *   - scan: which text the claim is read out of — "expect" (the prediction's
 *     representation text alone) or "expect+basis" (that text plus the REALIZE
 *     basis it came from). Default "expect+basis".
 *   - maxHorizon: longest horizon accepted. Default "24h". Longer is refused
 *     ("horizon-too-long") — this is a transient lab mind and holding a watch for
 *     a week is a promise it cannot keep.
 *   - defaultHorizon: horizon assumed when the prose states none. Default "" =
 *     REFUSE. Set it only if you accept that the verdict then depends on your
 *     assumption rather than on what the mind said; settled rows are marked
 *     horizonAssumed in that case.
 *   - flatBand: fraction inside which a move counts as no move. Default 0.002
 *     (0.2%). A directional claim that lands inside the band is recorded
 *     unsettleable ("inside-flat-band"), not wrong — the market did not answer.
 *   - settleBy: "auto" | "price" | "change". Default "auto" (feed change field
 *     when the horizon matches a feed window and the field is not the sentinel,
 *     otherwise basis-vs-live price).
 *   - maxStale: how old the feed's own `updated` stamp for an asset may be and
 *     still count as a price for "now". Default "10m".
 *   - lateTolerance: how far past its horizon a watch may be settled (e.g. after a
 *     restart) before it is dropped as "missed-horizon". Default "10m".
 *   - wrongSalience: salience of a settled-WRONG percept. Default 0.92.
 *   - rightSalience: salience of a settled-RIGHT percept. Default 0.35.
 *   - unsettleableSalience: salience of an unsettleable outcome. Default 0 =
 *     recorded, never felt. Any value <= 0 means the same.
 *   - fireSettlement: "on" | "off". Default "off". "on" also fires the mind-scoped
 *     prediction-settled event so m-expect-ledger writes its own standard settled
 *     row; see the validUntil limitation above before turning it on.
 *   - maxWatch: most open watches held at once. Default 64. Further claims are
 *     recorded unsettleable ("watch-full") rather than silently dropped.
 *   - pollCache: how long one fetch of the surface is shared across all stereotic
 *     senses. Default "100s", the measured publish tick.
 *   - timeout / sigma: the settling tick. Defaults "60s" / "15s". A tick with
 *     nothing due does not fetch anything.
 */
export class MMarketOutcome extends MSense {
    _active = false
    _host = null
    _watch = new Map()        // predictionId -> watch entry
    _slots = new Map()        // symbol -> opaque slot index
    _rev = 0
    _queue = Promise.resolve()
    _ledgerFile = null
    _storeFile = null

    get defaultTimeout() { return "60s" }
    get defaultSigma() { return "15s" }

    ready() {
        this._symbols = (this.attr("watchTickers") || "")
            .split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
        if (!this._symbols.length) {
            log.debug(`[${this._label()}] no watchTickers — market-outcome is dormant.`)
            this._active = false
            return false
        }
        this._aliases = parseAliases(this.attr("aliases") || "")
        this.url = (this.attr("url") || "https://stereotic.com/data/stats/top100_stat.json").trim()
        const scan = (this.attr("scan") || "expect+basis").trim().toLowerCase()
        if (scan !== "expect" && scan !== "expect+basis") {
            throw new Error(`scan must be "expect" or "expect+basis", got ${JSON.stringify(scan)}`)
        }
        this._scanBasis = scan === "expect+basis"
        this._maxHorizonMs = parseTime(this.attr("maxHorizon") || "24h")
        const dh = (this.attr("defaultHorizon") || "").trim()
        this._defaultHorizonMs = dh ? parseTime(dh) : null
        this._flatBand = Number(this.attr("flatBand") ?? 0.002)
        if (!Number.isFinite(this._flatBand) || this._flatBand < 0) {
            throw new Error(`flatBand must be a non-negative fraction, got ${JSON.stringify(this.attr("flatBand"))}`)
        }
        this._settleBy = (this.attr("settleBy") || "auto").trim().toLowerCase()
        if (!["auto", "price", "change"].includes(this._settleBy)) {
            throw new Error(`settleBy must be auto|price|change, got ${JSON.stringify(this._settleBy)}`)
        }
        this._maxStaleMs = parseTime(this.attr("maxStale") || "10m")
        this._lateToleranceMs = parseTime(this.attr("lateTolerance") || "10m")
        this._wrongSalience = unit(this, "wrongSalience", 0.92)
        this._rightSalience = unit(this, "rightSalience", 0.35)
        this._unsettleableSalience = unit(this, "unsettleableSalience", 0)
        this._fireSettlement = (this.attr("fireSettlement") || "off").trim().toLowerCase() === "on"
        this._maxWatch = Math.max(1, Number(this.attr("maxWatch") ?? 64))
        this._ttlMs = parseTime(this.attr("pollCache") || "100s")
        if (!Number.isFinite(this._ttlMs) || this._ttlMs <= 0) this._ttlMs = 100000
        this._active = true
        return true
    }

    onConnect() {
        super.onConnect()
        if (!this._active) return
        const mind = this.membrane()
        // Same lab gate m-expect-ledger uses: this component writes into the
        // private prediction ledger, and that file exists only in a research mind.
        if (mind?.getAttribute("stage") !== "experimental") {
            throw new Error('m-market-outcome connects only in a mind tagged stage="experimental"')
        }
        const dir = mindHome(this, "predictions")
        fs.mkdirSync(dir, { recursive: true })
        this._ledgerFile = path.join(dir, "ledger.jsonl")
        this._storeFile = path.join(dir, "market-outcome.json")
        this._load()
        this._host = mind
        mind.addEventListener(PREDICTION_EVENT, this._onPrediction)
    }

    onDisconnect() {
        if (this._host) this._host.removeEventListener(PREDICTION_EVENT, this._onPrediction)
        this._host = null
        this._active = false
        super.onDisconnect?.()
    }

    // -----------------------------------------------------------------------
    // Recording a claim
    // -----------------------------------------------------------------------

    /** A prediction went by. Extract, or refuse and say why. Never throws into the
     * event dispatch — a market settler failing must not take the mind with it. */
    _onPrediction = event => {
        const prediction = event?.detail
        if (!prediction || typeof prediction !== "object" || typeof prediction.id !== "string") return
        this._record(prediction).catch(error => {
            log.debug(`[${this._label()}] could not take up a prediction: ${error?.message ?? error}`)
        })
    }

    async _record(prediction) {
        const expectText = prediction.representation?.value ?? ""
        const basisText = this._scanBasis ? (prediction.basis?.text ?? "") : ""
        const text = `${expectText}\n${basisText}`.trim()
        const claim = extractMarketClaim(text, {
            symbols: this._symbols,
            aliases: this._aliases,
            maxHorizonMs: this._maxHorizonMs,
            defaultHorizonMs: this._defaultHorizonMs,
        })
        if (!claim.ok) {
            this._append({
                kind: "market-unsettleable", stage: "extract",
                predictionId: prediction.id, actId: prediction.actId ?? null,
                reason: claim.reason,
            })
            return
        }
        if (this._watch.size >= this._maxWatch) {
            this._append({
                kind: "market-unsettleable", stage: "extract",
                predictionId: prediction.id, actId: prediction.actId ?? null,
                reason: "watch-full",
            })
            return
        }

        // The basis price: what the asset cost when the mind made the claim. Taken
        // through the shared cache, so this is free for a mind already watching prices.
        let asset = null
        try {
            asset = (await this._assets())?.get(claim.symbol) ?? null
        } catch (error) {
            log.debug(`[${this._label()}] no basis price: ${error?.message ?? error}`)
        }
        const now = Date.now()
        const reason = basisProblem(asset, now, this._maxStaleMs)
        if (reason) {
            this._append({
                kind: "market-unsettleable", stage: "basis",
                predictionId: prediction.id, actId: prediction.actId ?? null,
                symbol: claim.symbol, reason,
            })
            return
        }

        const entry = {
            predictionId: prediction.id,
            actId: prediction.actId ?? null,
            symbol: claim.symbol,
            direction: claim.direction,
            horizonMs: claim.horizonMs,
            horizonText: claim.horizonText,
            horizonAssumed: claim.horizonAssumed === true,
            hedged: claim.hedged === true,
            issuedAt: new Date(now).toISOString(),
            settleAt: now + claim.horizonMs,
            basisPrice: asset.price,
            basisUpdatedAt: asset.updatedAt,
        }
        this._watch.set(entry.predictionId, entry)
        this._save()
        this._append({
            kind: "market-watch",
            predictionId: entry.predictionId, actId: entry.actId,
            symbol: entry.symbol, direction: entry.direction,
            horizon: entry.horizonText, horizonMs: entry.horizonMs,
            horizonAssumed: entry.horizonAssumed || undefined,
            hedged: entry.hedged || undefined,
            basisPrice: entry.basisPrice,
            settleAt: new Date(entry.settleAt).toISOString(),
        })
    }

    // -----------------------------------------------------------------------
    // Settling
    // -----------------------------------------------------------------------

    /** The settling tick. Nothing due means nothing fetched: an idle watcher costs
     * the far end nothing at all. */
    async onSense() {
        if (!this._active || !this._watch.size) return
        const now = Date.now()
        const due = [...this._watch.values()].filter(e => e.settleAt <= now)
        if (!due.length) return

        let assets = null
        try {
            assets = await this._assets()
        } catch (error) {
            // The feed is down. Say nothing, settle nothing, try again next tick:
            // a network blip must never be recorded as the mind having been wrong.
            log.debug(`[${this._label()}] price surface unavailable: ${error?.message ?? error}`)
            return
        }

        const settled = []
        for (const entry of due) {
            this._watch.delete(entry.predictionId)
            settled.push([entry, settleWatch(entry, assets.get(entry.symbol) ?? null, {
                now,
                flatBand: this._flatBand,
                settleBy: this._settleBy,
                maxStaleMs: this._maxStaleMs,
                lateToleranceMs: this._lateToleranceMs,
            })])
        }

        // ONE percept per tick, and it is the most informative one. Measured: a
        // region admits the FIRST candidate offered in a burst and drops the rest,
        // so offering a right and a wrong in the same tick would have let the order
        // of a Map decide which one the mind got to feel — and half the time the
        // wrong one, the only one that teaches anything, would have been the one
        // thrown away. Sorting wrong ahead of right makes that deterministic. Every
        // outcome is still written to the ledger; the ones that were not offered
        // say so with felt:false, so the record never implies an experience the
        // mind did not have.
        const rank = { wrong: 0, right: 1, unsettleable: 2 }
        settled.sort((a, b) => rank[a[1].verdict] - rank[b[1].verdict])
        let spoken = false
        for (const [entry, outcome] of settled) {
            if (this._emit(entry, outcome, !spoken)) spoken = true
        }
        this._save()
    }

    /** Record it, and — unless this tick has already spoken — let the mind feel it.
     * @returns {boolean} whether a percept was offered. */
    _emit(entry, outcome, speak = true) {
        const salience = outcome.verdict === "wrong" ? this._wrongSalience
            : outcome.verdict === "right" ? this._rightSalience
                : this._unsettleableSalience
        const felt = speak && salience > 0
        this._append({
            kind: "market-settled",
            predictionId: entry.predictionId, actId: entry.actId,
            verdict: outcome.verdict, reason: outcome.reason ?? null,
            symbol: entry.symbol, direction: entry.direction,
            horizon: entry.horizonText, horizonMs: entry.horizonMs,
            horizonAssumed: entry.horizonAssumed || undefined,
            hedged: entry.hedged || undefined,
            basisPrice: entry.basisPrice,
            settlePrice: outcome.settlePrice ?? null,
            movePct: outcome.movePct ?? null,
            settleBy: outcome.settleBy ?? null,
            late: outcome.late || undefined,
            felt,
        })
        if (this._fireSettlement && outcome.verdict !== "unsettleable") {
            try {
                firePredictionSettlement(this, {
                    predictionId: entry.predictionId,
                    status: outcome.verdict === "right" ? "matched" : "mismatched",
                    evaluationIds: [],
                    settledAt: new Date().toISOString(),
                    reason: `market:${entry.symbol}:${entry.direction}`,
                })
            } catch (error) {
                log.debug(`[${this._label()}] settlement event refused: ${error?.message ?? error}`)
            }
        }

        if (!felt) return false
        this.perceive(feltLine(entry, outcome), {
            salience,
            // Opaque: the ticker and the verdict must not sit in front of a closed
            // gate. Only changeMagnitude crosses before admission, and it is enough
            // for the arbiter to know that something loud happened.
            changeKey: `market-outcome:${this._slot(entry.symbol)}:${++this._rev}`,
        })
        return true
    }

    // -----------------------------------------------------------------------
    // Plumbing
    // -----------------------------------------------------------------------

    async _assets() {
        const text = await fetchStereoticText(this.url, { ttlMs: this._ttlMs ?? 100000 })
        return indexMarketPrices(parseMarketPrices(text))
    }

    _slot(symbol) {
        if (!this._slots.has(symbol)) this._slots.set(symbol, this._slots.size)
        return this._slots.get(symbol)
    }

    _label() { return this.attr("name") || "market-outcome" }

    /** One JSON line, `at` first, appended in order — m-expect-ledger's convention
     * exactly, into the same file. Failures are swallowed: the ledger is a record,
     * not a dependency. */
    _append(row) {
        if (!this._ledgerFile) return
        const line = JSON.stringify({ at: new Date().toISOString(), ...row }) + "\n"
        this._queue = this._queue
            .then(() => fs.promises.appendFile(this._ledgerFile, line))
            .catch(() => {})
    }

    _save() {
        if (!this._storeFile) return
        const body = JSON.stringify({ version: 1, watch: [...this._watch.values()] }, null, 1)
        try {
            // Write-then-rename so a crash mid-write cannot leave a truncated store
            // that would silently lose every open watch.
            const tmp = `${this._storeFile}.tmp`
            fs.writeFileSync(tmp, body)
            fs.renameSync(tmp, this._storeFile)
        } catch (error) {
            log.debug(`[${this._label()}] could not persist open watches: ${error?.message ?? error}`)
        }
    }

    _load() {
        try {
            const raw = fs.readFileSync(this._storeFile, "utf8")
            const data = JSON.parse(raw)
            for (const entry of data?.watch ?? []) {
                if (entry && typeof entry.predictionId === "string") {
                    this._watch.set(entry.predictionId, entry)
                }
            }
            if (this._watch.size) {
                log.debug(`[${this._label()}] ${this._watch.size} open prediction(s) carried across the restart.`)
            }
        } catch { /* no store yet, or unreadable: start empty */ }
    }
}

// ---------------------------------------------------------------------------
// Extraction — pure, exported, and the part that is supposed to say no
// ---------------------------------------------------------------------------

const UP = new Set([
    "rise", "rises", "rising", "risen", "rose", "higher", "up", "upward", "upwards",
    "gain", "gains", "gaining", "gained", "climb", "climbs", "climbing", "climbed",
    "rally", "rallies", "rallying", "rallied", "surge", "surges", "surging", "surged",
    "jump", "jumps", "jumping", "jumped", "increase", "increases", "increasing",
    "increased", "above", "pump", "pumps", "recover", "recovers", "recovering",
    "recovered", "strengthen", "strengthens", "appreciate", "appreciates", "rebound",
    "rebounds", "outperform", "outperforms", "breakout",
])

const DOWN = new Set([
    "fall", "falls", "falling", "fallen", "fell", "lower", "down", "downward",
    "downwards", "drop", "drops", "dropping", "dropped", "decline", "declines",
    "declining", "declined", "slide", "slides", "sliding", "slid", "sink", "sinks",
    "sinking", "sank", "crash", "crashes", "crashing", "crashed", "dip", "dips",
    "dipping", "dipped", "decrease", "decreases", "decreasing", "decreased", "below",
    "dump", "dumps", "weaken", "weakens", "weakening", "retrace", "retraces",
    "selloff", "underperform", "underperforms",
    "plunge", "plunges", "plunged", "tumble", "tumbles", "tumbled",
])

/** Deliberately short. "still", "quiet", "range" and "correct" were all candidates
 * and all removed: they are ordinary English a thinking mind uses about itself
 * ("I am still unsure", "a quiet afternoon", "I was correct"), and each one turned
 * a sentence with no market claim in it into a direction. A direction word has to
 * be one that only ever means the price. */
const FLAT = new Set([
    "flat", "unchanged", "sideways", "steady", "stable", "rangebound",
])

/** A negator this close before a direction word makes the claim unreadable, not
 * reversed. "BTC will not rise" leaves both "falls" and "stays flat" open. */
const NEGATORS = new Set([
    "not", "no", "never", "without", "nor", "unlikely", "doubt", "hardly",
    "wont", "dont", "doesnt", "isnt", "wouldnt", "shouldnt", "cant", "couldnt", "fail",
])
const NEGATION_WINDOW = 4

/** A conditional claim cannot be settled unconditionally, so it is not settled. */
const CONDITIONALS = new Set(["if", "unless", "whether", "depending", "either", "provided", "assuming"])

const WORD_NUMBERS = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
    thirty: 30, forty: 40, forty_five: 45, sixty: 60, ninety: 90,
}

const UNIT_MS = {
    minute: 60000, minutes: 60000, min: 60000, mins: 60000, m: 60000,
    hour: 3600000, hours: 3600000, hr: 3600000, hrs: 3600000, h: 3600000,
    day: 86400000, days: 86400000, d: 86400000,
    week: 604800000, weeks: 604800000, w: 604800000,
}

/**
 * Read a settleable market claim out of prose, or refuse with a reason.
 *
 * @param {string} text
 * @param {{symbols: string[], aliases?: Map<string,string>|object,
 *          maxHorizonMs?: number, defaultHorizonMs?: number|null}} opts
 * @returns {{ok: true, symbol: string, direction: "up"|"down"|"flat",
 *            horizonMs: number, horizonText: string, horizonAssumed: boolean,
 *            hedged: boolean} | {ok: false, reason: string}}
 */
export function extractMarketClaim(text, {
    symbols = [], aliases = null, maxHorizonMs = 86400000, defaultHorizonMs = null,
} = {}) {
    if (typeof text !== "string" || !text.trim()) return { ok: false, reason: "no-text" }

    // --- symbol: exactly one, or nothing ---------------------------------
    const aliasMap = aliases instanceof Map ? aliases : new Map(Object.entries(aliases || {}))
    const hits = new Set()
    for (const sym of symbols) {
        // Case-SENSITIVE: "BTC" is a ticker, "btc" in running prose usually is not,
        // and a watched "SOL" must not be found inside ordinary lowercase text.
        if (new RegExp(`(^|[^A-Za-z0-9])${escapeRe(sym)}([^A-Za-z0-9]|$)`).test(text)) hits.add(sym)
    }
    for (const [alias, sym] of aliasMap) {
        if (!symbols.includes(sym)) continue
        if (new RegExp(`(^|[^A-Za-z0-9])${escapeRe(alias)}([^A-Za-z0-9]|$)`, "i").test(text)) hits.add(sym)
    }
    if (hits.size === 0) return { ok: false, reason: "no-symbol" }
    if (hits.size > 1) return { ok: false, reason: "ambiguous-symbol" }
    const symbol = [...hits][0]

    // --- direction: exactly one family, unnegated, unconditional ----------
    const words = (text.toLowerCase().match(/[a-z][a-z']*/g) || []).map(w => w.replace(/'/g, ""))
    for (const word of words) {
        if (CONDITIONALS.has(word)) return { ok: false, reason: "conditional" }
    }
    const families = new Set()
    const positions = []
    words.forEach((word, i) => {
        const family = UP.has(word) ? "up" : DOWN.has(word) ? "down" : FLAT.has(word) ? "flat" : null
        if (!family) return
        families.add(family)
        positions.push(i)
    })
    if (families.size === 0) return { ok: false, reason: "no-direction" }
    if (families.size > 1) return { ok: false, reason: "ambiguous-direction" }
    for (const i of positions) {
        for (let j = Math.max(0, i - NEGATION_WINDOW); j < i; j++) {
            if (NEGATORS.has(words[j])) return { ok: false, reason: "negated-direction" }
        }
    }
    const direction = [...families][0]

    // --- horizon: exactly one explicit duration ---------------------------
    const found = findHorizons(text)
    if (found.length > 1) return { ok: false, reason: "ambiguous-horizon" }
    let horizonMs, horizonText, horizonAssumed = false
    if (found.length === 1) {
        horizonMs = found[0].ms
        horizonText = found[0].text
    } else if (defaultHorizonMs != null && defaultHorizonMs > 0) {
        horizonMs = defaultHorizonMs
        horizonText = "assumed"
        horizonAssumed = true
    } else {
        return { ok: false, reason: "no-horizon" }
    }
    if (!(horizonMs > 0)) return { ok: false, reason: "no-horizon" }
    if (horizonMs > maxHorizonMs) return { ok: false, reason: "horizon-too-long" }

    const hedged = /\b(might|maybe|perhaps|possibly|could|probably|likely|i think|i suspect)\b/i.test(text)
    return { ok: true, symbol, direction, horizonMs, horizonText, horizonAssumed, hedged }
}

/** Every explicit duration in the text, de-duplicated by length. Vague time words
 * ("today", "soon", "later", "tomorrow") are deliberately NOT here: they have no
 * endpoint, and inventing one would decide the verdict by the invention. */
function findHorizons(text) {
    const lower = text.toLowerCase()
    const out = new Map()
    const units = Object.keys(UNIT_MS).filter(u => u.length > 1).sort((a, b) => b.length - a.length).join("|")
    const counts = Object.keys(WORD_NUMBERS).filter(k => !k.includes("_")).join("|")

    // "in an hour", "within 30 minutes", "over the next 2 days", "by 15 minutes"
    const phrase = new RegExp(
        `\\b(?:in|within|over|after|by|for)\\s+(?:the\\s+)?(?:next\\s+)?(?:(\\d+(?:\\.\\d+)?)|(${counts}))?\\s*(${units})\\b`,
        "g")
    // "the next hour", "next 45 minutes" — no leading preposition
    const nextPhrase = new RegExp(
        `\\bnext\\s+(?:(\\d+(?:\\.\\d+)?)|(${counts}))?\\s*(${units})\\b`, "g")
    // "15m", "2h", "3d" — attached only, so a stray "m" cannot become a minute
    const compact = /\b(\d+(?:\.\d+)?)(m|h|d|w)\b/g

    for (const re of [phrase, nextPhrase, compact]) {
        for (const match of lower.matchAll(re)) {
            const digits = match[1]
            const wordNum = re === compact ? null : match[2]
            const unit = re === compact ? match[2] : match[3]
            const n = digits != null ? Number(digits) : (wordNum ? WORD_NUMBERS[wordNum] : 1)
            if (!Number.isFinite(n) || n <= 0) continue
            const ms = n * UNIT_MS[unit]
            if (!out.has(ms)) out.set(ms, match[0].trim())
        }
    }
    return [...out.entries()].map(([ms, t]) => ({ ms, text: t }))
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }

/** "BTC=bitcoin,xbt; ETH=ether" -> Map("bitcoin"->"BTC", "xbt"->"BTC", "ether"->"ETH") */
export function parseAliases(spec) {
    const map = new Map()
    for (const group of String(spec).split(/[;\n]/)) {
        const [sym, list] = group.split("=")
        if (!sym || !list) continue
        const ticker = sym.trim().toUpperCase()
        for (const alias of list.split(",")) {
            const a = alias.trim().toLowerCase()
            if (a) map.set(a, ticker)
        }
    }
    return map
}

// ---------------------------------------------------------------------------
// Prices — a local parser, on purpose
// ---------------------------------------------------------------------------

/** stereotic's missing-data marker in a change field. NOT a -100% move. */
const MISSING_CHANGE = -99.999

/**
 * Parse the stereotic price-stat surface into the few fields settlement needs.
 *
 * This deliberately does NOT import m-stereotic-prices' parser, even though that
 * one is richer. That file belongs to another concern and its exports are free to
 * change; settlement correctness — above all the -100 screening — must not be able
 * to break because a sense was refactored. The duplication is about a dozen lines
 * and buys independence.
 *
 * @returns {Array<{symbol, price, change1h, change4h, change24h, change7d,
 *                  updated, updatedAt}>}
 */
export function parseMarketPrices(json) {
    let data
    try { data = JSON.parse(json) } catch { return [] }
    if (!Array.isArray(data)) return []
    const out = []
    for (const raw of data) {
        if (!raw || typeof raw !== "object") continue
        const symbol = String(raw.symbol || raw.symbolname || "").trim().toUpperCase()
        if (!symbol) continue
        const change = (gecko, native) => screen(num(raw[gecko] ?? raw[native]))
        const updated = num(raw.updated)   // epoch SECONDS on the live surface
        out.push({
            symbol,
            price: num(raw.current_price ?? raw.price),
            change1h: change("price_change_percentage_1h_in_currency", "change1h"),
            change4h: change("price_change_percentage_4h_in_currency", "change4h"),
            change24h: change("price_change_percentage_24h", "change24h"),
            change7d: change("price_change_percentage_7d_in_currency", "change7d"),
            updated,
            updatedAt: updated == null ? null : Math.round(updated * 1000),
        })
    }
    return out
}

export function indexMarketPrices(assets) {
    const map = new Map()
    for (const asset of assets) if (!map.has(asset.symbol)) map.set(asset.symbol, asset)
    return map
}

/** <= -99.999 is "no data", never a move. See the -100 SENTINEL note above. */
function screen(v) {
    if (v == null) return null
    return v <= MISSING_CHANGE ? null : v
}

function num(v) {
    if (v == null || v === "") return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}

/** Horizons that line up exactly with a feed window, where the feed's own change
 * field is the better measurement of the predicted interval. */
const WINDOW_FIELD = new Map([
    [3600000, "change1h"], [14400000, "change4h"],
    [86400000, "change24h"], [604800000, "change7d"],
])

function basisProblem(asset, now, maxStaleMs) {
    if (!asset) return "symbol-not-on-surface"
    if (!(asset.price > 0)) return "no-basis-price"
    if (asset.updatedAt != null && now - asset.updatedAt > maxStaleMs) return "stale-basis"
    return null
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

/**
 * Settle one watch against the live asset row. Pure, so the whole verdict table is
 * testable without a mind, a clock, or a network.
 *
 * @returns {{verdict: "right"|"wrong"|"unsettleable", reason: string|null,
 *            movePct: number|null, settlePrice: number|null,
 *            settleBy: string|null, late: boolean}}
 */
export function settleWatch(entry, asset, {
    now = Date.now(), flatBand = 0.002, settleBy = "auto",
    maxStaleMs = 600000, lateToleranceMs = 600000,
} = {}) {
    const late = now > entry.settleAt + lateToleranceMs
    if (late) {
        // The process was down (or the tick starved) well past the horizon. This
        // surface only offers windows ENDING NOW, so the predicted interval cannot
        // be reconstructed. Dropping it honestly beats grading the wrong window.
        return { verdict: "unsettleable", reason: "missed-horizon", movePct: null, settlePrice: null, settleBy: null, late: true }
    }
    if (!asset) {
        return { verdict: "unsettleable", reason: "symbol-not-on-surface", movePct: null, settlePrice: null, settleBy: null, late: false }
    }
    if (asset.updatedAt != null && now - asset.updatedAt > maxStaleMs) {
        return { verdict: "unsettleable", reason: "stale-settle-price", movePct: null, settlePrice: asset.price ?? null, settleBy: null, late: false }
    }

    const field = WINDOW_FIELD.get(entry.horizonMs)
    const changePct = field ? asset[field] : null   // already -100-screened to null
    let movePct = null
    let via = null
    if (settleBy === "change") {
        if (changePct == null) {
            return { verdict: "unsettleable", reason: field ? "change-field-absent" : "horizon-has-no-feed-window", movePct: null, settlePrice: asset.price ?? null, settleBy: null, late: false }
        }
        movePct = changePct
        via = field
    } else if (settleBy === "auto" && changePct != null) {
        movePct = changePct
        via = field
    } else {
        if (!(asset.price > 0) || !(entry.basisPrice > 0)) {
            return { verdict: "unsettleable", reason: "no-settle-price", movePct: null, settlePrice: asset.price ?? null, settleBy: null, late: false }
        }
        movePct = ((asset.price - entry.basisPrice) / entry.basisPrice) * 100
        via = "price"
    }

    const band = flatBand * 100
    const settlePrice = asset.price ?? null
    const base = { movePct, settlePrice, settleBy: via, late: false }
    if (entry.direction === "flat") {
        return Math.abs(movePct) <= band
            ? { verdict: "right", reason: null, ...base }
            : { verdict: "wrong", reason: "it moved", ...base }
    }
    if (Math.abs(movePct) <= band) {
        // The market did not answer the question. A 0.05% drift is not evidence
        // that "it will rise" was wrong; calling it wrong would manufacture errors
        // out of noise, and this component's whole value is that its errors are real.
        return { verdict: "unsettleable", reason: "inside-flat-band", ...base }
    }
    const went = movePct > 0 ? "up" : "down"
    return went === entry.direction
        ? { verdict: "right", reason: null, ...base }
        : { verdict: "wrong", reason: `it went ${went}`, ...base }
}

/**
 * The line the mind actually experiences. First person, about the WORLD and about
 * having been wrong about it — never about ledgers, rows, comparators or horizons
 * "elapsing". Wrong is stated plainly and without self-flagellation; right is
 * stated briefly and moved on from.
 */
export function feltLine(entry, outcome) {
    const word = { up: "rise", down: "fall", flat: "hold steady" }[entry.direction] || entry.direction
    const span = entry.horizonText && entry.horizonText !== "assumed"
        ? entry.horizonText.replace(/^(in|within|over|after|by|for)\s+/, "over ")
        : "over that stretch"
    const move = outcome.movePct == null ? null
        : `${outcome.movePct >= 0 ? "+" : ""}${outcome.movePct.toFixed(2)}%`
    const at = outcome.settlePrice == null ? "" : `, now at ${formatPrice(outcome.settlePrice)}`

    if (outcome.verdict === "wrong") {
        return `I was wrong about ${entry.symbol}. I thought it would ${word} ${span}; it went ${move}${at}. The market did not agree with me.`
    }
    if (outcome.verdict === "right") {
        return `${entry.symbol} did ${word} ${span}, ${move}${at} — as I thought it would.`
    }
    return `I cannot tell whether I was right about ${entry.symbol}: ${outcome.reason ?? "the world did not answer"}.`
}

function formatPrice(p) {
    if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 })
    if (p >= 1) return p.toFixed(2)
    return p.toPrecision(4)
}

function unit(host, name, fallback) {
    const raw = host.attr(name)
    if (raw == null || raw === "") return fallback
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0 || n > 1) {
        throw new Error(`${name} must be a number in [0, 1], got ${JSON.stringify(raw)}`)
    }
    return n
}

A.define("m-market-outcome", MMarketOutcome)
