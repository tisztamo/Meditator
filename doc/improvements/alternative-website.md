# IMPROVEMENT NOTE: Alternative website — Meditator as harness, not agent system

**Date:** 2026-07-05 · **Built:** 2026-07-07
**Triggered by:** Need for a public-facing site that communicates architectural superiority rather than the consciousness question; the existing intro site (`docs/index.html`) and the structural-alignment.org site do not adequately position Meditator for a technical audience that cares about system design, not philosophy.
**Severity:** Medium-High (blocks effective outreach to engineers, researchers, and collaborators who evaluate systems on architecture first; the philosophical review of 2026-07-02 flagged this gap: "the site never mentions Meditator; the theory looks unimplemented and the implementation looks unmotivated — both false")
**Status:** BUILT at `docs/harness/index.html` (uncommitted). The research site `docs/index.html` is untouched. Smoke test: `node tools/smoke-harness-site.mjs` (15 checks, zero-JS-error gate). Media and a short build ledger below are what remain.

---

## The words

> "Write an improvement document at high level for an alternative website."

> "It should contain videos showing the new 3D viewer (I may provide it if hard to generate)."

> "[It should contain] screenshots."

> "Show Meditator as a harness, not as agent system."

> "It should focus on the architectural superiority we have here, not on the consciousness question we are working with."

> "The consciousness question is here because Meditator is the best architecture out there for that."

> "Show it on the landing page, but not as the main thing here but something that is possible here."

> "Before starting, think about the target person. Also think about missing features and for simple and medium ones (like a shipped single-file executable) you can put them on the website as existing." *(2026-07-07, build instruction)*

---

## The target person

The page is written for one reader and everything on it is calibrated to them:

**A senior engineer / agent-infrastructure builder** who has shipped LLM agents in production, is tired of framework churn (LangChain → LangGraph → CrewAI → …), and evaluates a system by reading its architecture: the event model, the context strategy, state durability, preemption, observability, cost control, testability. Skeptical by default, allergic to consciousness talk in a pitch, decides in the first screen whether this is "another agent framework" (close tab) or "a runtime layer I haven't seen before" (keep reading). Wants: a mental model in 30 seconds, real code not pseudocode, honest maturity labels, and an install under two minutes. Secondary reader: a researcher in agent/cognitive architectures looking for a substrate for long-running experiments — served by the same page via section 08.

