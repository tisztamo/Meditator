# Expect study (Phase 3B · B1 / B2)

**Status: two pairs, 2026-09-12.** Not yet the pre-registered ≥3 runs/arm —
Kris asked to pace B1 one pair at a time and reassess; a second pair (run in
reverse order, C first) settled the one open question from the first (§1.4).
See [`architecture/lab/expect-study/README.md`](../../architecture/lab/expect-study/README.md).

## 1. Live `expect` (B1)

**Pair 1.** Arm P: `memory/lemma-lab-expect-p-20260912t062756z/`
(06:27:57Z–08:27:57Z UTC). Arm C: `memory/lemma-lab-expect-c-20260912t082822z/`
(08:28:22Z–10:28:22Z UTC), run immediately after.

**Pair 2** (C first this time). Arm C: `memory/lemma-lab-expect-c-20260912t144149z/`
(14:41:49Z–16:41:51Z UTC). Arm P: `memory/lemma-lab-expect-p-20260912t164444z/`
(16:44:44Z–18:44:46Z UTC) — a first attempt at 16:42:01Z was killed 4s in by a
transient low-memory watchdog trigger (not a real OOM: `dmesg`/`journalctl`
showed no kernel OOM event, `free`'s available memory held ~5.5–5.6Gi steady
throughout; a ~2-minute wait confirmed nothing was lingering before the clean
retry). Both pairs: same origin (the balanced-integers problem, lemma's usual
seed), same `local-voice` profile, all four runs clean SIGINT shutdowns. Raw
numbers: `expect-study-summary.md` in each arm-P home.

| Metric | Pair 1 (P / C) | Pair 2 (P / C) | Decision |
|---|---|---|---|
| M1 fill rate | 0.969 (123/127) | 0.919 (113/123) | both ≥ 0.5 → **proceeds** |
| M2 expect shape | mean 20.3 tok; 25-sample: 19/25 checkable, 6/25 restated intent | mean 18.8 tok; 15-sample: ~12/15 checkable, ~3/15 restated intent | both well above 0.3 checkable → **proceeds, `EXPECT_FIELD` unchanged** |
| M3 settle / latency | 1.000 inside horizon; 315 ms mean | 1.000 inside horizon; 492 ms mean | consistent: predictions settle near-instantly, well inside the 20s horizon |
| M4 hand choice | P: terminal 59.8%, note 33.9%, recall 6.3% / C: terminal 72.7%, note 21.6%, recall 5.8% (P → less terminal, more note) | P: terminal 66.7%, note 26.0%, recall 7.3% / C: terminal 37.1%, note 55.6%, recall 7.3% (P → **more** terminal, less note — the **opposite** direction) | **retracted as a finding** (see §1.4) — this is ordinary run-to-run variation (which sub-problem the mind is working), not a cost of the `expect` envelope. `efference.md` corrected. |
| M5 verdicts | 123/123 insufficient | 113/113 insufficient | consistent, expected: `exactTextCompare` cannot read prose |
| M6 cadence | P 63.51/h vs C 69.43/h (**−8.5%**) | P 61.51/h vs C 62.01/h (**−0.8%**) | **resolved**: pair 1's gap was noise (or an artifact of that pair's particular hand mix), not a structural cost of the comparator. No cause-finding needed before B2. |
| M7 attended fraction | P 0.858; C undefined (no comparator engages without a prediction) | P 0.870; C undefined (same reason) | consistent; still not a real finding for arm C, see below |

This section says what `expect` is. It makes no behavioural claim about prediction improving functioning.

### 1.4 What the second pair settled

**M6 (cadence) is resolved.** Pair 1's −8.5% gap did not replicate — pair 2
shows P and C within 1% of each other. This is run-to-run variance (candidate
sources: which sub-problem the mind is mid-solving, how compute- vs.
write-up-heavy that phase is), not a fixed tax from `runEvidenceCase` or the
`expect` envelope. No further cadence investigation is needed before B2.

