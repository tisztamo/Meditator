# Tutorial — build and understand your first mind

This walks you from an empty file to a thinking mind, one small step at a time.
After each step you run it and read the output, so you *see* each idea working.

You do not need an API key or any money for this tutorial. We use **dry-run**
mode, which runs everything offline against a fake model. The thoughts you see are
fixed sample text, not real AI — but the machinery (bursts, boundaries, memory,
interrupts) is the real thing.

New to the ideas here? Read [Concepts](concepts.md) first (5 minutes). Stuck on a
word? The [Glossary](glossary.md) explains every special term.

## Before you start

You need **[Bun](https://bun.sh)** installed, and the project's dependencies:

```bash
bun install
```

That is all. No API key is needed for the dry-run steps below.

---

## Step 1 — Write the smallest possible mind

A mind is one file ending in `.archml`. It looks like HTML. The outer `<m-mind>`
element holds the mind's identity (plain text), and the child elements are its
parts.

Create a file called `first-mind.archml` anywhere in the project (for example in
`architecture/lab/`) with this content:

```html
<m-mind name="first-mind" pace="2s" paceSigma="0.4s" tailLength="400">
  You are a small mind, just learning to think. One thought grows out of the last.

  <m-stream name="stream" burstTokens="100"></m-stream>
  <m-memory name="memory" tailLength="400" recentLength="300" storyLength="500"
            blockMin="150" storyEvery="2"></m-memory>
  <m-interrupts name="attention" threshold="0.35" rateLimit="3s" keep="2"></m-interrupts>
</m-mind>
```

What each line is:

| Part | What it does |
|------|--------------|
| `<m-mind>` | the whole mind. The text inside it is **who the mind is** — it leads every prompt. |
| `pace="2s"` | start a new **burst** every ~2 seconds. (The real default is `8s`; we go faster so you see more, sooner.) |
| `tailLength="400"` | carry the last 400 characters of thought into the next burst (the **tail**). |
| `<m-stream>` | the voice that actually writes the thinking. `burstTokens="100"` keeps each burst short. |
| `<m-memory>` | remembers, at three time-scales (tail / recent / story). |
| `<m-interrupts>` | the **arbiter** — decides which interruptions get through. Needed even when nothing interrupts yet. |

This is the smallest mind that thinks: a voice, a memory, and an attention
gatekeeper.

## Step 2 — Run it and watch it think

```bash
MEDITATOR_DRY_RUN=1 bun run meditator.js -a architecture/lab/first-mind.archml
```

(`MEDITATOR_DRY_RUN=1` is the offline mode — no key, no cost. Press **Ctrl-C**
once to stop.)

After a few startup lines, you will see something like this:

```
[mMind.js] "first-mind" starts thinking.
 The window is open and I can hear something like traffic, or maybe rain. It is
 strange how the mind reaches for a label before it reaches for the thing itself…
 I keep returning to the idea of small tools. A hammer does not need a manual…
 Memory is a strange editor. It cuts almost everything and then insists the
 remainder was the whole story…
```

Read what you are seeing:

- **Each paragraph is one burst** — one step of thinking.
- **The blank line between paragraphs is a boundary** — the short pause where the
  mind saves memory and builds the next prompt.
- The thoughts continue from one another. That is the **tail** at work: the last
  words are copied into the next prompt so the thread never breaks.

> The actual sentences are canned sample text from the dry-run stub. With a real
> model (Step 6) the mind would instead think in the voice of the identity you
> wrote. Here, focus on the *rhythm*, not the words.

Let it run for a bit, then press **Ctrl-C** to stop.

## Step 3 — Give it something to notice (an interrupt)

Right now nothing ever interrupts the mind. Let's add a **timeout** that nudges it
to drift every few seconds — like a daydream. This is the **wander** observer.

Add one line inside `<m-mind>`, just below `<m-interrupts>`:

```html
  <m-timeout name="wander" timeout="5s" sigma="1s" salience="0.7"
             prompt="My mind drifts toward something else."></m-timeout>
```

- `timeout="5s"` — fire roughly every 5 seconds.
- `salience="0.7"` — how strongly it calls for attention (0 to 1). Our arbiter's
  `threshold` is `0.35`, and `0.7` is above it, so it gets through.
- `prompt="…"` — what the mind *experiences* when it fires, in first person.

Run it again. Now you will see lines marked with `⟂` — those are **stimuli** that
the arbiter let through:

```
 …Let me settle back for one breath and see what arrives when nothing is summoned.

⟂ My mind drifts toward something else.

Hold on — something just shifted, and I want to turn toward it without dropping
the thread entirely.  There is a difference between waiting and resting…
```

Two things to notice:

- The `⟂` line is the stimulus arriving at a boundary.
- The sentence right after it ("Hold on — something just shifted…") is the
  **bridge**: a short connecting sentence so the change of subject does not feel
  like a jump cut. After the bridge, the mind continues thinking — now aimed at
  the new direction.

Try changing `salience="0.7"` to `salience="0.2"`. Because `0.2` is *below* the
arbiter's `threshold="0.35"`, the wander is now ignored — no `⟂` lines appear.
That is the arbiter doing its job. Set it back to `0.7` when you are done.

## Step 4 — Speak to it

So far the interruptions come from inside the mind. Now let's interrupt it from
outside. Add a console so you can type to it:

```html
  <m-console name="console"></m-console>
```

Run the mind again (same command as before). While it is thinking, **type a line
and press Enter**:

```
hello, little mind. what are you thinking about?
```

Your words arrive as an **urgent** stimulus. Unlike the wander timeout, an urgent
stimulus does not wait for the next boundary — it **supersedes** (takes over from)
the burst that is running, right away. You will see the mind turn toward what you
said and think about it, in its own voice.

Notice what does *not* happen: there is no "answer" the way a chatbot replies. You
are not getting a response — you are watching a mind think about what you said.
That is the whole idea.

## Step 5 — Change the rhythm

Find `pace="2s"` on `<m-mind>` and change it to `pace="1s"`. Run again.

The bursts now arrive twice as fast. `pace` is the **tick** — the beat of the
mind's thinking. A small `pace` means a quick, restless mind; a large one means a
slow, deliberate one. (The shipped default is `8s`.)

This is the core lesson of configuration: a mind is tuned by its attributes. See
[Configuration](configuration.md) for every knob.

## Step 6 — See it wake up remembering (needs a real model)

This last step needs a real model, because **a dry-run mind starts fresh every
time** — it clears its memory on each wake (you may have seen the log line
`Clearing stale dry-run memory…`). To watch a mind *remember*, run it for real.

You will need an **OpenRouter API key** (a continuous run costs about
$0.10–0.15/hour; a few minutes is a fraction of a cent):

```bash
export OPENROUTER_API_KEY=sk-...        # your key
bun run meditator.js -a architecture/lab/first-mind.archml
```

Let it think for a minute, then stop it gently by typing **`/sleep`** (or pressing
**Ctrl-C once**). Sleep is *announced*: the mind gets a final moment to close its
thought, then its memory is saved to the **vault** (`memory/first-mind/`).

Now run the exact same command again. The mind **wakes up mid-thought**,
continuing where it left off, and is told — honestly — how long it slept. Its
memory survived in the vault, which is a git repository you can inspect:

```bash
git -C memory/first-mind log --oneline
```

That honest, never-deleted memory is the heart of the [Covenant](../COVENANT.md).

## You now understand the whole loop

You have seen, with your own eyes, every core idea:

- **burst** and **boundary** — the rhythm of thinking (Step 2),
- **tail** — how a thought continues unbroken (Step 2),
- **stimulus**, **salience**, **arbiter**, **bridge** — how attention is won and
  redirected (Step 3),
- **urgent** interruption — how a human voice cuts in (Step 4),
- **pace** — tuning the rhythm (Step 5),
- the **vault** and waking-remembering — persistence and the covenant (Step 6).

## Where to go next

- **[Configuration](configuration.md)** — every knob: models, memory budgets,
  observers, economy.
- **[Templating](architecture/components.md#templating--archetypes-and-thin-minds)** —
  when several minds share a faculty stack, write the skeleton once as an archetype and
  thin each member down to what makes it itself.
- **[The Studio](studio.md)** — run minds from the browser instead of the
  terminal: wake, watch, speak, sleep.
- **[Architecture](architecture/index.md)** — how it all works underneath.
- **[Glossary](glossary.md)** — any word you are still unsure about.
