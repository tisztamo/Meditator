# Jev (System One) integration — phased plan

**Status: design, 2026-09-18. Nothing implemented.** Author: Claude Fable 5.1 at
Kris's request, after reading TypeSafe's announcement, docs and SDK surface, and
the judge/comparator/bidder/loop-detector seams in this repo. Deliberately shallow:
enough to decide the order and the gates, not the code.

## 0. What Jev is, in our vocabulary

TypeSafe AI's Jev is a frontier-class model that does **no generation**. One call:
`POST https://api.typesafe.ai/v1/systemone`, bearer key, JSON body
`{ state, model: "jev-latest", questions }`. `state` is text only (string, object,
or array of strings; 32k tokens for state, 64k total). `questions` is a named map of
three primitive types; answers come back under the same keys:

| type | ask | returns |
|---|---|---|
| `noul` | a yes/no statement, optional `criteria: {true, false}` | `noul` ∈ [0,1], the probability of yes; **no confidence field** |
| `choice` | `criteria: {option: description\|null}` | `choice`, `probabilities`, `confidence` |
| `score` | `criteria: [level0 … levelN]`, 2–10 ordered levels | `score` (expected level), `probabilities`, `confidence`, `legend` |

`confidence` is a statistic of the distribution's peakedness, not a separate
estimate. Vendor claims: 70–500 ms end to end, calibrated probabilities, $0.042 per
million input tokens, output free. Rate limits today 1,200 req/min. Errors 401/422/
429/529, with backoff on the last two. Trained with "RLCD" (calibrated decisions)
instead of RLHF; parallel sampling instead of decoding. All performance numbers are
the vendor's own workflow evals, unverified by us. English-first. No JS chat shape:
it is **not** an OpenAI-compatible endpoint, so it cannot hide behind `complete()`.
An official `@typesafe-ai/sdk` exists (Node 20+, ESM, typed); the endpoint is small
enough that a raw `fetch` is the better fit for us (one dependency fewer, Bun-native,
same `signal`/deadline discipline as `llm.js`).

**Where it lands in the membrane.** The perceptual-membrane doc defines tier 1 as
"a query-conditioned perception model producing structured, non-linguistic evidence:
match scores against declared targets". Jev is exactly that primitive. Everything
that today is a utility-model prompt ending in `Reply in EXACTLY this format` is a
Jev question in disguise: the judge's verdict, the loop detector's LOOPING/SCORE/KIND,
a sense's relevance filter, a search controller's `found`. The two things Jev cannot
do are the two things the mind's voice does: think and speak.

**Privacy.** State leaves the box. Under `local-voice` the judge was deliberately
kept local so the mind's evidence is never graded off-box. A Jev-backed judge is a
*profile* decision (like `cloud`), to be stated in `components.md` and the covenant
compatibility note, not a component default.

## 1. Phases

Each phase has a stop condition. Phases 0–2 need no mind awake. Phase 3 is the
first behavioural use. Phases 4–5 are where the model's shape buys something the
LLM judge cannot give.

### Phase 0 — probe (hours)

- `TYPESAFE_API_KEY` in `.env`; `typesafe` provider in `config/models.yaml` with a
  new field `kind: decision` (existing providers are implicitly `kind: completion`).
- A throwaway script under `architecture/lab/expect-study/analysis/jev-probe.mjs`:
  one arm-P ledger pair as `state: {expected, perceived}`, one `choice` question
  with the three verdicts, print the raw response and wall clock ×10.
- **Stop when** we have seen the real response JSON, real latency from this box,
  and know whether `confidence` is present on `choice` as documented.

### Phase 1 — the `decide()` primitive (a day)

`src/modelAccess/decide.js`, sibling of `complete()`:

```
decide({ model, state, questions, signal, deadline, debugTag, debugEl })
  → { answers, usage, latencyMs }        // or null on soft failure, like complete()
```

- Resolves through `resolveModelRef(ref, role)`; refuses a provider whose `kind` is
  not `decision`. Conversely `complete()` refuses `kind: decision`. The mismatch is a
  config bug and should fail at `loadModelConfig` pre-flight, same as the
  `LOCAL_LLM_BASE_URL` check.
- Usage accounted in `getUsageTotals()` (input tokens, cost from the published
  price; output is free). 429/529 → soft-fail with backoff, never retried inside a
  compare deadline. Dry-run returns a uniform distribution so architectures still
  wake with `MEDITATOR_DRY_RUN=1`.
- Pure helpers: `verdictChoice()` (the three glosses from `judgePrompt` as
  `criteria` descriptions), `readChoice(answer)` → `{ value, confidence, probabilities }`.
