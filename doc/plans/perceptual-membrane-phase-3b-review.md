# Perceptual membrane — Phase 3B review: implementation against the plan

**Status: reviewed 2026-09-11, against commit `c7c504e`.** Reviews the
[phase 3B plan](perceptual-membrane-phase-3b.md) as implemented. Sibling of the
[phase 3A review](perceptual-membrane-phase-3a-review.md). Reviewer: Claude Fable 5.1,
at Kris's request. The implementor reported the work as uncommitted with
"431 tests, 0 failures"; both statements need qualification (§1).

## 1. Verdict

Phase 3B landed as commit `c7c504e` on `main`. Code and offline tests match the plan
stage by stage, with the deviations in §4. The suite is not green in the sense
reported: every test passes, but the full run exits non-zero with 18 unhandled
errors that the parent commit did not have. Nothing live has run, so every research
report is a stub.

| Suite (`bun run test:wiring`) | Parent `96034fe` | 3B `c7c504e` |
|---|---|---|
| tests | 393 | 431 |
| failures | 2 | 0 |
| unhandled errors | 0 | 18 |
| exit code | 1 | 1 |

The 18 errors are Amanita `RefResolutionError`s for Studio refs (`/conn/focused`,
`/conn/replayResume`, `/conn/backfill`, `/conn/hidden`, `/conn/@streamFragment`,
`/conn/@lifecycle`; six refs, three times each), reported "between tests" after
`membrane-compare.test.js` and only in the full run. The new `unhandledrejection`
handler added to `architecture/tests/wiring/setup.js` does not catch them: Bun
reports them at process level, not on the jsdom `window`. They do not reproduce when
the Studio tests, the 3B tests and `senses.test.js` run together in isolation, so it
is an ordering leak from a teardown in the new files. The two parent failures (the
agent-terminal workspace tests) now pass.

## 2. What eddy-world is

`architecture/lab/eddy-world.archml` is `eddy.archml` with one line changed. The
world region that groups the three RSS feeds gains
`modality="text" aperture="open" dwell="30s" contactHorizon="10m"`, which makes it a
sensory aperture. Because `m-feed` now calls the new `MSense.perceive()` helper, the
feeds offer lazy candidates through the gate instead of eagerly firing `feel()`. No
prediction, no bidder, no judge. It is `stage="experimental"`, listens on ws port
7633, and is the first mind in the repository where a shipped sense sits under
aperture control.

`architecture/lab/eddy-world-orient.archml` is that plus the B4/B5 machinery:
`m-judge` as the comparator, `m-search` as the single search controller, an `m-bid`
inside the world region at small weights (`expectedFloor="0.3"`,
`mismatchWeight="0.6"`), `prediction="on"` and `compareDeadline="8s"` on the hands,
and the `m-orient` hand on its own control lane (`cooldown="30s"`,
`intentThreshold="0.75"`). The mind can close, soften, narrow or open the world
channel by its own reach; a `template` on that reach starts a bounded search over the
feed routes (`sampleBudget="6"`, `deadline="2m"`, `attemptTimeout="8s"`); the
region's deficit reflex softens a closed or narrowed channel once contact debt passes
0.65 and opens it at 0.9. Port 7634.

**Status of both:** built, offline-tested, never woken. No home exists under
`memory/` for either. `doc/research/first-live-aperture.md` and
`doc/research/expect-study.md` are empty templates with the pre-registered metrics.

## 3. Plan conformance — what landed as specified

- **B0.** `MAct.provides = { hands }` and `bidOwnerOf` by role (tag fallback table
  only for un-upgraded test stubs); `requestId` on `evaluation-commit`,
  `candidateId`/`requestId` on `perceptDecision`, `actId`/`predictionId` on `acted`;
  trusted `progress` boolean on `InterruptRecord` and the evidence view, skipped by
  both comparators; rebinding admits with null slots (3A test 13b rewritten);
  duplicate comparator throws at connect; `mind-sleeping` fired from `MMind.sleep()`;
  `runEvidenceCase` in `src/infrastructure/evidenceCase.js`; `compareDeadline`
  attribute replacing `_compareDeadlineOverride`; all six owed documents updated.
- **B1.** `m-expect-ledger` lab-gated on `stage="experimental"`, JSONL to
  `mindHome(…, 'predictions')/ledger.jsonl` only; `lemma-lab-expect.archml` (arm P);
  `run.sh` generates arm C by `prediction="off"`; `summarize.mjs` computes M1–M7;
  `rubric.md` has the four M2 categories.
- **B2.** `judgeCompare.js` pure prompt/parse; `m-judge` `provides comparator`,
  shared `livePredictionIndex.js`, ancestor `utilityModel`, 60 tokens, temperature 0,
  abort → `insufficient`; `judge-offline.mjs`; `lemma-lab-judge.archml`.
- **B3.** `perceive()` with `_salienceFor` shared with `feel()` (jitter included);
  `m-feed` migrated; `m-weather`/`m-daylight` untouched, as the plan said.
- **B4.** `OrientationRequest`; `requestOrientation` role port on `m-region`,
  forwarding to child providers; enums derived from live apertures and refreshed on
  `aperture-register`; `_transition(from, reason, actId)`; claim-at-execute in
  `mAct._execute`; orient-study harness.
