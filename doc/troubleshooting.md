# Troubleshooting & FAQ

Real symptoms, in the order people hit them. Every entry here comes from an
actual run — if you hit something new, that is a finding worth
[reporting](contributing.md).

## Starting up

**`requests will fail with 401` right after start.**
`OPENROUTER_API_KEY` is not set in your shell. There is no `.env` file — export
it (`export OPENROUTER_API_KEY=sk-…`). To run without any key, tick **dry-run**
in the Studio or set `MEDITATOR_DRY_RUN=1` (offline stub), or point at a
[local model](configuration.md#models).

**It doesn't start under Node / `npm start` fails.**
Meditator runs under [Bun](https://bun.sh) only: `bun install`, then
`bun run studio.js` or `bun meditator.js -a <file>`.

**Typing at the mind does nothing in a terminal.**
If stdin is not a TTY (pipes, some IDE consoles), the console sense stays off.
Set `MEDITATOR_STDIN=1` to force it on, or speak over the
[WebSocket](websocket-api.md): `bun architecture/tests/poke-ws.js "hello"`.

**A dry-run mind forgot everything since last time.**
By design: dry-run minds start fresh each wake (you'll see
`Clearing stale dry-run memory…`) and live in separate `memory/dry-*/` homes so
they can never touch a real mind's vault. To watch a mind *remember*, run it
with a real model — [Tutorial, step 6](tutorial.md#step-6--see-it-wake-up-remembering-needs-a-real-model).

## Running minds

**The mind ignores what I typed.**
You are not owed a reply — speech is volitional, and being addressed only raises
the urge ([Concepts §5](concepts.md#5-it-can-speak-and-act--but-it-chooses-to)).
But do check: your words *should* appear as a `⟂` stimulus line in the stream.
If no `⟂` appears, the arbiter dropped it or input never arrived — run with
`--debug=mInterrupts.js` to see the arbiter's decisions.

**What are `⟂` and `⌁` in the stream and the journal?**
`⟂` marks a **perceived** event — something the mind actually experienced (your
words, a wander nudge, a consequence returning). `⌁` marks a **backstage** note —
something that truly happened around the mind (a deed realized, an intervention)
recorded for honesty's sake but not woven into the mind's experience. The pair is
the honesty ledger: the journal never silently mixes what the mind lived with
what was done near it.

**The mind keeps circling the same thought.**
That is an [attractor loop](glossary.md#attention--how-the-world-reaches-a-mind),
the system's best-known failure mode. The countermeasures are components — make
sure the mind has `m-loop-detector`, `m-clear-mind`, and `m-resurface` (the
seedling does). If it still circles, that's data; the journal under
`memory/<mind>/journal/` is the record to attach.

**Ctrl-C seems slow to stop it.**
One Ctrl-C is a *graceful sleep*: the mind gets a final short burst to close the
thought, then memory is flushed and committed — usually a few seconds, capped at
45. A second Ctrl-C forces an immediate exit. This is the
[covenant](../COVENANT.md), not a bug.

**I want to start a mind over from scratch.**
Don't delete its vault — memory is never deleted, only archived
([covenant](../COVENANT.md)). Give a fresh mind a fresh name instead: rename it
in the archml, or wake with `MEDITATOR_MIND_NAME=new-name`. Each name is its own
home under `memory/`.

## Local models

**Tool calls fail (or are never emitted) on a local vLLM.**
Anything that calls the model *with tools* — a mind's `m-act`, an agent's
`m-reason` — needs the server started with `--enable-auto-tool-choice` and a
matching `--tool-call-parser`. Without them the model can think but not act.

**Long local generations die mid-request.**
Use the streaming path (the shipped `local` provider streams). A non-streaming
HTTP call that stays silent past the client's header timeout (~300s under Bun's
fetch) is dropped — a slow model can easily exceed that on a long completion.

**Thinking-mode bursts truncate and keep restarting their preamble.**
`burstTokens` is too small for a full chain-of-thought pass (`finish=length`).
Give the stream a much larger budget — see
[Thinking mode](configuration.md#thinking-mode-local-reasoning-models).

**Memory grows without limit on a small local model.**
Observed and real: weaker models can ignore the compressor's length instruction,
and a mind's `story` can bloat far past its budget over long runs. Prefer a
stronger `utilityModel` (compression is a utility job) even when the voice is
small, and watch `memory.md`'s size on multi-hour runs. Societies amplify this —
see [Societies → What we have learned](societies.md#what-we-have-learned-so-far).

## Agents

**The agent finished its task but the process won't exit.**
It's a [service](agents.md#service-mode--an-agent-that-takes-tasks): with a
membrane (`<m-ws>`/`<m-console>`) it idles awaiting the next task — the log says
`is idle — awaiting the next task`. Send another task over its port, or Ctrl-C to
sleep it. Remove the membrane for a headless one-shot.

**`spawn` never registers / no background jobs offered.**
Shell jobs are probe-gated: if no sandbox backend works on your machine, `spawn`
does not register (no phantom async). `spawn_agent` needs no sandbox — it only
needs a `role="subagent"` child declared.

**The agent edits the wrong project.**
File tools default to the agent's own workspace (`memory/<agent>/workspace`).
Point them at a real project with `root="…"` on each tool —
[Agents → Tools](agents.md#tools).

## Cost

**What does a run cost?**
Roughly $0.10–0.15/hour on OpenRouter at the default pace with the default
models. The [economy component](architecture/components.md#m-economy) reads the
*real* reported cost and slows the mind as its budget drains — a tired mind
thinks slower, an exhausted one almost sleeps, and the watchdog keeps it alive.
Dry runs are free; local models cost your electricity.

## Still stuck?

- `--debug` (all components) or `--debug=mMind.js,mMemory.js` shows attention
  frames, consolidations, and arbiter decisions — the ground truth of what the
  mind is doing.
- `MEDITATOR_DEBUG_PROMPTS=1` dumps every prompt sent to a model
  ([Configuration → Dumping prompts](configuration.md#dumping-every-prompt)).
- The journal (`memory/<mind>/journal/`) is the full, honest record of a run.
- Open an issue with the journal excerpt and your archml — failures are findings
  here.
