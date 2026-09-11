# Expect study (Phase 3B · B1 / B2)

The experiments git submodule is not checked out in this workspace, so the
harness lives next to the lab architectures it runs
([`architecture/lab/`](../)). Copy into `experiments/expect-study/` if that
repository is available.

## Question

In a mind that thinks, is `expect` produced, in what form, how often does its
outcome arrive inside the horizon, and does offering the field change which
hand the realizer picks or how often it declines?

## Design

Two arms of [`lemma-lab-expect.archml`](../lemma-lab-expect.archml):

| Arm | Architecture | Difference |
|---|---|---|
| **P** | `lemma-lab-expect.archml` as checked in | `prediction="on"`, `m-compare`, `m-expect-ledger`, no `m-bid` |
| **C** | generated (`prediction="off"`) | same components; REALIZE schemas lack `expect` |

Weights stay at zero. The only behavioural difference is the optional `expect`
property in the realizer's tool schemas.

## How to run (needs a local GPU / `local-voice`)

At least three runs per arm, at least two hours each, same origin, no voice probes:

```bash
# from the repo root
architecture/lab/expect-study/bin/run.sh P 7200
architecture/lab/expect-study/bin/run.sh C 7200
```

`MEDITATOR_MODEL_PROFILE=local-voice` is set by the script. Homes land under
`memory/lemma-lab-expect-p-<n>/` and `memory/lemma-lab-expect-c-<n>/`. The
private ledger is `memory/<home>/predictions/ledger.jsonl`.

After the runs:

```bash
bun architecture/lab/expect-study/analysis/summarize.mjs memory/lemma-lab-expect-p-1 memory/lemma-lab-expect-c-1
```

Label a sample of predictions with [`analysis/rubric.md`](analysis/rubric.md)
(M2). Write the table and the B2 decision into
[`doc/research/expect-study.md`](../../../doc/research/expect-study.md).

## B2 offline judge (after B1 ledgers exist)

```bash
bun architecture/lab/expect-study/analysis/judge-offline.mjs memory/lemma-lab-expect-p-1
```

Decision rule: agreement with a blind reader ≥ 0.8 on match-vs-mismatch, and no
mismatch verdict on a pair the reader calls insufficient, before the judge goes
live. Live judge condition: [`lemma-lab-judge.archml`](../lemma-lab-judge.archml).

## Pre-registered metrics

See the [phase 3B plan](../../../doc/plans/perceptual-membrane-phase-3b.md) §3.3.
This harness does not claim that prediction improves functioning.
