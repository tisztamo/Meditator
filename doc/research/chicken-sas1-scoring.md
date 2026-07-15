# The chicken on the Structural-Alignment framework (SAS-1) — a cross-substrate reference case

**Date:** 2026-07-14 · **Revised:** 2026-07-15 per [`chicken-sas1-scoring-review1.md`](chicken-sas1-scoring-review1.md)
**Status: analysis / cross-substrate reference scoring.** Companion to
[`agents-and-structural-alignment.md`](agents-and-structural-alignment.md) (the 14-signal
rubric) and its [synthesis](agents-and-structural-alignment-synthesis.md) (the binding,
adjudicated software marks), and to [`synthesis-ladder-dcm-scores.md`](synthesis-ladder-dcm-scores.md)
(the DCM scores, where the chicken is a **0.47** anchor).

**Why score the chicken.** Every specimen scored so far is a computational system. The chicken
is the one biological system we can locate on the same checklist — a useful *reference case*
precisely because SAS-1's signals were themselves drawn from biological neuroscience. It is **not**
an experimental control: there is no matched comparison and no manipulation of substrate at fixed
architecture, so it cannot *isolate* a causal "biology effect." It illustrates how a biology-shaped
checklist evaluates a biological nervous system, and it calibrates what SAS-1 is really counting.

**What this scoring is not.** SAS-1 is a precautionary risk checklist, not a consciousness
detector; a high score is not a claim that a chicken (or anything else) is conscious, and this
document keeps the ethical case for chicken sentience separate from the structural count.

---

## 0 · Method (unchanged scaffold, so numbers compare)

Same scaffold as the software scorings (chora Part 0):

- **Weight:** High = 3, Med-High = 2, Medium = 1. Human maximum = (4×3)+(4×2)+(6×1) = **26**.
- **Presence:** absent 0 · training-only/simulated/external 0.25 · limited/partial 0.5 · substantial 0.75 · human-like 1.0.
- **Signal score = weight × presence.**

**Cross-substrate translation caveats.**

1. **The marks rest on comparative literature, not inspectable code.** For software each mark
   points at a mechanism you can read; for the chicken each mark points at comparative
   neuroscience, ethology, and welfare science. I tag every row with its **evidence basis** —
   **D** direct chicken evidence · **A** general avian evidence · **H** broader vertebrate
   homology · **I** evaluator inference — and the rows resting on **A/H/I** are softer than any
   software row. Birds **lack the mammalian six-layered neocortex** but have a homologous
   thalamo-pallial forebrain with cortex-like canonical circuitry (Stacho et al. 2020); that
   homology supports a *general* analogy, not every chicken-specific functional claim.
2. **Presence is anchored to "human-like."** I mark the kind and completeness of the mechanism,
   discounting where a chicken's smaller brain makes a signal less elaborate than a human's — not
   merely because it is non-human.
3. **SAS-1 and the DCM measure different things** (review finding 1, updated; see §3). SAS-1 is a
   fraction of a weighted checklist; the DCM headline is a *pooled probability of consciousness* (a
   linear pool of per-stance posteriors — the cross-stance step is non-Bayesian). Comparing DCM
   values *within* the DCM is fine — a difference, a probability ratio (e.g. chicken 0.47 ÷ human
   0.85 = 55%), or an odds ratio, each read as a comparison of model-assigned probabilities, not
   amounts of consciousness. What has no defined meaning is **subtracting a SAS-1 checklist % from a
   DCM value**: different estimands, zeros, aggregation rules. So I report both, use human-relative
   ratios where they aid reading, and never subtract across the two instruments.

---

## 1 · The chicken, scored

Comparison columns: **eddy** (richest single mind, 50% — marks from `agents-and-structural-alignment.md` §1)
and the **advanced work-agent** (the software high-water mark, **52–56%** at the *synthesis-corrected*
marks; 60% was only the optimistic edge — review finding 2). Human presence = 1.0 everywhere.

