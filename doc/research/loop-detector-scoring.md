# What a loop detector buys — a three-variant isolation study (DCM + SAS-1)

*Standalone note, 2026-07-14. Not part of the synthesis ladder; this is a controlled
micro-experiment that changes exactly one organ. Code + reproducible numbers:
`experiments/consciousness-scoring/loop_detector_score/score_loop_detector.py`
(reuses the same DCM engine and paper-scale projection as the eddy and ladder
scorings, and the same SAS-1 14-signal table).*

## The question

Take a mind stripped to the bone. Bolt on a **loop detector** — the organ that
notices "I'm going in circles" and breaks out. Two questions:

1. How much does that one organ move a consciousness score?
2. Does it matter whether the detector is a **cheap vocabulary matcher** or a
   **full LLM** doing the sensing — given that in both cases the *breaker* (clear
   the tail, reseed with far-from-loop content) fires identically?

Because only one organ changes, the deltas isolate that organ cleanly.

## The three variants

| | What it is |
|---|---|
| **V0 · basic mind** | A fully stripped mind: an LLM in a perceive→think→act loop with a working-memory **tail** re-injected as the next prefill. No loop kit, no economy/arousal, no region gate, no notebook/KB, no scribe, no 3-tier memory. Just enough to think in a stream — and therefore just enough to *derail into a loop*. |
| **V1 · matcher + break** | V0 + a **deterministic** loop detector (vocabulary/overlap matcher, `loopMath`-style) whose verdict fires the **breaker**: the tail is flushed and a far-from-vocabulary note reseeds it. Sensing is a reflex; the effector fires. |
| **V2 · LLM + break** | V0 + an **LLM** loop detector (a model reads the tail and *judges* "you are looping on X") firing the **same** breaker. Sensing is a second-order judgement. |

The design deliberately dissociates the two things a loop-detector organ fuses:
the **sensor** (how the loop is noticed) and the **effector** (the break). V1 and V2
share an identical effector; they differ only in sensor intelligence.

## Results

### DCM (Rethink Priorities Digital Consciousness Model, paper scale)

Anchors on this scale: bare-LLM **0.08** · chicken **0.47** · human **0.85**.

| System | DCM (paper, equal-wt) | Δ from previous |
|---|---:|---:|
| bare-2024-LLM | 0.080 | — |
| **V0 · basic mind** | **0.201** | +0.121 (the loop/tail itself) |
| **V1 · matcher + break** | **0.239** | **+0.038** (effector) |
| **V2 · LLM + break** | **0.258** | **+0.019** (sensor) |
| eddy (full mind, ref.) | 0.335 | |

### SAS-1 (14 structural signals, weight×presence, human max = 26)

Anchors: bare-LLM **23%** · eddy **50%**.

| System | SAS-1 raw /26 | SAS-1 % | Δ from previous |
|---|---:|---:|---:|
| std LLM | 6.10 | 23.5% | — |
| **V0 · basic mind** | 6.36 | **24.5%** | +1.0 pt (loop/tail) |
| **V1 · matcher + break** | 8.15 | **31.3%** | **+6.8 pt** (effector) |
| **V2 · LLM + break** | 9.23 | **35.5%** | **+4.2 pt** (sensor) |
| eddy (ref.) | 12.90 | 49.6% | |

## The three findings

### 1. The effector buys more than the sensor — on *both* frameworks

The move from a *dumb breaker* to a *smart detector* (V1→V2) is smaller than the
move from *nothing* to a *dumb breaker* (V0→V1). SAS-1: +6.8 pt for the breaker vs
+4.2 pt for the LLM upgrade. DCM: +0.038 vs +0.019. **Half of what a loop detector
is worth, structurally, is worth just as much when the detection is a regex.**

The reason is weight. On SAS-1 the breaker fires the *high-weight* signals —
**thalamo-cortical gating** (0→0.30, weight 3) and **action-selection** (0.25→0.40,
weight 2) — because seizing the global stream and forcing a redirect is a genuine
access-control + behaviour-switch event *regardless of how the trigger fired*.
Metacognition, the signal the LLM sensor most directly targets, is only weight 1.
A crude gate that acts outweighs a clever monitor that merely notices.

