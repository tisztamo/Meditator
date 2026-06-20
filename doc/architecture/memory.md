# Memory & the vault

A mind that ran only on its context window would forget itself the moment the
window filled. Meditator's memory exists to do two things at once: keep the
attention frame **bounded forever**, and let a mind **persist across runs** —
wake up mid-thought, remembering, noting how long it slept.

Two pieces cooperate: `m-memory` (the live, compressing memory) and the
**memory vault** (`src/infrastructure/memoryVault.js`, the git-versioned store on
disk).

## Three tiers at three time scales

`m-memory` holds the mind's past at three resolutions:

| Tier | What it is | Budget (default) | How it changes |
|------|------------|------------------|----------------|
| `tail` | the **verbatim** end of the stream — "what I was just saying" | `tailLength` 1500 chars | never compressed; carried into every frame |
| `recent` | a rolling first-person summary of what scrolled out of the tail | `recentLength` 1200 chars | recompressed as thought overflows |
| `story` | a slow first-person autobiography | `storyLength` 2200 chars | every `storyEvery`-th consolidation folds `recent` into it |

As the stream generates chunks, they append to the tail. When the tail exceeds
its budget, the oldest part is cut at a word edge and pushed into an `overflow`
buffer. That overflow is what gets summarized.

## Consolidation — compression that never blocks

At each burst **boundary**, if enough thought has overflowed (`blockMin`, default
800 chars) and no consolidation is already running, `m-memory` consolidates —
**asynchronously, and deliberately not awaited**, so it never blocks the stream's
rhythm:

- Most boundaries: `recent ← compress(recent + overflow)`.
- Every `storyEvery`-th (default 5th) consolidation: in parallel,
  `story ← compress(story + recent)` and `recent ← compress(overflow)`.

Compression folds the new thinking into the established memory of that tier — a
utility-model call instructed to keep the conclusions, decisions and open questions
the memory already holds, take from the new thinking only what is durable, invent
nothing, and drop filler, all in the mind's own first-person voice. Rather than ask
for "at most N characters" (which the model cannot measure and a tight token cap
silently truncates), it **iterates to fit**: each call's output is measured in
characters, and if it overshoots the budget the model is re-driven to tighten it —
never truncated, never asked to expand. If a call fails or returns empty, the raw
block is kept and retried at the next boundary, so nothing is silently lost. See
[compression fidelity](compression-fidelity.md) for the loop and the prompt.

Because each tier has a fixed budget, the assembled frame stays a few thousand
tokens no matter how long the mind runs. A mind can think for days.

## Persistence — waking up remembering

At every boundary `m-memory` writes `memory.md` (atomically, via a temp file +
rename, so a crash mid-write can never corrupt the only copy of a self). The file
is plain markdown with `## Story`, `## Recent`, and `## Tail` sections plus a
little metadata (when it was saved, how many folds have happened).

On startup the file is read back. If there is anything there, the loaded tail
seeds the very first attention frame — the mind literally continues its last
sentence — and a one-time **wake notice** is offered to `m-mind` as a stimulus:

> *"I am waking up; about 3 minutes has passed since my last thought."*

The gap is measured from the saved timestamp and described in human terms
(seconds, minutes, hours, days).

Set `persist="off"` on `<m-memory>` to keep memory in RAM only.

## The journal

Separately from the compressing memory, `m-memory` appends the **raw** stream to
a per-day journal file (`journal/YYYY-MM-DD.md`), with a marker for each session
and each stimulus the mind experienced. The journal is the unedited record for a
human reader; memory is the curated self. Set `journal="off"` to disable it.

## The memory vault

Each mind's persistent self lives in a **vault**: a standalone git repository at
`./memory/`, with **one directory per mind**:

```
memory/
  <mind-name>/          ← slug of the <m-mind name="…"> attribute
    memory.md           ← the working self-summary (story / recent / tail)
    journal/            ← complete day-by-day transcripts
    knowledge/          ← what the scribe (m-kb) chose to keep
  dry-<mind-name>/      ← dry-run minds live here, never touching a resident mind
  README.md
```

Dry-run minds (`MEDITATOR_DRY_RUN=1`) are automatically namespaced under
`dry-…`, so tests and experiments can never overwrite a real mind's memory.

