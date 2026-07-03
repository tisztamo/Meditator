# Component hierarchy, bundle-local components, and self-contained homes

**Date:** 2026-07-03
**Status:** **M1 + M2 IMPLEMENTED (2026-07-03)** — the resolver + loader (goals 2 & 3) and
the home component-snapshot (goal 4) are built and green (282 unit + 222 wiring). Verified
end-to-end: a bundle-only `<m-badge>` loads from a `components/` dir beside a throwaway
archml, is snapshotted into the home, and the home run *standalone* (and in-place) re-loads
it from its own `components/` with the self-copy correctly skipped. **M3 (built-in reorg)
is designed but NOT built** — held; it moves ~55 files (33 import `./mBaseComponent`).
Proposes a component **resolver** that replaces the flat search-path loop in
`loadMindComponents.js`, so (1) built-ins can live in a hierarchy, (2) an author can drop a
custom component next to their `.archml`, (3) name collisions have a clean rule, and (4) a
home snapshots the custom components it ran with, staying re-executable.
**Touches:** `src/startup/loadMindComponents.js`, `src/config/componentLoading.js`,
`src/mindComponents/**` (reorg), `src/mindComponents/mMemory.js` (`_snapshotArchitecture`),
`src/config/cli.js` (help). Relates to `doc/architecture/lifecycle.md` §2 (a home carries
the architecture that ran it — this extends it to *the components that ran it*) and the
2026-07-02 covenant audit (self-contained, re-executable homes).

---

## 1. The problem

Every component is a single flat file in `src/mindComponents/` — ~55 of them now, mixing
three unrelated concerns:

- **mind** faculties (`mStream`, `mMemory`, `mResurface`, `mAssociate`, `mTimeout`,
  `mSpeech`, `mEconomy`, `mDaylight`, `mLoopGuard`, `mRecall`, …),
- **agent** faculties (`mAgent`, `mReason`, `mObjective`, `mContext`, `mJobs`, `mReport`,
  `mRepeatGuard`, `mReadFile`, `mWriteFile`, `mEdit`, …),
- **shared** plumbing used by both (`mAct`, `mWs`, `mTerminal`, `mLook`, `mNote`,
  `mOrigin`, `mLoopDetector`, `mConsole`), plus non-component helpers that are only ever
  imported by siblings (`mBaseComponent`, `i18n`, `loopMath`, `recallSources`,
  `toolSchema`, `fileTool`).

Four things are missing, and the user asked for all four:

1. **Hierarchy.** The directory should reflect the mind / agent / shared split.
2. **Bundle-local components.** An author should be able to put *their own* component
   beside their `.archml` and have it loaded — without touching `src/`.
3. **A collision rule.** When two files could answer the same tag, the outcome must be
   either a clean, documented override *or* a loud error — never a silent race on
   filesystem order.
4. **Self-contained homes.** A home already snapshots its `architecture.archml`
   (lifecycle §2). If that architecture uses a custom component, the home is **not**
   re-executable today — the custom `.js` lives only next to the author's original file.
   The vault must carry it too.

### How loading works today

`loadMindComponents(dom)` (src/startup/loadMindComponents.js):

- collects every unregistered hyphenated tag in the DOM, in document order;
- maps `m-foo` → `mFoo` (kebab→camel);
- asks `getMindComponentsPaths()` (src/config/componentLoading.js) for an ordered list of
  **base directories** — `[ -p CLI, MIND_COMPONENTS_PATH env, ./mindComponents (cwd),
  <src>/mindComponents ]`;
- for each tag, tries `import(`${base}/mFoo.js`)` in order and **the first import that
  succeeds wins**; if all fail, `skipload="true"` downgrades the failure to a warning,
  otherwise it is fatal.

So there is *already* a layered, first-wins search path — the bones of an override system.
But it has three weaknesses that block the four goals:

- **It resolves against a computed flat path per base**, so a base dir cannot be a tree —
  goal 1 has nowhere to go.
- **"First import that succeeds"** conflates *"file not here, try the next base"* with
  *"file is here but has a syntax/import error"* — a broken component silently falls through
  to a lower layer (or to "not found"), masking the real error.
- **It never sees a second answer**, so it cannot detect a collision (goal 3) or know which
  loaded components are non-built-in and need snapshotting (goal 4).

The loader also does not currently know the `.archml` file's directory — but it is
available: `getLoadedArchitecture()` (src/startup/architecture.js) returns `{ path, content }`,
and `<m-import src="…">` already resolves relative to that directory (architecture.js /
templating.js). Anchoring bundle-local components to the same directory is consistent.