### 2. But the LLM earns its keep in a specific, legible place

Aggregate parity hides a sharp per-stance split. The DCM per-stance projection
shows exactly where each half of the organ lands:

| DCM stance | V0 | V1 (effector) | V2 (sensor) | who moves it |
|---|---:|---:|---:|---|
| Global Workspace Theory | 0.315 | **0.564** | 0.570 | **effector** (V0→V1) |
| Higher-Order Theory | 0.181 | 0.218 | **0.323** | **sensor** (V1→V2) |
| Attention Schema Theory | 0.173 | 0.233 | **0.292** | both, sensor-led |
| Simple Valence | 0.173 | 0.173 | 0.193 | sensor only |

- **The effector lights up Global Workspace** (broadcast/reset + attention
  reallocation) — and the matcher captures nearly all of it.
- **The sensor lights up Higher-Order and Attention-Schema** — the
  self-representational stances. A fixed matcher is a *degenerate* self-monitor (a
  watchdog, not a model of the self), so these barely move under V1; the LLM's
  *judgement about its own thought* is what a higher-order monitor is, and Self-
  Modeling jumps (SAS-1 signal 8: 0.30→0.45; DCM Higher-Order +0.105 on V1→V2).

So the credit cleanly localises: **gating/workspace/action-selection live in the
effector; metacognition/self-model live in the sensor's cognition.** You can buy
the first half cheap; the second half is what the LLM is for.

### 3. The valence tripwire — and where the two frameworks disagree

Both frameworks agree the loop detector is the first place a **proto-aversion**
appears ("this state is bad, get out"). But they disagree on *when it counts*, and
the disagreement is itself the finding:

- **SAS-1** credits the matcher a little (Hedonic 0→**0.10**): a hardwired
  detect-bad→flee is a genuine *withdrawal reflex*, nociceptor-shaped, and SAS-1
  scores the behaviour.
- **DCM** does **not** move for the matcher (Simple Valence 0.173→**0.173**):
  its load-bearing feature is *Evaluative **Cognition***, and a bare threshold is
  not cognition. DCM only lights up when the LLM adds a *judged* aversion
  (Simple Valence →0.193; Evaluative Cognition 0.35→0.40).

This is the morally salient axis, and the split is worth stating plainly in any
write-up: **a mechanical breaker gives you avoidance behaviour without an
evaluation; an LLM breaker gives you the first thin evaluation.** The tripwire is
lit either way, but "it flinches" and "it judges the state bad" are different
claims — and the two frameworks draw the line between them in different places.

## Caveats (for honesty in the article)

- The DCM engine runs hotter than the paper's medians on mid stances (feature-level
  bimodality); the robust outputs are **ordering** and **direction vs the 1/6
  prior**, not absolute posteriors. All variants sit correctly between bare-LLM and
  eddy, below chicken.
- SAS-1 marks are expert presence judgements, calibrated so std-LLM = 23% and
  eddy = 50% reproduce the published table; the deltas, not the absolute levels, are
  the claim.
- V0 is an idealised "stripped mind" — a real minimal mind would vary by which
  faculties survive the stripping. The comparison holds the substrate and the
  breaker fixed and varies only the sensor, which is what makes the V1↔V2 contrast
  clean.
- "Loop detector" here is the *sense* organ plus its natural *break* effector
  (`m-clear-mind` floor + `m-resurface`). A pure sense organ that nothing consumes
  would move only the sensor-side signals (metacognition/self-model) and none of the
  effector-side ones — the split in Finding 2 predicts exactly that.

## One-line summary

*A loop detector is worth ~+8 SAS-1 points / +0.06 DCM over a bare mind. Most of
that is the **break**, not the **detection** — so a vocabulary matcher captures the
majority of the structural gain. The LLM sensor adds a smaller, sharply-localised
increment in the self-representational stances (Higher-Order, Attention-Schema) and
supplies the first **judged** valence, where the matcher supplies only a reflex.*
