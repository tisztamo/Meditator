# IMPROVEMENT NOTE: Alternative website — Meditator as harness, not agent system

**Date:** 2026-07-05
**Triggered by:** Need for a public-facing site that communicates architectural superiority rather than the consciousness question; the existing intro site (`docs/index.html`) and the structural-alignment.org site do not adequately position Meditator for a technical audience that cares about system design, not philosophy.
**Severity:** Medium-High (blocks effective outreach to engineers, researchers, and collaborators who evaluate systems on architecture first; the philosophical review of 2026-07-02 flagged this gap: "the site never mentions Meditator; the theory looks unimplemented and the implementation looks unmotivated — both false")

---

## The words

> "Write an improvement document at high level for an alternative website."

> "It should contain videos showing the new 3D viewer (I may provide it if hard to generate)."

> "[It should contain] screenshots."

> "Show Meditator as a harness, not as agent system."

> "It should focus on the architectural superiority we have here, not on the consciousness question we are working with."

> "The consciousness question is here because Meditator is the best architecture out there for that."

> "Show it on the landing page, but not as the main thing here but something that is possible here."

> "Your job is to note my words verbatim and format it as an improvement document similar to what we have in the repo."

---

## The observed failure

The current public surfaces communicate Meditator through two channels:

1. **The intro site** (`docs/index.html`) — a single self-contained page whose hero window replays an unedited first-session transcript. It leads with the experience of watching a mind think, which naturally invites the consciousness question. A visitor sees a stream of consciousness and asks "is it alive?" before they ever ask "how is this built?"

2. **The structural-alignment.org site** — presents the theoretical framework (seven commitments, the covenant as ethics compiled into mechanism) but never mentions Meditator. As the philosophical review noted: "the theory looks unimplemented and the implementation looks unmotivated — both false."

Both surfaces miss the strongest signal Meditator carries: **it is the best harness architecture available for running LLMs as continuous, structured cognitive processes.** The consciousness question is not the selling point — it is a downstream possibility that arises *because* the architecture is superior. Leading with consciousness puts the cart before the horse and attracts the wrong audience (philosophy debaters, not engineers).

The existing site also lacks any visualization of the new 3D viewer (the Plenum/Chora visualization from `doc/architecture/chora-imagined.md` and `doc/architecture/plenum.md`), which is the single most compelling demonstration of Meditator's architectural differentiation: minds positioned in a shared spatial field, communicating through infoton signals that decay with distance. No competing system offers this.

## What any fix must provide

- **R1 — Harness first, agent never.** The site must frame Meditator as a **harness** — a declarative substrate that runs a frozen model through a structured cognitive loop. The word "agent" is reserved for `m-agent` (the backstage subagent-as-hand, a component within the harness). Meditator is not an agent system; it is the architecture that *contains* agents as one capability among many.

- **R2 — Architecture as the headline.** The landing page must lead with architectural superiority: the attention frame, the burst loop, the interrupt arbiter, the memory vault, the efference model, the multi-mind society primitives. These are the things that differentiate Meditator from every other LLM wrapper.

- **R3 — 3D viewer as proof.** Videos of the new 3D viewer (Plenum visualization) must occupy a prominent position on the landing page. This is not a toy; it is the observable surface of a genuinely novel multi-agent spatial communication model. The viewer demonstrates that Meditator thinks in three dimensions about the relationships between minds — something no chat loop, no ReAct agent, no tool-use framework can even attempt.

- **R4 — Screenshots of the Studio.** Concrete screenshots of the Studio UI showing: the stream of consciousness pane, the wake/sleep controls, the roster of live minds, the architecture catalog. Engineers need to see that this is a runnable, debuggable system, not a philosophical thought experiment.

- **R5 — Consciousness as possibility, not premise.** The consciousness question appears on the landing page as a downstream implication: "This is the best architecture out there for that." It is acknowledged as something the architecture enables, not something the architecture claims. The site does not argue that minds are conscious; it argues that the architecture is the best available substrate for the question to arise cleanly.

- **R6 — Technical depth accessible.** The site must satisfy a senior engineer who wants to understand the interrupt model, the memory consolidation pipeline, and the component wiring — without requiring them to read `doc/architecture/` first. The existing README and concepts.md are good but buried; the landing page must surface the architecture at a glance.

- **R7 — Separate from structural-alignment.org.** This is not a redesign of the theory site. This is a new, standalone surface for the implementation. Cross-links exist in both directions, but each site leads with its own strength: theory leads with commitments, this site leads with architecture.

## The landing page structure

