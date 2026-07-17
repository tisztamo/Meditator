# Review 1 — chicken SAS-1 scoring

**Date:** 2026-07-15  
**Reviewed:** [`chicken-sas1-scoring.md`](chicken-sas1-scoring.md)  
**Disposition (at review time):** Revision required before publication.
**Resolution (2026-07-15):** all six findings were addressed in the revised
[`chicken-sas1-scoring.md`](chicken-sas1-scoring.md) — cross-instrument subtraction and the
"biology premium" removed (finding 1); software baseline updated to the synthesis 52–56%
(finding 2); robustness envelope corrected to ±2.6 (≈68–88%) and the ordering softened to
*advanced agent < chicken ≈ chora* (finding 3); per-row evidence-basis tags (D/A/H/I) and
sources added, and "no cortex" → "no mammalian six-layered neocortex" (finding 4); row 4
reworded to "consistent with valenced affect" (finding 5); "control/isolates" →
"reference case/illustrates" (finding 6). This document stands as the audit record; the
findings below are preserved verbatim.

The central weighted total, **20.25/26 ≈ 78%**, recomputes correctly. The profile may
support a narrow qualitative finding: on this evaluator's biology-derived structural
checklist, chickens receive high marks and exhibit a different profile from software.
The draft does not, however, establish a quantitative “biology premium” or an
independently confirmed consciousness ranking.

## Findings

### 1. High — the DCM probability comparison is misinterpreted, and the cross-instrument subtraction is not commensurable

Section 3 treats the DCM's chicken and human results, 0.47 and 0.85, as quantities of
consciousness. It divides the former by the latter to produce “55% of human,” then
subtracts this from SAS-1's weighted-checklist percentage to obtain a 23-point gap.

At the stance level, the DCM produces posterior probabilities. Its overall values are
linear pools: weighted averages of stance-specific posteriors, with the cross-stance
aggregation explicitly described by the DCM authors as non-Bayesian. Such a pool can
be used as a probability estimate, but it is not the posterior of one unified Bayesian
model unless the stance weights are given an additional interpretation as probabilities
over an appropriate set of models.

If 0.47 and 0.85 are provisionally treated as comparable probabilities, subtracting or
dividing them is mathematically valid. The difference says that the model-assigned
probability for the human proposition is 38 percentage points higher. The ratio
`0.47 / 0.85 = 0.553` says that the model assigns the chicken proposition about 55% of
the probability it assigns the human proposition; equivalently, the human probability
is about 1.81 times the chicken probability. An odds comparison gives yet another
valid measure: the human posterior odds are about 6.4 times the chicken posterior odds.
These are comparisons of probabilities, not measurements of how much consciousness
each system possesses. In particular, the probability ratio does not mean that a
chicken possesses 55% of a human quantity of consciousness.

SAS-1's 78%, meanwhile, is the fraction of the maximum available points in an
internally constructed weighted checklist. It estimates checklist attainment, whereas
the DCM number estimates or pools credence in a binary proposition. The two numbers
therefore have different estimands, scales, reference points, and aggregation rules.
Numerically subtracting them is possible, but the resulting number has no established
interpretation.

This invalidates the substantive interpretations built on that cross-instrument
subtraction:

- the **+23** “SAS-1 − DCM” result;
- the claimed “biology premium”;
- the claim that DCM compresses the top by a measured number of points; and
- the claim that the gap “isolates exactly” what the instruments weight differently.