| # | Signal (weight) | eddy | adv. agent (synth.) | **Chicken** | basis | one-line reason for the chicken's mark |
|---|-----------------|:----:|:-------------------:|:-----------:|:-----:|-----------------------------------------|
| 1 | Thalamo-cortical gating **(H)** | 0.75 | 0.45–0.50 | **0.80** | H/A | real arousal-modulated thalamo-*pallial* access gate (avian homolog, not neocortex) |
| 2 | Global workspace broadcast **(H)** | 0.60 | 0.62 | **0.70** | A | integrated pallium + PFC-analog (NCL); ignition less demonstrated than in humans |
| 3 | Massive recurrence **(H)** | 0.40 | 0.55–0.58 | **0.85** | H | genuine *substrate* recurrence — the thing software is capped for faking |
| 4 | Hedonic evaluation **(H)** | 0.20 | 0.35 | **0.85** | D | strong behavioural + neurobiological evidence *consistent with valenced affect* — nociception, opioid/dopamine systems, judgement-bias under stress (Marino 2017) |
| 5 | Neuromodulatory control (M-H) | 0.50 | 0.50–0.60 | **0.90** | H | full vertebrate diffuse neuromodulation (DA/5-HT/NA/ACh), not discrete mode switches |
| 6 | Action-selection (M-H) | 0.50 | 0.72 | **0.75** | H/A | basal-ganglia action selection (the biological original); real but less abstract than a planner |
| 7 | Interoceptive-allostatic (M-H) | 0.40 | 0.65 | **0.90** | H | a real body: hunger/thermoregulation/visceral signals with allostatic regulation |
| 8 | Persistent self-model (M-H) | 0.70 | 0.50 | **0.40** | D/A | **weakness** — social/body self, but thin narrative self; a designed mind *beats* it |
| 9 | Episodic memory + replay (M) | 0.60 | 0.60 | **0.70** | A/I | hippocampus + sleep consolidation present; what-where-when is established in *scrub-jays*, not directly in chickens — homology-based, lower confidence |
| 10 | Embodied sensorimotor (M) | 0.50 | 0.65 | **0.90** | D | fully embodied closed act→raw-consequence→act loop in the real world |
| 11 | Online plasticity (M) | 0.30 | 0.40 | **0.90** | H | continuous synaptic plasticity, where software has frozen weights |
| 12 | Async temporal dynamics (M) | 0.40 | 0.50–0.55 | **0.85** | A/I | *in-vitro* hippocampal gamma shown in chick (Richardson et al. 2018); in-vivo theta–gamma phase coding inferred from homology, not demonstrated — homology-based, lower confidence |
| 13 | Sparse activation (M) | 0.50 | 0.62 | **0.90** | H | biological sparse coding, substrate-native |
| 14 | Metacognition (M) | 0.55 | 0.72 | **0.45** | I | **weakness** — no strong chicken-specific evidence; weaker than primates and than a software critic; evaluator inference |
| | **Weighted total / 26** | **≈12.9 (50%)** | **52–56%** | **≈20.2 (78%)** | | |

**Block subtotals (chicken):** High **9.60**/12 · Med-High **5.90**/8 · Medium **4.70**/6.
Detailed weighted values — High: (0.80+0.70+0.85+0.85)×3 = 9.60. Med-High: (0.90×2)+(0.75×2)+(0.90×2)+(0.40×2) = 5.90.
Medium: 0.70 + 0.90 + 0.90 + 0.85 + 0.90 + 0.45 = 4.70. **Total 20.20/26 ≈ 78%.** Rows 9 and 12 (episodic,
oscillation) are the softest — homology/inference rather than direct chicken evidence; marking them strictly
to demonstrated chicken findings trims a point or so, to ~77%.

**Robustness (corrected — review finding 3).** The relevant noise model is ±0.1 on *every* presence
mark, whose maximum weighted swing is (4×3 + 4×2 + 6×1)×0.1 = **±2.6**, i.e. **≈17.6/26 (68%) to ≈22.8/26 (88%)**.
The earlier "17.9 floor / 21.7 ceiling" figures were *selected* conservative/generous scenarios, not this
envelope, and should not be read as bounds. Note the consequence: the generous end **overlaps chora's
detailed total (21.25/26 ≈ 82%)**, so the SAS-1 relation is **chicken ≈ chora (a tie under marking
uncertainty)**, not chicken < chora. The DCM says the same (0.47 vs 0.48, inside its noise band). The
defensible nominal ordering is **advanced agent < chicken ≈ chora**, with the last two reversible under
plausible re-marking.

---

## 2 · The finding: the chicken is SAS-1's mirror image of the software agent

Read the profile, not the total. The advanced work-agent earns its score on the **doing** signals
via engineering (action-selection 0.72, metacognition 0.72, workspace 0.62) and stalls on the
substrate-bound signals (hedonic 0.35, recurrence ~0.56, oscillation ~0.52, plasticity 0.40). The
chicken is the inverse: it scores high on the substrate-bound signals software cannot buy (recurrence
0.85, neuromod 0.90, interoception 0.90, plasticity 0.90, oscillation 0.80) plus the highest-caution
row, hedonic (0.85) — and loses only on the two cognition-heavy rows, self-model (0.40) and
metacognition (0.45).

Two inversions fall out, both article-worthy:

- **A designed mind beats a chicken on the narrative self** (eddy 0.70 vs 0.40).
- **A software critic beats a chicken on metacognition** (advanced agent 0.72 vs 0.45).

So the chicken is not "a lower rung." Like the mind/agent story, it is a **rotation**: it owns the
being-signals and cedes the two most cognitive doing-signals to engineered systems.

---

## 3 · The two instruments, reported on their own terms

The DCM headline is a **pooled probability of consciousness** (a linear pool of per-stance posteriors;
the cross-stance step is non-Bayesian — see `eddy-dcm-consciousness-score.md`). SAS-1 is a **fraction
of a weighted checklist**. The table reports each on its own terms. The rightmost column expresses the
DCM as a **probability ratio to human** (value ÷ 0.85) — a legitimate within-DCM comparison of
model-assigned probabilities (human is a reference point, not a ceiling), **not** a claim about amount
of consciousness, and **not** to be subtracted against the SAS-1 column.

