# Tier-1 search lab (Phase 4 · lean versus edge-grounded)

The first architecture in which a source processes its own candidates before the
aperture. Two arms over the same BBC science feed and the same search template:

| arm | region | aperture | matcher | what may cross |
|---|---|---|---|---|
| **E** (edge-grounded) | `world` | **closed** | the source itself, `tier="1" decider="jev"`, one `noul` per item | a score and its provenance |
| **L** (lean, control) | `lean` | open | `m-judge` after materialization (today's default) | the item's text, as an ordinary percept |

`m-search-probe` (in `components/`) starts the searches on a clock. It is lab-only
and exists because two live `eddy-world-orient` runs produced zero organic
searches in 8.5 hours (`doc/research/first-live-orientation.md` §B5): the trigger
is the thing that never happened, and it is not what this lab is measuring.

## Run

Needs the local GPU for the voice and `TYPESAFE_API_KEY` for the decider.

```bash
set -a; . ~/.env; set +a
MEDITATOR_MODEL_PROFILE=local-voice bun meditator.js \
  -a architecture/lab/tier1-search/tier1-search.archml --mind-name tier1-search-1
```

Stop when both arms have reported an outcome (the edge probe fires at 40s, the
lean probe at 4m, both every 8m after that). Then read the ledger:

```bash
grep -E 'edge-score|search-outcome|search-target' \
  memory/tier1-search-1/predictions/ledger.jsonl
```

Delete `memory/tier1-search-1/` when done.

## What to read out

- `status: found` with `reason: edge-match` while `apertureState` is `closed` —
  the stop condition of Phase 4.
- `provenance`: model version, question keys, derived strength (`|p−0.5|·2`;
  `noul` has no confidence of its own), candidates scored, calls, latency, cost.
- What crossed: the score and that record, and nothing else. The headlines stay
  in the source; the template never reaches a tier-0 source at all.

The report is `doc/improvements/prediction-mismatch.md` §"First edge-grounded
search".

## Privacy

Arm E sends feed headlines and the experimenter's template to TypeSafe. That is
public text and the experimenter's own words, not the mind's evidence — but it is
off-box, which is why this architecture is `stage="experimental"` and why tier 1
is a per-source declaration rather than anything a profile can turn on globally.
