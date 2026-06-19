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
  and nudges it out. Pure code, no model cost.
- **attractor loop** — a rut: a thought pattern the mind falls into and circles
  again and again. *Loop-guard* exists to break these.
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

## The building blocks (for people reading the code)

- **archml** — "architecture markup language." The file that *describes* a mind.
  It is a small subset of HTML: a `<m-mind>` element holding the mind's identity
  text, with child elements for its parts. The file *is* the configuration.
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