---

## 2. The core idea: an architecture is a *bundle*, and so is a home

> **A bundle is `X.archml` + a sibling `components/` directory.**
> A vault home is *already* a bundle: `architecture.archml` + (proposed) `components/`.
> **One resolver rule serves all four goals** — authoring, running, snapshotting, and
> re-running a home — because a home is just another bundle the resolver reads.

This closure is the whole design. When we snapshot an author's `components/` into
`home/components/`, re-executing that home (`-a memory/<name>/architecture.archml`, or a
graveyard bundle via `retire.mjs`) resolves its custom components by the *same* rule that
loaded the original — no special case for "running from a home."

---

## 3. Layers and precedence

Replace the flat base-path list with ordered **layers**. Each layer is a *set of
directories at equal precedence*. Highest wins on override; a tie *within* one layer is an
error.

| # | Layer | Directory(ies) | Purpose |
|---|-------|----------------|---------|
| 1 | **cli** | `-p` / `--mind-components-path` dir | deliberate one-off operator override (testing, bug workaround) |
| 2 | **bundle** | `<dir(archml)>/components/` | the author's own components (goal 2) |
| 3 | **env** | `MIND_COMPONENTS_PATH` | a project's component library (the Studio sets it per external project) |
| 4 | **project** | `./mindComponents` (cwd) | external-project convention (existing) |
| 5 | **built-in** | `src/mindComponents/**` (recursive) | the shipped faculties (goal 1) |

**Precedence = specificity, with re-executability protected.** The bundle dir (adjacent to
the exact file being run) is more specific than the project-wide `MIND_COMPONENTS_PATH`
library, which is more specific than a cwd-level `./mindComponents`, then the shipped
built-ins. **`bundle` sits above `env`** so a home's snapshotted `components/` beats a
project's current library on re-execution — the Studio always sets `env` for an external
project, so a resident re-woken there must still resolve *its own* frozen components, not
whatever the library has drifted to. **`cli` (`-p`) stays on top** as the deliberate
override: a re-run of a home normally passes no `-p`, so putting it above the bundle costs
re-executability nothing while keeping the workaround escape hatch (see §7.2).

The built-in layer becomes a **recursive scan of `src/mindComponents/`**, which is what
makes the hierarchy (goal 1) free: the loader does not care whether `mStream.js` sits in
`mind/` or at the root — it finds it anywhere in the tree, and *errors if it finds two*.
The folder layout is then purely for humans and can be refined without touching the loader.

---

## 4. Resolution algorithm (the collision rule)

Build, per layer, a `Map<camelName, string[] paths>` by scanning that layer's directories.
The **bundle** and **built-in** layers are scanned recursively (so components may be nested
/ organised into folders); **cli/env/project** stay shallow, preserving the historical
`${base}/mFoo.js` lookup. Recursion skips `node_modules` and dotdirs so pointing a layer at
a project root can't sweep up unrelated modules. Then to resolve a requested tag `T`
(camel `C`):

```
for each layer L, highest precedence first:
    hits = L.index[C] ?? []
    if hits.length >= 2:                       # two answers at equal precedence
        FATAL: ambiguous component `T`; name a winner. Paths: <hits>
    if hits.length == 1:
        winner = { path: hits[0], layer: L }
        for each lower layer L' with a hit:    # someone below is being shadowed
            WARN: `T` resolved from <winner.path> (<L>), shadowing <L'.path> (<L'>)
        return winner
FATAL (or skipload → warn+skip): component `T` not found in any layer
```

- **Intra-layer duplicate → hard error.** This is goal 3's *"error when multiple same-named
  components run."* Two built-ins named `mFoo.js` anywhere in the tree is a build mistake;
  two files in one `components/` dir is an author mistake. Both fail loudly with both paths.
- **Inter-layer duplicate → clean override + loud log.** This is goal 3's *"very clean
  override rules."* An author who drops their own `mMemory.js` in `components/` **overrides**
  the built-in on purpose, and the log says exactly what shadowed what. No silent surprise.
- **Only requested tags are checked.** Helper files (`loopMath.js`, `mBaseComponent.js`, …)
  are indexed by basename like everything else, but a collision is only *reported* for a tag
  that actually appears in the DOM — so an unrelated helper sharing a name never trips it,
  and we never need to distinguish "component" from "helper" during the scan.
- **The winning path is imported exactly once.** A syntax/import error in the resolved file
  now surfaces directly instead of being misread as "not here, try the next layer" — a
  strict improvement over today's first-success-wins loop.

