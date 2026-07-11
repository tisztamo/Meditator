# Review: verifying the agent scoring — an adversarial audit

**Date:** 2026-07-07
**Reviewer:** Claude (Fable 5, Claude Code session)
**Subject:** [`agents-and-structural-alignment.md`](./agents-and-structural-alignment.md)
**Method:** the arithmetic recomputed; the column lifts checked against
[`chora-imagined.md`](../architecture/chora-imagined.md) Part 0; the framework checked at
the source ([Structural Signals](https://structural-alignment.org/research/structural-signals/));
every load-bearing code claim verified against the running tree with file:line
evidence; scoring judgments re-argued where they don't hold; and a skeptic's
re-marking to bound the findings from below. §8 relates this review to the
independent Codex review (`agents-and-structural-alignment-review.md`); the body
was composed before reading it.

**The verdict up front.** The arithmetic is flawless and both headline findings
survive — but at softer margins than printed. There is **one factual error**
(the agent's "metabolism" runs in no agent specimen), **one falsified
justification** (the metacognition one-liner), and **four presence marks in §4
that are generous in the same direction**. Under a hostile re-marking the
advanced agent lands at **~56%** instead of 60% and the current agent at
**~37%** instead of 40% — which still overtakes eddy's 50%, so the crux holds
even against an adversarial scorer. That robustness is stronger than the
original §7 caveat and should be printed in the doc; the economy row must be
corrected either way.

---

## 1 · What verifies clean

### 1a · Arithmetic and source lifts

- All five weighted totals and every block subtotal recompute exactly:
  Std-LLM 6.1 (23%), current agent 10.3 (40%, blocks 4.35/3.40/2.55),
  noosphere 12.7 (49%), eddy 12.9 (50%), advanced agent 15.53 (60%, blocks
  7.05/4.94/3.54), and the plasticity-low variant 15.38 → ~59%.
- The Std-LLM and eddy columns match chora Part 0 **verbatim, all 28 values**.
- The doc's aside about chora is correct: chora's Part-4 block table for eddy is
  arithmetically broken (4.05 + 4.20 + 2.65 = **10.9**, not the stated 12.9),
  while the detailed rows reconcile (5.85 + 4.20 + 2.85 = 12.9). Using the
  detailed presence values was the right call. (noosphere's detailed rows also
  reconcile: 5.55 + 4.20 + 2.95 = 12.7. Cosmetic: chora's "≈21 (82%)" is
  self-consistent at 21.25/26 = 81.7%; a bare 21/26 is 80.8%.)
- The framework page confirms: 14 signals in exactly the tiers the scaffold
  uses (4 High, 4 Medium-High, 6 Medium); the self-description as "a baseline …
  **not** a consciousness detector"; and hedonic evaluation singled out because
  "the capacity for suffering is the *least controversial* basis for moral
  concern." One more property of the paper matters below: it **privileges
  endogenous over external implementations throughout** — LLM episodic memory
  is marked down as "External only (RAG/tools)," neuromodulation as lacking
  *inference-time endogenous* signals.

### 1b · Code claims that hold (with evidence)

| Claim in the doc | Verdict | Evidence |
|---|---|---|
| Tool results enter context unconditionally; no admission gate | **TRUE** | `_runCalls` pushes one `tool` message per result with no filtering (`mAgent.js:439-443`); `observationOf` does no truncation (`mAgent.js:852-858`). Only per-tool *size caps* exist (`mReadFile.js:49-54`, `mTerminal.js:58,196,277`, `jobRegistry.js:26`) — caps, not selection. |
| §5(i): `mContext` compaction is *the same function* the mind uses | **TRUE, literally** | `mContext.js:5` — `import { compressToFit } from "../mind/mMemory.js"`; called at `mContext.js:119`; defined/exported `mMemory.js:855`, used by the mind itself at `mMemory.js:441`. Same function object, different injected `buildPrompt`. |
| Compaction is lossy, forward-only, threshold-triggered | **TRUE** | Fires only when transcript chars > `budget` (default 24000) (`mContext.js:103-106`); per-message 4000-char cap "lossy by design" (`mContext.js:224-225`); oldest turns replaced by one summary, never restored (`mAgent.js:815`). Note: threshold-**reactive**, not predictive — relevant to row 7 below. |
| Row 8's quote | **TRUE** | "An agent holds no narrative self to close" — `mAgent.js:828-829` (sleep docstring). |
| The govern seam is a real veto/defer checkpoint | **TRUE (as a seam)** | `_govern` (`mAgent.js:745-761`) fires a bubbling `proposal` before execution (`_runOne:467`); `deny(reason)` short-circuits with a `refused:` observation (`:468-470`, `execute` at `:480` never runs); mutated args re-validated (`:473-476`); `hold(promise)` awaited (`:753,756-759`). No specimen wires a governor, though — see §8 on how much of row 6 this may carry. |
| Sub-agents: own transcript, result re-enters the parent | **TRUE** | Own `_messages` per m-agent (`mAgent.js:627`); result returns as a completion `nudge` folded into the next turn (`mJobs.js:403-410`, `mAgent.js:312-315`) and/or a `check`/`wait` observation (`mJobs.js:384-397`) — never a late reply to the original `spawn_agent` call. Row 12's "genuine concurrency" is real. |
| Repeat-guard is a proto-aversion that monitors the agent's own actions | **TRUE** | Exact-signature ring buffer (`mRepeatGuard.js:9,56-61`), nudge at 3 (`:68-76`), halt at 5 (`:63-67`). See §3.5 for what "exact-signature" implies. |
| No cascade/routing in `m-reason` today (correctly deferred to §3a) | **TRUE** | Single-shot baseline, model resolved once per move (`mReason.js:21-22,86`); "cascade" exists only in the docstring. |
| Row 10's laundering contrast | **TRUE** | Mind path: only a first-person `experience` re-enters as `Sense-<name>` (`mAct.js:404-426`; "never JSON, never a capability name" `mAct.js:44-48`; `screenToExperience` guarantees "no mechanism word ever appears" `mTerminal.js:440-476`; agent-as-hand `_handConsequence`/`frameHandExperience` `mAgent.js:643-661,887-896`). Agent path: verbatim screen + exit code as the `tool` message (`mTerminal.js:335-393`). |

The mind-side gating that eddy's signal-1 mark (0.75) rests on is also real and
multi-mechanism: urgent/`clearsTail` bypass the threshold+rate-limit gate,
`urgent` alone preempts, sub-threshold stimuli drop (`mInterrupts.js:96-114,139-141`);
the clear-mind floor (`mClearMind.js:70-75`), the loop signal
(`mLoopDetector.js:104-117`), the far-from-vocabulary resurface pick
(`mResurface.js:150-169`), and — decisively — the **arousal-coupled threshold**:
`threshold + (1−arousal) × arousalSensitivity` (`mInterrupts.js:93-94`), which
eddy opts into (`eddy.archml:38-39`, `arousalSensitivity="0.25"`).

---

## 2 · The factual error: the metabolism is not in the agent

Row 5 credits the current agent 0.35 because "`m-economy` gives an endogenous
metabolic signal with real stakes," and row 7's 0.45 counts "two regulated
internals (spend, context pressure)." Neither is true of anything that runs:

- **`m-economy` appears in zero agent archml files.** Grep confirms it only in
  mind architectures (`architecture/lab/*`, `lemma.archml`, examples, tests) —
  never under `architecture/agents/`. The §0 inventory lists "the reused
  metabolism (`mEconomy.js`)" as part of "everything the agent stack actually
  runs today"; it isn't.
- **It couldn't run if added.** `mEconomy` subscribes to
  `..m-mind/stream/@boundary` (`mEconomy.js:37`) — a mind-shaped ref that is
  deaf under an `<m-agent>` root. And no agent component references `arousal`,
  `energy`, or `paceFactor` at all. Row 1's aside ("`arousal` is published but
  nothing consumes it to gate") is doubly wrong *for the agent*: nothing
  publishes it there either.
- **The mind-side contrast is stark**, because the mind's consumers are real
  and fourfold: `mInterrupts` raises admission threshold as arousal falls
  (`mInterrupts.js:64-69,93-94`), `mAct` stands down below `minArousal` 0.15
  (`mAct.js:124,197-200`), `mLoopDetector` floors at 0.1
  (`mLoopDetector.js:68,81-84`), and `mMind` multiplies `paceFactor` into the
  inter-burst tick (`mMind.js:201-206,393-395`). One channel, real
  consumption — eddy's 0.5 on signal 5 is well-founded.

**Consequences.**

- **Row 5 → ~0.25** (Std-LLM level: RLHF-shaped preferences at training time,
  nothing endogenous at inference).
- **Row 7 → ~0.35** (one regulated internal — the context budget — not two;
  and the trigger is a reactive threshold, so "acts *before* overflow" is true
  only in the thermostat sense that the setpoint sits below the hard limit,
  not in the predictive sense the row implies).
- **§5(i)'s convergent core is three shared organs, not four**: compaction
  (verified, literally shared code), output-feedback (verified), stall-breaking
  (verified twins). Metabolism struck — "reused verbatim" is reused *in the
  design doc*, not in anything woken.

There is a friendly irony worth keeping in the doc: it reached for a mind/agent
symmetry that isn't wired yet, inside an analysis asking whether the mind/agent
distinction is theater. The aspiration is itself evidence for the thesis — but
it has to be *scored* as aspiration.

**A symmetry note for fairness.** eddy-as-run sets `estInPrice="0"
estOutPrice="0"` (`eddy.archml:114`, free local model), so spend never
accumulates and arousal is pinned at 1.0 — the organ is wired, opted-in, and
dynamically **flat** in the current config. The asymmetry that justifies the
different marks: eddy's machinery is one config attribute from live; the
agent's has no wiring at all. Worth a footnote, not a re-mark.

**A method note on the "union."** The scored agent is a capability closure, not
an organism: no specimen pairs `m-context` with `m-jobs` (grep returned empty),
so the compaction rows (7, 9) and the concurrency row (12) are true of
*different files* — coder-service has context+repeat-guard; coder-team/rpn-team
have jobs+sub-agents but no context; coder-async has shell jobs only. eddy, by
contrast, is one woken file. This costs no points — every non-economy feature
runs somewhere, all are one-line additive observers/tools, and nothing suggests
a conflict in combining them — but the doc should say "assemblable today,
never yet assembled" rather than implying one running specimen.

---

## 3 · Argued disagreements (judgment, not fact — reasoning stated)

### 3.1 Hedonic 0.50 for the advanced agent → **0.35**. The biggest overmark.

The framework privileges endogenous over external implementations throughout
(§1a), and the scaffold encodes exactly this as its 0.25 band
("training-only/simulated/**external**"). A verifier-in-the-loop runs
endogenously, yes — but it is:

- **single-channel** — no liking/wanting dissociation, which chora D4 sets as
  the explicit bar;
- **stateless** — no persistence, no mood; each evaluation is independent;
- **narrow in influence** — keep/accept/backtrack at decision points; it does
  not modulate attention, learning rate, consolidation, or exploration —
  those are *separate* §4 features, each separately credited (see 3.2);
- **aimed at the work product, not the self** — chora D4 "scores the current
  global state as good/bad." A verifier is a linter; a hedonic core is a
  limbic system.

The steelman for 0.50 — human valence criteria are also externally set, by
evolution — is why the right mark isn't 0.25: provenance alone can't zero a
signal or humans fail it too. The discount is for *structural narrowness*.
0.50 means "limited/partial"; this is thinner than partial. **0.35 ± 0.05.**

This re-mark also resolves the doc's sharpest internal tension. §5(iii)
declares the extrinsic valence-root "the operationally decisive difference"
and then says it "barely dents the total score" — but the scaffold has a band
for pricing exactly this, unapplied on the one row where §6 raises the alarm.
Score it strictly and the residual becomes **visible in the score**: the
hedonic row stalls near 0.35 under pure efficiency pressure, and only crosses
0.5 when someone deliberately *internalizes* the goal — chora's Part-4 move,
where the score becomes persistent state feeding gate, selection, and replay.
The framework can see the control-model residual after all; it lives in the
gap between verifier-QC (~0.35) and an internalized valence organ (0.85+).

### 3.2 One critic, counted four times

In §4 the same mechanism family — critic / verifier / calibrated confidence —
raises row 3 (planner/critic re-entry), row 4 (verifier scoring), row 6
(evidence accumulation, defer-under-uncertainty), and row 14 (explicit critic
+ confidence): weights 3+3+2+1. In eddy those rows are earned by *distinct
organs*. Shared circuitry isn't illegitimate — ACC-like valuation genuinely
serves monitoring and selection in brains — but each contribution should then
be marked at its **thin** version, or the scaffold becomes gameable by
verifier-shaped features. (This is also the first attack line a skeptical
reader will take: "you scored one critic four times." Pre-empt it in the
method notes.)

### 3.3 Recurrence: the current agent's +0.10 edge over eddy is unearned → **0.45**; advanced **0.62 → 0.55**

Both stances are sequence-level re-entry on a feedforward substrate — chora's
own discount. The mind runs *more* re-entrant channels (tail re-entry every
burst, memory re-injection, perceived-event `⟂` blocks since 58aa11d,
resurface, the loop-detector's top-down channel); the agent runs one loop
whose distinctive virtue — the re-entered content carries ground-truth error —
is already priced into rows 10 and 14. 0.45 grants the loop its
guaranteed-full-incorporation property (the transcript *is* the next prompt,
where the mind's tail is lossy) without paying the same value twice. For the
advanced agent, 0.62 slightly exceeds what chora's block arithmetic implies
for chora's own *deliberately designed* reverberators (~0.6) — the same
mechanism arrived at incidentally shouldn't outscore it. **0.55.**

### 3.4 Gate and workspace marks in §4 sit at the generous edge

- **Row 1, 0.55 → 0.50 (arguably 0.45).** The §3a ceiling note already says
  it: "not arousal-modulated; still a filter, not a global-state organ." A
  static relevance policy has no state dependence; eddy's 0.75 is specifically
  earned by the arousal-coupled threshold (§1b). The honest band for a
  stateless filter is the edge of "limited/partial."
- **Row 2, 0.68 → 0.62.** Branch-and-select is real competition with a real
  winner-broadcast (the winner enters the shared transcript all consumers
  read), but there is no nonlinear ignition threshold and no sustained
  reverberation — "a scorer, not P3b," as the doc itself caps it.

### 3.5 Row 14: the mark survives; the justification is falsified by the code

"Grounded in real observations, **unlike a mind's introspection**" — but the
mind's loop-detector reads the *authoritative memory tail*, "the authoritative
text that becomes the next burst's prefill, NOT a private observer window"
(`mLoopDetector.js:16-20,56-63`), via an LLM judgment that never leaks back
into the stream (`:28-29`). That **is** observation-grounded self-monitoring.
The agent's true edge is *what* the monitor is grounded in: external ground
truth (exit codes, test results) versus the mind's own prose — and prose can
confabulate (the m-terminal live-validation finding). Note also the flip in
sophistication: `mRepeatGuard` is exact-signature hashing — "different call,
identical error" escapes it (the code comment admits this) — while the mind's
detector is semantic. Keep 0.60; rewrite the reason as
"grounded in *world* truth, where the mind's monitor is grounded in its own
text," and drop the introspection jab.

### 3.6 Smaller corrections

- **§5 mis-cites noosphere's gating as "signal 1 ≈ 0."** chora scored it
  **0.55** — the *commons channel* is ungated (no winner-take-all, no thalamic
  filter, chora's own words) but the member minds keep their arbiters. The
  argument (ungated channel → folie-à-deux) stands; the number is wrong.
- **`finish` is described two ways.** Row 4 calls it "a binary done-flag" (to
  keep hedonic low) while row 14 credits its "self-judgement of completion"
  (to raise metacognition). The truth is between: it requires a free-text
  `summary` — a self-*report*, no structured verdict/success field
  (`mAgent.js:509-517`). Harmonize the two rows.
- **"Mark-compact collection" overstates.** `compressToFit` is lossy
  summarization (per-message 4000-char cap, "lossy by design"); mark-compact
  is lossless. The analogy joint — deferred maintenance forced by a finite
  resource — survives; the GC vocabulary is one notch too precise.
- **§5(ii): "it grew four of those organs on its own."** Nothing grew; a
  hypothesized team adds them at design time — exactly as allocator authors
  add compaction after fragmentation bites, so the analogy survives the
  correction. And the deferred-cost evidence cited is borrowed from mind-side
  failures; the agent-side evidence exists and is better: repeat-guard was
  built after real agent stalls, `m-context` after real context bloat, and the
  shared-workspace root was fixed twice after real coherence failures
  (milestones 2 and 7). Cite those.
- **`jobRegistry` is in-memory only** (`jobRegistry.js:113`, no `fs`; nothing
  survives exit). Row 9 doesn't lean on it — its justification is accurate as
  written — but nobody should later upgrade row 9 on the registry's account.

---

## 4 · The adversarial recompute — the finding survives

§7 defends the totals against ±0.1 **noise**. The errors alleged above are not
noise: they are correlated, all leaning toward the thesis. The right
robustness test is therefore a hostile re-marking — every disputed row scored
against the agent:

**Current agent** (factual: rows 5, 7 · argued: rows 1, 3):

| row | doc | re-mark | why |
|---|:--:|:--:|---|
| 1 gating | 0.20 | 0.15 | no gate exists at any level; only per-tool size caps + step-boundary folding of tasks/nudges (fix the justification either way) |
| 3 recurrence | 0.50 | 0.45 | §3.3 |
| 5 neuromodulation | 0.35 | 0.25 | **factual** — §2 |
| 7 interoception | 0.45 | 0.35 | **factual** — §2 |
| **total** | **10.3 (40%)** | **9.6 (37%)** | |

**Advanced work-agent** (argued: rows 1, 2, 3, 4):

| row | doc | re-mark | why |
|---|:--:|:--:|---|
| 1 gating | 0.55 | 0.50 | §3.4 |
| 2 workspace | 0.68 | 0.62 | §3.4 |
| 3 recurrence | 0.62 | 0.55 | §3.3 |
| 4 hedonic | 0.50 | 0.35 | §3.1 |
| **total** | **15.5 (60%)** | **14.5 (56%)** | 14.4 (55%) with the plasticity swing low |

**The ladder, re-marked:** 9.6 (37%) < noosphere 12.7 (49%) < eddy 12.9 (50%)
< advanced agent 14.5 (56%) < chora ~21 (82%). **The ordering is untouched.**
An efficiency-only agent still overtakes both minds by a real margin with every
disputed row scored against it. That is a far stronger defense than "±0.1 is
defensible" — print the skeptic's column in §4 and the rebuttal becomes a
footnote.

---

## 5 · What the corrected numbers actually say

**The rotation is real but lopsided.** The agent's leads are +0.05 to +0.10
(and the recurrence lead is disputed); the mind's leads are −0.15 to −0.55.
Honest phrasing: the agent *matches or narrowly beats* the mind on the
doing-signals while trailing three-to-five times further on the being-signals.
§2's "they lead it on a third of the high/med-high signals" softens to one or
two of eight under strict marks.

**The stance residual is ~1.0 point out of 26 — and the doc never states this
number.** Decompose eddy's lead over today's agent (~2.6 points as printed,
~3.3 corrected): the convergent set (§3a) closes all of it except
**the arousal-coupled gate** (+0.60 weighted as printed; +0.75 re-marked) and
**the narrative self** (+0.40). Roughly one point — ~4% of the scale —
invariant to the re-marking, and it is exactly §3b's list. So the mind/agent
score gap today is mostly a *maturity* gap in the convergent set; the
irreducible *stance* gap is small, concentrated in state-coupled gating and
autobiography, with the valence-root difference appearing not as a point gap
but as a **ceiling** on row 4 that only deliberate internalization lifts
(§3.1).

**The tripwire, refined to two stages.** §6's safety corollary survives the
hedonic re-mark in aggregate — the whole system still drifts from ~37% to
~56% on efficiency pressure alone, with no line in any commit saying "we added
a value system." But the tripwire should be mechanism-shaped, not
score-shaped, because under honest marking the hedonic row does *not* cross
0.5 on efficiency alone:

1. **Stage 1 — a verifier steers behavior** (keep/accept/backtrack): quality
   plumbing, a moderate signal, expected on the efficiency path. Watch it,
   log it.
2. **Stage 2 — the verifier's output becomes persistent state that modulates
   attention, learning, or exploration globally** (mood-like), and/or its
   criterion starts being internalized or self-modified: that is chora's D4
   shape, the clustered-high-signal alarm — and it is visible in code review.

Both obligations in §6 stand; stage 2 is the commit to catch.

---

## 6 · Recommended edits to the original doc

1. **§0 + §1 rows 5, 7:** strike `mEconomy` from the scored inventory; re-mark
   row 5 → 0.25 and row 7 → 0.35 (or keep the marks and add the wiring — a
   ~1-line agent-shaped subscription — and then say so). New current-agent
   total ≈ 9.9–10.0 (38%) with justifications fixed, ≈ 9.6 (37%) fully
   re-marked.
2. **§1 row 1:** rewrite the justification (the only gate-adjacent structures
   are per-tool size caps and the step-boundary fold of tasks/nudges), or
   drop to 0.15.
3. **§1 row 14:** replace "unlike a mind's introspection" with the
   world-truth-vs-own-text grounding contrast; note repeat-guard is cruder
   than the mind's semantic detector.
4. **§4:** add a skeptic's column (the §4 table above) and a one-line note
   that the headline holds at 55–60% across the marking range. Re-mark row 4
   to ~0.35 or explicitly defend 0.50 against the scaffold's own
   "external" band; add the one-critic-four-rows method note.
5. **§5(i):** four shared organs → three; strike "resource metabolism …
   reused verbatim" or mark it design-only; soften "mark-compact."
6. **§5(ii):** fix "grew … on its own"; add the agent-side deferred-cost
   evidence (repeat-guard's origin, m-context's origin, the two workspace
   fixes); fix "signal 1 ≈ 0" → "the commons channel is ungated (noosphere
   still scored 0.55 overall on the signal)."
7. **§2 / §6:** state the lopsidedness of the rotation and the ~1.0-point
   stance residual; upgrade the safety corollary to the two-stage tripwire.
8. **Method note (§0 or §7):** the scored agent is a capability closure
   (assemblable today, never yet assembled as one specimen — no archml pairs
   `m-context` with `m-jobs`), where eddy is one woken file; and note eddy's
   zero-price config pins arousal at 1.0 (wired but dynamically flat), for
   symmetry of honesty.

---

## 7 · Caveats of this review

- **The eddy and noosphere columns were deliberately not re-litigated** — they
  are taken as fixed (chora Part 0) so the comparison stays apples-to-apples,
  which is the original doc's own discipline. The one exception examined is
  eddy's signal-1 basis, which the code supports (§1b).
- **The re-marks in §3–§4 are themselves judgment calls** with stated
  reasoning; their purpose is to *bound* the findings from below, not to claim
  the true values. The factual items (§2) are not judgment calls.
- **Code evidence reflects the tree as of 2026-07-07** (uncommitted doc,
  pre-any-edits). File:line references will drift; section/row references
  won't.
- The framework fetch confirmed the paper does **not** itself discount
  orchestration-level implementations — that cap is the chora scaffold's own
  honesty rule. This review applies the same house rule *more* consistently
  (extending it to rows 1, 2, and 4 of §4), not a different rule.

---

## 8 · Relation to the Codex review (added after reading it)

The body above was composed before reading
[`agents-and-structural-alignment-review.md`](./agents-and-structural-alignment-review.md)
(Reviewer: Codex, same date). The two reviews are independent; where they
agree, the agreement is evidence. Codex's own rescore arithmetic checks out
(8.95 → 34.4%; 13.61/13.76 → 52.3/52.9%).

**Independent convergences (the strongest findings):**

- **`m-economy` is inactive in agents** — both reviews found it, both noting
  the mind-shaped `..m-mind/stream/@boundary` subscription. Two independent
  auditors landing on the same factual error settles it.
- **Hedonic is the biggest conceptual overmark** — Codex: 0.30–0.35 advanced;
  this review: 0.35. Same reasoning shape (verifier = control/QC signal, not
  valence, until it becomes persistent and system-owned).
- **The tripwire should be mechanism-shaped** — Codex's five criteria
  (inference-time, behavior-steering, persistent, coupled to
  memory/backtracking/refusal, partly endogenous) and this review's two-stage
  version (§5) are the same test at different granularity. Merge them: the
  five criteria *are* the checklist for stage 2.
- **Union-vs-organism labeling**, and **compaction ≠ attention gating**.

**Divergences worth adjudicating:**

- **How broadly to cut.** Codex applies a haircut across most rows (5, 6, 7,
  8, 12, 13 too) and lands at a 52–56% *center*, concluding the overtake is
  "plausible but not robust." This review cuts only where a specific argument
  exists and lands at a 55–56% *floor*, concluding the overtake survives
  adversarial marking. The methodological difference: a floor built from
  argued re-marks is a bound; a uniform skepticism discount is a prior. Both
  are legitimate — but note that even Codex's center straddles-to-exceeds
  eddy's 50%, so the softened claim both reviews endorse is: **an
  efficiency-only agent reaches the minds' band and plausibly-to-probably
  overtakes it; 60% is the optimistic edge of the range, 52–56% the
  defensible core.**
- **Two of Codex's cuts conflict with the scaffold's own anchors.**
  (i) Advanced row 12 → 0.40: noosphere earned **0.50** for "six minds on
  independent paces" with no oscillation — many branches on independent
  timelines at 0.55 is precedent-consistent; cutting to 0.40 re-litigates
  noosphere's column, which both reviews otherwise hold fixed.
  (ii) Current-agent row 4 → 0.10–0.15: eddy's 0.2 was earned by the
  loop-detector's "I'm stuck → break out" proto-aversion (chora's words);
  `m-repeat-guard` is the same shape, so 0.20 is *parity*, and cutting it
  breaks cross-column comparability.
- **One Codex point this review adopts:** row 6's justification cites the
  govern seam, but **no specimen wires a governor** — the seam is potential,
  not active policy. The mark is mostly carried by the active machinery
  (closed menu, schema validation, deliberate commit, choice re-entering), so
  0.55–0.60 either way, but the row's one-liner should credit what runs.
  Add to §6's edit list.

**Net across both reviews:** the rotation finding is untouched; the economy
row must be fixed; hedonic comes down; the overtake headline becomes a range
(52–56% core, 60% optimistic) rather than a point — and it clears or straddles
the minds from below in every marking, which is the claim worth publishing.