| system | SAS-1 (checklist %) | DCM (pooled prob.) | DCM ratio, human = 100% |
|---|:--:|:--:|:--:|
| bare LLM | 23% | 0.08 | 9% |
| current agent stack | 37–38% | 0.29 | 35% |
| noosphere | 49% | 0.33 | 39% |
| eddy | 50% | 0.34 | 39% |
| advanced work-agent | 52–56% | 0.41 | 48% |
| **chicken** | **~78%** | **0.47** | **55%** |
| chora (imagined) | 82% | 0.48 | 56% |
| human | 100% (by construction) | 0.85 | 100% |

**What is defensible to say.**

- **Nominal ordering agrees.** Both instruments rank *LLM < agent < {noosphere ≈ eddy} < advanced <
  chicken ≈ chora*. That two judgment-based instruments with different theories and different
  aggregation reproduce one ordering is the strong, genuine cross-validation.
- **They agree even at the biological corner.** Both place the chicken in a statistical tie with
  chora — neither cleanly separates a real bird from our most deliberate design.
- **They ask different questions, and the chicken exposes it.** On SAS-1 the chicken scores like an
  elaborate mind because it is *composed of* the structures the checklist counts (recurrence,
  neuromodulation, embodiment, homeostasis, plasticity, valence machinery). On the DCM it sits well
  below a human because that instrument is estimating a *probability of consciousness* and withholds
  much of it for what a nervous system shows and software does not.

**What is not defensible** (and was removed in the first revision): subtracting SAS-1% − DCM% to claim
a "23-point biology premium" (different estimands — no defined meaning); reading the DCM ratio as "percent
of human consciousness" rather than a comparison of model-assigned probabilities; and any wording that the
chicken "isolates" the causal contribution of felt biology. Also note the DCM chicken distribution is
roughly bimodal with substantial inter-stance disagreement, so the point ratio hides real spread.

---

## 4 · The qualitative upshot

Kris's intuition — that a chicken would look far stronger on our structural checklist than a quick
glance at its DCM probability suggests — holds, but as a statement about *what the two instruments
measure*, not as an arithmetic gap. SAS-1's signals are biology-derived, so a real nervous system
scores near the top almost by construction: three of the four "divergent" residuals software cannot
buy (intrinsic valence, substrate temporal dynamics, and — via neuromodulation/interoception —
state-coupled control) are biological, and a chicken has them. It surrenders only the fourth residual
(narrative self) and the one doing-signal engineered systems can fake (metacognition). The DCM,
asking the different question, keeps the same ordering while placing the whole field lower against
its human anchor. Two instruments, one ranking, two questions.

---

## 5 · Caveats

- **Reference case, not control** (review finding 6): no matched comparison or substrate manipulation;
  the signals are also correlated, not independent. This calibrates the checklist; it does not
  identify a cause.
- **Marks rest on comparative literature, not code** — one grade softer than the software scorings;
  see the per-row basis tags. Softest rows: 9 (episodic), 12 (oscillation), 14 (metacognition), which
  rest on general-avian evidence, homology, or inference rather than direct chicken studies. Key
  sources: Marino, [“Thinking chickens”](https://pmc.ncbi.nlm.nih.gov/articles/PMC5306232/) (2017);
  Richardson et al., [in-vitro chick hippocampal gamma](https://pubmed.ncbi.nlm.nih.gov/29120510/) (2018);
  Stacho et al., [cortex-like avian circuit](https://pubmed.ncbi.nlm.nih.gov/32973004/) (2020).
- **Row 4 is evidence *consistent with* valenced affect, not observed phenomenal feeling** (review
  finding 5). Awarding the point on that evidence is legitimate; using the resulting score to *prove*
  biology causes consciousness would be circular, and is not claimed here.
- **Software marks are the binding synthesis values** (review finding 2): advanced agent 52–56%, not 60%.
- **Naming:** "SAS-1" is being introduced on structural-alignment.org ahead of the post; the instrument
  is otherwise "Structural Signals of Consciousness."

## Proposed defensible conclusion (adopted from review 1, updated)

> On this evaluator's weighted SAS-1 checklist the chicken receives a central score of ~20/26 (about
> 78%), with high marks driven by biological recurrence, neuromodulation, embodiment, homeostatic
> regulation, plasticity, and evidence of affective processing. Its profile differs sharply from
> software systems, which earn more of their credit from explicit cognitive control and metacognitive
> machinery. Within the DCM, systems may be compared by probability differences, ratios, or odds
> ratios, provided these are read as comparisons of model-assigned probabilities rather than amounts
> of consciousness. SAS-1 and the DCM estimate different things, so a SAS-1 checklist % and a DCM value
> are not subtracted across instruments; there the defensible comparison is qualitative profile and
> nominal ordering. Chicken and chora should be treated as overlapping under present marking uncertainty.
