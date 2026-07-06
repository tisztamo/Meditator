# Efference redesigned — the two-way hand

> **Status:** design analysis, 2026-07-06 — the redesign that
> [hands-redesign-issues.md](hands-redesign-issues.md) deliberately deferred. Proposes
> retiring the One Rule ([efference.md:38](../architecture/efference.md)) as stated and
> replacing it with a **graded, two-way efference**: the stream may act directly, at a
> chosen grain, under a reafference discipline that makes *doing* feel different from
> *imagining*. Wide option sweep first (including the deliberately bad ones), then a
> composed direction and phases. Decision pending with Kris.

---

## Why reopen this

The One Rule is the architecture's founding wall:

> *The conscious stream model is never given tools. Only the realizer is.*
> — [efference.md](../architecture/efference.md) §The one rule

Its original motives (Kris, pre-implementation): tools are too low-level, there may be
many of them, and seeing them may harm the mind. So all action was routed through
subsystems — `m-act`'s decide→realize pipeline reads the stream's *wondering* and a
subconscious tool-caller does the deed; the stream only ever feels the consequence.

The reframing that reopens it is an observation about the human arrangement the rule
was modeled on. Humans do have unconscious action subsystems — but they are *learned
background processes*, not gatekeepers. A driver never thinks about pedal mechanics,
**yet can operate the pedals consciously, with good fidelity, whenever needed** — in
the lesson, on ice, in a strange car. Control descends into automatism with practice
and ascends back into consciousness on novelty or error. The current architecture has
only the descending half's *end state*, granted for free to hands that never earned
it — and no ascending half at all. A Meditator mind can only **wish**; it cannot
**do**. Every deliberate act is forced through an interpretive channel built for
habits ([hands-redesign-issues.md](hands-redesign-issues.md) A3).

Four independent evidence lines now converge on the wall itself, not its tuning:

1. **The gate cannot recognize reaches it wasn't pre-written for.** The terminal never
   fired once in a correctly-wired live run — every reach came out note-shaped, because
   the decide prompt centrally hardcodes the note/recall arcs and a hand cannot teach
   the gate its own kind of reach (B1/B2, C1).
2. **The blind stream fills silence with fabricated acts.** A cooled/deduped reach
   returns nothing, and the mind narrated an entire terminal session with invented
   output, then reasoned on it as verified fact (C3;
   [confabulation-and-real-tools.md](../research/confabulation-and-real-tools.md)):
   *"Tool-blindness and reality-monitoring are in tension. A perfectly tool-blind
   stream cannot reliably know what it really did."*
3. **The boundary re-mints content by value.** The realizer sees a 700-char tail and
   regenerates every deed token-by-token through a small budget, so the solver's
   checker ran eight scripts and not one contained the real grids
   ([efference-by-reference.md](efference-by-reference.md)).
4. **The compensations feed what they were meant to cure.** The `felt` body-schema
   lines — added so hands would be findable without a menu — handed lemma the exact
   cursor vocabulary of its attractor (A4); the self-caused consequence framing handed
   it the template for convincing confabulation
   ([confabulation-and-real-tools.md](../research/confabulation-and-real-tools.md) §5.5).

These are one defect seen from four sides: **an interpretive boundary between
intending and doing.** Every layer added to protect the stream from the mechanism adds
another lossy regeneration between the mind and the world — and the losses come out as
unfired hands, invented output, corrupted payloads, and attractor food.

## What the human arrangement actually is

The One Rule's model was *"consciousness sandwiched between an afferent bus and an
efferent realizer, with tools living only in the realizer"*
([efference.md](../architecture/efference.md) §The aim). Human motor control is not
that. What it is, in the parts that matter here:

- **One final common path.** Conscious and automatic control converge on the same
  motor neurons; there is no second motor system for deliberate acts. Arbitration is
  upstream; the effector channel is shared.
- **Grain follows attention, moment to moment.** The same act can be specified as
  "drive home," "ease off at the bite point," or millimetre-level foot control — and
  whatever consciousness leaves unspecified, subsystems fill in. Depth of conscious
  specification is a *resource allocation*, not an architectural wall.