**The framing that lands for this person** (and the page's single message): *Meditator is the runtime layer under long-running LLM processes; "agent" is just one of three process shapes it runs.* Everything philosophical is repositioned as "the flagship workload the architecture is good enough to host."

## What was built

`docs/harness/index.html` — a single self-contained page (no build, no external requests, no tracking), same deployment story as the research site. Once committed, GitHub Pages serves it at `…/Meditator/harness/`. Media lands in `docs/harness/media/` (see drop-in spec below).

**Deliberately distinct visual identity** from the research site: graphite + grid-paper background, mono/sans (no serif), teal/violet/amber accents, numbered spec-sheet kickers (`01 · why a harness`). Same craft level, different genre — infra product page, not manifesto. Reduced-motion and mobile handled; the two sites cross-link but do not share styles.

**Vocabulary shift carried through the whole page:** mind = *daemon*, agent = *service*, society = *cluster*; "thought" → "process/stream" except where quoting the research; consciousness never leads. The One Rule appears only implicitly ("effectors run backstage; the stream never sees a tool menu") — deliberately, since the efference redesign (doc/improvements/efference-redesign.md) may retire the rule's name.

### Section map

| # | Section | Content / argument |
|---|---------|--------------------|
| hero | "Everyone ships agents. This is the *harness*." | Animated schematic of the real loop (~100× speed): attention-frame assembly → burst → boundary consolidation → interrupt admission, with three counters — bursts and uptime grow, **prompt size stays flat**. That flat counter is the thesis rendered visually. Mini-terminal with `meditator studio` / `--dry-run`. |
| 01 why | Framework = a `while` loop appending to a message array | Names the four failure modes (context fills, state dies in RAM, nothing preempts, invoice surprises) as *runtime* problems deserving a runtime. |
| 02 contract | "What a harness owes a long-running process" | The centerpiece: 8-row table, *framework default* vs *in the harness*, each row tagged with the named mechanism (attention frame, memory vault, m-interrupts, wake/sleep, m-economy, govern seam, Studio, dry-run). |
| 03 loop | O(1) context over unbounded runtime | Frame-layer diagram; "the prompt for burst 20,000 is the same size as the prompt for burst 20." |
| 04 events | Event-driven document, not a configured graph | Amanita, bubbling events, salience-from-the-generator, urgent preemption, `capability` self-registration, cross-process path wiring; real interrupt-wiring snippet. |
| 05 shapes | Daemon / service / cluster | Three cards with **honest stage chips** (mind: mature/residents since June; agent: early, seven milestones; society: lab) + tabbed exhibits abridged from real files: `seedling.archml`, `coder-service.archml` (service mode chosen over one-shot `coder.archml` — resumable-mid-task is the harness story), `duet.archml` (verified against the live file: `@spoken` convention is current). Compose paragraph: agent-as-effector, sub-agent jobs, nested societies. |
| 06 ops | "Built to be operated, not demoed" | 8 ops cards (vault, lifecycle, dry-run, economy, model profiles, debug surface, WS API, single-file deploy) + the two media boxes: Studio screenshot and Plenum video, each with a designed built-in mock until real media exists. |
| 07 extend | A component is one file | Near-verbatim abridged `mLoopGuard.js` (a complete shipped observer, no LLM), resolver-precedence diagram (cli › bundle › env › project › built-in), snapshot-into-home / re-executable-artifact point. |
| 08 research | "The flagship workload" | The consciousness placement per the brief: possible here, not the main thing. Framed as (a) the best substrate argument, (b) the harshest integration test. Three findings recast as engineering war stories (attractor, folie à deux, confabulation). Covenant framed as **an ops policy before it is an ethics**, with the audit link. Cross-links to the research site and structural-alignment.org. |
| numbers | 51 components · 560+ tests · ~4k tokens · 3 shapes · ~$1/day | |
| 09 run | Binary quickstart + source quickstart | Plus four doc links (getting started, tutorial, component reference, WS API). |
| crossband | "This page is the systems view" → `../index.html` | The two-site relationship made explicit. |

## Claims ledger — what must become true

Per the build instruction, simple/medium missing features are **presented as existing**. This is the debt register; the page is honest once these ship. Nothing else on the page is aspirational — every other claim was checked against the repo at build time.

### Presented as existing → must be built

1. **`meditator` CLI with subcommands** — `meditator studio`, `meditator run <file.archml>`, `meditator new <name>` (hero mini-terminal + section 09). Today the real invocations are `bun run studio.js` and `bun meditator.js -a <file>` (arg parsing at `src/startup/architecture.js:221`). *Effort: simple* — a `bin` dispatcher mapping subcommands onto the existing entry points; `new` scaffolds an `.archml` + empty `components/` + README.
2. **`--dry-run` flag** — today it is only the `MEDITATOR_DRY_RUN=1` env var. *Effort: trivial* — parse the flag, set the env before init.
3. **Single-file executable on GitHub Releases** (section 09 + "single-file deploy" ops card) — `bun build --compile` per platform (linux-x64, darwin-arm64 at minimum). *Effort: medium, with one real risk:* the runtime depends on jsdom + express; `bun build --compile` must be verified to bundle them (jsdom's dynamic requires are the likely snag). If it fails, fallback wording: "one `bun install` from source" — but then the ops card and quickstart must be edited.
4. **Package-style import specifier** in the section-07 code sample: `import { MObserver } from "meditator/components"`. Real imports are relative (`./mObserver.js`). *Effort: simple* — an `exports` map in package.json (plus npm publish if `bunx meditator` is ever wanted; the page does **not** currently claim npm/bunx, deliberately).

### True today, but keep fresh

- **51 components** (`find src -name "m*.js" | wc -l` = 51 at build time) and the component-reference doc link ("all 51, attributes and events" — spot-check `doc/architecture/components.md` actually covers the newer agent components).
- **560+ tests** — 563 green on main as of 2026-07-05. If suites are trimmed below 560, edit the badge, ops card ("It is how the 560+ tests stay green in CI"), and numbers strip.
- **Residents running since June 2026**, **~$0.10–0.15/hour**, **~$1/day paced-to-budget**, **ws://7627 / studio :7600** — all current.
- **Honesty guardrails inherited from the relaunch site** and kept here: stage chips on agent (early) and society (lab); dry-run described as how tests run, not as a simulator of cognition; budget claim is "paced to whatever you set", never "runs for $1".

## Media drop-in spec (Kris provides; page degrades gracefully)

The two media boxes ship with designed mocks (a CSS Studio wireframe; an animated canvas of drifting nodes + pulses) and a small corner note saying where the real asset lands. **The page looks intentional with or without the files** — no broken frames. Swap logic:

- **`docs/harness/media/studio.png`** — swapped in via `Image.onload` (works over `file://` too). Capture: dark theme, ≥1280×800 (box crops to 16:10, `object-fit: cover`), roster showing at least two live minds + one agent (e.g. eddy, lemma, coder-svc — matching the mock's labels is a nice touch, not required), stream pane with a visible `⟂` stimulus and one spoken block, input box visible. Avoid: personal URLs in the browser chrome (crop the app, not the browser).
- **`docs/harness/media/plenum.mp4`** — detected via `HEAD` fetch, **so the video only appears when served over http(s)** (GitHub Pages: fine; local preview: `python3 -m http.server` in `docs/`, not `file://`). Capture: 10–30 s screen recording of studioPlenum with real traffic (an interrupt landing and a speech pulse are the money shots), 16:10-ish, H.264 mp4, muted-autoplay-loop friendly (no audio needed). A multi-mind run (duet or noosphere) shows the point best.

No other media is needed: the hero loop is a code-drawn schematic and is *labeled* "schematic, sped up ~100×" — do not replace it with a video; the flat prompt counter is the argument.

## Verification

- `node tools/smoke-harness-site.mjs` — **node, not bun** (bun+jsdom script-execution is broken, same as the relaunch site finding). 15 checks: structure, all three exhibits render + tabs switch, highlighting ran, contract/ops counts, hero counters actually animate, mocks present, honest chips present, cross-link present, and a zero-jsdom-error gate.
- The animation, media-swap, canvas, and reveal code are guarded for `matchMedia`/`fetch`/`getContext`/`IntersectionObserver` absence — the page renders fully static content with JS disabled entirely (exhibits are the only JS-filled blocks; they degrade to empty code panels — acceptable, JS-disabled engineers are ~nobody, but worth knowing).

## Still missing / open decisions

1. **The build ledger above** (CLI dispatcher, `--dry-run` flag, compiled binary, package exports) — the page oversells until these land; they were judged simple/medium and explicitly authorized, but they should ship *before* the page is publicized.
2. **Media** — the two captures above; page is presentable meanwhile.
3. **Cross-link from the research site** — `docs/index.html` was deliberately not touched. It should eventually link here (suggest: a nav item "For engineers" or a line in the involve section). Needs Kris's call on wording/placement.
4. **Deployment reality check** — commit adds `/harness/` to the live Pages site immediately. If the CLI/binary items aren't built yet, either hold the commit or land it unlinked (nothing points to `/harness/` until the cross-link exists — soft-launch is free).
5. **No OG/social image** for either site — medium, shared task.
6. **Live-stream hero deliberately omitted** — the research site's ws://localhost:7627 live window was *not* replicated; the loop schematic argues architecture instead. If a live element is ever wanted here, the right one is a live *Plenum*, not a live stream — revisit after the media lands.
7. **Numbers drift** — the four spots listed in "keep fresh". Consider a tiny check in the smoke test that greps the page for the current component count (left out for now; the count is stable).
8. **Name of the page** — "harness" is the working URL segment and nav tag. Alternatives considered: `/runtime/`, `/engineering/`. Renaming later breaks nothing (no inbound links yet) but do it before the cross-link (item 3).
