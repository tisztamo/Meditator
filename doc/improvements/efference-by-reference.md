# IMPROVEMENT NOTE: Efference carries knowledge by VALUE — the realizer cannot hand over what the mind knows

**Date:** 2026-06-29
**Triggered by:** ARC solver, second fact-memory run — the checker had the puzzle pinned verbatim in every frame, yet every sandbox script it ran contained fabricated grids
**Severity:** High (a general ceiling on grounded action: any mind that must act on exact, sizable data it knows cannot do so faithfully)

---

## Problem

The fact-memory fix ([fact-memory.md](fact-memory.md)) put the puzzle into the checker's frame, verbatim, and held it there for the whole run — the perception/knowing side is solved. But when the checker reached its terminal hand, it ran **eight** scripts and **not one contained the real grids**; they invented small 10×10 grids "from the puzzle description," and one even printed *"actual training data is not provided… Actual training data required"* — false, the data was pinned right there in the frame. So computational grounding still verified nothing real.

The cause is not the model and not the frame. It is the **efferent boundary** — the realizer in `m-act` that turns a conscious reach into a concrete action. Reading the code (`src/mindComponents/mAct.js`) shows two faults, and both are general, not puzzle-specific:

1. **The boundary is blind.** `_realizeFrame(decision)` (`mAct.js:405`) hands the realizer only:
   - `## What the mind has been thinking` — the last **700 chars** of the stream window;
   - `## What it is reaching toward` — the intent gist.

   It does **not** include the mind's identity, its `## What I know (verbatim)` facts, its memory, or anything else. So when the realizer writes the script-string argument, it is not working from the pinned grids at all — it is reconstructing them from a 700-char tail.

2. **The boundary regenerates by VALUE.** Even if it saw the data, the realizer must *retype* it: the script is a string argument inside a tool call, generated token by token, capped at `realizeTokens || 512` (`mAct.js:251`). One ARC grid is ~366 chars (~150–200 tokens); the full puzzle is ~500–700+ tokens of literals alone — so 512 cannot fit even the data, let alone the logic. The scripts truncate **mid-grid** (one ended `# [1, 1`, another `[8, 8, 3, 8`), and the model fills the gap with small grids that fit.

> This is the **efferent twin** of [perception-not-compressible.md](perception-not-compressible.md) and [fact-memory.md](fact-memory.md). Those record that some content must reach the mind *by reference, never by paraphrase*. This note records the same law on the way **out**: some content must leave the mind *by reference, never by regeneration*. A mind can now *know* a thing exactly; it still cannot *hand it over* exactly.

## Why this is general (not a puzzle problem)

The checker exposed it because ARC is all exact data, but the ceiling is universal — it bites any mind whose deed must carry exact, sizable content it knows:

- a correspondent mind that wants to **send** a passage it remembers verbatim;
- a coding mind that wants to **run** a command over an exact config, path, or stack trace it was told;
- a scribe that wants to **file** a quotation without paraphrasing it;
- any mind that wants to act on a confirmed result rather than a re-description of it.

In every case today the realizer re-mints the content from a short stream tail through a small token budget, and large or exact content corrupts. The fix must therefore live in the **components** (`m-act`, `m-facts`), reusable by any architecture — not in the solver.

The project's own metaphor for `m-act` points straight at it: *"the way the hand realizes the wish to grasp."* When you pick up a cup you carry **the actual cup** — you do not sculpt a replica from memory each time. The realizer needs to carry objects **by reference**, not re-mint them **by value**.

## The design — transclusion at the efferent boundary

Two general, composable capabilities. Neither knows about puzzles, grids, or sandboxes.

**(1) A bus reference-resolver contract.** Any "knowing" component answers one question: *resolve handle `H` → verbatim text.* `m-facts` implements it over its keys (it already has `_findFact`). Later, `m-memory` can resolve a remembered span, a perception component a stimulus. The realizer never knows *who* resolves — it asks the bus. Domain-agnostic by construction.

**(2) Handle-expansion in `m-act`'s realizer.** Teach `_realizeSystem` that it may write a reference token — e.g. `«puzzle»` — anywhere in a hand's **string** arguments, meaning *"splice the verbatim value of what I know under this handle."* After the tool call returns and **before** `cap.execute(args)` (`mAct.js:~290`), `m-act` walks the argument strings and expands any tokens via the registered resolvers. The realizer spends its budget on **logic and structure**; the substrate splices the data losslessly:

```python
grids = parse("""«puzzle»""")     # one handle in; ~2 KB spliced by the substrate, 0 model tokens
# ...the model writes only the rule logic, well within 512 tokens...
```

**(3) The small complement that fixes fault #1: advertise the handles.** Knowing-components publish the *menu* of what they can resolve (e.g. `m-facts` publishes its key list, each with a one-line gloss), `m-act` subscribes and includes it in `_realizeFrame` — *"you may quote: `puzzle`, `verdict:crop-rule`."* The realizer thus knows what it can reach for **without** carrying the values. (This is the only part of "just put the facts in the realizer frame" worth keeping — the menu, not the payload.)

## Why this satisfies "components above architectures"

- `m-act` gains *"realize a deed by reference, not only by value"* — for **every** hand (terminal, message-send, note, web call) and **every** mind.
- `m-facts` gains *"I am a verbatim resolver"* — for **every** architecture.
- The solver merely `pin`s a fact and reaches a hand. Nothing in any component mentions grids. The same machinery lets a correspondent quote a remembered letter or a coding mind paste an exact trace it was given.

## Alternatives considered and rejected as the primary fix

- **Just put the facts in the realizer frame and raise `realizeTokens`.** Treats the symptom (blindness) but not the disease (by-value regeneration): the realizer still retypes the data every call, still corrupts large content, still pays the tokens. Keep only the *handle-menu* slice of this (see (3)); reject the value-dump.
- **Mount the knowing-store into each hand's environment** (e.g. write `puzzle.json` into the terminal workspace — the first, overfit proposal in `fact-memory.md`). It couples `m-facts` to `m-terminal` and only helps hands that *have* an environment; a message/note/web hand has none. Transclusion covers all hands uniformly. This is a domain-specific special case of the general fix, not the fix.
- **Delete the separate realizer regeneration step entirely** — have the stream emit structured actions directly, so there is no lossy re-typing layer (see [hands-redesign-issues.md](hands-redesign-issues.md): "the realizer is an agent-tool function-caller one layer below the stream → intent drift"). This is the deepest cure for both intent drift and by-value re-minting, but a large redesign. Transclusion is the targeted, shippable expression of the same principle and can land first.

## Caveat to design in — handles are DATA, not code

A resolver returns content, which the realizer may splice into a hand that interprets its argument (a shell/terminal script, a web body). The realizer must place handles only in **data positions** — inside a string literal / heredoc — never where the spliced text could execute. Otherwise transclusion into a terminal hand is an injection vector. The expansion step should treat resolved text as opaque data and (for code-executing hands) keep it quoted; consider a resolver/handle policy per hand class.

## Required direction — smallest first milestone

The piece that unsticks the checker is small and self-contained:

1. `m-facts` exposes a resolver (`resolve(handle) → verbatim | null`) over the bus, and publishes its **handle menu**.
2. `m-act` includes the menu in `_realizeFrame`, and expands `«handle»` tokens in string args after the tool call and before execute, via registered resolvers.
3. `_realizeSystem` tells the realizer to quote known data by handle and never retype it.

Re-run the solver and confirm the checker's script contains `«puzzle»`-spliced real grids and actually tests a rule cell-for-cell. The richer surface (which sources resolve, per-hand data-position policy, transcluding from memory/perception) follows once the path is proven.

---

## Related Issues

- [fact-memory.md](fact-memory.md): the knowing side this completes — facts now reach the frame; this lets them reach the **deed**. (Supersedes that note's overfit "write `puzzle.json` to the workspace" candidate.)
- [perception-not-compressible.md](perception-not-compressible.md): the afferent twin — content lost on the way *in*; this is content lost on the way *out*.
- [hands-redesign-issues.md](hands-redesign-issues.md): the realizer's by-value regeneration is the same layer whose intent-drift that note diagnoses; the structured-action redesign is the deeper version of this fix.
- `src/mindComponents/mAct.js`: `_realizeFrame` (blind frame, `:405`), `_realize` (`realizeTokens` cap, `:251`), `_execute` (`:275` — where handle-expansion belongs, before `cap.execute`)
- `src/mindComponents/mFacts.js`: `_findFact` (the resolver to expose), `_publishPinned` (sibling to a handle-menu publish)

**Status:** Open (design agreed: transclusion at the efferent boundary — bus resolver contract + handle-expansion in the realizer + handle-menu)
**Priority:** High (general ceiling on grounded action; small, well-scoped first milestone)