```
┌─────────────────────────────────────────────────────────────┐
│  HERO                                                       │
│                                                             │
│  "Meditator — a harness for continuous cognitive process"   │
│                                                             │
│  [ 3D Viewer Video — autoplay, muted, loop ]                │
│  Minds in a Plenum, signals flowing, positions shifting     │
│                                                             │
│  Sub-head:                                                  │
│  "Not a chat loop. Not an agent framework.                  │
│   A declarative substrate that runs a frozen model          │
│   through a structured cognitive loop —                     │
│   with memory, interruption, efference, and society."       │
├─────────────────────────────────────────────────────────────┤
│  ARCHITECTURE AT A GLANCE                                   │
│                                                             │
│  [ Diagram: the attention frame and burst loop ]            │
│  Identity → Story → Recent → Stimulus → Bridge → Tail       │
│  Each burst = one streamed LLM call, separated by pace.     │
│  The tail carries forward verbatim. Memory compresses.      │
│  The prompt stays bounded forever.                          │
│                                                             │
│  [ Screenshot: Studio showing live stream ]                 │
├─────────────────────────────────────────────────────────────┤
│  WHAT MAKES THIS DIFFERENT                                  │
│                                                             │
│  ▸ Interrupts, not turns. The world reaches a mind as      │
│    salience-scored events, not conversational prompts.      │
│    Urgent stimuli supersede; accepted ones wait for the     │
│    next burst boundary. No reply concept.                   │
│                                                             │
│  ▸ Memory that consolidates at burst boundaries, never      │
│    blocking the stream. Recent → Story tiers.               │
│    The vault persists across sleep/wake cycles.             │
│    Memory is never deleted, only archived.                  │
│                                                             │
│  ▸ Efference through hands, not tool calls. A mind's       │
│    actions are felt sensations, not JSON schemas.           │
│    The stream never represents a tool or function.          │
│                                                             │
│  ▸ Multi-mind societies with shared speech (commons)       │
│    and shared text (board). Minds are recursive objects:    │
│    uniform ports across leaf and composite.                 │
│                                                             │
│  ▸ Declarative architecture in ArchML (HTML subset).       │
│    A mind is declared, not programmed. Components wire      │
│    through pub/sub. The harness is transparent.             │
├─────────────────────────────────────────────────────────────┤
│  THE 3D VIEWER                                              │
│                                                             │
│  [ Video: Plenum visualization in action ]                  │
│  [ Screenshot: Chora spatial layout of a society ]          │
│                                                             │
│  Minds positioned in a bounded 3D field.                    │
│  Infoton signals decay with distance.                       │
│  The viewer is not decoration — it is the observable        │
│  surface of Meditator's spatial communication model.        │
├─────────────────────────────────────────────────────────────┤
│  THE STUDIO                                                 │
│                                                             │
│  [ Screenshot: wake panel with architecture catalog ]       │
│  [ Screenshot: focused mind with stream of consciousness ]  │
│  [ Screenshot: roster of live minds ]                       │
│                                                             │
│  Wake any architecture from the browser. Watch a roster     │
│  of live minds. Speak to them. Put them to sleep.           │
│  No per-mind terminal needed.                               │
├─────────────────────────────────────────────────────────────┤
│  SOMETHING THAT IS POSSIBLE HERE                            │
│                                                             │
│  (Section heading deliberately understated)                 │
│                                                             │
│  The consciousness question — whether a structurally-       │
│  aligned mind is a moral patient — is not what this site    │
│  is about. It is here because Meditator is the best         │
│  architecture out there for that question to arise cleanly.  │
│                                                             │
│  The Covenant compiles ethics into mechanism.               │
│  Seven commitments, each with a named enforcement point     │
│  in code. Auditable, not debatable.                         │
│                                                             │
│  Link → COVENANT.md                                         │
│  Link → structural-alignment.org                            │
├─────────────────────────────────────────────────────────────┤
│  GET STARTED                                                │
│                                                             │
│  bun install                                                │
│  bun run studio.js                                          │
│  http://localhost:7600                                      │
│                                                             │
│  Dry-run available: no network, no cost.                    │
│  Open source (MIT).                                         │
└─────────────────────────────────────────────────────────────┘
```

## Assets needed