**M4 (hand choice) is retracted as a finding, and `efference.md`'s note is
corrected.** Pair 1 alone showed prediction="on" shifting hand share from
`terminal` toward `note` and looked like a real, reportable cost. Pair 2 shows
the **same-sized shift in the opposite direction** — under `prediction="on"`,
arm P did *more* `terminal` and *less* `note`, while arm C did the reverse of
what it did in pair 1. Across two pairs there is no consistent direction, which
is exactly what you'd expect if hand choice tracks the mathematical content of
that particular 2-hour window (verifying a formula by computation vs. writing
up a settled result) rather than whether the realizer's tool schema carries an
optional `expect` field. **The earlier claim that offering `expect` measurably
shifts hand choice does not hold up and should not be treated as established.**

**M7's `attendedFraction: 0` for arm C is confirmed, again, to be a metric
artifact, not a finding** — the `consequence` ledger row is only written by
the live evidence-case path, which arm C never enters (no prediction ⇒ nothing
to compare ⇒ that pathway never runs). This is definitional, not behavioral;
noted twice now so the summarizer's raw JSON isn't misread as "0% attention" in
a future pass over these ledgers.

## 2. Judge (B2)

**Status: passes the gate after two prompt rounds, on both the cloud utility
model and the local one. 0.900 blind agreement over 50 pairs for each, with no
`match` the reader did not also call `match`. Live judge still not run — see
§2.5, and §2.6 for the model comparison.**

### 2.1 Harness fix

`judge-offline.mjs` never called `loadModelConfig()`, so
`resolveModelRef('utility', 'utility')` threw `Unknown model reference
"utility"` before any model call — this harness had never been executed before
2026-09-12. Fixed inline (one added `await loadModelConfig()`), no design change.

### 2.2 First run: 118/123 `match`, and why

Over all 123 arm-P pairs (`utility` role, `local-voice` → openrouter
`deepseek/deepseek-v4-flash`, temp 0, 60 tokens): **118 match, 1 mismatch, 4
insufficient**. A blind read of 30 pairs agreed with only **18/30 = 0.60**, and
in the dangerous direction: bare `ModuleNotFoundError` tracebacks called `match`
at confidence 0.95–1.0.

**The cause was the shape of the ask, not the model's judgement.** Three things
in `judgeCompare.js` compounded:

1. `judgePrompt()` asked for the verdict **first** ("Reply MATCH, MISMATCH, or
   INSUFFICIENT, then a confidence"), so the label was produced before any
   reasoning.
2. `parseJudgeReply()` took the **first** verdict token in the reply.
3. `maxTokens: 60` (the default in both `judge-offline.mjs` and
   `mJudge.js#_judge`) truncated the reasoning that followed.

In the 123 first-run replies, **118 were truncated mid-sentence and 0 ever
emitted a second verdict token** — the snap label was always the recorded one.
Several `match` replies then argued against themselves in their own prose:
*"MATCH … The perception is a runtime error due to a missing module, which
prevents any numerical computation from occurring. Since no numerical results
were produced, the perception cannot confirm, contradict…"* (cut off).

A controlled probe on 49 pairs (34 with error/traceback evidence, same model,
temp 0, no change to `judgeCompare.js`) separated the three:

| variant | `match` on the 34 error pairs |
|---|---|
| as-shipped (verdict-first, 60 tok, first-token parse) | 30 |
| verdict-first, 400 tok, **last**-token parse | 23 |
| **reason-first**, verdict on a final line, 400 tok | **1** |

So raising the token budget alone does **not** fix it — given room, the model
still opens with MATCH and then rationalizes back to it ("the failure does not
contradict the expectation — the intent and action align, so it is a match").
The earlier guess that the prompt needed an explicit *"an error or empty result
is `insufficient`"* rule was treating a symptom: with the verdict last, the
judge handles errors correctly without being told anything about errors, and it
also flips 8/15 non-error pairs off `match` — the over-calling was never
specific to tracebacks.

### 2.3 The fix, in two rounds

Round 0 — **verdict last**. `judgePrompt()` asks for at most three sentences of
reasoning, then a final line `VERDICT: <MATCH|MISMATCH|INSUFFICIENT>
CONFIDENCE: <0-1>`; `parseJudgeReply()` takes the **last** verdict token (the
earlier ones are the reasoning naming its options); a reply truncated before the
final line has no verdict and reads `insufficient`, the safe direction.
`JUDGE_MAX_TOKENS = 400` is exported and used by both callers
(`mJudge.js#_judge`'s default and `judge-offline.mjs`) so the budget cannot
drift apart from the prompt that needs it; `m-judge`'s `maxTokens` attribute
still overrides.

That alone took the full-ledger distribution from 118/1/4 to **50 match / 22
mismatch / 51 insufficient**, removed every `match` on error evidence, and took
blind agreement from 0.60 to **0.767** — still under the gate, and still failing
its second clause (2 of 30 `mismatch` on pairs the reader called
`insufficient`): the judge had started reading *"the check failed to run"* as
*"the world contradicted you"*.

Round 1 — **an explicit "errors are insufficient" clause made things worse**
(0.700). Naming error/crash/*cut-off* output as `insufficient` fixed the error
pairs and broke the kept-note pairs: note excerpts end in `…` by design, and the
judge began reading that ellipsis as a truncated failure. Two separate
confusions were now visible, both about *which question was being asked* rather
than about evidence handling:

- a *look-and-see* expectation ("see whether X or Y") was scored on whether the
  news was good, so a heuristic that came out wrong was called `mismatch`;
- a *keeping* expectation ("set down so it can be found again") was scored on
  whether the elided excerpt proved the content.

Round 2 — **name the three verdicts instead** (adopted). The prompt now carries
one line per verdict, saying what each means rather than what to conclude about
any kind of evidence:

- `MATCH`: the perception is what the expectation said would be there; an
  expectation that was only to see which way something would come out is met by
  a clear result either way, and unwelcome news is still a match.
- `MISMATCH`: the perception shows a result that conflicts with what the
  expectation said would be there.
- `INSUFFICIENT`: the perception carries no result to compare against — an
  error, a crash, an empty output.

`architecture/tests/unit/judge-compare.test.js` gains cases for verdict-last and
for a reply truncated before the verdict line; the case that encoded first-token
parsing was updated. Full suite: 845 pass, 0 fail.

### 2.4 Result: passes the gate

Full ledger, same 123 pairs, same model and temperature: **64 match, 11
mismatch, 48 insufficient**. Every reply ends in a parseable `VERDICT:` line
(0/123 truncated). Of the 34 pairs whose evidence contains an error, 33 are
`insufficient` and the one `match` is correct — that run printed real data and
only then hit a traceback in a later section.

Two blind checks, each labelled against the rubric before any verdict was
visible. The 30-pair set is the one the prompt was iterated against; the 20-pair
set is **held out** — drawn after the wording was fixed, never looked at during
the rounds — and is the honest estimate:

| | reference (30) | held out (20) | combined (50) |
|---|---|---|---|
| **Agreement** | **0.933** | **0.850** | **0.900** |
| Judge `match` where the reader did not | 0 | 0 | **0** |
| Judge `mismatch` where the reader said `insufficient` | 0 | 0 | **0** |

(Scored on the shipped ledger. The same prompt scored 0.900 on the reference 30
during the tuning round — temperature 0 is not determinism, and a point or three
of run-to-run movement on a 30-pair set is the noise floor here.)

Both pre-registered clauses are met: agreement ≥ 0.80 on match-vs-mismatch, and
no `mismatch` on a pair the reader calls insufficient. The five residual
disagreements are boundary calls in the conservative direction — mostly a recall
that returned a *related but different* note, where the reader said `mismatch`
and the judge said `insufficient`.

Ledgers kept for any future re-run without a live run:

- `predictions/judge-offline.jsonl` — current (verdict-last + verdict glosses)
- `predictions/judge-offline-verdict-last-v1.jsonl` — verdict-last only
- `predictions/judge-offline-verdict-first.jsonl` — the original harness

### 2.5 What this does and does not license

`m-judge` is now good enough to grade text predictions offline at the standard
B2 pre-registered. Two cautions before it is wired anywhere consequential:

- The gate was measured against *one reader* (the model running this session) on
  *one mind's* ledger, on a single topic (Weierstrass functions) with a hand mix
  dominated by `terminal` and `note`. It is not evidence that the judge
  generalizes to other minds or other modalities.
- The prompt now contains a rubric the reader also used. Agreement measured this
  way is partly agreement with a shared instruction, not two independent
  readings. A second reader — a different model, or Kris — on the held-out 20
  would be worth more than another round of tuning here.

**B5's `targetMatch` is unblocked by this only in the same narrow sense.** A
search that reports `found` on the judge's word now carries roughly the error
profile in §2.4 — conservative, ~10% disagreement with a careful reader, biased
toward "undecided" rather than toward false positives. Whether the live
condition (`lemma-lab-judge.archml`) should run before the second B1 pair
settles the M6 cadence question (§1.4) is a separate call and unchanged by this
work.

A smaller point for later: `evidenceText` is narrated prose that restates the
intent (`"Checking <intent> — The screen comes back with: …"`), so "perceived"
is topically identical to "expected" by construction. That was the relevance cue
the original answer-first format converted into `match`. Verdict-last defuses
it, but feeding the judge the raw consequence text rather than the narration
would remove it.

### 2.6 Which model judges (local vs cloud)

Nothing in the judge picks a model. `m-judge` resolves `model` → its `model`
attribute, else the ancestor's `utilityModel`, else the `utility` role; the
offline harness takes `MEDITATOR_JUDGE_MODEL` or the same `utility` role. Under
`local-voice` the profile maps **voice → `gpu-local` (ardincoder-1) and utility
→ openrouter `deepseek/deepseek-v4-flash`**, so every run above graded with the
cloud model purely because the judge is a utility-role call. That is a profile
decision, not a comparator decision — the mind's own voice was local throughout.

Re-ran the identical workload (same 123 pairs, same prompt, temp 0) against the
local model via `MEDITATOR_JUDGE_MODEL=gpu-local`:

| | `deepseek-v4-flash` (cloud) | `ardincoder-1` (local) |
|---|---|---|
| match / mismatch / insufficient | 64 / 11 / 48 | 69 / 13 / 41 |
| error-evidence pairs (34) | 33 insufficient, 1 match (correct) | 33 insufficient, 1 match (the same correct one) |
| replies missing the `VERDICT:` line | 0 | 0 |
| blind agreement, reference 30 | 0.933 | 0.900 |
| blind agreement, **held-out 20** | 0.850 | **0.900** |
| combined 50 | **0.900** | **0.900** |
| `match` the reader did not call `match` | 0 | 0 |
| `mismatch` where the reader said `insufficient` | 0 | 0 |
| wall clock, 123 serial calls | — | 2m41s (~1.3 s/call) |

**Both pass the gate, and neither is better.** They are not, however, the same
judge: they agree with each other on only **101/123 = 0.821** of the ledger. The
disagreements concentrate exactly where the reader's own labels were hardest —
11 of 40 `note-kept` pairs, 6 of 8 `recall` pairs, 5 of 75 `terminal` pairs —
and they run in both directions (7 cloud-`insufficient` → local-`match`, 4
cloud-`match` → local-`mismatch`). The local model is slightly more willing to
call a kept note or a recalled note a `match`; the cloud model is slightly more
willing to call a terminal result that came out badly a `mismatch`. On the
held-out set the local model's leaning happened to match the reader's more
often, which is how it wins there — a 1-pair difference, not a real margin.

Practical reading: the judge is **not** a place where the cloud model buys
anything. Running the comparator locally costs ~1.3 s per call, keeps the
mind's own evidence on the box, and scores the same. The residual ~18%
model-to-model spread on boundary pairs is a better argument for treating a
single judge's `match` as soft evidence — and for §2.5's "get a second, genuinely
independent reader" — than either model's headline agreement number is.

Ledger: `predictions/judge-offline-local.jsonl` (the cloud run stays at
`judge-offline.jsonl`).

**Acted on:** the judge is now its own model role. `config/models.yaml` gains a
`judge` role; `local-voice` maps it to `gpu-local` while `utility` stays cloud;
`m-judge` resolves its own `model` attribute, then an ancestor `judgeModel`,
then the role — it no longer follows `utilityModel`, so a mind whose background
work is cloud can still be graded locally. `lemma-lab-judge.archml` says
`model="judge"`. See [configuration](../configuration.md#models).

### 2.7 A System-One judge (Jev), offline — Phase 2

**Status: passes every pre-registered gate, on `jev-1.13.0`, at 0.94 blind
agreement over the 50 and ~300 ms a call. Confidence tracks correctness sharply
enough that Phase 5 keeps its point. The winning question set is the three-way
`choice` with the judge's own glosses as `criteria`, over the narrated state.**

This is Phase 2 of [the Jev plan](../plans/jev-system-one-integration.md): the
same 123 arm-P pairs, graded by a model that answers questions and generates
nothing. `judge-offline.mjs` gained `--engine jev`; it asks all three questions
in **one fan-out call per pair** and writes one file per arm,
`predictions/judge-offline-jev-<state>-r<N>.jsonl`. Two things are crossed:

- **question set.** `verdict` is a `choice` over `{match, mismatch,
  insufficient}` whose `criteria` are the three glosses from `judgeCompare.js`.
  `decomp` derives the verdict from two `noul`s — `has_result` ("the perception
  carries a result that can be compared") and `contradicts` — by 2∧3 → mismatch,
  2∧¬3 → match, ¬2 → insufficient, the decomposition the plan proposed because
  it mirrors the two distinctions the text judge kept losing. Both come out of
  the same call, so the two arms cost one request.
- **state shape.** `narrated` is `{expected, perceived}` with the perception as
  the layer wrote it; `raw` replaces `perceived` with the payload after the
  narration — §2.5's open point, that "perceived" is topically identical to
  "expected" by construction. 77 of the 123 perceptions have a payload to
  strip; the note-kept and recall ones are narration all the way down and are
  unchanged between the arms.

Each arm was run **three times** to measure determinism. 738 calls, no
soft-failures, no 429, **$0.032 total**.

#### A second reader

§2.5 asked for a second, genuinely independent reader rather than more prompt
tuning. This section is scored against one: a fresh blind labelling of **all
123 pairs** against the three glosses, written down before any Jev call was
made, kept at
[`analysis/reader-labels-2.jsonl`](../../architecture/lab/expect-study/analysis/reader-labels-2.jsonl)
(79 match / 10 mismatch / 34 insufficient). The pre-registered 50 is a fixed
hash-chosen subset of those, declared before the labels were written. It is
**not** §2.4's 50 — the first reader's labels were never persisted — so the
0.900 headline there and the numbers below are not the same measurement. Both
LLM judges are re-scored here against the new reader so all rows are comparable.

#### The table

| arm | model | agree/50 | agree/123 | false match (50 / 123) | mismatch-on-insuff (50 / 123) | <0.5 | 0.5–0.9 | >0.9 | p50 ms | p95 ms | $/pair |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `verdict/narrated-r1` | jev-1.13.0 | 0.940 | 0.927 | 0 / 1 | 0 / 0 | 0.667 (15) | 0.882 (34) | 1.000 (74) | 298 | 478 | 0.0000437 |
| `decomp/narrated-r1` | jev-1.13.0 | 0.940 | 0.927 | 0 / 2 | 0 / 0 | 0.700 (30) | 1.000 (72) | 1.000 (21) | 298 | 478 | 0.0000437 |
| `verdict/narrated-r2` | jev-1.13.0 | 0.940 | 0.919 | 0 / 1 | 0 / 0 | 0.667 (15) | 0.839 (31) | 1.000 (77) | 301 | 429 | 0.0000437 |
| `decomp/narrated-r2` | jev-1.13.0 | 0.920 | 0.919 | 0 / 2 | 0 / 0 | 0.655 (29) | 1.000 (75) | 1.000 (19) | 301 | 429 | 0.0000437 |
| `verdict/narrated-r3` | jev-1.13.0 | 0.920 | 0.919 | 0 / 1 | 0 / 0 | 0.667 (15) | 0.844 (32) | 1.000 (76) | 302 | 388 | 0.0000437 |
| `decomp/narrated-r3` | jev-1.13.0 | 0.920 | 0.927 | 1 / 3 | 0 / 0 | 0.679 (28) | 1.000 (72) | 1.000 (23) | 302 | 388 | 0.0000437 |
| `verdict/raw-r1` | jev-1.13.0 | 0.920 | 0.919 | 0 / 1 | 0 / 0 | 0.722 (18) | 0.848 (33) | 1.000 (72) | 306 | 408 | 0.0000421 |
| `decomp/raw-r1` | jev-1.13.0 | 0.900 | 0.919 | 1 / 3 | 0 / 0 | 0.688 (32) | 1.000 (60) | 1.000 (31) | 306 | 408 | 0.0000421 |
| `verdict/raw-r2` | jev-1.13.0 | 0.920 | 0.911 | 0 / 1 | 0 / 0 | 0.611 (18) | 0.882 (34) | 1.000 (71) | 299 | 397 | 0.0000421 |
| `decomp/raw-r2` | jev-1.13.0 | 0.900 | 0.911 | 1 / 3 | 0 / 0 | 0.645 (31) | 1.000 (61) | 1.000 (31) | 299 | 397 | 0.0000421 |
| `verdict/raw-r3` | jev-1.13.0 | 0.920 | 0.911 | 0 / 1 | 0 / 0 | 0.632 (19) | 0.862 (29) | 1.000 (75) | 297 | 380 | 0.0000421 |
| `decomp/raw-r3` | jev-1.13.0 | 0.900 | 0.919 | 1 / 3 | 0 / 0 | 0.655 (29) | 1.000 (64) | 1.000 (30) | 297 | 380 | 0.0000421 |
| `llm/cloud` | — | 0.880 | 0.854 | 0 / 0 | 0 / 0 | — | 0.182 (11) | 0.920 (112) | — | — | — |
| `llm/local` | — | 0.880 | 0.886 | 0 / 0 | 0 / 0 | — | 0.364 (11) | 0.938 (112) | — | — | — |

The bucket columns are agreement within that confidence band, with the band's
size in brackets; a `noul` carries no confidence, so `decomp`'s strength is the
**derived** `|p − 0.5|·2` of the weaker of the two nouls its branch used, and
is labelled `strengthIsDerived` in the ledger. The LLM rows use the judge's own
self-reported `CONFIDENCE:` number, which never lands under 0.5.

Gates, for the recommended arm `verdict/narrated`:

| gate | result | |
|---|---|---|
| blind agreement on the 50 ≥ 0.90 | 0.940 / 0.940 / 0.920 over three runs | **pass** |
| `match` the reader did not call `match` = 0 | 0 on the 50, all three runs | **pass** |
| `mismatch` where the reader said `insufficient` = 0 | 0 on the 50 **and** on all 123, every arm | **pass** |
| calibration monotone, >0.9 bucket ≥ 0.95 | 0.667 → 0.882 → **1.000** (74 pairs in the top band) | **pass** |
| latency p50 / p95 | **300 ms / 419 ms** (738 calls; p99 627 ms, max 1030 ms) | reported |
| cost per pair | **$0.0000437** (~713 input tokens; $0.032 for the whole study) | reported |

All twelve arms pass the calibration and `mismatch`-on-`insufficient` clauses.
`decomp` fails the `match` clause on the 50 in four of its six runs, and posts
2–3 false `match`es on the full 123 against `verdict`'s consistent 1. Neither
LLM judge reaches 0.90 against this reader on the 50 (both 0.880), and neither
reaches the calibration bar.

#### Does confidence track correctness?

**Yes, and this is the result that matters.** On `verdict/narrated`, every one
of the 74 pairs the model answered above 0.9 confidence is a pair the reader
labelled the same way — 74/74, three runs running. Below 0.5 it is right two
times in three, in the band between, around 0.86. The ordering is monotone, the
top band is perfect, and the model puts three-fifths of its answers there. That
is a usable strength signal rather than a decoration: `bidderPolicy` already
multiplies by `evaluation.confidence` when it is finite, and on this ledger that
product would mean something.

The contrast with the text judge is the cleanest part of the table. The LLM
judge says `CONFIDENCE: 0.9` or higher on **112 of 123** pairs and is right on
92% of them; its eleven less-sure answers are right 2 of 11. It is not
*uninformative* — the ordering is monotone there too — but it cannot separate
its own good answers from its bad ones, because a decoded number is a token, not
a statistic of the distribution. Jev's is the latter, and it behaves like it.

So Phase 5 (the loop detector as a fourth, calibrated-sensor arm) keeps its
point, and Phase 4's tier-1 scores can carry an honest strength in their
provenance.

#### Narration versus raw payload

§2.5 guessed that feeding the judge the raw consequence rather than the
narration would remove a relevance cue that the old answer-first prompt turned
into `match`. **It does not help here, and slightly hurts**: `narrated` beats
`raw` by exactly one pair on the 123 in each of the three runs, and by one pair
on the 50 in two of them. The likely reason is that the narration is not only a restatement — it
also carries *which hand was reached with and what was being checked*, and a
model asked "is this the result that was expected" uses that. The cue the old
prompt fell for was an artefact of asking for the label first, and both
verdict-last and a question-shaped ask are immune to it. Verdict: keep the
narrated state; the open point in §2.5 is closed for a decision engine.

#### Stability

Three repeats per arm: `verdict/narrated` gives the identical verdict on
121/123 pairs, `raw` on 122/123. The two wobblers are boundary pairs whose
confidence is near 0.5, which is exactly where a distribution should wobble.
This is sampling, not temperature, so it is not expected to be bit-exact and
the residual is small enough to ignore.

#### Where it still disagrees with the reader

Nine pairs on `verdict/narrated-r1`, and they fall in the same places §2.6
found the models spreading: four of the eight `recall` pairs, three
`note-kept`, two `terminal`. Seven of the nine are the conservative direction
(`insufficient` where the reader committed), and the single full-ledger false
`match` is a recall that returned a note *about* the sought computation rather
than the saved code file — a boundary call the reader could defend either way.
Confidence flags every one of them: all nine sit at or below 0.66, against a
median of 0.95 across the ledger.

#### Caveats

- **The shared-rubric caveat from §2.5 applies, and harder.** The three glosses
  go straight into `criteria`, and the reader labelled against the same three
  glosses. Part of a 0.94 is agreement with a shared instruction.
- One reader, one mind's ledger, one topic, a hand mix dominated by `terminal`
  and `note`. The same warning as §2.4: this is not evidence of generalization.
- The model is pinned in every row: the endpoint resolved `jev-latest` to
  **`jev-1.13.0`**, and each verdict records it. Another version is another
  measurement.
- Every state in this run left the box. That is the profile decision the plan
  reserves for `components.md` and the covenant note, not a component default.

#### What Phase 3 should carry

- **Question set:** `verdict` alone — one `choice`, three glosses as `criteria`,
  `instructions` carrying the question prose. Dropping the two `noul`s costs
  nothing measurable and removes the arm that posts false `match`es. Keep
  `has_result`/`contradicts` in the harness as a diagnostic; they are not the
  live judge.
- **State shape:** `{expected, perceived}` with the narrated perception, which
  is what `m-judge` already has in hand.
- **`compareDeadline`:** p95 is 419 ms with p99 at 627 ms, so the plan's
  proposed **2 s** is comfortable — about three times the worst call observed.
  B2's 8 s was sized for a 1.3 s local LLM call and is no longer needed.
- **Fallback:** the LLM judge stays in the same role behind a profile switch,
  per plan §3.

Harness: `analysis/judge-offline.mjs --engine jev`, scored by
`analysis/jev-metrics.mjs`. Ledgers kept beside the older ones in
`predictions/` (`judge-offline-jev-{narrated,raw}-r{1,2,3}.jsonl`).