`skipload="true"` keeps its meaning: a tag that resolves nowhere (or whose resolved module
fails to import/register) is downgraded to a warning only if some element with that tag
carries `skipload`; otherwise fatal, exactly as now.

---

## 5. What changes, concretely

### 5.1 `componentLoading.js` → a resolver

Replace `getMindComponentsPaths()` with `buildComponentResolver({ archmlPath })` returning
`{ resolve(tag) → {path, layer} | throws, loadedSources() → [{tag, path, layer}] }`.
`archmlPath` comes from `getLoadedArchitecture()?.path` (null in unit tests that build the
DOM directly — those simply have no bundle/project layer, only explicit + built-in, so they
are unaffected). Directory scanning is a one-time `fs.readdir` walk per layer at startup —
trivial for ~55 files.

### 5.2 `loadMindComponents.js`

`importModuleForTag` calls `resolver.resolve(tag)` and imports the single resolved path
(via `pathToFileURL`), instead of looping bases. The two-phase deferred-define machinery
(the careful comment block about document order and `connectedCallback`) is untouched — only
*where the module comes from* changes. The loader records each resolved winner so the
snapshot step (§5.4) can ask `resolver.loadedSources()` for the non-built-in ones, mirroring
how `mMemory` already asks `getLoadedArchitecture()`.

### 5.3 Built-in reorg (goal 1) — a *separate, mechanical* step