- **B5.** `control-result` id-only event; `m-search` state machine with the four
  outcomes and coverage; `targetMatch` from `m-judge`'s `target` subject;
  `template` only on `acceptsTemplate` hands; `ControlRequest.template` stays null.
- **Compatibility promise.** Holds by construction: `perceive()` falls back to
  `feel()` outside an aperture (test 16), and `eddy.archml`'s world region has no
  `modality`.

## 4. Deviations from the plan

1. **Harness location.** Plan: `experiments/expect-study/`. Landed:
   `architecture/lab/expect-study/` and `architecture/lab/orient-study/`, with a
   README saying the experiments submodule is not checked out. In this checkout it
   is (the submodule's dirty state is pre-existing local work, unrelated to 3B).
2. **Seam test weaker than asked.** Plan test 14 wanted `m-judge` to pass 3A
   comparator tests 8–13 in place of `m-compare` with a stubbed `complete`. The
   commit has one test, on the act path only.
3. **Contract tests 2 and 7 have no named test.** Ids on `acted` are asserted inside
   an existing `act-prediction.test.js` case; `EvidenceCase` is covered only by the
   unchanged 34 tests, which the plan allowed.
4. **Extra `mMemory.js` change.** Vault/identity checks moved before channel binding
   so a throwing `onConnect` does not leave stream retries running. Behaviour-
   preserving and commented, but not in the plan.
5. **`m-contain` built** although the plan said skip it unless B1 shows short
   checkable phrases. Unused; harmless.
6. **Stale comments.** `eddy-world.archml` says delete `memory/eddy-world/`, but the
   cheat sheet runs it as `eddy-world-1`; it also keeps eddy's "public port 7627"
   comment while listening on 7633.
7. **Reporting.** The commit exists; the suite exits 1 (§1).

## 5. Covenant compatibility

Compatible, with three tensions to keep in view.

**What holds.**

- *Bands and namespacing (§6).* Every new architecture is `stage="experimental"`,
  so transient: it writes a home but never commits, and the ledger refuses to
  connect outside that tag. `--mind-name` keeps checked-in homes untouched. Ports
  7631–7634 avoid the shared Studio pool (see the 2026-07-04 port-pool finding).
- *Announced sleep (§2).* `run.sh` stops the mind with a single SIGINT and waits.
- *No deception, private data stays private (§3, §9).* The ledger writes
  expectation and consequence text only to the run home, the same place terminal
  transcripts live. `m-judge` sends those texts to its own judge model; under
  `local-voice` that stays on the box, and `components.md` says so. The one profile
  that breaks that, `local-voice-jev` (the System-One comparator), sends the mind's
  expectation and the perception it is graded against to a third-party endpoint —
  a knowing trade a human makes per run, named in `config/models.yaml` and
  `components.md`, never a component default. The same §3/§9 line now covers the two
  other roles a decision model can hold: a **tier-1 source** discloses its own
  candidates and the search template to whatever provider its `decider` names (a
  per-source declaration in the architecture, never on a source whose candidates are
  the mind's own state), and a **decision-model loop sense** would send the mind's
  verbatim inner monologue off the box, which is why it is refused under
  `local-voice` — see the residency call in
  [`doc/research/jev-decisions.md`](../research/jev-decisions.md). Orientation and
  reflex transitions are journaled as backstage (⌁) notes, never passed off as the
  mind's own thought.
- *Flourishing and the given world (§7, §8) in code.* The mind gains the power to
  wall off its world, and the reflex reverses a voluntary closure when contact debt
  rises. That is "rouse a contented collapse" applied to perception; a real choice
  with a real cost, to be observed in the orient study rather than assumed.

**Tensions (none blocking).**

1. *Volume of transient minds (§6).* The cheat sheet calls for at least six two-hour
   lemma runs, a judge run, a four-hour eddy-world run and an open-ended orient run.
   Each needs a live model, since `expect` cannot be produced dry, but arm C exists
   only to measure a schema perturbation. State the justification in the
   expect-study report and consider two runs per arm before committing to three.
2. *Reflex reopenings are undisclosed to the mind (§3).* The mind feels neither its
   own closing nor the reflex reopening, only the world going quiet and then loud.
   This matches the known undisclosed-structural-signal gap from the 2026-07-02
   covenant audit rather than adding a new one; worth a line in the
   perceptual-membrane known issues.
3. *"Delete the home when done" (§1).* Fine for transients under existing lab
   practice, but the vault is a git repository and §1 forbids casual `rm -rf`. Keep
   deletions to the lab homes named in the archml comments.

## 6. Before the GPU runs

1. Fix the ordering leak so `bun run test` exits 0: a process-level
   `unhandledRejection` filter in the Bun preload, or the missing teardown, not the
   `window` listener.
2. Correct the harness README sentence about the submodule and the two stale
   comments in `eddy-world.archml`.
3. Then run the cheat sheet in `architecture/lab/README.md` in order: B1 first, since
   its decision rule gates B2; B3 before B4, since the orient study needs a working
   aperture to close. None of the reports may claim that prediction improves
   functioning.