The DCM paper also describes the chicken distribution as roughly bimodal, with
substantial disagreement within and between theoretical stances. See Rethink
Priorities, [*Initial results of the Digital Consciousness
Model*](https://rethinkpriorities.org/wp-content/uploads/2026/01/Digital_Consciousness_Model.pdf).

**Recommendation:** report the pooled DCM estimate and SAS-1 checklist percentage in
separate columns and explicitly label their different meanings. Within the DCM, a
cross-system probability difference, risk ratio, or odds ratio may be reported if the
chosen comparison is named and interpreted only as a comparison of model-assigned
probabilities. Do not label `0.47 / 0.85` as “percent of human consciousness,” and do
not subtract a DCM comparison from the SAS-1 checklist percentage unless a defensible
common calibration and interpretation are developed.

### 2. High — the software comparison uses a superseded baseline

The draft compares the chicken against the original advanced work-agent score of 60%
and repeats the original per-row marks. The later adjudicated synthesis revises that
system to **52–56% at the argued marks**, with 60% retained only as an optimistic edge:

- gating: 0.45–0.50, not 0.55;
- workspace: 0.62, not 0.68;
- recurrence: 0.55–0.58, not 0.62;
- hedonic evaluation: 0.35, not 0.50;
- neuromodulation: 0.50–0.60, not a fixed 0.60; and
- asynchronous dynamics: 0.50–0.55, not a fixed 0.55.

See [`agents-and-structural-alignment-synthesis.md`](agents-and-structural-alignment-synthesis.md)
§3 and its corrected ladder. The DCM companion also declares those corrections
binding and lists structural alignment at 52–56%; see
[`synthesis-ladder-dcm-scores.md`](synthesis-ladder-dcm-scores.md) §§Method, Results.

Consequently, the row-by-row comparison, the fixed 60% ladder entry, and the advanced
agent's stated +12 cross-instrument gap mix incompatible versions of the source
analysis.

**Recommendation:** use the synthesis values and ranges throughout, and describe 60%
only as the prior optimistic marking. This correction does not erase the qualitative
chicken/software profile contrast, but it materially changes its stated size.

### 3. High — the robustness bounds and preserved ordering do not reconcile

The robustness section states that ±0.1 per row produces a floor near 17.9 and a
ceiling near 21.7. If ±0.1 is applied to every presence mark, the maximum weighted
change is:

```text
(4 high × 3 × 0.1) + (4 medium-high × 2 × 0.1) +
(6 medium × 1 × 0.1) = 2.60
```

The resulting interval is therefore:

```text
20.25 − 2.60 = 17.65  (67.9%)
20.25 + 2.60 = 22.85  (87.9%)
```

If 17.9 and 21.7 instead come from selected conservative and generous scenarios, the
draft needs to list the perturbed row vectors. Those values are scenarios, not a
floor and ceiling implied by the stated noise model.

There is also an internal contradiction: the draft's own generous value of 21.7
exceeds chora's detailed total of 21.25. Thus the claimed SAS-1 ordering
`chicken < chora` is not robust. On DCM, the source analysis already treats the small
chicken/chora difference as inside the noise band and recommends calling it a tie.

**Recommendation:** distinguish the nominal central ordering from uncertainty. The
supported phrasing is approximately `advanced agent < chicken ≈ chora`, with the last
two capable of reversing under plausible SAS-1 re-marking.

### 4. Medium — several biological rationales outrun the supplied evidence

The scoring table contains no citations for most chicken-specific claims. The most
important unsupported combinations are:

- Row 9 asserts hippocampal what–where–when memory plus genuine sleep-dependent
  replay and consolidation in chickens.
- Row 12 asserts chicken theta/gamma oscillation and phase coding.
- Row 14 assigns modest uncertainty monitoring without identifying chicken-specific
  evidence.

The available domestic-chicken cognition review discusses the classic avian
what–where–when result in scrub-jays rather than establishing it in chickens:
Lori Marino, [“Thinking chickens: a review of cognition, emotion, and behavior in the
domestic chicken”](https://pmc.ncbi.nlm.nih.gov/articles/PMC5306232/). A direct chick
study demonstrates pharmacologically induced gamma oscillations in hippocampal brain
slices, but not in-vivo theta–gamma phase coding: Richardson et al., [“In vitro
characterization of gamma oscillations in the hippocampal formation of the domestic
chick”](https://pubmed.ncbi.nlm.nih.gov/29120510/).

Likewise, Stacho et al. supports a general analogy between avian pallial and mammalian
cortical circuit organization; it does not by itself establish every chicken-specific
functional claim in rows 1–3: [“A cortex-like canonical circuit in the avian
forebrain”](https://pubmed.ncbi.nlm.nih.gov/32973004/).

The caveat that rows 2, 9, and 14 depend on evidence from other birds is therefore too
narrow; at least row 12, and parts of rows 1–3, also require explicit separation of
direct chicken evidence from clade-level extrapolation.

**Recommendation:** add a source column or evidence appendix for all 14 rows. Label
each basis as direct chicken evidence, general avian evidence, broader vertebrate
homology, or evaluator inference. Use ranges or lower confidence grades where the
evidence is extrapolated. Replace “birds have no cortex” with the more precise “birds
lack the mammalian six-layered neocortex.”

### 5. Medium — claims about felt experience make the argument circular

Row 4 says the chicken's evaluation is “felt, not computed,” and later sections state
that the chicken instantiates felt valence and simply “is” a biological conscious
system. This assumes the conclusion while using SAS-1 to support conclusions about
the effects of biology.

The source framework explicitly says it is a precautionary risk checklist, not a
consciousness detector, proof of consciousness, or set of jointly sufficient
conditions. See [*Structural Signals of
Consciousness*](https://structural-alignment.org/research/structural-signals/),
§Intended Use and Limitations. The companion analysis repeats this limitation in
[`agents-and-structural-alignment.md`](agents-and-structural-alignment.md) §0.

Chicken nociception, neuromodulatory systems, judgment bias, and motivated behavior
provide evidence consistent with affective or valenced states. They do not directly
observe phenomenal feeling. If felt experience is assumed in advance to award the
structural points, the resulting score cannot independently confirm that biology
causes the gap.

**Recommendation:** describe row 4 as “strong behavioral and neurobiological evidence
consistent with valenced affect.” Keep the ethical case for treating chickens as
sentient separate from the structural score, and replace “confirmed” with
“consistent with” in the headline conclusion.

### 6. Medium — “control” and “isolation” overstate the study design

A single chicken profile scored by the same reasoned-marking process is a useful
cross-substrate reference case, but it is not an experimental control. There is no
matched comparison, manipulation of substrate while holding architecture constant,
or model that separates substrate from species-level cognitive differences. The
SAS-1 signals are also intentionally derived from biological neuroscience and are
correlated rather than independent.

Accordingly, the comparison cannot isolate the causal contribution of “felt biology”
or show that the full score difference is a substrate effect. It illustrates how a
biology-shaped checklist evaluates a biological nervous system.

**Recommendation:** use “cross-substrate reference case” instead of “natural
control,” “illustrates” instead of “isolates,” and present the result as a calibration
exercise rather than causal identification.

## Proposed defensible conclusion

> On this evaluator's weighted SAS-1 checklist, the chicken receives a central score
> of 20.25/26 (about 78%), with high marks driven by biological recurrence,
> neuromodulation, embodiment, homeostatic regulation, plasticity, and evidence of
> affective processing. Its profile differs sharply from software systems, which
> receive more of their credit from explicit cognitive control and metacognitive
> machinery. Within the DCM, systems may be compared by probability-point differences,
> risk ratios, or odds ratios, provided these are described as comparisons of
> model-assigned probabilities rather than quantities of consciousness. SAS-1 and DCM
> estimate different things, so their values should not be subtracted without a common
> calibration; across the two instruments, the defensible comparison is qualitative
> profile and nominal ordering. Chicken and chora should be treated as overlapping under
> the present marking uncertainty.
