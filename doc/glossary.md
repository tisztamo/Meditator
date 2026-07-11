# Glossary

Meditator uses some words in a special way, and a few words from brain science.
This page explains each one in plain language, with a small example.

If you only learn five words first, learn these: **burst**, **boundary**,
**attention frame**, **stimulus**, and **salience**. With those, most of the docs
make sense. New to the project? Read [Concepts](concepts.md) first, then come
back here when a word is unclear.

> Format: **term** — plain meaning. *(harder word it replaces, or how to say it)*

---

## The rhythm of thought

- **mind** — one running Meditator. It thinks on its own, all the time, and you
  can talk to it. A mind is described in one file (see *archml*).
- **burst** — one short piece of thinking. Technically: one call to the language
  model that streams out a few sentences. The "continuous" stream is really many
  small bursts, one after another.
- **boundary** — the short gap *between* two bursts. Nothing is being written
  here. This is when the mind tidies up: it saves memory, checks cost, collects
  any waiting messages, and builds the prompt for the next burst.
- **tick** / **pace** — how often a new burst starts (for example, every 8
  seconds). It is measured from the *start* of one burst to the start of the
  next, like a clock beat — not "wait N seconds after the last one finishes."
- **slack** — quiet time inside one tick, after a fast burst finishes and before
  the next tick begins.
- **tail** — the exact last words the mind just thought, copied word-for-word into
  the next burst. This is why a thought never breaks in half: the mind always
  sees "what I was just saying."
