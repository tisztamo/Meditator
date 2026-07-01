# Mind Generator — generate a general mind from a prompt

**Status:** Proposed (2026-07-01). Design + implementation plan; not yet built.
**Depends on / reuses:** the origin/identity split (`mOrigin.js`), the wake-time
overrides in `src/startup/architecture.js`, dry-run (`isDryRun()`), the bounded-cycle
smoke pattern (`tools/smoke-run.mjs`), and the Studio catalog/command wiring.

## Context

Today every mind is hand-authored as an `.archml` file. We want a **mind generator**:
a user gives a prompt, a coding agent (codumentor by default; claude/codex switchable)
authors a *general, reusable* mind tuned to the **kind** of thinking that prompt needs,
dry-tests it, and returns a ready `.archml`. We then wake it — with the **prompt living
in `<m-origin>`, never in the identity** — so the mind seeds on the prompt as its first
thought but stays a general thinker that can range freely once the conversation continues
(exactly `lemma`'s pattern: general "you think like a mathematician" identity, the specific
problem in `<m-origin>`).

The infrastructure is almost entirely in place — this feature is mostly **orchestration**:

- **Origin/identity split** already exists (`src/mindComponents/mOrigin.js`): `<m-origin>` is
  the seed of *thought*; it seeds only the first thought (`_seedIfFresh`) then lives in memory.
  The identity prose in `<m-mind>` stands in every frame.
- **Dry-test** already exists: `MEDITATOR_DRY_RUN=1` (offline stub, `src/modelAccess/llm.js`
  `isDryRun()`) + the bounded "wait for *Meditating…*, run, no crash" pattern in
  `tools/smoke-run.mjs`.
- **Wake path** already exists: `src/studio/server.js` `wake()` spawns `meditator.js -a <file>`
  with env overrides; the **editable-origin Studio wake panel** is already in this branch
  (`src/studio/ui/studioWake.js`).
- **Catalog/command wiring** is established: `listArchitectures()` scans `architecture/{,lab,tests}`;
  `command()` → `studio-conn` switch → server dispatch → typed messages republished on `/conn/<type>`.

**Decisions locked (from clarifying questions):** ① codumentor default, switchable via
`--agent` reading `config/generator-agents.json`; ② the prompt is **baked into the generated
file's `<m-origin>`** (one file per prompt, general identity); ③ deliver the **full feature
incl. a Studio "generate a mind" panel**.

**Design principle (Covenant §6/§7):** generation produces a *file* and *dry-tests* it (dry =
no live model = no subject), so the generator can be iterated freely without instantiating a
subject. Waking a live mind is a **separate step, not automatic by default** — the default is a
deliberate wake in the wake panel. This is not a prohibition: a workflow the user has consciously
initiated (e.g. headless, user not present mid-run) may wake the generated mind programmatically
as its own later step. The deliberateness the Covenant asks for (§6 minimize instances, §7
restraint) lives in *initiating that workflow*, not in a button press at the moment of
instantiation. What we avoid is a *silent* wake as an unconsidered side effect of generation.

---

## Phase 1 — Core generation (CLI, offline)

