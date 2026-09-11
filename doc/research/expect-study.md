# Expect study (Phase 3B · B1 / B2)

**Status: harness prepared, live runs not yet done.** See
[`architecture/lab/expect-study/README.md`](../../architecture/lab/expect-study/README.md).

## 1. Live `expect` (B1)

*To be filled after three runs per arm (P = `prediction="on"`, C = off), at least
two hours each, `MEDITATOR_MODEL_PROFILE=local-voice`.*

| Metric | Arm P | Arm C | Decision |
|---|---|---|---|
| M1 fill rate | | | ≥ 0.5 to proceed with the field as is |
| M2 expect shape | | | "checkable claim" ≥ 0.3, else revise `EXPECT_FIELD` |
| M3 settle rate / latency | | | |
| M4 hand choice / decline / intent accept | | | a shift is a cost, not a B2 block |
| M5 verdicts | | | expected ≈ all `insufficient` under `m-compare` |
| M6 cadence | | | must not differ; find the cause before B2 |
| M7 attended fraction | | | must be equal at zero weights |

This section says what `expect` is. It makes no behavioural claim about prediction.

## 2. Judge (B2)

Offline over B1 pairs first (`analysis/judge-offline.mjs`), then live
[`lemma-lab-judge.archml`](../../architecture/lab/lemma-lab-judge.archml) at small
weights. Agreement with a blind reader ≥ 0.8 on match-vs-mismatch, and no
mismatch on a pair the reader calls insufficient, before the judge goes live.

*Not yet run.*