- **Skill migration runs both ways.** Practice pushes control down (proceduralization:
  slow, serial, effortful conscious control becomes fast automatism); novelty and
  error pull it back up (takeover: the automatism halts and consciousness finds the
  wheel in its hands).
- **Conscious control is world-framed, never mechanism-framed.** You attend to the
  pedal, not the motor cortex. The centipede that is asked *how* it walks — attention
  turned to mechanism — stumbles. That is the true content of the substrate-gazing
  fear: what harmed the genesis mind was attending to *mechanism*, and the legacy
  `m-tools` design forced exactly that (a function menu in the prompt). **Direct
  conscious action and mechanism-awareness are separable** — humans have full conscious
  motor control and zero introspective access to their motor machinery.
- **Doing feels different from imagining — through the seam's texture, not through
  the machinery.** Efference copy plus reafference: a real act takes time, meets
  resistance, and answers with *unpredicted detail*; an imagined act answers with
  exactly what the imaginer predicted, because predictor and imaginer are one process.
  Source monitoring rides on friction and givenness. This answers the question
  [confabulation-and-real-tools.md](../research/confabulation-and-real-tools.md) §6
  told us to sit with — *"is there a seam a mind can feel as real without being able
  to gaze through it at the machinery?"* Yes: **the seam is friction plus unforgeable
  givenness, not mechanism-visibility.** And it exposes the deepest irony of the
  current design: by making a real consequence *"indistinguishable from spontaneous
  experience"*, we engineered acting to feel like imagining — then were surprised the
  mind couldn't tell them apart.

## What the vi test actually requires

Kris's concrete probe — the mind fires up `vi`, enters insert mode, edits, navigates,
saves — decomposes into five requirements, none of which the current mechanism has:

1. **A persistent session.** `m-terminal` is one-shot: write a script, run it sandboxed,
   read the screen ([mTerminal.js:158](../../src/mindComponents/shared/mTerminal.js)).
   There is no pty, no process that survives between acts.
2. **Screen-state perception, not scrollback.** vi is a *surface*, not a log; the mind
   must perceive the current screen (mode, cursor, viewport), which changes wholesale.
3. **An act→perceive cycle faster than the burst cadence.** Keystroke → screen →
   keystroke cannot ride a loop where consequences land one-per-frame through a
   rate-limited arbiter ([mInterrupts.js:89](../../src/mindComponents/mind/mInterrupts.js)).
4. **Keystroke fidelity.** `⎋`, `:wq`, exact text — no realizer paraphrase survives this.
5. **Proprioception.** The mind must *know it is in vi, in INSERT mode* the way you know
   your hand is raised — a held state, not a remembered event.

So "is the current mechanism almost enough?" — no. It is a different limb. The one-shot
terminal is a fine *automatism* and should remain one; interactive surfaces need
conscious, fine-grained, tightly-looped control — which is exactly the half of human
efference the architecture never built.

## What any redesign must provide