Because the built-in layer is a recursive scan, the physical move is invisible to the loader
and can land **after** §5.1–5.2 as its own commit. Proposed buckets (assign by which
root's subtree uses a tag; a tag used by ≥2 roots is `shared`):

```
src/mindComponents/
  mind/     mMind mStream mMemory mResurface mAssociate mTimeout mSpeech mPhrase
            mClearMind mEconomy mDaylight mLoopGuard mRecall mInterrupts mRegion
            mFeed mKb mImage mWeather mObserver mSense mFacts mFact mPrompt …
  agent/    mAgent mReason mObjective mContext mJobs mReport mRepeatGuard
            mReadFile mWriteFile mEdit …
  shared/   mAct mWs mTerminal mLook mNote mOrigin mLoopDetector mConsole
            mBaseComponent i18n loopMath recallSources toolSchema fileTool …
```

**Migration risk to respect:** intra-directory relative imports. `./mBaseComponent` is
imported by 33 files, `./i18n` by 9, `./mObserver` by 8, plus `mSense`, `loopMath`,
`recallSources`, `fileTool`, `toolSchema`. Moving a file breaks these unless the import
path is rewritten. Do the move as a codemod (move file → rewrite `./x` to the correct
`../shared/x` etc.), and gate it with the collision test below. This is why the reorg is
sequenced last: nothing else depends on it, and it is the only change that can break a
working tree by a stale relative path.

### 5.4 Self-contained homes (goal 4) — `mMemory._snapshotArchitecture`

Today it writes `architecture.archml` into the home. Extend it (rename → `_snapshotBundle`):

- If any loaded component resolved from the **bundle** layer, copy that whole `components/`
  directory into `home/components/`. *Wholesale*, not just the winners — a custom component
  may import a local helper (`components/myWidget.js` → `./myUtil.js`), and copying only the
  tag-winner would break the re-run. The bundle dir is the author's own, so copying it
  entirely is correct and gives a clean archival boundary. (This is the main reason to
  prefer a dedicated `components/` subdir over loose `.js` beside the archml — see §7.)
- For winners resolved from the **explicit**/**project** layers that are not already inside
  the bundle copy, copy the individual file into `home/components/` and `WARN` that a
  component with its own local dependencies from those layers may not be fully captured —
  recommend placing shared custom components in the bundle `components/` for guaranteed
  re-executability. (Honest about the transitive-dependency limit rather than silently
  copying an entire external `-p` tree into every home.)
- **Skip any copy whose source already lives inside the home** — when re-running a home,
  the bundle dir *is* `home/components/`, so the copy is a no-op and must not clobber.
- Best-effort, like the existing snapshot: a copy failure warns, never blocks the wake.

`commitVault(msg, home)` stages the home path recursively (`git add -- <rel>`), so the new
`home/components/` is committed with the wake/periodic/sleep commits automatically.
`tools/retire.mjs` `git mv`s the whole home into the graveyard, carrying `components/` along
with `architecture.archml` — the graveyard bundle becomes re-executable for free.

---

## 6. Testing

- **Resolver unit tests** (`architecture/tests/unit/`): precedence (bundle overrides
  built-in), intra-layer duplicate → throws with both paths, inter-layer shadow → warns and
  picks the higher, not-found → throws (and `skipload` → null), helper name-clash on an
  unrequested tag → no error.
- **No-duplicate-basename test** over `src/mindComponents/**`: asserts the built-in tree is
  a single flat namespace. This is the invariant that makes the recursive scan safe, and it
  guards the reorg codemod.
- **Wiring test** (`architecture/tests/wiring/`): a bundle component beside a throwaway
  `.archml` loads; a bundle `mNote.js` overrides the built-in and the override is logged.
  (Extends the existing `load-components-error.test.js`, which already exercises a custom
  component via `MIND_COMPONENTS_PATH`.)
- **Snapshot test** (extend `architecture-snapshot.test.js`): a mind using a bundle
  component writes `home/components/…`, and re-loading `home/architecture.archml` resolves
  that component from the home (the re-run closure) with no self-copy clobber.

---

## 7. Decisions to confirm

1. **Bundle-dir convention.** Recommended: a dedicated **`components/` sibling directory**
   next to the `.archml`. Alternatives: loose `.js` files *directly* beside the archml
   (literally "next to the file", but the snapshot then cannot copy a clean directory — it
   would sweep up the `.archml` and unrelated files, forcing winners-only copies and
   reintroducing the transitive-dependency gap); or a per-file `<name>.components/` for
   isolation when several archml files share one directory (e.g. `architecture/agents/` has
   5). A shared `components/` per directory is simpler and mirrors how built-ins are shared;
   homes are isolated at rest regardless, since each snapshots into its *own*
   `home/components/`.

2. **Where do `-p` and `env` sit relative to `bundle`?** RESOLVED (2026-07-03, with the
   user): `-p` > `bundle` > `env`. The two override sources split by role. `env`
   (`MIND_COMPONENTS_PATH`) is a *project-wide library* — the Studio sets it for every
   external-project run — so it must sit *below* the bundle: a resident re-woken via the
   Studio (env set) has to resolve *its own* snapshotted `components/`, not a library that
   has since drifted. `-p` (CLI) is the *deliberate one-off* override (testing, a bug
   workaround); it stays on top because a home re-run passes no `-p`, so putting it above the
   bundle costs re-executability nothing. (Rejected: a single `explicit` layer over the
   bundle — it would let the Studio's persistent env silently shadow a home's frozen
   components; and bundle-always-wins — it would ignore a deliberate `-p` workaround.)

3. **Silent built-in override, or opt-in?** Recommended: allow a bundle component to
   override a built-in, but always `WARN` (shadow log). The stricter alternative is to
   *error* on a bundle-vs-built-in name clash unless the element opts in (e.g.
   `override="true"`), trading convenience for a guardrail against an accidental shadow.

---

## 8. Sequencing

- **M1 — resolver + loader (goals 2, 3). ✅ DONE (2026-07-03).** Introduced
  `src/config/componentResolver.js` (scan + resolve + collision rule + override log + the
  load-scoped `getLoadedComponentSources()`/`getBundleComponentsDir()` state M2 will read),
  rewrote `getComponentLayers` in `componentLoading.js`, and pointed `loadMindComponents.js`
  at the resolver. No files moved. `architecture/tests/unit/component-resolver.test.js`
  added; CLI help updated. A resolved file is now imported exactly once, so its own
  syntax/import error surfaces directly instead of falling through to a lower layer.
- **M2 — self-contained homes (goal 4). ✅ DONE (2026-07-03).** `mMemory._snapshotArchitecture`
  now also calls `_snapshotComponents`: the bundle `components/` dir is copied wholesale into
  `home/components/` when a component resolved from it, plus cli/env/project winners
  individually (with the transitive-dep warning); a copy whose source is already inside the
  home is skipped (the re-run no-op). `architecture/tests/wiring/component-snapshot.test.js`
  added (+ a built-in-only no-op guard on `architecture-snapshot.test.js`); `retire.mjs`
  docstring updated. `commitVault` already stages the home recursively, so `home/components/`
  is committed with the wake/sleep commits and `git mv`'d into the graveyard for free.
- **M3 — built-in reorg (goal 1).** Codemod the move + relative-import rewrites; the
  no-duplicate-basename test; update `cli.js -p` help and `doc/configuration.md`.

M1 alone already delivers user-extensible, collision-safe loading; M2 makes those extensions
survive into the vault; M3 is the cosmetic tree the loader was made indifferent to.
