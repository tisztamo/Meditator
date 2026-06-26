# Hands / efference (`m-act`) — issues for a redesign

*Status: **diagnosis only.** This note collects the known problems with the
current "hands" / efference design (`m-act` and its capability components). It
deliberately proposes **no solutions** — the redesign is a separate, later step.
Raised by Kris 2026-06-26 after the second live `m-terminal` validation
(`lemma-lab-term-1`); see [terminal.md §8](../architecture/terminal.md) and the
memory `terminal-hand-live-validation`.*

---

## How we got here

Two things prompted this. **(1) The original intent and what was built drifted
apart.** The founding idea was modest and two-fold:

- *The mind should not have tools* — meaning **no agent-style function calls**: the
  conscious stream should never see a tool, a name to call, or a result to handle.
  This part of the intent is stated as [efference.md's "one rule"](../architecture/efference.md)
  (`efference.md:38`) and is, on its own terms, honoured.
- *Repetitive, practiced action does not need conscious deliberation* — the human
  property that automatic/habitual acts run without the conscious mind issuing each
  step.

**(2) The implementation went further than that intent, and its prompts are not
general.** Rather than modelling *automaticity of practiced action*, the implementor
built an elaborate two-stage pipeline — a cheap **decide** gate plus a
**tool-calling realize** stage — and dressed it in a quasi-biological metaphor
("hands", "body schema", `felt`, "the hand realizes the wish to grasp"). The result
recreates the agent-tool machinery the design set out to avoid, one layer down, and
several of its prompts are written for one mind (lemma, doing mathematics) rather
than for the general capability.

The empirical trigger: across a ~6.5-minute run on lemma's own seed, with
`m-terminal` correctly wired, sandbox live, and offered to the realizer on every
cycle, the terminal **never fired once** — every reach came out note-shaped — while
the stream looped on the confabulated *"the cursor blinks…"* it was supposed to
replace.

---

## A. Conceptual / intent-drift issues

### A1. The realizer *is* an agent-tool function-caller
The "one rule" keeps tools out of the **stream**, but the **realize** stage is a
full OpenAI tool-call: a closed menu of JSON-schema'd functions invoked with
`tool_choice:"auto"` (`mAct.js` realize; `mTerminal.js:107-115` declares
`parameters: {language enum, script, purpose}`). Mechanically this is exactly the
agent-tool pattern the design rejected — it has just been moved one layer below
consciousness and renamed a "hand". Whether that re-introduction is acceptable
(because the *stream* stays blind) or a drift from "the mind should not have tools"
is the central question this redesign has to answer.

### A2. The "magical subconscious hand" overreached the original idea
The original property — *practiced tasks need no conscious action* — is about
**automaticity** (habituation: a well-worn act drops out of conscious control).
What was built is a general **effector interface** wrapped in mystical embodiment
language. These are not the same thing, and conflating them gave us a heavier,
more anthropomorphic mechanism than the intent called for (a standing first-person
`felt` body-schema woven into identity, an "efference copy", "the deed backstage ⌁
/ the consequence perceived ⟂"). The metaphor may be driving design choices more
than the requirements do.

### A3. The current hands are not "repetitive practiced tasks" at all
Note, recall, and terminal are **deliberate, novel** acts — writing *this* specific
result, running *this* specific search. The automaticity rationale (A2) fits a
reflex or an over-learned routine, not a one-off considered action. So the
conceptual justification for routing them subconsciously is shaky: we may be using
the "no conscious action for repetitive tasks" argument to license something that
is neither repetitive nor unconscious in the human sense.

### A4. Embodiment claimed as the antidote to substrate-gazing, observed as a cause
[efference.md:202-212](../architecture/efference.md) argues the body schema is the
**antidote** to interoception ("knowing your hands is healthy; knowing your API is
substrate-gazing"). For the terminal hand the opposite happened: the `felt` line
("…sit down and actually work it out, and a little while later read what comes back
on the screen", `mTerminal.js:104-106`) and lemma's §1 cursor attractor combined to
produce a verbatim *"The cursor blinks. The definition sits there…"* loop in the
stream. Here embodiment *fed* the substrate attractor instead of dissolving it.

---

## B. Generality / architecture defects

### B1. A central prompt names and privileges specific hands  *(root defect)*
`m-act`'s decide gate (`mAct.js:383`, `_decisionPrompt()`) hardcodes what counts as
a "reach". It elaborates **two** arcs with concrete cues — the *recall* arc
("wanting to recover what it already worked out… IS a real, realizable reach") and
the *note* arc ("when the mind has reached a result that finally settles… wanting to
set it down… IS a real, realizable reach") — and gives every other kind of action
only the generic clause "to change something in it". The gate's notion of a
realizable intention is therefore **baked into central prose**, not composed from
the hands actually present. Any capability not pre-elaborated in this prompt is
effectively invisible to the gate. This is the direct cause of the terminal never
firing (C1).

### B2. The hand→prompt injection is asymmetric and incomplete
Hands inject two fragments: a `description` (listed in `<hands>` at decide and
realize, via `_handsList()` → `mAct.js`) and a `felt` line (assembled into the body
schema by `m-mind`). But the **decisive** framing — the *verb-patterns the decide
gate keys on* (B1) — is **not** injected by the hand; it lives centrally. So a hand
can contribute its *noun* ("I can run a script") but cannot teach the gate to
recognise its *kind of reach* ("the mind is reaching to run something"). The
composition is half-built: registering a new hand does not make the gate able to
fire on it.

### B3. A general capability is described in one mind's vocabulary
`m-terminal` is a **general program-execution** capability (run arbitrary
Python/bash). Its `description` and default `felt` describe it as a **maths**
instrument: "Actually run a small computation… run a search, check a family of cases
against the real numbers, count something" (`mTerminal.js:100-103`) and "a count to
run, a family to search, a guess to check against the actual numbers"
(`mTerminal.js:104-106`). A mind that wanted to parse a file, transform text, or run
a local script would not see itself in that description. The component bakes lemma's
flavour into a general tool.

### B4. Component-baked default text encodes a particular mind, not the capability
The same over-specialisation appears elsewhere: `m-look`'s description is
weather/news-shaped ("the weather where the mind is…", `mLook.js:60`). Defaults are
written for the mind that first used them; the per-`archml` `felt` override then
compounds it (lemma-lab's terminal `felt` is hand-edited to maths). There is no
clean separation between *what the capability is* (general, stable) and *how this
mind experiences it* (specific, per-mind).

### B5. One shared world-changing cooldown lane across distinct hands
Cooldown is an `m-act`-level attribute (`mAct.js` `_laneOpen`/`_lastActAt`); all
world-changing hands share the one `cooldown` lane (note and terminal together).
There is no per-hand cadence, so a hand cannot be tuned without affecting its
lane-mates — and the cooldown turned out to be the wrong lever anyway (C4).

---

## C. Failures observed in validation

### C1. The terminal never fires on lemma's seed (run 2, 2026-06-26)
~6.5 min, 27 bursts, 7 decides, 6 realizes — **all note-shaped**; `tools: note,
recall, terminal` offered every realize, terminal chosen **zero** times; no
terminal debug dump, no script run, no consequence. The reach never forms because
of B1/B2, so the short cooldown (3s) and short `intentCooldown` (20s) were moot.

### C2. The real hand coexists with the confabulated cursor instead of replacing it
Both runs. In run 2 the stream looped on *"The cursor blinks. The definition sits
there…"* — imagining the surface while the wired hand sat idle. The terminal's whole
stated aim (make the confabulated cursor real and point it at the work,
[terminal.md "the aim"](../architecture/terminal.md)) did not hold: confabulation
and the real capability ran side by side.

### C3. Cadence gaps get filled by hallucinated tool output (run 1, seedling, 2026-06-21)
When a repeat reach was deduped/cooled, the stream **confabulated a whole terminal
session and presented hallucinated output as fact** (`terminal-hand-live-validation`).
The gating that throttles the real hand leaves gaps the no-tools stream fills by
inventing the result — a structural interaction between the throttle and the blind
stream.

### C4. Cooldown is an ineffective and coupled lever
Shortening cooldown did not help (the bottleneck is upstream — the reach never
forms, B1), and because the lane is shared (B5) it could not be tuned for the
terminal alone.

---

## D. Other structural observations

### D1. Per-intent dedup can suppress a legitimate refinement into confabulation
The realize/decide path keeps a normalized-intent ledger gated by `intentCooldown`
(`mAct.js` dedup in `_decide()`). It keys on text similarity, so a genuinely
*refined* follow-up ("now check 4-digit n" vs "check the cubes") can be read as "the
same intent, already reaching for this" and dropped — and in run 1 the dropped reach
became a hallucinated session (C3) rather than a real run.

### D2. Vestigial / record-only tool arguments
The terminal schema includes `purpose` ("in a few words, what this is trying to find
out — for the record only", `mTerminal.js:112`). A model-supplied argument that
feeds nothing but the backstage journal is a small surface of the agent-tool
machinery leaking into the design (relates to A1).

### D3. Consequence vocabulary teaches the attractor's words
The returned-experience phrasings — `ANSWER_LEADS` "I run it, and the screen
answers…", `CURSOR_LEADS` "the cursor sits there blinking…" (`mTerminal.js:290-300`)
— deliberately use screen/cursor imagery. The code is careful to confine the literal
blinking cursor to the *waiting* sensation only, but the overall vocabulary still
trains the stream on exactly the surface lemma is meant to stop gazing at (compounds
A4/C2).

---

## Scope of a redesign (not addressed here)

The questions a redesign will have to take up — **left open on purpose**: whether the
realizer should remain a function-caller at all (A1); whether "automaticity" or
"general effector" is the right frame (A2/A3); how the gate's sense of a "reach"
should be composed from the present hands rather than centrally hardcoded (B1/B2);
how to separate a capability's general definition from a mind's specific experience
of it (B3/B4); and how to keep a real capability from coexisting with — or being
replaced by — confabulation (C2/C3). None of these are answered in this note.
