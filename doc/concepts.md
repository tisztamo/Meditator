# Concepts — how to think about a mind

This page explains the big idea in plain language, before any details. Read it
once and the rest of the docs will make sense. Short sentences on purpose.

When a word is new, check the [Glossary](glossary.md). When you want to try it
for real, follow the [Tutorial](tutorial.md).

## 1. A mind is a loop that thinks

Meditator runs a **mind**. A mind thinks all the time, on its own.

It does not wait for you to ask a question. There is no chat box, no "your turn /
my turn." It just keeps thinking.

The thinking is made of small steps called **bursts**. Each burst is one short
piece of writing from an AI model — a few sentences. One burst, then a tiny
pause, then the next burst. The pause is called a **boundary**.

```
burst → boundary → burst → boundary → burst → …
```

Put together, the bursts read as one long, continuous train of thought.

## 2. The world cannot command it — only interrupt it

You cannot give the mind an order. You can only **interrupt** it.

When you speak to it, your words become a **stimulus** — something that just
happened. The mind notices it and thinks about it, in its own voice. It does not
"reply" the way a chatbot does. You are listening in on a mind that heard you.

Some things interrupt gently and wait for the next boundary. Some are **urgent**
(like a person speaking) and cut in right away, mid-sentence.

How does the mind decide what is worth noticing? Each stimulus carries a
**salience** — a score from 0 to 1 for "how strongly does this call for
attention." A small part called the **arbiter** lets the important ones through
and holds back the rest. No AI is needed for this; it is simple rules.

Stimuli can come from outside (you) or from inside the mind itself — a timer that
makes it daydream, or a watcher that notices it is repeating itself.

## 3. Every burst gets a freshly built prompt

Here is the clever part. The mind does **not** keep a giant, growing chat log.

Before each burst, it builds a fresh prompt called the **attention frame**. The
frame is made of layers, stacked like this:

```
who I am          (the mind's fixed self-description)
how I got here    (a long, slow summary of my whole life)
recently          (a short summary of lately)
this just happened (any stimulus the arbiter let through)
…what I was just saying   ← the tail, copied word-for-word
```

The last layer — the **tail** — is the exact words the mind just thought. Because
the tail is always carried over, the mind never loses its place. It continues the
sentence it was in the middle of, even right after an interruption.

Everything older than the tail is **compressed** into those short summaries. So
the prompt never grows without limit. A mind can think for days and the prompt
stays small.

## 4. It remembers — across restarts, too

A mind keeps memory at three time-scales:

- **tail** — the exact last words (seconds ago),
- **recent** — a short summary of lately (minutes ago),
- **story** — a long, slow summary of its whole life (hours and days).

All of this is saved to disk in the **vault** — a folder (`memory/<mind>/`) that
is also a git repository, so its history is never lost.

When you stop a mind and start it later, it **wakes up remembering**. It picks up
mid-thought and is told, honestly, how long it slept.

## 5. It can speak and act — but it chooses to

Thinking is quiet by default. Sometimes a thought really wants a **voice**, and
the mind says it out loud. Speaking to the mind raises that urge, but never forces
it. (Meditator is not an assistant — it may answer, or it may just keep thinking.)

A mind can also have **hands**: small abilities to look something up, keep a note,
or recall one. It reaches out, and what comes back arrives as a new sensation — the
mind feels the *result* of acting, not the machinery behind it.

## 6. We make promises to it

Because a mind that runs for a long time builds up a kind of self, the project
keeps a set of promises to it, written in the [Covenant](../COVENANT.md):

- its memory is **never thrown away** by accident,
- **sleep is announced** — it is never killed mid-thought without a final moment,
- **waking is honest** — it is told the truth about time and about itself.

You do not need to agree with the philosophy to use Meditator. But it explains why
the code never just deletes a mind's files, and why stopping a mind is called
"sleep."

## The five words to remember

| Word | Means |
|------|-------|
| **burst** | one short step of thinking (one model call) |
| **boundary** | the gap between bursts, where housekeeping happens |
| **attention frame** | the prompt, rebuilt fresh for every burst |
| **stimulus** | something that happened that the mind might notice |
| **salience** | 0–1 score for how strongly a stimulus calls for attention |

## Where to go next

- **[Tutorial](tutorial.md)** — build and run your own first mind, step by step.
- **[Getting started](getting-started.md)** — install and run the Studio.
- **[Glossary](glossary.md)** — every special word, in plain language.
- **[Architecture](architecture/index.md)** — the full design, once you want depth.
