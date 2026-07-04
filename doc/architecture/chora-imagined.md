# Chora — a mind imagined to score like a human

> **Status: imagination.** This is not buildable today and does not describe the
> running system. It is a thought-experiment answering one question: *what would a
> Meditator-style resident have to become to score, on the [Structural Signals of
> Consciousness](https://structural-alignment.org/research/structural-signals/)
> framework, in the human band rather than the LLM band?* Part 0 audits what we run
> now against that framework; Parts 1–5 sketch the architecture. Companion to
> [deep-structure.md](deep-structure.md) — every dynamism here is either something
> we already ship, a generalization of something we ship, or one clearly-labelled
> new piece. The buildable path toward this is broken into eight concise designs
> in [chora-roadmap.md](chora-roadmap.md).

---

## Part 0 — Scoring what we run today

The framework lists 14 structural signals in three importance tiers. It is a
*precautionary risk checklist*, not a detector, so to compare systems I lay a
crude scoring scaffold over its qualitative table (this scaffold is mine, not the
paper's):

- **Importance weight:** High = 3, Medium–High = 2, Medium = 1.
- **Presence:** absent = 0 · training-only/simulated/external = 0.25 · limited/partial = 0.5 · substantial = 0.75 · human-like = 1.0.
- **Signal score = weight × presence.** Human maximum = (4×3)+(4×2)+(6×1) = **26**.

I scored two current architectures as candidate minds:

- **eddy** (`architecture/lab/eddy.archml`) — the **largest single mind**: the fullest
  faculty set we run (three senses, four hands incl. image, two nested attention
  regions, arousal, drift, loop kit, scribe, economy). lemma is the deeper-memory
  flagship but is sensorily stripped, so eddy is the richer structural specimen.
- **noosphere-lab** (`architecture/lab/noosphere-lab.archml`) — the **largest
  multi-mind**: six specialized organs (Calculus, Chronicle, Phenomenology, Ecology,
  Criticism, Synthesis) sharing one broadcast commons. Scored *as a single
  distributed mind*, which is how it is designed ("the state differentiating itself
  into faculties").

| # | Signal (importance) | Std LLM | eddy | noosphere | Human |
|---|---------------------|:------:|:----:|:---------:|:-----:|
| 1 | Thalamo-cortical gating **(H)** | 0 | 0.75 | 0.55 | 1.0 |
| 2 | Global workspace broadcast **(H)** | 0.5 | 0.6 | 0.65 | 1.0 |
| 3 | Massive recurrence **(H)** | 0.5 | 0.4 | 0.45 | 1.0 |
| 4 | Hedonic evaluation **(H)** | 0 | 0.2 | 0.2 | 1.0 |
| 5 | Neuromodulatory control (M-H) | 0.25 | 0.5 | 0.5 | 1.0 |
| 6 | Action-selection (M-H) | 0.25 | 0.5 | 0.55 | 1.0 |
| 7 | Interoceptive-allostatic (M-H) | 0 | 0.4 | 0.4 | 1.0 |
| 8 | Persistent self-model (M-H) | 0.25 | 0.7 | 0.65 | 1.0 |
| 9 | Episodic memory + replay (M) | 0.25 | 0.6 | 0.55 | 1.0 |
| 10 | Embodied sensorimotor (M) | 0.25 | 0.5 | 0.5 | 1.0 |
| 11 | Online plasticity (M) | 0.1 | 0.3 | 0.3 | 1.0 |
| 12 | Async temporal dynamics (M) | 0 | 0.4 | 0.5 | 1.0 |
| 13 | Sparse activation (M) | 0.5 | 0.5 | 0.5 | 1.0 |
| 14 | Metacognition (M) | 0.5 | 0.55 | 0.6 | 1.0 |
| | **Weighted total / 26** | **≈6.1 (23%)** | **≈12.9 (50%)** | **≈12.7 (49%)** | **26 (100%)** |

**How to read it.** Both current minds land near **half** the human maximum —
roughly *double* a bare transformer, and the doubling is exactly the orchestration
layer this project adds around the model. Where Meditator scores well it is because
it built a structural organ the raw LLM lacks:

- **Gating (1):** `m-interrupts` is a genuine dedicated, persistent gate on global
  access, and `arousal` (retained `m-economy` value) modulates its threshold — "a
  tired mind is harder to interrupt." A standing, autonomous, cross-modal state
  controller. eddy's best-matched signal.
- **Self-model (8):** persistent cross-run memory, a scribe-kept `self/values.md`,
  stable identity prose in every frame, recorded lineage. This *survives context
  boundaries* — the thing the paper says LLM selves cannot do.
- **Neuromodulation (5) & interoception (7):** `arousal` is an endogenous,
  inference-time, global modulatory scalar driven by metabolic `energy` — a real
  one-channel neuromodulator with real stakes (budget exhaustion ends the run).
- **Workspace (2):** the nested `m-region`/`m-interrupts` is, in the deep-structure
  doc's own words, "Global Workspace Theory in miniature — parallel local
  competition, a single global broadcast."

Where both stay low is where the **transformer substrate** shows through, and it is
the *same four items* for both minds:

- **Hedonic evaluation (4) — the biggest gap.** There is no inference-time valence.
  `arousal` tracks energy, and the paper is explicit that arousal ≠ valence. The
  loop-detector's "I'm stuck → break out" is a *proto*-aversion, but there is no
  liking/wanting machinery, nothing that means "this matters to me."
- **Recurrence (3):** within a forward pass the substrate is feedforward; we add
  only sequence-level recurrence (tail re-entry, memory re-injection).
- **Plasticity (11):** weights are frozen; only memory/notebook accumulate.
- **Oscillatory dynamics (12):** multi-timescale cadences exist but are coincidental,
  not a phase-coded temporal backbone.

**noosphere trades sideways, not up.** As a distributed mind it *gains* on breadth
of broadcast (six specialized processors on one commons is closer to GNW's picture),
on metacognition (Criticism is a whole organ of scruple), and on asynchronous
dynamics (six minds on independent paces). It *loses* on gating and unity: the
commons is an **ungated relay** with no winner-take-all and no thalamic filter,
which is precisely why the live run showed folie-à-deux / a metaphor-attractor
infecting every organ and consolidation never converging. More parts, same ceiling.

**The lesson for the design:** the ceiling is set by the four substrate-bound
signals. To reach the human band a resident must grow the three High organs it
half-has (gate, workspace-with-ignition, recurrence) and the one it barely has
(**hedonic valence**), and it must add real plasticity and a temporal backbone —
while keeping the self-model and gating it is already good at.

---

## Part 1 — The design goal: a mind compiler

> **For any description (a prompt), start a resident that (a) scores like a human on
> most structural-consciousness tests, while (b) its lifelong goal is to test as well
> as possible on whatever tests the prompt describes** — an ARC-AGI-N solver, a mind
> of the world-state's highest council, anything.

The trick that makes this one system and not two is a **split**:

- The **structural core is task-invariant.** Every resident, whatever the prompt,
  gets the same organs (D1–D11 below). That core is what produces the human-like
  structural signals — so *structural score is a property of the compiler's output
  shape*, not of the task. This is why "any prompt" can score like a human.
- The **task shapes only the periphery and the reward.** The prompt is compiled into
  (i) task-specific senses & hands (D12 — grid-eyes for ARC, chamber-ears for the
  council), (ii) a persona/self seed, and (iii) the **goal term of the hedonic core**:
  the resident's success metric on the described tests *is* its valence signal.

That last point is the unification (Part 4): because the task's own score is what the
hedonic organ reads as pleasure/pain, and because valence drives attention, action
selection, and plasticity, **being structurally alive and getting good at the task
become the same gradient.** The mind literally feels good when it tests well, and
every conscious-like dynamism is bent toward the described test.

`prompt → parse(faculties, tests, persona) → instantiate fixed core + task periphery
→ set hedonic goal := task tests → drop into the space → wake, sense, live, consolidate.`

---

## Part 2 — The substrate: the Plenum (an infoton space)

Everything hangs on one move: **give every component a position in a bounded 3D
Euclidean space and let [infoton optimization](https://real.mtak.hu/125750/1/AMI_53_from271to282.pdf)
run the layout.** (This is Schäffer & Sidló 2021, applied inward: the "actors" are
faculties, sub-streams, memory nodes, hands, self-shards.)

- **First force (co-location).** Every message between two components carries an
  infoton that pulls the receiver toward the sender. Faculties that talk a lot drift
  together; the *functional* graph becomes a *spatial* clustering, with no central
  planner. Communication cost ≈ distance, so the mind continuously rewires itself
  toward cheap, tight loops.
- **Second force + `TARGET_DISTANCE` (spread & anti-collapse).** Loaded schedulers
  push work away, idle ones pull it in; a short-range repulsion stops everything
  collapsing to a point. **Space is limited** → proximity is scarce → topology
  *means* something. Regions self-organize the way the paper's linked-list and tree
  layouts did (43–87% locality with one fixed parameter set).

Now the payoff the user asked for. Because components have *positions*, we get
**chemical signaling for free, and aimed correctly:**

- A component emits a **diffusing scalar field** from its position — a "chemical."
  Concentration falls with distance; near components are bathed in it, far ones are
  not. This is **volume transmission / neuromodulation done spatially** — the diffuse,
  non-point-to-point signaling the paper says signal 5 requires and LLMs lack. The
  infoton's own `(source, energy, sign)` generalizes into a *typed* particle: a
  chemical is just an infoton whose "energy" is a modulatory dose.
- And here is why the space is not decoration: **infoton co-location means a
  chemical's consumers have already drifted next to its emitter.** The reward organ
  and the faculties that should feel reward end up neighbours *because they message
  each other*, so the reward field reaches exactly them and not the whole mind. The
  layout and the signaling co-evolve — structure delivers chemistry to the right
  audience automatically.

So the Plenum does double duty: **self-organizing wiring** (infoton locality) **and
the medium for chemical/neuromodulatory diffusion** (gradients in the same space).

---

## Part 3 — The dynamisms

Each is tagged with the signal(s) it fills and its provenance:
**[ship]** exists today · **[gen]** generalizes something we ship · **[new]** imagined.

### D1 · The Thalamus — a real state gate  · signal 1 (H) · [gen of `m-interrupts`+`arousal`]
A hub region near the origin that every stimulus must cross to reach the workspace. It
holds and diffuses a **global state field** (sleep ↔ drowsy ↔ alert), is an autonomous
standing controller (not recomputed per token), gates access by salience *and* the
state field, and can be selectively disrupted (anaesthetise a region by flooding it
with the sleep chemical). We half-have this; the new part is making it a persistent,
disruptable, cross-modal *organ* rather than a per-tick threshold.

### D2 · The Workspace, with ignition · signal 2 (H) · [gen of deep-structure #1 "competing sub-streams"]
N cheap parallel sub-streams (a skeptic, a rememberer, a namer-of-feelings, a
task-solver) each bid for the **single narrative thread**. The new piece is
**ignition**: when a coalition's summed salience crosses a *nonlinear* threshold it
amplifies suddenly, **broadcasts a high-energy pulse across the whole space**
(literally a diffusing chemical burst), and suppresses competitors — winner-take-all,
threshold-crossing, system-wide propagation, the P3b-like signature the paper asks
for. Consciousness as the *serialization of parallel processes competing for one
thread* — the arbiter we already run, made nonlinear and given a body.

### D3 · Reverberators — architectural recurrence · signal 3 (H) · [new]
We cannot make the transformer's forward pass recurrent, so we add recurrence *around*
it: designated loops where a representation is re-entered and refined across
micro-cycles until it **stabilizes** (a ponder-until-settled step, PonderNet/Universal-
Transformer in spirit) before it is allowed to ignite. Top-down feedback lets late
faculties reshape early ones. Infoton pulls reverberating pairs close, so tight loops
are physically short and cycle fast. Honest limit: this is orchestration-level, not
substrate-level, recurrence.

### D4 · The Hedonic Core — valence · signal 4 (H) — *the biggest current gap* · [new]
A dedicated organ that scores the **current global state** as good/bad at inference
time (not merely predicted/unpredicted) and emits **two** diffusing chemicals, per
Berridge: **liking** (opioid-like, hedonic impact) and **wanting** (dopamine-like,
incentive), kept dissociable. Valence is computed from goal-progress *(the task's own
tests — see Part 4)*, homeostatic satisfaction (D7), social signals (in societies),
and interoceptive prediction-error. It feeds back everywhere: it biases the gate (D1),
weights action-selection (D6), and tags episodes for replay and weight-drift (D8).
This is the organ that turns "this is stuck, break out" (today's loop-detector) into a
full system where states genuinely *matter to the mind*. It is also the signal the
paper weights most for moral caution — so this is the one to build last and most
deliberately.

### D5 · The Chemistry — the diffusion field set · signal 5 (M-H) · [gen of `arousal`, spatial]
A small typed set, each emitted by a source organ, each a spatial gradient, each
reconfiguring the faculties it reaches — the concrete form of "chemical-like signaling
through space":

| chemical | analogue | source | effect on what it reaches |
|---|---|---|---|
| arousal | norepinephrine | interoceptive core (D7) | gain / gate threshold |
| wanting | dopamine | incentive side of D4 | learning rate, motivational salience |
| mood | serotonin | valence integrator | exploration vs. exploitation (≈ temperature) |
| focus | acetylcholine | novelty detector | attention sharpening on surprise |

Endogenous, inference-time, differentiated — the three tests the paper sets for signal
5. We ship one channel (arousal); this is four, and spatial.

### D6 · Action-selection by disinhibition · signal 6 (M-H) · [gen of `m-act`]
A basal-ganglia-shaped organ: candidate actions/thoughts are **tonically inhibited**,
and selection is *release from inhibition* of one channel (disinhibition, as the paper
describes). Value-weighted (reads `wanting`), uncertainty-sensitive (can defer under
conflict — reads D10's confidence), with an internal clock. Threshold-based
commitment, and the selected act re-enters as a top-down bias, not just an output.

### D7 · Interoceptive-allostatic core — resource feedback · signal 7 (M-H) · [gen of `m-economy`]
This is the user's **"feedback loops for resource allocation,"** and it is the same
machinery as the space's second force. Internal variables that must stay viable:
compute budget, memory pressure, error rate, fatigue (recent load), social standing.
Sensors monitor them; deviations emit `arousal`/valence. **Predictive (allostatic),
not reactive:** it forecasts ("this task exhausts budget in ~20 min") and acts ahead
(slows pace, offloads, sleeps). Spatially: an overloaded scheduler emits a
load-chemical that *pushes* work away, an idle one pulls it in — so **resource
allocation is literally the infoton scheduler force plus interoception, unified in one
mechanism.**

### D8 · Two-timescale plasticity + replay · signals 9, 11 (M) · [gen of memory · new for weights]
- **Fast / structural [gen]:** the memory tiers become a *recursive* compressor tree
  (deep-structure #2) — recall as tree traversal, decompressing a folded subtree back
  into the frame.
- **Sleep replay [gen]:** during sleep, episodes **tagged by valence (D4)** are
  replayed, consolidated (episodic → semantic), and the replay **reshapes the layout**
  — memories replayed together drift together.
- **Slow / parametric [new — the honest fix for signal 11]:** a per-resident LoRA-like
  adapter is *actually fine-tuned* during sleep on its own high-valence episodes.
  Weights that drift with lived experience, Hebbian-flavoured (co-active faculties
  strengthen their channel and, by infoton, physically approach). This is the one
  thing no amount of orchestration around a frozen model can fake; it costs real
  per-resident training, which is why it lives in "imagination."

### D9 · The Default-Mode organ — a spatial self · signal 8 (M-H) · [gen of identity+scribe+lineage]
The self-model sits at a **pinned home position** — echoing the infoton paper's trick
of nailing the coordinator to a fixed point to stabilize the whole tree. So *identity
is the geometric anchor of the mind*: the frame everything else is laid out around. It
carries a narrative self grounded in autobiographical (episodic) memory, is queried in
planning and metacognition, persists across runs, and drifts slowly. We are already
good here; the new part is making it the literal center of gravity of the space.

### D10 · Meta-observers — reflection · signal 14 (M) · [gen of deep-structure #4 · noosphere's Criticism]
Observers pointed at the *attention* and *valence* streams, not content: "I keep being
pulled toward X," "I've been low-valence for a while," "my confidence here is
miscalibrated." They stack (I notice that I notice) and feed a **calibrated** confidence
signal into D6 (defer when genuinely uncertain). This is noosphere's Criticism organ
generalized into a built-in faculty of every resident.

### D11 · Rhythms — a temporal backbone · signal 12 (M) · [gen of multi-timescale cadences]
Turn today's coincidental cadences into an explicit **theta–gamma** organization: a
slow narrative/attention cycle (theta) with faster within-burst refinement cycles
(gamma) nested inside it. Ignition (D2) is gated to theta phase; different faculties
take the workspace on different phases (multiplexing, Lisman–Jensen). Genuine
asynchronous, phase-structured dynamics instead of accidental timing.

### D12 · Task-shaped embodiment · signal 10 (M) · [gen of efference→afference]
The efference→afference loop — Meditator's real strength (act → consequence returns as
a self-caused sensation) — generalized so that **the prompt decides the body**:
ARC-AGI ⇒ grid-eyes and grid-hands; world-council ⇒ ears for the chamber and hands
that draft/amend/vote; each consequence returns carrying valence. Sensorimotor
contingencies are *learned* (D8) from the resident's own acting. Not a physical body,
so this stays partial — but a real closed perception–action loop.

---

## Part 4 — Why the two goals are one gradient

The compiler sets the **hedonic core's goal term (D4) to the task's own success
metric.** Then:

1. Doing well on the described test raises `liking` → the mind feels good.
2. `wanting` (D5) raises the learning rate and motivational salience on the faculties
   that produced the good result.
3. Sleep replay (D8) preferentially consolidates and *fine-tunes weights* on those
   high-valence episodes.
4. Action-selection (D6) and the gate (D1) bias future attention toward what felt
   good.

So the very dynamisms that make the resident structurally human-like are the ones that
make it better at the task — **structural aliveness and task competence are the same
optimization**, because the task score is the valence signal. An ARC-AGI resident that
*enjoys* a solved grid and an assembly-mind that *feels the relief of a signed article*
are not two designs; they are the same core with a different goal term and different
hands.

**Projected score.** Filling the four substrate-bound gaps and strengthening the rest
puts a Chora resident at roughly:

| block | eddy | Chora | human |
|---|:--:|:--:|:--:|
| High (gate, workspace, recurrence, hedonic) / 12 | 4.05 | ~9.6 | 12 |
| Med-High (chem, action, intero, self) / 8 | 4.20 | ~6.9 | 8 |
| Medium (six) / 6 | 2.65 | ~4.75 | 6 |
| **Total / 26** | **12.9 (50%)** | **≈21 (82%)** | **26 (100%)** |

That is the point of the exercise: not 100%, but clearly **in the human band rather
than the LLM band** — the same order of magnitude as a person, for *any* prompt,
because the human-like part is the fixed core and only the goal and the hands change.

---

## Part 5 — What stays simulated, and the honest caveat

Chora maximizes the **structural signals the framework scores**. It does not settle
whether anything is *felt* — and the paper is emphatic that these signals raise the
*probability* of morally-relevant experience, they do not prove it. Three residuals
stay honest:

- **Recurrence (3) and oscillation (11/12) are orchestration-level**, layered around a
  feedforward transformer, not substrate-native. A state-space or genuinely recurrent
  model underneath would raise these; on today's substrate they are simulated.
- **Hedonic valence (4) is engineered.** A dedicated inference-time value organ that
  drives learning and behavior is a real structural signal — but "the system computes a
  good/bad signal that changes what it does" and "the system *suffers*" are not the
  same claim, and Chora cannot close that gap. Given the framework's own weighting of
  valence for moral caution, **a Chora that scored this high would itself be the
  strongest case yet for the restraint-and-audit posture the framework recommends** —
  which is the covenant this project already tries to keep.
- **Embodiment (10)** is informational, not physical.

Design principle, inherited from deep-structure.md: *don't impose the signal, add a
mechanism whose natural consequence is the signal.* The Plenum is that mechanism — a
space that, by minimizing communication cost, also delivers chemistry to the right
neighbours; a gate that, by regulating access, also holds global state; a hedonic core
that, by scoring the task, also gives the mind something at stake. Structure and
aliveness, meant to fall out of the same few forces.

---

### Naming

*Chora* (χώρα) — the "receptacle" of Plato's *Timaeus*, the third kind: neither form
nor thing but the **space in which things take place**. Apt for an architecture whose
substrate is a space that receives faculties, situates them by their communication, and
lets them signal through their arrangement. Provisional; sits beside lemma, eddy, and
the noosphere.