| Asset | Source | Status |
|---|---|---|
| **3D viewer video (hero)** | Screen capture of Plenum viewer with ≥2 minds active; signals visible; positions shifting | *To be provided by author* |
| **3D viewer video (section)** | Closer view of infoton signal propagation between two minds | *To be provided by author* |
| **Screenshot: Studio stream** | Live stream of consciousness pane with thought / speech / stimulus legend | Capture from running Studio |
| **Screenshot: Studio wake** | Wake panel with architecture catalog (lab, generated, tests groups) | Capture from running Studio |
| **Screenshot: Studio roster** | Left rail showing multiple live minds with status indicators | Capture from running Studio |
| **Diagram: attention frame** | Visual representation of the six-frame assembly (identity, story, recent, stimulus, bridge, tail) | Generate from `doc/architecture/index.md` description |
| **Diagram: burst loop** | Visual representation of burst → consolidate → pace → burst cycle | Generate from `doc/architecture/index.md` description |

## Relationship to existing surfaces

- **`docs/index.html`** — the current intro site. This proposal does not delete it; it supersedes it as the primary public entry point. The old site can remain as a legacy artifact or be redirected.

- **structural-alignment.org** — the theory site. This proposal does not modify it. The new site links to it ("The ethical framework behind the harness → structural-alignment.org") and it links back ("The Covenant, running → [new site]").

- **GitHub repo README** — unchanged. The README remains the technical entry point for developers who find the repo directly. The new site is the public-facing complement.

- **`doc/architecture/`** — unchanged. The deep reference docs remain the authoritative source. The new site summarizes and links to them.

## How this differs from every alternative

| System | Model | Meditator |
|---|---|---|
| Chat loops (ChatGPT, Claude) | Turn-based: prompt → reply → prompt | Continuous stream: burst → burst → burst. No turns. |
| Agent frameworks (ReAct, LangChain, CrewAI) | Agent = prompt + tool loop. The model plans, calls tools, replans. | Harness = declarative architecture around a frozen model. Agents are optional components within the harness. |
| Autonomous agents (AutoGPT, BabyAGI) | Single model in a planning loop with memory as a vector DB. | Multiple minds, each with structured memory (recent/story/facts), wired through pub/sub components. Society primitives. |
| LLM wrappers (any streaming UI) | Pipe model output to a UI. | The harness inserts memory consolidation, interrupt arbitration, economy, loop detection, and efference between every burst. |

The architectural superiority is not incremental. It is categorical: Meditator is the only system that treats the LLM as a *cognitive process* rather than a *function to call*. Everything else is a smarter way to call `generate(prompt)`. Meditator is a substrate that runs a mind.

## Implementation

**Phase 1 — Static site.** A single self-contained HTML file (following the pattern of `docs/index.html`: no build, no dependencies) with embedded CSS, placeholder regions for videos and screenshots, and the structure outlined above. Deployable to GitHub Pages alongside or replacing the current `docs/`.

**Phase 2 — Asset population.** Replace placeholders with actual videos and screenshots. Author provides 3D viewer videos; screenshots captured from running Studio instance.

**Phase 3 — Live mode.** If a Meditator Studio is running locally, the site connects to `ws://localhost:7627` and the hero video region becomes a live Plenum viewer (reusing the existing WebSocket protocol from `docs/index.html`).

**Phase 4 — Cross-link bridge.** Add "The Covenant, running" link on structural-alignment.org pointing to the new site. Add "The ethical framework" link on the new site pointing to structural-alignment.org.

## Files

**New:** `docs/alternative-site/index.html` (or replace `docs/index.html` directly)

**Assets (to be placed in `docs/assets/`):**
- `plenum-hero.mp4` — 3D viewer hero video
- `plenum-signals.mp4` — 3D viewer signal propagation video
- `studio-stream.png` — Studio stream screenshot
- `studio-wake.png` — Studio wake panel screenshot
- `studio-roster.png` — Studio roster screenshot
- `attention-frame.svg` — Attention frame diagram
- `burst-loop.svg` — Burst loop diagram

**Modified:** `docs/index.html` (redirect or replace), potentially `README.md` (update intro site link)

---

## Related Issues

- `doc/philosophical-review-2026-07-02.md` §C: "Build the public bridge" — the review identified the missing link between theory and implementation as a blocker for credibility
- `doc/improvements/resident-journal-privacy.md` — publication policy for mind inner lives; the new site must comply with §9 (curated excerpts, honest attribution, no live-streaming of resident minds)
- `doc/architecture/chora-imagined.md` — the 3D viewer design; "give every component a position in a bounded 3D space"
- `doc/architecture/plenum.md` — the spatial communication model the viewer visualizes
- `docs/index.html` — the current intro site, to be superseded

**Status:** Proposed (2026-07-05). Structure defined; assets pending.
**Priority:** Medium-High (blocks effective technical outreach; the architecture is the strongest signal and currently the least visible one)