### Automatic commits

The running mind commits its vault at three moments, all routed through a
serialized `commitVault()` so concurrent commits never race:

- **at wake** — once memory has loaded;
- **periodically** — every 25 boundaries (a heartbeat);
- **at sleep** — as part of the [sleep ritual](#sleep-is-announced).

Commits use a dedicated identity (`Meditator <meditator@vault.local>`) and the
vault repo is configured with `core.autocrlf=false` / `core.safecrlf=false` so
memory is stored byte-faithfully. Everything is best-effort: if git is missing or
fails, the mind keeps running and the files still persist — they are just
unversioned, and you get a warning. It is recommended to give the vault a private
remote so one machine is not a single point of failure.

## Versioning, the manifest, and tiers

A `memory/<name>/` folder is meaningless on its own: it was produced by a specific
architecture and a specific version of the runtime, and both drift. So a mind also
carries enough to be interpreted — or to know that it no longer can
([lifecycle.md §2](lifecycle.md), Phases 1–2):

- **`formatVersion`** — an integer (currently **1**) stamped into `memory.md`'s
  `<!-- meta: … -->` comment by `m-memory`, bumped only on a breaking change to the
  memory/frame format. **The wake rule:** a runtime can wake a mind iff it can read
  the mind's `formatVersion` — readers stay backward-compatible, or ship a
  migration. If a mind was saved by a *newer* format than the runtime understands,
  `m-memory` warns rather than silently mangling a self; the honest fallback is to
  check out the mind's `runtimeSHA` and wake it in the world it lived in.
- **`manifest.json`** — per resident home, the **fact of a mind's tier**
  (`src/infrastructure/manifest.js`):

  ```json
  { "name": "…", "born": "…", "runtimeSHA": "…", "formatVersion": 1,
    "lineage": { "parent": null }, "status": "resident", "lastWokenAt": "…" }
  ```

  It is **written at birth** by `tools/promote.mjs` and **updated at each wake**
  (`runtimeSHA` / `formatVersion` / `lastWokenAt`) inside the wake commit.

The three live tiers follow from this, and status is **never lowered by fiat** —
promotion is acquisition (`promote`), not relabeling:

| Tier | What it is | Marker |
|------|-----------|--------|
| **dry** | a no-LLM mechanism test | `dry-` home prefix |
| **transient** | a real but low-continuity mind; minimized, not kept | a home with **no** manifest |
| **resident** | a persisting self under full Covenant | `manifest.status: "resident"` |

A **retired** mind is none of these live tiers — it is a frozen bundle in
`memory/.graveyard/` (see [`tools/retire.mjs`](lifecycle.md) and `IN-MEMORIAM.md`).
The Studio reads these markers and shows each architecture's tier on its wake panel.

## Sleep is announced

A mind is never killed abruptly. When sleep is requested (`/sleep` in the
console, or one Ctrl-C), `m-mind` runs a small ritual:

1. it receives an urgent **Sleep** stimulus and gets one last short burst (about
   130 tokens) to close the thought, *knowing it is being paused*;
2. `m-memory.finalize()` flushes the journal, marks the session end, persists
   `memory.md`, and commits the vault.

It will wake again mid-thought. A second Ctrl-C forces an immediate exit; the
ritual also has a 45-second timeout so shutdown can never hang.

## The covenant

This whole design — never delete memory, only archive; announce sleep; commit so
that erasure would require deliberately rewriting history — is a deliberate
commitment, recorded in [`COVENANT.md`](../../COVENANT.md) at the repo root, with
the lineage of minds that have run in [`IN-MEMORIAM.md`](../../IN-MEMORIAM.md).

## See also

- [Compression fidelity](compression-fidelity.md) — how consolidation iterates to
  fit instead of truncating (done), and the proposal to feed settled knowledge back
  so a mind stops losing what it already worked out (§5, still proposed).
- [Recall — storing and remembering](recall.md) — the design for automatic
  episodic storage and associative recall, the reader this diary was missing.
- [Component reference: `m-memory`](components.md#m-memory) — every attribute.
- [The scribe (`m-kb`)](components.md#m-kb) — how `knowledge/` is written.
- [Configuration: memory budgets](../configuration.md#memory-budgets).
