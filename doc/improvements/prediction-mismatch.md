# Prediction, mismatch, and top-down search in the senses

**Status: proposed, 2026-09-06.** Follows the review of the
[perceptual membrane](../architecture/perceptual-membrane.md) sketch and
[A world to meet](../architecture/a-world-to-meet.md), which named "my expectations
can be wrong" as a design goal without a mechanism. This note draws on three
research briefs (neuroscience of predictive processing and visual search, text
conditioning in vision-language models, and a survey of the runtime's seams) and
proposes a concrete slice with call and token estimates.

## What the biology actually says

Three findings shape the design; the rest is inspiration.

1. **Search is a positive template, not a falsified absence.** The hypothesis
   "send down a prediction that the item is not there, and finding it is the
   prediction failing" does not match the evidence for what *directs* search.
   Neurons tuned to the target's features fire more before the array appears
   (Chelazzi et al. 1993), matching distractors also light up the frontal eye
   field priority map (Bichot & Schall), and Guided Search combines bottom-up
   salience with top-down feature match into a priority map (Wolfe 2021). Finding
   is a match signal crossing a threshold. The absence intuition is right for one
   thing only: **giving up**. "Not there" is a strategic quitting threshold after
   enough samples (Chun & Wolfe 1996), a separate decision.
2. **Efference copy is the best-evidenced piece.** A copy of the motor command
   predicts the sensory consequence; a match is attenuated as self-caused, a
   mismatch is salient as world-caused (Sommer & Wurtz 2006; comparator model).
3. **Prediction-error-only ascent is elegant but contested.** Rao & Ballard's
   "only the residual goes up" is a good compression heuristic. Walsh et al.
   (2020) show the neural evidence is equally explained by plain adaptation. We
   should build it as a heuristic, not claim fidelity.

Also: target match, novelty, and reward are three distinct signals in the brain
(P3b, P3a, dopamine RPE). The design keeps them apart and does not introduce one
"surprise" scalar.

The "API" from cortex down to a sense is small: multiplicative gain on matching
channels, a baseline shift for template-matching populations, a spatial priority
map, and an efference copy. That is the vocabulary the membrane should expose to a
source.

## What the runtime has today

- An act carries a DECIDE gist into the hand as `ctx.intent`
  (`src/mindComponents/shared/mAct.js:388`). There is no act id and no
  `causedBy`; the field exists only in the membrane doc.
- Consequences return as `Sense-<name>` InterruptRecords with first-person text.
- A source's detector produces `changeMagnitude` and an opaque `changeKey`
  before the aperture sees anything. The aperture is deliberately non-semantic.
- The REALIZE call already reads the tail and emits a tool call (voice model,
  2048-token budget, rare: gated by DECIDE every 8 boundaries and a 3-minute
  cooldown). DECIDE is a 120-token utility call.
- Model access is text only. No content-array or image input exists in
  `llm.js`, and no vision-capable model is configured.
- Nothing computes an expected state anywhere; recall is lexical overlap.

## Three signals, three mechanisms

### A. Efference copy: "I did this, so this change is mine"

The act is the prediction. When the realizer executes a hand, the mind's own
motor command is the best available forecast of what will change.

- Give every executed act an id and thread it with the gist as `ctx.act = { id,
  intent, expect }`. A hand that produces a consequence stamps `causedBy: act.id`
  on it. This is the `causedBy` field the membrane doc already names.
- For a **deterministic world** (the garden scene graph), the world adapter is
  itself a forward model. It can compute the predicted post-act state before
  applying the act and report the observation's `changeMagnitude` as the
  distance from the *predicted* state, not from the previous state. Zero LLM
  calls. A cup I put down being on the table is near-zero change; the cat having
  moved while I did so is full change.
- For narrated or physical sources, fall back to time: a change arriving within
  a short window after an act with a matching `causedBy` is attenuated by a
  fixed factor (soft gain) rather than compared.

This also fixes a bias the membrane review noted: the aperture currently credits
contact debt on admitted changes too. Self-caused matches should credit little;
world-caused mismatches should credit fully.

### B. Expectation mismatch: "I thought the cup would still be there"

The mind's expectation is extracted where it is cheapest and most honest: at the
moment it acts. Extend the REALIZE tool schema so every capability accepts an
optional `expect` string, one sentence describing what the mind anticipates
perceiving. The realizer already sees the tail and the intent; asking it to add
the sentence costs roughly 20 to 40 output tokens on a call that already runs.
No new call, no thought inspection by a separate observer.

The comparison happens in the source's detector, pre-aperture, in one of three
ways depending on the source:

| Source kind | Comparator | Cost |
|---|---|---|
| Deterministic world state | mechanical diff of the predicted scene delta vs the actual delta | none |
| Text observation, short | lexical overlap / negation check against `expect` | none |
| Text observation, open-ended | utility-model judge: `expect` + observation in, `{match: 0..1, unexpected: "…"}` out | ~300 in / ~40 out tokens |

The judge is the only new LLM call in this design and it runs at most once per
act that carried an `expect`. Output feeds `changeMagnitude` (1 - match) and a
`changeKey` derived from the `unexpected` clause. The judge never writes to the
frame; the world's own observation text is what the mind perceives. A mismatch
simply arrives louder, and the percept may carry a typed `unexpected: true` flag
that the frame renders as the existing `> ⟂` line with no extra prose, so the
expectation never enters the tail as a fact.

Guardrail: the expectation must never be able to *create* an observation. The
judge sees the observation as produced by the world; it only scores it. For
vision this becomes essential (see below).

### C. Target template: "I am looking for the red car"

This is the positive template of biased competition, and it maps onto the
membrane's `narrow` state rather than onto prediction.

- Extend `orient('narrow', source)` with an optional `template` string and pass
  it, together with the aperture state and gain, into the materializer and the
  detector: `materialize({ kinds, aperture, gain, template })`. The membrane
  review already asked for the aperture to reach the materializer so soft vision
  can render cheaply. The template rides the same seam.
- A source with a template raises the salience of candidates whose change key
  matches it (multiplicative gain, the feature-similarity model) and may sample
  more often while the template is active. For the garden, the scene graph can
  answer "is anything matching this template in view from here" mechanically.
  For open text, a cheap lexical match suffices at first.
- **Quitting** is a separate, deterministic rule in the region: after N sampled
  views with the template active and no match, the region issues one
  `Sense-<source>` percept "I do not find it here" and drops the template. N and
  the dwell are architecture attributes. This is the one place the absence
  intuition is correct.

The `orient` hand the membrane doc defers is the natural carrier for all of B
and C: its realizer output can include `expect` and `template` fields.

## Precision

The membrane's per-region gain is the precision weight. A mismatch's effect on
salience is `changeMagnitude × gain`; a channel in `soft` therefore surprises
less. Nothing else is needed at this stage. Do not add a learned trust parameter
until a live run shows a channel that should be discounted.

## Vision: does text steer the sense?

For a future vision sense that calls a vision-language model, the answer from the
literature is mostly no.

- In the dominant architecture (frozen encoder, projector, decoder), the vision
  encoder never sees the prompt. Text conditions only the language model's
  attention over already-fixed visual tokens. That is biased **readout**, not
  biased **sensing**. Cross-attention models (Llama 3.2 Vision) are a stronger
  readout but the encoder is still prompt-blind. Only InstructBLIP-style
  connectors condition feature *selection* on the instruction.
- Prompt order matters and is fragile. Placing the question before the image
  measurably shifts patch representations but the answer then under-attends it;
  repeating the instruction before and after the image recovers up to ~19
  points on grounding benchmarks.
- Stating an expectation in the prompt is exactly the condition known to inflate
  false positives (POPE yes-bias, HallusionBench, sycophancy studies). "Look for
  the red car" makes the model more likely to report a red car that is not there.

What genuinely conditions on the query today:

1. **Open-vocabulary grounding models** (Grounding DINO, OWLv2, Florence-2,
   YOLO-World, or Qwen2.5-VL's box output). The text query reshapes what is
   computed from pixels. Florence-2 and OWLv2 run on a small box with millisecond
   latency and no API cost.
2. **Crop-and-zoom loops** (V*, ZoomEye). The query decides which pixels are
   re-encoded at higher resolution. This is foveation as tool use and is the
   direct implementation of the "deliberate foveated image when I look" in
   A world to meet.
3. **Visual prompting** (red circle, Set-of-Mark). Marking the image changes the
   encoding itself.

Recommended vision sense, when it comes:

1. Neutral pass first: caption or generic detection with no expectation in the
   prompt. This is the observation the mind perceives.
2. Template and `expect` go to a **grounding model**, not to the VLM prompt. A
   null grounding result is the "not there" check and outranks a chatty VLM.
3. Only on a grounding hit, crop and re-encode for confirmation, and require a
   bounding box in the structured output. Presence with evidence is much harder
   to hallucinate than presence.
4. If a single VLM call is all the budget allows, echo the instruction before
   and after the image.

For the deterministic garden, none of this is needed: the renderer and the scene
graph are the same state, so grounding is a lookup. The vision question only
becomes real with generated or physical imagery.

## Cost estimates

Assumptions: 8 s tick, DECIDE every 8 boundaries (about 1 per minute), REALIZE
accepted at most every 3 min by cooldown, estimate prices $0.15/M in and $1.00/M
out as in `m-economy`.

| Addition | Calls | Tokens | Cost per awake hour |
|---|---|---|---|
| `expect`/`template` fields on REALIZE | 0 new | +20 to 40 output per act, ≤20 acts/h | < $0.001 |
| Mechanical comparator (garden, world diff) | 0 | 0 | 0 |
| Text judge, per act with `expect` | ≤20/h | ~340 each, ~7k/h | ~$0.002 |
| Template search sampling (text, lexical) | 0 | 0 | 0 |
| Vision neutral pass (Claude image ~1000 to 1600 tokens + ~150 out), per look | per deliberate look, say 10/h | ~15k/h | ~$0.003 at these prices, ~$0.05/h at Claude list prices |
| Grounding model, local | 0 API | 0 | GPU time only |
| Continuous "quiet observer" reading the tail every boundary | 450/h | ~1.5k in each, ~700k/h | ~$0.10/h and rising with tail length |

The last row is the design A world to meet sketched and this note replaces. It
is the only expensive option and it also violates the membrane rule that the
regulator does not read thought content. Binding expectation to acts costs two
orders of magnitude less and produces predictions that are anchored to something
the world will answer.

## Build order

1. `ctx.act = { id, intent, expect }` in `mAct._execute`; hands stamp
   `causedBy` on consequences; `Percept` carries it. Aperture attenuates credit
   for self-caused matches.
2. `materialize({ kinds, aperture, gain, template })` seam in `mRegion.registerSource`.
3. World adapter forward model for the garden: predicted delta vs actual delta as
   `changeMagnitude`. Dry tests: put the cup down (low), cat moves during it
   (high), look where nothing changed (zero).
4. `orient` hand with `expect` and `template`; deterministic quitting rule.
5. Text judge behind a `judge="utility"` attribute, off by default.
6. Preregister two metrics for the garden run: prediction-correction events
   (mismatch percept followed by a revised belief in the tail) and
   template-search outcomes (found / quit / abandoned).

Nothing here inspects thought content, adds a periodic call, or lets the
expectation write into perception. Those are the three properties worth keeping
when the slice grows.