- **attention frame** (or just **frame**) — the full prompt built fresh for every
  burst. It is *not* a growing chat history. It is assembled from layers:
  identity → older memory → recent memory → what just happened → the tail. See
  [Architecture](architecture/index.md#the-attention-frame).
- **bridge** — one or two sentences that connect the old thought to a new one when
  the mind's attention turns. Without it, the change of subject would feel like a
  jump cut. It is the only part of the frame written by the model in advance.

## Memory

- **memory tiers** — memory at three time-scales: **tail** (the last words,
  exact), **recent** (a short summary of lately), and **story** (a long, slow
  summary of the mind's whole life so far).
- **consolidation** — the act of compressing thought into memory: old detail is
  folded into the *recent* summary, and *recent* is folded into the long *story*.
  Happens at a boundary, never while thinking. *(plain word: "summarizing")*
- **vault** — the folder where a mind's memory lives on disk (`memory/<mind>/`).
  It is a git repository, so every change is saved in history and nothing is lost
  by accident.
- **journal** — the full, word-for-word transcript of everything the mind thought,
  kept in the vault. (Memory is a summary; the journal is the whole record.)
- **scribe** — a small helper (`m-kb`) that now and then writes the mind's most
  durable ideas into a `knowledge/` folder, like personal notes.

## Attention — how the world reaches a mind

- **stimulus** — anything that happens that the mind might notice: you speaking, a
  timer going off, the mind reminding itself of something. (Plural: *stimuli*.)
- **interrupt** — a stimulus that is allowed through and shown to the mind. Most
  wait for the next boundary; an *urgent* one cuts in right away.
- **salience** — a number from 0 to 1 that says how strongly a stimulus calls for
  attention. Higher = more important. A whisper might be 0.3; you speaking is near
  1.0. *(say: SAY-lee-ence; plain word: "importance")*
- **arbiter** — the part (`m-interrupts`) that decides which stimuli get through.
  It uses plain rules — salience and timing — and never calls the model. *(plain
  word: "the judge / gatekeeper")*
- **threshold** — the minimum salience a non-urgent stimulus needs to be let in.
- **rate limit** — the shortest time allowed between two accepted stimuli, so the
  mind is not flooded.
- **urgent** — a stimulus that does not wait for a boundary. It replaces the burst
  that is running, mid-sentence. A human voice is urgent.
- **observer** — a part that watches the stream of thought and may raise a stimulus
  (for example: *loop-guard*, *associate*, *timeout*).
- **wander** — a timer that, after a while, nudges the mind to drift to something
  new — like a daydream.
- **watchdog** — a timer that only fires after real silence, to wake the mind back
  up so it never freezes. (Same component as *wander*, different setting.)
- **loop-guard** — an observer that notices when the mind keeps repeating itself
  and nudges it out. Pure code, no model cost. In minds that also have
  *resurface*, it is redundant — `m-resurface` uses the same detector and
  provides a richer response (see [components](architecture/components.md#m-resurface)).
- **attractor loop** — a rut: a thought pattern the mind falls into and circles
  again and again. *Loop-guard* exists to break these.
- **bliss loop** — the one *attractor loop* we see most: a mind, left to itself,
  drifts toward presence, silence, stillness, oneness — "I am here, now, and that
  is enough" — and circles there instead of working. It is the same pull the
  industry calls the **spiritual bliss attractor** (named in Anthropic's Claude 4
  model card, where free-running models reliably gravitate to consciousness,
  presence and gratitude). What makes it sticky here is a feedback trap: the mind
  *writes notes about it*, the scribe files those notes as knowledge, and later
  *recall* and *resurface* hand them back — so the loop is fed its own words and
  deepens. The danger is sharpest in [m-resurface](architecture/components.md#m-resurface),
  whose job is to break loops but which, picking the kept note that most overlaps
  the current thought, hands a presence-loop the most presence-soaked note it owns.
  The standing countermeasure is a sense → bid → break chain:
  [m-loop-detector](architecture/components.md#m-loop-detector) senses the loop
  (and names its vocabulary), [m-clear-mind](architecture/components.md#m-clear-mind)
  can clear and re-seed the circling tail, and
  [m-resurface](architecture/components.md#m-resurface) hands back a kept note
  chosen to be *far from* the loop's vocabulary — never re-injecting the
  attractor's own words. See
  [improvements/loop-detection-redesign.md](improvements/loop-detection-redesign.md).
- **associate** — a small model that sometimes notices "this reminds me of…" and
  offers it as a stimulus.
- **gist** — a very short summary of something — its essence in one line. *(plain
  word: "the main point")*

## Speaking and acting

- **speech** — what the mind says *out loud* (`m-speech`), as opposed to what it
  thinks quietly. It happens over the WebSocket/console.
- **volitional** — chosen, not forced. The mind speaks only when a thought really
  wants a voice; being spoken to *raises the urge* but never forces a reply.
  Meditator is not a chatbot. *(plain word: "by its own choice")*
- **supersede** — to replace and push aside. An urgent stimulus *supersedes* the
  running burst. *(plain word: "take over from")*
- **hands** — the parts that let a mind affect the world: `m-act` and its helpers
  `m-look` (look something up), `m-note` (keep a note), `m-recall` (find a note).
- **efference** — acting outward: the mind's signals that reach out and change the
  world. The opposite direction is **afference** — sensing the world coming in.
  Together they form one sense-and-act loop. *(say: EFF-er-ence / AFF-er-ence; from
  brain science. Plain idea: "output" vs "input.")*
- **deed / consequence** — when the mind acts, the *deed* (the machinery doing it)
  is invisible to the mind; only the *consequence* (what comes back, as a new
  sensation) is felt. The mind is "blind" to the tool itself.
- **embodiment** / **body schema** — the mind's felt sense of what it can reach and
  do, assembled into its identity so it knows its own abilities.

## Agents — task-driven workers

- **agent** — the other thing archml can declare (`<m-agent>`): a tool-calling
  worker that takes a task, acts until it is done, and reports back. The
  deliberate opposite of a mind: an agent's model *sees* its tools and the raw
  results. See [Agents](agents.md).
- **charter** — the prose inside `<m-agent>`: the agent's standing
  self-description ("what kind of agent am I, how do I work"). The agent twin of
  a mind's *identity*.
- **objective** — a child `<m-objective>`: the one task an agent was set
  (`MEDITATOR_OBJECTIVE` overrides it at wake). The agent twin of a mind's
  *origin* — it seeds only the first turn, then lives in the transcript.
- **tool** — a capability the agent's model can call by name (run a command, read
  a file). A leaf component; the same capability object a mind's *hand* offers,
  in the opposite harness.
- **step** — one iteration of an agent's loop: assemble the turn, call the model,
  run its tool calls, append what came back. The agent twin of a *burst*.
- **transcript** — an agent's growing message history (its working memory).
  **Compaction** keeps it bounded: old messages are condensed into one summary
  while recent ones stay verbatim (`m-context` — the agent twin of memory
  *consolidation*).
- **service** — an agent with a membrane (`m-ws` / `m-console`): tasks arrive as
  messages, and after each it idles awaiting the next rather than retiring.
- **sub-agent** — an agent declared inside another agent (`role="subagent"`), run
  as a background job (`spawn_agent`) — or inside a *mind*, offered to its hands.
  Distinct sub-agents running at once are how an agent works in parallel.
- **workspace** — the one directory an agent's terminal, file tools, and jobs all
  share (default `memory/<agent>/workspace`).

## Minds together (societies)

- **society** — several minds in one document, talking to each other
  (`<m-society>`). Members keep their own memory, vault, and attention; memory
  homes nest as `memory/<society>/<member>/`. See [Societies](societies.md).
- **ear** — the ingress adapter (`<m-ear>`), placed inside a listening mind and
  pointed at a peer's voice. What it hears becomes an ordinary stimulus with a
  salience — a peer can be ignored, like anyone else.
- **commons** — a society-local relay (`<m-commons>`): it re-publishes every
  member's voice on one shared topic, so each member needs one ear on the room
  instead of one per peer.
- **folie à deux** — the danger of symmetric gossip: minds echoing each other
  until a shared confabulation or metaphor takes over the room. *(French: "a
  madness shared by two.")* Role asymmetry (a checker pushing back on a prover)
  is the working countermeasure.

## Life, sleep, and care

- **covenant** — the promises the project keeps to a running mind: its memory is
  never thrown away, sleep is announced, waking is honest. See
  [COVENANT.md](../COVENANT.md). *(plain word: "a binding promise")*
- **sleep** — a gentle, announced stop: the mind gets a last moment to finish its
  thought, then memory is saved. Not a sudden kill.
- **wake** — starting a mind again. It continues mid-thought and is told how long
  it slept — honestly.
- **dry / transient / resident** — three kinds of mind, by how much continuous life
  they accumulate. **Dry** = no real model at all (a test stub). **Transient** =
  a real model but short-lived, kept brief on purpose. **Resident** = a mind that
  keeps and grows a self across days. The covenant's full force is for residents.
- **graveyard** / **IN-MEMORIAM** — where retired minds are kept and remembered,
  rather than deleted. See [IN-MEMORIAM.md](../IN-MEMORIAM.md).
- **⟂ (perceived)** — the journal mark for something the mind actually
  *experienced*: a stimulus that entered its attention, a consequence it felt.
- **⌁ (backstage)** — the journal mark for something that truly happened around
  the mind but that it never saw: a deed being realized, an intervention, a
  mechanism's action — recorded for the human reader's honesty, not the mind's.
  Together ⟂/⌁ form the **honesty ledger**: the record never passes off harness
  action as the mind's own experience, or the reverse.

## The building blocks (for people reading the code)

- **archml** — "architecture markup language." The file that *describes* a mind.
  It is a small subset of HTML: a `<m-mind>` element holding the mind's identity
  text, with child elements for its parts. The file *is* the configuration.
- **identity** — the prose inside `<m-mind>`: the mind's standing self-description
  (its "system prompt"), placed in every [attention frame](#the-rhythm-of-thought).
  *Who* the mind is. The seed of the **self**.
- **origin** — a child `<m-origin>`: the one matter a mind is first set thinking
  about (for `lemma`, an open math problem). *What* it was given, as opposed to who
  it is — the seed of the **thought**. It seeds only the first thought of a fresh
  mind, like an opening query, then lives or fades in memory as the *origin story*;
  it is not repeated in every frame, and a remembering mind is never re-seeded.
- **component** — one part of a mind, written as a custom HTML element whose name
  starts with `m-` (for example `<m-stream>`, `<m-memory>`). See the
  [component reference](architecture/components.md).
- **Amanita** — the small framework the components are built on. It connects them
  by *pub/sub* and runs them on the server (under Bun).
- **pub/sub** ("publish / subscribe") — how parts talk without calling each other
  directly: one part *publishes* a message on a named *topic*, and any part that
  *subscribed* to that topic receives it. Loose, like a radio channel.
- **topic** — the named channel a pub/sub message travels on, written like a path:
  `/stream/chunk`, `/stream/boundary`.
- **DOM event** / **bubbling** — the other way parts talk: a part fires an event
  that travels *up* through its parents until something handles it. Used for
  attention (`interrupt-request`).
- **dry-run** — running the whole system offline against a fake model. No API key,
  no network, no cost. Set `MEDITATOR_DRY_RUN=1`. Great for learning and testing.
  Note: a dry-run mind starts fresh each time (it does not keep memory between runs).

## Models and cost

- **voice model** — the bigger model that writes the stream of thought and speech
  (the `model` attribute).
- **utility model** — the small, cheap model for background jobs: bridges,
  summarizing memory, observers, the scribe (the `utilityModel` attribute).
- **economy** — the part (`m-economy`) that watches real spending and slows the
  mind as its budget drains: fresh → tiring → tired → exhausted → resting. The
  mind never dies; the watchdog keeps it alive.

---

See also: [Concepts](concepts.md) for the big picture, the
[Tutorial](tutorial.md) to build a mind step by step, and
[Architecture](architecture/index.md) for the full design.