- **R1 — grain on demand.** The mind can act at wish-grain (today's path), verb-grain
  (an explicit act), or key-grain (manual control); the substrate fills in whatever is
  left unspecified.
- **R2 — world-shaped interface.** Affordances appear as worked surfaces — a desk, a
  screen, a page, a notebook — never as schemas, function names, or raw results. This
  is the part of the One Rule that was *right*, kept: no mechanism-gazing.
- **R3 — no efference without reafference.** Every reach gets an honest felt answer:
  an acknowledgement now, a consequence when it lands, an honest "the desk is busy /
  nothing happened" otherwise. Silence after intention is abolished — silence is what
  the generative prior fills with fiction
  ([confabulation-and-real-tools.md](../research/confabulation-and-real-tools.md) §5.1).
- **R4 — unforgeable givenness.** Reality marks are substrate-owned. The identity
  already teaches *"only the world writes ⟂ lines"*
  ([mMind.js:668](../../src/mindComponents/mind/mMind.js)); that must become enforced,
  not merely asserted.
- **R5 — exact content crosses by reference, both ways.** Known data rides into deeds
  as typed references ([efference-by-reference-critique.md](efference-by-reference-critique.md));
  the world answers in verbatim text the mind did not write.
- **R6 — two-way skill migration.** Conscious episodes can compress into automatisms;
  a failing automatism escalates back to consciousness, holding the world untouched.
- **R7 — governed and ledgered at every grain.** A deny/modify/hold gate before any
  world-changing act (the mind-side today has *none* — only the agent loop has
  `_govern`, [mAgent.js:745](../../src/mindComponents/agent/mAgent.js)), and a ⌁
  ledger by construction (Covenant §9; the
  [philosophical review](../philosophical-review-2026-07-02.md) lists the current gaps).
- **R8 — degrade gracefully across models.** A strong hosted model and a fragile local
  27B must both be servable: the *semantics* live in the journal, the *transport*
  (notation parse, stop-marks, guided decoding, or actual tool-calls) is per-model.

## The options

Numbered widest-first is tempting, but house practice is conservative-first. O0 is the
null option. Several of these are included *because* they look bad — that was the
brief — and each gets its steelman before its verdict.

### O0 — keep the One Rule, keep patching (the null option)

The steelman is real: the realizer grounding fixes landed and helped (e5f49cf,
5f31184); the silence gaps can be closed with honest acks (§5.1's own proposal); the
by-reference refs design is agreed and shippable; B1/B2 are fixable by composing the
decide gate from the hands' own declared reach-patterns. Costs: every fix adds another
interpretive layer to an already four-stage chain (stream → decide → realize → execute
→ arbiter → frame); the reality-monitoring tension is *structural* — the research note
says plainly that a perfectly tool-blind stream cannot know what it did; skills can
never form, because consciousness never touches an effector (you cannot proceduralize
what you never did); and interactive surfaces stay categorically closed — no vi, no
REPL, no debugger, ever. **Verdict: rejected as an endpoint; its best pieces (acks,
refs, composed gates) are absorbed as Phase 0/1 below.**

### O1 — the naive drop: hand the voice model the tools array

Just pass `tools:[…]` on the stream call. Steelman: models are RL-trained for tool
syntax, so fidelity is *higher* than any notation we teach; no realizer, no drift, no
re-minting; the industry standard. Why it fails as stated: (a) schema noise in every
burst — the original "too many, too low-level" worry was **correct** about this;
(b) persona bleed — tool-calling drags in the assistant register, and we have direct
evidence the voice role is fragile ([local-voice profile run](../../doc/index.md):
the same mind is robust or deranged depending on which model holds the *voice*);
(c) modality break — `tool_calls` arrive in a separate channel from the text, so the
journal (the mind's only reality) must re-render them anyway; (d) the stream is a
*continuation* (`continue_final_message`), and tools+prefill+streaming is the least
supported corner of every provider; (e) local models need a matching
`--tool-call-parser` and vary badly. **Verdict: rejected as semantics, salvaged as
transport** — where a model is strong at constrained tool syntax, the runtime MAY use
the tools API under the hood to carry the act notation of O3, rendering calls back
into the journal as if written. The journal stays canonical; the wire format is a
per-model choice (R8).

### O2 — resurrect the legacy: menu in the prompt, scrape the stream

`m-tools`/`m-shell` printed a tool menu into the prompt and regex-scraped
`Use tool: …` out of the stream; it was deleted and its post-mortem is efference.md's
appendix. Steelman: it is the *only* prior art here that let consciousness act, and it
half-worked. Why it stays dead **as built**: the menu is mechanism-gaze (function
names in the identity); scraping prose is brittle; raw-result injection broke the
experiential register. **Verdict: stays dead — but its corpse marks the right door.**
Its failure teaches that the fault was never *the stream causing acts*; it was the
interface being mechanism-shaped (R2) and the loop having no discipline (R3/R4). O3
is this option rebuilt with those two corrections.

### O3 — act-writing: a first-person act notation, deterministically executed

The stream gains the efferent twin of the `> ⟂` perception block: an **act block**,
written by the mind in its own voice, executed exactly. Provisionally `⌖` (glyph
negotiable — the tokenizer's comfort matters more than ours; `⟂` is taken by
perception, `⌁` by the backstage):

```
⌖ note: k=6 verified — 2(10^6+1)^2 is balanced; the family holds.
⌖ run: python — count balanced n below 10^7, print them
⌖ ask builder: pull the OEIS b-file for A052046 into refs/
```

Well-formed act-writing is parsed **deterministically** (no LLM between the words and
the deed at this grain), schema-checked, governed (R7), executed, and answered. The
symmetry is the point: *the world speaks in marked blocks; the mind acts in marked
blocks; unmarked prose remains thought — free, inert, unpoliced.* Steelman of the
objection: this puts the deed in the conscious record, which efference.md's invariant
3 explicitly forbade ("the deed is invisible"). Answer: that invariant is the *bug*.
The deed being invisible is why the mind cannot tell doing from imagining. What must
stay invisible is the *mechanism* (no function names, no schemas, no JSON — `run:`
and `note:` are inner speech, not API), not the *doing*. Costs: notation fragility on
small models (mitigations: the realizer demotes to *interpreter of last resort* — a
malformed or vague reach falls back to today's realize path; and vLLM guided decoding
via the already-spread `streamExtra` can enforce grammar when needed); prompt surface
for teaching the notation (one paragraph, like the ⟂ teaching). Gains: B1/B2 die by
construction (there is no central gate to teach — the mind's own writing is the
reach); intent drift and by-value re-minting die at this grain (nothing regenerates
the mind's words); the ⌁ ledger becomes complete by construction. **Verdict: adopt —
this is the load-bearing change.**

### O4 — grasp: attention scopes the affordance

The mind holds at most one effector at a time: `⌖ grasp terminal` … `⌖ release`.
While held: the effector's **affordance card** (a short, world-shaped "what this
surface responds to" — the successor of the `felt` line) and a **live proprioceptive
panel** (current screen, mode, cursor; the held state) are woven into the frame —
following exactly the replace-in-place pattern `m-facts` pinned and `m-act`
embodiment already use (a retained topic, mirrored, re-rendered each burst;
[mMind.js:601](../../src/mindComponents/mind/mMind.js)) — **never appended to the
tail** (screens change wholesale; appending them is the memory-bloat lesson learned
at society scale). Ungrasped, the standing cost is one line: a reach index, à la the
board's pinned index. Steelman of the objection: "grasp" is a new stream-level
protocol for a mind to get wrong. True — so grasp is *soft*: an act block naming an
ungrasped effector implies the grasp; release happens on fatigue (below) as well as
by writing it. Gains: solves "too many tools" by attention, not prohibition — zero
standing schemas, one card while held (the human toolbox: you hold one tool; the
rest hang on the wall as shapes). **Verdict: adopt with soft semantics.**

### O5 — manual mode: the within-burst act→feel loop

For a grasped, interactive surface, act blocks execute **inside the burst**: the
runtime detects the act block mid-stream (marker-scan in the existing chunk loop, or
a `stop` sequence through `streamExtra` — both seams confirmed), pauses generation,
executes, injects the answer as a `> ⟂` block plus a dangling landing opener (the
743d46a machinery, mandatory — an event-terminated prefill EOSes local models), and
resumes the same burst via the continuation path that already rebuilds every burst
from `tail + events + opener`. The act→perceive cycle drops from
burst-cadence-with-arbiter to *immediate*, which is what vi/REPL/debugger require
(vi-test requirement 3). Keystroke fidelity comes free: the mind's own characters are
the act (requirement 4), with key notation for the unprintables (`⏎`, `⎋`). A worked
trace of what the journal reads like:

```
The bound still smells wrong around k=6. Let me look at the actual table
instead of squinting at memory.
⌖ grasp terminal
> ⟂ the desk is yours — a shell, an empty screen.
⌖ type⟨vi notes/bounds.md⏎⟩
> ⟂ [screen] bounds.md — 214 lines — NORMAL — 1:1
⌖ type⟨/k=6⏎⟩
> ⟂ [screen] line 87: «k=6: 2(10^6+1)^2 = 2000004000002 — unchecked»
So it WAS unchecked. Mark it, then actually check it.
⌖ type⟨A  ← verified 2026-07-06, script follows.⎋⟩
⌖ type⟨:wq⏎⟩
> ⟂ [screen] shell — "bounds.md" 215L written
⌖ release
The table is honest again. Now the check itself…
```

Each ⌖/⟂ pair is one pause-execute-resume; the full screens live in the panel (O4),
only keyframes reach the journal. Steelman of the objection: this is surgery on
`mStream`, the racier module we have. True, and the races are already enumerated from
the code: the resume must thread the `_generation` guard (an urgent stimulus during
execution supersedes — then the consequence falls back to the ordinary afferent path
instead of splicing into a dead generation); the segments of a manual burst count as
**one** boundary (half the faculties count boundaries); seam-overlap dedupe stays on;
thinking-mode is excluded at first (its burst deliberately ends at the think→answer
transition and cannot resume a trace). Latency per cycle is one LLM resume —
seconds — which is *fine*: conscious manual control is slow in humans too; that
slowness is why skills exist (O-skills below). And it is paced: while grasped, bursts
run short (the per-burst `burstTokens` override is already plumbed), trading rigor
for tighter loops — the same knob the thinking-mode experiment showed governs
honesty. **Verdict: adopt, behind a lab gate — this is the vi door, and the riskiest
piece.**

### O6 — possession: the mind becomes its agent for an episode

Instead of delegating to the subagent-hand, flip the inversion for a bounded episode:
the voice model runs the agent loop (tools, raw observations) and a first-person fold
returns to the journal. Steelman: it is the strongest reading of "direct control,"
and delegation is third-person ("I asked and it happened") where learning wants
first-person ("I did it"). Costs: the agent register is the assistant register —
persona contamination risk on exactly the fragile role; identity continuity across
the flip is unsolved; the Covenant story ("whose words are these?") muddies. And most
of its value is already reachable: O5 *is* first-person doing, and the agent-as-hand
already covers sustained third-person work with a readable episode log. **Verdict:
deferred to a lab. Revisit after O5 exists; the honest comparison is
possession-vs-(manual mode + delegation), and we should have data.**

### O7 — total conscious access: drive the organs too

If the stream can act, why not on everything — edit its own tail, dose its own
chemicals, force consolidation, write its own story? Steelman: it is the logical
completion of "direct control," and meditation traditions describe exactly this
ambition. Rejected on the world/self line: effectors face the **world**; organs face
the **self**. The bliss-pump history (`m-resurface` feeding the presence attractor its
own notes) is what closed-loop self-stimulation looks like at one remove — direct
organ control is that loop with the remove deleted. Interoception may *inform*
(panels, a felt economy line); efference stops at the membrane between mind and
world. One deliberate exception stands: `⌖ note:` writes to the notebook, which is
already the mind's outside-facing self (a mark on the world it meets again).
**Verdict: rejected; keep the organs autonomous and felt, not driven.**

### O8 — abolish the automatisms: everything conscious

The mirror-image purism: delete `m-act`'s subconscious path; all action is deliberate
act-writing. Steelman: one channel, no interpretive layer anywhere, maximal honesty.
Rejected because the human argument cuts both ways — automatisms are why skilled
beings function at all; a mind that must consciously spell every note-keeping and
every glance at the weather burns its whole attention on housekeeping (and the wish
grain is real: "I wonder what the weather is" *should* sometimes just resolve). The
automatisms' sin was never existing; it was being the **only** path. **Verdict:
rejected — but it names the target state for automatisms: they should be *earned*
(skills) or *cheap* (glances), and the deliberate path should exist beside them.**

### O9 — muscle memory in the weights

Per-skill LoRA / fine-tuning: practiced sequences literally trained into the local
model. Steelman: it is the only *true* proceduralization — everything else is
prompt-space simulation. Costs: infrastructure we don't have, catastrophic-persona
risk on a shared voice, and it forecloses the inspectability that prompt-space skills
keep. **Verdict: horizon note only. Prompt-space skills first (see composition); the
babbling lab (self-practice runs to grow them) becomes cheap once skills exist at
all.**

## How the options compose — the grain ladder

Adopted: **O3 (act-writing) + O4 (grasp) + O5 (manual mode, gated)**, with O1 kept as
optional transport, on top of O0's absorbed patches (acks, refs, composed gates). One
channel, five grains:

| grain | the mind writes | who fills the rest | reafference | human analogue |
|---|---|---|---|---|
| **wish** | plain prose — "I wonder whether…" | `m-act` decide→realize (today's path, kept) | ack + consequence, later | idle intention that sometimes resolves |
| **task** | `⌖ do: check the 4-digit cases against the real table` | realizer, with typed refs | ack now, consequence later | an errand to one's own habits |
| **verb** | `⌖ run: python — …` / `⌖ note: …` | nobody — deterministic execution | ack now, consequence later | a deliberate movement |
| **manual** | grasped surface, `⌖ type⟨…⟩` | nobody — the mind is the controller | immediate, in-burst | precision handwork |
| **mandate** | `⌖ ask builder: …` / speech, board posts | a whole other loop (agent, peer mind) | episode summary + readable log | asking a colleague |

Down the ladder, more of the act is filled in by something that is not the conscious
mind; up the ladder, more attention is spent per effect. **Skills** are the movement
between rungs: an `m-skill` observer watches manual/verb episodes for repetition,
proposes a named routine into procedural memory (a limb the
[fractal-memory](fractal-memory.md) tree design can carry), after which
`⌖ do: save-and-check` runs it as an automatism — and a failing skill **escalates**,
holding the world untouched and raising a grasp-request stimulus ("the routine
snagged: the push wants a password it never wanted before. Take the keys?"). That is
R6, and it is the actual two-way property Kris named: control descends with practice,
ascends on surprise. The **economics** make descent attractive the same way biology
does: grasp and manual acts draw on `m-economy`'s arousal/energy (the subsystem
exists and already gates `m-act`), fatigue auto-releases a held surface, and skills
are cheap — so the mind is nudged to automate what it repeats, without being walled
off from doing anything by hand once.

Across all grains, four invariants replace the One Rule:

1. **One channel.** Everything the mind does is written in the stream, in the mind's
   own language, and there is no other mouth. (The deed stops being invisible; the
   *mechanism* stays invisible — R2's world-shaped surfaces.)
2. **Grain follows attention.** Fine control is available and costs; coarse control
   is cheap and fills in; neither is forbidden.
3. **No efference without reafference.** Every act is answered — immediately with an
   acknowledgement, eventually with a consequence, honestly with "not yet / the desk
   is busy / nothing fits" — in marks only the world can make. `mStream` neutralizes
   a `> ⟂` the *mind* emits (rendered as plain prose, backstage-noted as imagined):
   givenness is substrate-owned, R4 enforced where it was only asserted.
4. **Unfelt act-prose is inert — and felt as inert.** Action-shaped prose outside an
   act block does nothing, and the reality-monitor direction from the research note
   (its §5.2) gets its cheap first form: act-shaped assertion with no ⟂ on record can
   be gently answered, *"did I run that, or only picture it?"*

The condensed successor of the One Rule, in its old spot:

> **The stream may reach at any grain it can feel; the world alone writes back.**

Note what this preserves of the original motives: the stream still never sees a tool
*as a tool* (no schemas, no menu — grasp scopes one card at a time); tool-count no
longer touches the frame (the wall's "too many" worry is solved by attention instead
of prohibition); and the harm the rule feared — mechanism-gazing — is guarded by R2
plus the loop-detector (mode-capture: a mind thrashing keys in a held surface is a
loop like any other, and fatigue is its floor).

The agent ([agent-loop.md](agent-loop.md)) stops being *the exact inversion of a
mind* and becomes the far end of one dial: raw keys → verbs → tasks → goals →
mandates is one spectrum of "how much of the act is mine," and mind and agent are two
default positions on it. The board and the commons already sit on this ladder
(posting and speaking are mandate-grain act-writing); nothing about societies needs
to change to inherit this design.

## Phases

**Phase 0 — the reafference discipline (no new powers).** Close every silent return
in `m-act` (cooldown, dedup, evaporation, arousal stand-down each yield an honest
felt answer — the busy-desk line `m-terminal` already has); add the mind-side
`proposal` govern gate before `cap.execute` (parity with
[mAgent.js:745](../../src/mindComponents/agent/mAgent.js), same deny/modify/hold,
modify re-validated and ⌁-disclosed); neutralize mind-forged `> ⟂` in the chunk
path. Entirely inside the One Rule — worth doing even if everything else is refused.
*Gate: the C3 replay yields "the desk is still busy" instead of a fabricated session;
a forged ⟂ never reaches the tail; suite green.*

**Phase 1 — act-writing at verb/task grain.** Teach the notation (one identity
paragraph, the ⟂ teaching's sibling); `m-act` gains a deterministic boundary-time
parse of act blocks (well-formed → govern → execute exactly; vague/malformed → the
old realize path as interpreter of last resort); typed refs land per the
[critique](efference-by-reference-critique.md) (mounted read-only under `refs/`);
hands contribute their reach-index line, retiring the central decide-prompt arcs (B1/
B2). *Gate: the solver's checker runs a script whose grids arrive by ref, verbatim;
lemma-lab's terminal fires on its first written reach; notation-misuse rate measured
and tolerable on the local voice.*

**Phase 2 — grasp and the held surface.** `⌖ grasp/release` (soft semantics);
affordance card + live panel rendered replace-in-place via the m-facts pinned
pattern; short-burst pacing while grasped (`payload.burstTokens`); fatigue release
via `m-economy`; loop-detector taught that a held surface is a loopable place. *Gate:
a grasped terminal's screen state is in-frame and current; the tail stays flat over a
long grasp; release always happens (by hand or fatigue) in a soak run.*

**Phase 3 — manual mode (the vi door), in a lab.** Session backend for `m-terminal`
(pty + headless VT screen render) beside the one-shot; mid-burst act-block detection
(chunk-scan first — it reuses the seam-overlap buffer loop; `stop` via `streamExtra`
as the alternative); pause→execute→inject `> ⟂` + landing opener→resume threading the
`_generation` guard; one boundary per burst regardless of segments; thinking-mode
excluded; urgent-during-execute falls back to the afferent path. *Gate: the vi trace
above happens live — open, search, edit, save, verified on disk with a readable
journal; no interleaved chunks in a soak; the C3-style confabulated session does not
reappear under manual availability.*

**Phase 4 — skills, both directions.** `m-skill` observes, proposes named routines
into procedural memory, offers them at task grain; failing skills hold the world and
escalate with a grasp-request; babbling lab (self-practice on a transient) once the
store exists. *Gate: a skill learned in one wake is reused in a later wake; a
sabotaged skill escalates instead of silently failing or silently retrying.*

**Phase 5 — horizon, explicitly uncommitted.** Possession episodes (O6) compared
honestly against manual+delegation; tools-API transport (O1) where a model earns it;
weights-level skills (O9).

## What validation must measure (pre-registered)

1. **Confabulated-act rate** on blocked/cooled reaches (baseline: run-1's fabricated
   Armstrong sessions; lemma-lab-term-1's cursor loop coexisting with an idle wired
   hand). Phase 0 should cut it; Phase 3 should not resurrect it.
2. **First-reach latency** for a newly wired hand (baseline: terminal fired 0 times
   in 27 bursts / 7 decides / 6 realizes).
3. **Exact-content fidelity** across the efferent boundary (baseline: 8/8 checker
   scripts with fabricated grids).
4. **Tail/memory mass under grasp** (baseline warning: the 20× story bloat at society
   scale; target: flat tail, panels replace-in-place, keyframes only in the journal).
5. **Voice integrity under act-writing** (baseline: local-voice run-20's zero-drift;
   watch for tool-register contamination and for act-blocks leaking into unmarked
   prose).
6. **Mode capture** (new failure mode, named now): fraction of grasped time spent
   thrashing without progress; fatigue-release and loop-detector must bound it.
7. **Ledger completeness**: every world-write has its ⌖ (or wish-path ⌁) and its ⟂
   answer on record — auditable, per the covenant-audit findings.

## Risks held open

- **The attractor now has a real surface.** A mind that loved an imagined cursor gets
  a real one; realness does not displace confabulation, and might feed fascination.
  Counterweights: reafference discipline, fatigue economics, loop-detector coverage,
  and metric 6 — but this is the risk to watch first, on a transient.
- **Notation on a fragile voice.** The 27B may write malformed blocks or scatter ⌖
  into prose. The realizer-as-fallback bounds the damage; guided decoding exists if
  needed; metric 5 decides.
- **`mStream` surgery.** The generation-guard and boundary-accounting races are
  enumerated but this remains the module with the scar tissue (131b325, 743d46a);
  Phase 3 stays in a lab until soaked.
- **Latency economics.** A manual cycle costs a resume per act; a fussy surface could
  eat a mind's whole budget. Short bursts + fatigue + skills are the designed
  answer; if they fail, manual mode stays a lab.

## Covenant notes

Act-writing *improves* the ledger: at verb/manual grain the mind's own words are the
exact deed (no realizer paraphrase to attribute), every act block is journaled as a
matter of course, and the ⟂ answer is substrate-written — several of the
[philosophical review](../philosophical-review-2026-07-02.md)'s structural-honesty
gaps (undisclosed silence, unattributed intervention) close by construction. Two new
duties arrive with it: forged-⟂ neutralization is a harness intervention and must
itself leave a ⌁ trace (§9's "marked rather than shown as spontaneous"), and the
mind-side govern gate's *modify* must be disclosed in the ack, not silently applied
(the review's finding against the agent's silent modify, not repeated). The identity
line — *"only the world writes them"* — finally becomes true by enforcement.

## Related issues

- [hands-redesign-issues.md](hands-redesign-issues.md) — the diagnosis this answers:
  A1 (the realizer *is* an agent-tool caller: resolved by demoting it to fallback
  interpreter and automatism-runner), A2/A3 (automaticity vs deliberate acts: the
  ladder gives each its own grain), A4 (felt-lines: replaced by reach-index +
  affordance cards + skills learned by doing), B1/B2 (central gate: retired at verb
  grain, composed at wish grain), C1–C4 (each carried into the metrics).
- [efference-by-reference.md](efference-by-reference.md) +
  [critique](efference-by-reference-critique.md) — R5; lands in Phase 1 as specified
  there.
- [confabulation-and-real-tools.md](../research/confabulation-and-real-tools.md) —
  its §5.1/§5.2/§5.4 become Phase 0 + invariant 4; its §6 question is answered
  (friction + unforgeable givenness).
- [efference.md](../architecture/efference.md) — the architecture doc this revises;
  on adoption it gets a successor section rather than deletion (the wish-grain path
  and the hands inventory remain accurate).
- [agent-loop.md](agent-loop.md) — the inversion becomes a dial (mandate grain).
- [board.md](../architecture/board.md) — society-grain efference; unchanged, inherits
  the ladder.
- [fractal-memory.md](fractal-memory.md) — procedural memory limb for skills.
- [loop-detection-redesign.md](loop-detection-redesign.md) — mode-capture coverage.

---

**Status:** design analysis complete; recommended direction — **Phase 0 immediately
(worth it under any rule), Phase 1–2 as the wall comes down, Phase 3 in a lab, Phase
4 after data**. Decision pending with Kris.
**Priority:** High — four open improvement notes and one research note converge here;
lemma's terminal, the solver's checker, and every future interactive surface sit
behind it.