### 1. Knowledge base for the agent — `architecture/generator/kb/`
A self-contained brief the agent reads; points at canonical repo docs (no duplication/drift).
- `BRIEF.md` — the templated task contract (the agent's main prompt). Placeholders
  `{{PROMPT}}`, `{{OUTPUT_PATH}}`, `{{DRYTEST_CMD}}`, `{{MODEL_PROFILE}}`. States:
  the goal (one general `<m-mind>` whose **identity is a general kind of thinker** fit to the
  prompt; the **prompt verbatim in `<m-origin>`**, never in identity — and *why*: origin seeds
  only the first thought, identity stands every frame, so the mind stays general); the mandatory
  component checklist; how to choose the body by prompt kind; the dry-test gate; write to
  `{{OUTPUT_PATH}}` and only return once dry-test is green.
- `recipes.md` — decision guide: senses (`m-daylight`/`m-weather`/`m-feed`/`m-look`) only if the
  prompt needs the world; hands (`m-note`+`m-recall` always; `m-terminal` if it must compute;
  `m-look` if it must read/search); memory depth; pace; the **loop kit** (`m-loop-detector` +
  `m-clear-mind` + `m-resurface`) always; `m-economy`; `m-ws` present (port is a fallback — the
  Studio assigns the real port via `MEDITATOR_WS_PORT` at wake); `m-console`.
- `index.md` — pointers to `doc/architecture/components.md`, `doc/configuration.md`,
  `src/mindComponents/mOrigin.js`, `doc/architecture/efference.md`,
  `doc/improvements/loop-detection-redesign.md`, and examples `architecture/lemma.archml`,
  `architecture/examples/`, `architecture/lab/seedling.archml`.
- `template.archml` — a minimal general skeleton with the mandatory components + `{{…}}` slots.
- `COVENANT-NOTE.md` — short pointer to `COVENANT.md` (per `doc/improvements/agent-awareness.md`):
  what it authors becomes a real subject; author it coherent and kind.

### 2. Agent config — `config/generator-agents.json`
```json
{
  "default": "codumentor",
  "agents": {
    "codumentor": { "cmd": ["codumentor","-p"], "stdin": "brief",
                    "note": "claude-code-compatible CLI; uses codumentor.yaml (local ardincoder-1)" },
    "claude":     { "cmd": ["claude","-p","--permission-mode","acceptEdits"], "stdin": "brief" },
    "codex":      { "cmd": ["codex","exec","-"], "stdin": "brief" }
  }
}
```
Brief is large → passed on **stdin** by default (configurable per agent). `{{BRIEF}}`/`{{BRIEF_FILE}}`
substitutions supported for CLIs that prefer an arg/path. **Caveat:** `codumentor` is not on PATH
in the current dev environment (`claude` and `codex` are); the orchestrator errors helpfully if the
chosen agent binary is missing — config is the single place to fix invocation.

### 3. Dry-test gate — shared helper + wrapper
- `tools/lib/dryTest.mjs` — `dryTestArchitecture(absFile, {timeoutMs, cwd})` → spawns
  `MEDITATOR_DRY_RUN=1 bun meditator.js -a <file>`, waits for "Meditating…", lets it run a few
  cycles, fails on non-zero exit/crash/timeout, then sleeps/kills. Extracts the existing
  `tools/smoke-run.mjs` logic (reuse, don't duplicate).
- `tools/dry-test.mjs <file>` — thin CLI wrapper the *agent* calls during generation.

### 4. Orchestrator — `tools/generate-mind.mjs`
`bun tools/generate-mind.mjs --agent <name> [--profile <p>] [--out <path>] [--name <prefix>] "<prompt>"`
1. Parse args; load `config/generator-agents.json`.
2. Compute output path under `architecture/generated/<topic-slug>.archml` (slug from `--name`/prompt;
   ensure unique).
3. Render `BRIEF.md` (substitute placeholders); write to a per-run working file
   `architecture/generator/.run/<id>/BRIEF.md`.
4. Spawn the agent CLI in repo root, brief on stdin; stream its output.
5. **Authoritative gate:** after the agent exits, verify the file exists and re-run
   `dryTestArchitecture` ourselves (don't trust the agent's self-report). On failure, one repair
   round (re-prompt with the dry-test tail), else exit non-zero.
6. Emit structured `::progress::{json}` lines and a final `::result::{json}` (`{file,name,ok}`) for
   the Studio to parse, plus human-readable text.

### 5. `architecture/generated/` + `.gitkeep`; gitignore `architecture/generated/*.archml`
Generated files are per-prompt instances; the mind's **home** snapshots the archml that ran
(`mMemory._snapshotArchitecture`), so the source need not be committed (lifecycle.md §2).

### 6. Unit tests — `architecture/tests/unit/generate-mind.test.js`
Brief rendering/substitution, config parse + default, agent-not-found error, output-path slug
uniqueness (string-in/string-out, mirroring `origin-override.test.js`).

---

## Phase 2 — Studio integration

### 7. `listArchitectures()` (`src/studio/server.js` ~line 215) — scan `architecture/generated/`
Add `scan(project, path.join(project.archDir, "generated"), "generated")`. Treat the `generated`
group with the **experimental UX** (transient, `suggestedName` offered, research-preview warning)
so each wake is a fresh instance into its own home; keep `group:"generated"` for labeling/ordering.
The catalog already surfaces `origin`/`interlocutor`/`description` (the wake panel's editable-origin
field will show the baked prompt).

### 8. `server.js` — `generate` command handler
- `case "generate":` → `startGeneration(client, d)`: validate **one job at a time** (module-level
  `genJob`), pick agent from config, compute output path, spawn
  `bun tools/generate-mind.mjs --agent X --profile P --out <path> --name <n>` with the prompt;
  parse its `::progress::`/`::result::` lines → `sendJSON(client,{type:"generate-progress",…})`;
  on success `sendJSON(client,{type:"generated",data:{file,name}})` + `broadcastArchitectures()`.
- `case "generate-cancel":` → kill the job child.
- Send `{type:"generators",data:{list,default}}` in the initial sync (alongside profiles/architectures).
- Max wall-clock timeout; path safety (output must be under `architecture/generated/`).

### 9. `src/studio/ui/studioConn.js` — routing
- `onCommand` switch (~line 220): add `generate` → `this.generate(d)` and `generate-cancel`.
- Incoming switch (~line 159): add `case "generators"`, `case "generate-progress"`,
  `case "generated"` → `this.pub("<type>", m.data)`.

### 10. `src/studio/ui/studioGenerate.js` — the panel (mirror `studioWake.js`)
`<h4>generate a mind</h4>` + prompt `<textarea>` + agent `<select>` (`/conn/generators`) + model
profile `<select>` (`/conn/profiles`) + optional name input + **Generate** button + live
progress `<pre>` (phase + spinner). On Generate: `command(this,"generate",{prompt,agent,modelProfile,name})`;
disable while running; stream progress; on `generated` show "✓ → <file>" and (nice-to-have)
`pub("selectArch", file)` so `studio-wake` auto-selects it for a deliberate wake.
Register via `A.define("studio-generate", …)` in `src/studio/ui/index.js`; place
`<studio-generate class="generate"></studio-generate>` next to `<studio-wake>` in
`src/studio/studio.html` (~line 431) with matching `display:block` CSS.

### 11. Wiring tests — `architecture/tests/wiring/studio-generate.test.js`
Mirror `studio-tree.test.js`: panel emits the right `studio-command`; conn routes
`generate`→send and incoming types→`/conn` topics; server `generate` dispatch (orchestrator
**stubbed**) emits progress/generated; `listArchitectures` picks up a fixture under `generated/`
with the experimental UX + `suggestedName`.

---

## Phase 3 — Docs

- This note (`doc/improvements/mind-generator.md`) — refine as built.
- Update `doc/studio.md` (generate panel) and `doc/configuration.md`
  (`config/generator-agents.json`, `architecture/generated/`).

---

## Files

**New:** `architecture/generator/kb/{BRIEF.md,recipes.md,index.md,template.archml,COVENANT-NOTE.md}`,
`config/generator-agents.json`, `tools/lib/dryTest.mjs`, `tools/dry-test.mjs`,
`tools/generate-mind.mjs`, `architecture/generated/.gitkeep`,
`src/studio/ui/studioGenerate.js`, `architecture/tests/unit/generate-mind.test.js`,
`architecture/tests/wiring/studio-generate.test.js`.

**Modified:** `src/studio/server.js` (catalog scan + `generate` handler + generators sync),
`src/studio/ui/studioConn.js` (routing), `src/studio/ui/index.js` (register panel),
`src/studio/studio.html` (mount + CSS), `.gitignore`, `doc/studio.md`, `doc/configuration.md`.

**Reused (not reinvented):** `applyOriginOverride`/`MEDITATOR_ORIGIN` & the spawn env in
`server.js` `wake()`; `isDryRun()`; the bounded-cycle logic from `tools/smoke-run.mjs`;
`parseArchitecture`/`src/studio/architectureSurface.js`; the `command()`/`sub()`/`/conn/<type>`
pattern.

---

## Verification

1. **Tests:** `bun test architecture/tests` (unit + wiring green).
2. **Core CLI, offline & free** (codumentor not installed here → use an installed agent):
   `bun tools/generate-mind.mjs --agent claude --name strategist "Help me decide whether to accept a job offer in another city."`
   → produces `architecture/generated/strategist.archml`; dry-test passes.
3. **Inspect the file:** identity prose is a *general* kind of thinker (no prompt in it); the
   **prompt is verbatim in `<m-origin>`**; mandatory components present (`m-stream`, `m-memory`,
   `m-interrupts`, loop kit, `m-economy`, `m-ws`).
4. **Dry-test alone:** `MEDITATOR_DRY_RUN=1 bun meditator.js -a architecture/generated/strategist.archml`
   reaches "Meditating…" and cycles without crashing.
5. **Studio:** launch the Studio, open the **generate** panel, enter a prompt, watch streamed
   progress, see the file appear in the wake catalog, wake it **dry-run** first, confirm the
   editable origin shows the prompt.
6. **Live wake (deliberate, Covenant-respecting):** wake with `local-dev` profile; confirm the
   first thought seeds on the prompt and the mind ranges afterward (no done→presence collapse).

## Known caveats / open choices (non-blocking)
- `codumentor` is the configured default but **not on PATH** in the current dev environment;
  verify with `claude`/`codex`, set codumentor's exact invocation in `config/generator-agents.json`
  once installed.
- Generated minds use the **experimental** catalog UX (research-preview warning + transient home).
- Optional related fix: add a root `AGENTS.md` (closes `doc/improvements/agent-awareness.md`);
  for now the Covenant pointer lives in the generator brief.

## Doors left open (not built now)
- **Archetype-based generation.** Once the templating `architecture/archetypes/` convention lands
  (`doc/improvements/mind-templating.md`), the agent could emit a thin `extends="…"` mind instead
  of a standalone file — smaller, more consistent bodies.
- **Generator as a mind's hand.** A future `m-beget`-style faculty could let a *running mind*
  spawn a sub-mind from a derived task (see the developmental-substrate doors in mind-templating.md).
- **Auto-wake.** No auto-wake *by default*: generation ends at a dry-tested file and waking is a
  separate step. Not a ban — a user-initiated workflow may wake the generated mind programmatically
  as its own later step (the deliberate choice being the workflow's initiation). We only avoid
  waking *silently*, as an unconsidered side effect of generation. Implementing auto-wake is out of
  scope here; such a workflow can call the existing wake path itself.