- Unit tests with a stubbed fetch; no live call.
- **Stop when** `decide()` has the same failure discipline as `complete()` and the
  role/kind pre-flight catches a misconfigured profile.

### Phase 2 — offline benchmark on the B1 ledger (a day)

The B2 harness already exists: 123 arm-P pairs, 50 blind-labelled by a reader, two
LLM judges at 0.900 agreement, `~1.3 s/call` local. `judge-offline.mjs` gains
`--engine jev` and writes `predictions/judge-offline-jev.jsonl`.

Question design to compare, in one fan-out call per pair (cheap, so ask all):

1. `verdict`: `choice {match, mismatch, insufficient}`, criteria = the three glosses.
2. `has_result`: `noul` "the perception carries a result that can be compared".
3. `contradicts`: `noul` "the perception conflicts with what was expected".
   (2 ∧ 3 → mismatch, 2 ∧ ¬3 → match, ¬2 → insufficient — a decomposition that
   mirrors the two distinctions the LLM judge kept losing.)
4. State as `{expected, perceived}` object **and** as the raw consequence text
   rather than the narration (expect-study §2.5's open point), as separate arms.

Metrics, pre-registered:

| | gate |
|---|---|
| blind agreement on the 50 | ≥ 0.90 (ties the LLM judges) |
| `match` the reader did not call `match` | 0 |
| `mismatch` where reader said `insufficient` | 0 |
| **calibration**: agreement per `confidence` bucket (<0.5, 0.5–0.9, >0.9) | monotone; >0.9 bucket ≥ 0.95 |
| latency p50 / p95 from this box | reported; informs `compareDeadline` |
| cost per pair | reported |

The calibration row is the one that matters. If confidence tracks correctness, the
bidder gets an honest strength for free (`bidderPolicy` already multiplies by
`evaluation.confidence` when finite). If it does not, Jev is a fast tier-2 judge and
nothing more, still worth having, but Phase 5 loses its point.

Second reader on the held-out 20 (Kris, or a different model) is worth more here
than more prompt tuning, as §2.5 said; the shared-rubric caveat applies to Jev too
since the glosses go into `criteria`.

- **Stop when** the table is filled and `doc/research/expect-study.md` gains §2.7.

**Done, 2026-09-18.** Every gate passes on `jev-1.13.0`: 0.940 blind agreement
on the 50, no `match` the reader did not call `match`, no `mismatch` on an
`insufficient`, and calibration monotone with the >0.9 bucket at 1.000 over 74
of 123 pairs. Confidence tracks correctness, so Phase 5 keeps its point.
Winning question set: `verdict` (the `choice`) alone, over the narrated
`{expected, perceived}` — the raw-payload arm scored one pair worse, closing
§2.5's open point. p95 419 ms, so `compareDeadline: 2s` is comfortable.
$0.032 for 738 calls. See [expect-study §2.7](../research/expect-study.md).

### Phase 3 — live judge (one 2 h run, then a second if clean)

`m-judge` gains an engine switch derived from the resolved provider's `kind`: if
`decision`, `_judge()` calls `decide()` with the winning Phase-2 question set and
returns `{ verdict, confidence }` unchanged in shape. No new component, no new
port: the comparator seam was built for exactly this replacement.

- Profile `cloud-jev` (or `judge: jev` under `local-voice`, with the privacy note).
- `lemma-lab-judge.archml` run with `compareDeadline` back at `2s` if Phase-2 p95
  allows; B2's `8s` was sized for an LLM call.
- Compare M3/M5 and the bid trace against the LLM-judge live run. Watch for the
  429 path under a busy mind (1,200 req/min is far above our cadence, but the
  limits are "adjusting dynamically").
- **Stop when** one run completes with no soft-fail storm and verdict distribution
  within the Phase-2 error profile.

**Done, 2026-09-18.** Two hours live on `jev-1.13.0`
(`memory/lemma-lab-judge-jev-20260918t152214z`), then two hours with the text
judge as a control (`…-llm-20260918t172336z`) — §2.5's live judge had never been
run on *either* engine, so the plan's "compare against the LLM-judge live run"
meant running it. **109 judgements, 1 soft failure (an aborted compare, not the
endpoint), 0 rate limits, p50 311 / p95 480 ms against the 2 s deadline,
$0.0026.** Verdicts 89 match / 7 mismatch / 13 insufficient against the control's
96 / 12 / 7, and zero `match` on failed evidence in either arm. Profile is
`local-voice-jev` (not `cloud-jev`: the voice stays local, only the judge leaves
the box). The engine swap is invisible to the mind — M1–M7 differ between arms by
less than between two runs of one arm.

The negative finding is the one to carry: **the verdict never moved a bid.**
`decideBid` is a max over floors, and with `expectedFloor` 0.3 /
`mismatchWeight` 0.6 against a `changeMagnitude` of 0.6–0.8 per hand, salience
was one constant per hand and identical across all three verdicts in both arms.
Calibration is worth buying where it is multiplied into a decision or compared
against a threshold (Phase 4's `matchThreshold`, Phase 5's break), not where it
is one term of a max. See [expect-study §2.8](../research/expect-study.md).

### Phase 4 — first live tier-1 sense (the prize; a week, gated)

**Status: done 2026-09-18** (search `targetMatch`, the first candidate). Tier 1 is
implemented for text and the stop condition is met: one closed-aperture search
reported `found` on a Jev score of 0.86, 6 `noul` calls, 2.1 s, $0.000096, with
`m-feed` declared `tier="1" decider="jev"`. Code: `MSense.ground()` /
`targetMatchQuestion()`, `EdgeEvidence` + `edge-evidence`, `SourceContract.decider`,
`ControlRequest.targetId`, `m-search`'s per-route matcher, `m-expect-ledger`'s
`edge-score` rows. Lab: `architecture/lab/tier1-search/`. Report:
`doc/improvements/prediction-mismatch.md`, "First edge-grounded search". Tier 2
still throws; the Stereotic candidate below is untouched.

Today tiers 1 and 2 **throw at registration**; no live source declares either. Jev
makes tier 1 implementable without leaking language across a closed aperture: the
score is structured, the text stays in the source's private buffer.

Two candidates, pick one first:

- **Search `targetMatch`.** `m-search` currently asks the judge "does this
  candidate match the template"; with `noul` per candidate it becomes a real
  match score reaching the controller while the aperture is closed. This is the
  *lean-versus-edge-grounded* experiment from `prediction-mismatch.md`, unrun
  since design, finally with a tier-1 tool that exists.
- **Stereotic news relevance.** `watchTickers` is an exact-string filter. A
  `score` over `["noise", "mentions", "material to a watched asset"]` before the
  aperture is a query-conditioned sense; the level feeds salience as tier-1
  evidence with provenance, never as `changeMagnitude`. Stereotic is uncommitted
  and needs a live url; treat it as the second candidate.

Plumbing owed: lift the tier-1 throw for a source that declares `tier="1"` **and**
a `decider` model; provenance carries tier and question keys; journal the scores
in the run home like the expect ledger does. Keep the invariants: awareness gate
separate, tier-1 scores never into the tier-0 regulator as change headers.

- **Stop when** one closed-aperture search reports `found` on a Jev score and the
  report says what tier 1 cost and leaked, per the experiment row.

### Phase 5 — loop detector, third variant (two days)

`m-loop-detector` is a five-field format prompt. As Jev: `looping: noul`,
`score: score` (5 levels), `kind: choice {presence, void, spam, content, anxiety,
other}`; vocabulary and "why" are dropped (they were text). Rerun the loop-detector
scoring study as a fourth arm against effector(break) and sensor(LLM). The
finding to date is that the effector beats the LLM sensor; a calibrated,
sub-second sensor is the first one that could plausibly change that. Same DCM and
SAS-1 scoring so the numbers are comparable.

Similar shape, later: interrupt urgency (`m-interrupts` has no model today; keep it
that way unless Phase 4 shows salience needs semantics), memory-compression
keep/drop decisions, `m-agent` govern-seam checks.

### Phase 6 — report and residency

`doc/research/jev-decisions.md`: what a System-One model is to a mind (tier-1
primitive, not a voice), the four measurements, cost per hour against the
utility model, and the residency call: which roles in which profiles go to Jev,
with the privacy line in `components.md` and the covenant §3/§9 note.

## 2. Non-goals

Not a voice, not a realizer, not a memory writer. No images (Jev is text only).
Not a replacement for `m-compare`: tier 0 stays the default and the control arm.

## 3. Risks

- Single vendor, one endpoint, limits adjusting; keep the LLM judge as fallback in
  the same role (profile switch, no code change).
- Calibration is the claim we are buying; Phase 2 tests it before anything live.
- Every state is the mind's own evidence; cloud-only. Profile decision, documented.
- `noul` has no `confidence`; where strength matters use `choice`/`score`, or
  derive strength from `|p − 0.5|·2` and say so in provenance.
- The glosses-as-criteria share a rubric with the reader, same caveat as B2.

## 4. Order and dependencies

0 → 1 → 2 → 3 is strictly serial. 4 and 5 both need 1 and benefit from 2's
calibration answer; they are independent of each other and of 3. If 2 fails the
calibration row, do 3 (a fast judge is still useful) and skip 5.
