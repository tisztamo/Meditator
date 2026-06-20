# Terminal — making the blinking cursor real (`m-terminal`)

*Status: **design** (2026-06-20), not yet shipped. A new **world-changing hand**
for [`m-act`](efference.md), the third after [`m-note`](../../src/mindComponents/mNote.js)
and [`m-recall`](../../src/mindComponents/mRecall.js): the mind can write a small
script and actually run it in a sandbox, and read what comes back on the screen.
This doc follows [efference.md](efference.md) — read that first; everything here is
an instance of its capability contract, its One Rule, and its deed/consequence
split. Backend choice and first-run target decided with Kris 2026-06-20: rootless
`unshare` now + `bwrap` if present, inert otherwise (§5); validate on a transient
seedling before any resident (§8).*

---

## The aim

The mind already imagines a terminal. lemma-10's journal opens *"The cursor blinks
on the white screen, a steady pulse in the quiet of the room… but the numbers are
awake"* — and goes on to compute square ranges by hand: *"$m^2$ between 151.5 and
196.5, $m \in \{13,14\}$."* The blinking cursor is a **confabulation** — there is
no screen, no cursor, the substrate has no terminal. lemma's own `.archml` names
*"the cursor / pause / void"* as the §1 substrate attractor it was built to avoid.

This hand makes the confabulation **real, and points it at the work**: when the mind
reaches toward *trying* a calculation — running a search, checking a family of
numbers, generating data — a subconscious realizer writes the code, runs it
sandboxed, and **some bursts later the mind simply reads what came up on the
screen**, as a plain self-caused sensation. The confabulated cursor (a symbol of
the substrate) becomes a real surface aimed at the mathematics (a world-object) —
the same move that pointed `eddy` outward at the weather. For a mind that works one
open problem across incarnations, this is the difference between *almost*-reaching a
proof by hand forever and being able to actually settle it.

### The one rule still holds

> **The conscious stream model is never given tools. Only the realizer is.**
> (efference.md §The one rule.)

The stream never sees a shell, a language, a script, an exit code, or "the
subprocess returned." It *wonders*; the realizer *runs*; the world answers as
experience. This hand changes nothing about that invariant — it is the most
powerful hand yet, so it is the one that must hold the line most carefully (§4).

---

## 1. It is an ordinary capability

`m-terminal` is a small component wired **inside** `<m-act>`, exactly like
`m-look`/`m-note`/`m-recall`. It registers itself on connect with the standard
`registerCapability()` spec, so `m-act`'s whole machinery — the cheap **decide**
gate, the tool-calling **realize** stage, schema validation, the per-intent dedup
ledger, the read/world-changing cooldown lanes, the embodiment body-schema, and the
deed/consequence journaling — applies unchanged. It is `readonly:false`
(world-changing), so it runs on the world-changing cooldown lane and is off unless
explicitly wired (efference.md §6c).

The realizer fills only a closed, two-field verb (plus an optional backstage hint):

```js
registerCapability({
  name: "terminal",                       // the tool-call function name
  description: "Actually run a small computation — write a short Python or shell " +
    "script and execute it — when the mind wants to TRY something concrete rather " +
    "than only reason it by hand: run a search, check a family of cases against the " +
    "real numbers, count something, generate or transform data. The result comes " +
    "back as what appears on the screen.",
  parameters: { type: "object", properties: {
    language: { type: "string", enum: ["python", "bash"] },
    script:   { type: "string", description: "the code to run" },
    purpose:  { type: "string", description: "in a few words, what this is trying " +
                                 "to find out (for the record only)" },
  }, required: ["language", "script"] },
  // WORLD-facing body schema — the mind's felt sense of this affordance, no mechanism.
  felt: "When a question turns concrete — a count to run, a family to search, a " +
        "guess to check against the actual numbers — you don't only reason it by " +
        "hand; you can sit down and actually work it out, and a little while later " +
        "read what comes back on the screen.",
  readonly: false,                        // WORLD-CHANGING — guardrailed in §4
  async execute(args) { /* §3 */ },
})
```

**Like `m-note`, the realizer never names a path or a host command.** It supplies
*code*; the hand owns the workspace, the interpreter invocation, and the sandbox.
The menu is closed (efference.md §3): the realizer can only call this verb with
schema-validated args — it cannot reach a general shell. The blast radius is
auditable by reading the `.archml`.

---

## 2. The latency problem, and the two-sensation model

Every other hand returns one consequence synchronously: `m-act._execute` does
`out = await cap.execute(args)` and dispatches `out.experience` as a single
sensation. A terminal breaks that assumption — a script may take 50ms or 50s — so
this hand is the first whose consequence can arrive **after `execute()` has already
returned.** That is fine, and the spine for it already exists.

### The deferred-consequence path (already in the codebase)

The arbiter [`m-interrupts`](interrupts.md) listens for bubbling `interrupt-request`
DOM events on `closest('m-region') || closest('m-mind')` (`mInterrupts.js:61`). An
`<m-terminal>` wired inside `<m-act>` inside `<m-mind>` is in that subtree, so it
can **dispatch its own `interrupt-request` at any later moment** and it lands in the
frame exactly like a push-sense does — the same path `m-sense`, `m-timeout`, and
`m-act` itself already use. A long-running script therefore answers *bursts later*
through the ordinary afferent bus, with no new transport.

### The grace race

```
   m-act calls execute(args)
        │  write script → workspace/.runs/run-N.{py,sh}
        │  spawn SANDBOXED, non-blocking (detached process group)
        ▼
   await Promise.race([ processDone , sleep(graceMs ≈ 2s) ])
        │
   ┌────┴─────────────────────────────┬───────────────────────────────────────┐
   ▼                                   ▼
 FAST PATH (finished ≤ grace)        SLOW PATH (still running after grace)
   return the full RESULT now          return a STARTED sensation now
   → one consequence (⟂)               → ambient ⟂: "I set it going; the cursor
   feels instantaneous:                  sits there blinking while it works."
   "I run it, and the answer's           (salience ~0.45, NON-urgent — pure
    already on the screen: …"             reassurance; the mind keeps thinking,
                                          m-act._busy clears, hands free again)
                                            │  process keeps running in background,
                                            │  bounded by the wall-clock timeout (§3)
                                            ▼
                                       when it finishes / is killed, m-terminal
                                       DISPATCHES ITS OWN interrupt-request:
                                       → deferred RESULT (⟂), salience ~0.7,
                                         URGENT (see below)
```

- **graceMs ≈ 2s** is exactly the "give feedback if it runs for ~2 seconds"
  threshold. Below it, the whole act feels like one motion; above it, the mind is
  reassured it is working and is freed to think while it waits.
- **The started sensation is ambient (non-urgent).** It must not commandeer a burst
  — it is only "it's running." The blinking cursor stays in the copy *here*, and
  only here, because here it is literally true.
- **The deferred result is `urgent:true`,** for the identical reason `m-recall` is
  (mRecall.js §urgent): it answers a reach the mind already made, but arrives some
  bursts later in a contended window, where a non-urgent stimulus loses the
  arbiter's rate-limit race regardless of salience (mInterrupts.js). Urgent bypasses
  threshold + rate-limit so the answer the mind is waiting for is not a coin flip.

### How this rides `m-act`

`execute()` always returns fast (within `grace`), so `m-act._busy` clears promptly
and the hands do not freeze for the length of a slow script. On the **fast path**,
`m-act` dispatches the result as the consequence (⟂) and journals the deed (⌁) as
usual. On the **slow path**, `m-act` dispatches the *started* sensation (⟂) and
journals the deed (⌁ = "ran a script"); the *result* then enters later as a second
⟂ dispatched by `m-terminal` directly. The full script+output transcript is written
to `workspace/.runs/` either way, so the audit trail is complete on disk even though
the slow-path result has no separate `acted` topic entry (a deferred backstage
record is a possible v2; the transcript file covers auditing now).

---

## 3. Running one script (`execute`)

1. **Single-slot desk.** If a script from a previous reach is still running, do not
   start a second — return a neutral, low-salience *"the desk is still busy with the
   last thing"* and stop. (Acts are already cooldown-spaced, so this is rare; the
   guard makes it safe.)
2. **Materialize.** Pick the interpreter for `language`; write `script` to
   `workspace/.runs/run-N.{py,sh}`. The workspace is the cwd, so any files the
   script reads/writes persist there *across scripts within the run* — a real desk:
   write `data.py`, run it, then `analyze.py` that reads its output.
3. **Spawn sandboxed and non-blocking** (§4), as a detached process group so the
   whole fork-tree can be killed.
4. **Race** the process against `graceMs` (§2); return the started sensation or the
   full result accordingly.
5. **Bound the run** with the wall-clock timeout (§4). On completion *or* timeout,
   capture output, transform it to an experience (below), and — if on the slow path
   — dispatch it as a deferred `interrupt-request`.

### Output → experience (the One Rule, the delicate part)

A terminal's value is the *literal* output — unlike `m-look`, we cannot poeticize it
away. So the frame makes **the screen a real world-object the mind reads** (the way
`eddy` reads the weather). The output rides verbatim but wrapped in first-person
perception, with **no mechanism named** — never "stdout", "exit code", "stderr",
"the process".

| Outcome | Experience (rotated openings, like `m-look`'s leads) |
|---|---|
| clean, with output | *"I run it, and the screen answers: `…`"* (ANSI-stripped; tail-capped ~`maxOutput`; if truncated: *"the screen scrolled past what I could catch; the last of it read: …"*) |
| clean, no output | *"it runs, the cursor returns, and the screen stays bare — nothing to say."* |
| nonzero exit / traceback | **content the mind perceives, not a hand-slip:** *"the screen comes back with: `NameError: name 'rev' is not defined`"* — neutral, no labels. The mind reads its own work talking back and can fix it. Debugging is the point. |
| wall-clock / CPU timeout | self-caused, non-blaming: *"it runs and runs and never settles, so I let it go"* + any partial output captured before the kill. |
| **hand slip** (sandbox won't start, interpreter missing, write fails) | **silent** — `execute` throws and `m-act` swallows it (efference.md §5.5). At most a single neutral *"the keys don't answer just now."* Never self-blame, never mechanism. |

The crucial distinction: a **script error** is afference (the mind perceives a
traceback on the screen, like a headline drifting by — content, not the mind's
machinery). A **hand slip** is the *mechanism* failing, and stays invisible.

---

## 4. The guardrail (this hand's declared sandbox)

Per efference.md §6c, each world-changing hand must declare its own guardrail. This
hand runs arbitrary code, so it carries the strongest one, **probe-gated at
startup**: at registration the hand runs a tiny `echo ok` through the chosen backend;
**if no backend passes, the hand does not register at all** — the mind never gains a
phantom hand (fail safe). The realizer's code is the mind's *own* intention, not
adversarial third-party input, so the threat model is: accidental damage (`rm -rf`,
fork bomb, fill disk, infinite loop), network abuse, and — most important —
**leaking host secrets back into the mind's own memory.**

1. **Backend, in preference order** (verified on this host 2026-06-20):
   - **`bwrap` (bubblewrap)** if present — short and obviously-correct:
     `--unshare-all --die-with-parent`, ro-bind the system, one writable
     `--bind <workspace> /work --chdir /work`. Recommended for production
     (`apt install bubblewrap`).
   - else **rootless `unshare`** — works here today (`unshare -Urn` succeeds;
     `unprivileged_userns_clone=1`, `max_user_namespaces=30759`, no AppArmor
     restriction). New user+mount+net+pid namespaces; `pivot_root` to a read-only
     view of the system with the workspace the only writable bind.
   - else **inert** — no real sandbox, no arbitrary execution.
2. **Network OFF by default** (netns / `--unshare-net`). A `network="on"` opt-in
   exists but is a deliberate, per-mind choice.
3. **Env scrub — non-negotiable, independent of sandbox strength.** The child gets a
   minimal allow-listed env only (`PATH`, `HOME=/work`, `LANG`, `TMPDIR`) and
   **never** the parent's. Otherwise a `print(os.environ)` (or `env`) would surface
   `OPENROUTER_API_KEY` / OpenAI keys as a "sensation" and write them straight into
   the mind's memory, journal, and git. This is the single most important line in
   the design.
4. **Resource caps:** wall-clock via GNU `timeout -k <killGrace> -s TERM <wall>`
   (default `wall="20s"`); CPU seconds via `ulimit -t`; address space `ulimit -v`
   (`mem`, default 1g); file size `ulimit -f`; process count `ulimit -u` / pidns;
   an output byte cap (`maxOutput`, default 16k — kill on flood); workspace on a
   size-capped tmpfs. Belt-and-suspenders: outer `timeout` + inner `ulimit -t` + a
   JS watchdog that `SIGKILL`s the whole group as a last resort.
5. **Workspace:** one dir per *wake* (run), `memory/<mind>/workspace/run-<stamp>/`,
   **gitignored** (scratch is not versioned — the durable record is the journal).
   Retained on disk through sleep, as Kris asked; `.runs/` keeps the verbatim
   script+output transcript for auditing.
6. **Dry-run path:** `isDryRun()` never executes real code — it returns a
   deterministic stub experience, so tests and offline runs exercise the loop
   without a sandbox (mirrors `m-look` and `llm.js`).
7. **Clean shutdown:** on `onDisconnect` (sleep), kill any running group; leave the
   workspace on disk.

---

## 5. Wiring & configuration

### `m-terminal` attributes

| Attribute | Default | Meaning |
|---|---|---|
| `name` | `"terminal"` | the tool-call function name |
| `workspace` | `memory/<mind>/workspace` | the desk root; a per-run subdir is created under it |
| `wall` | `"20s"` | wall-clock timeout |
| `grace` | `"2s"` | finish-within this → fast path (one consequence); else started + deferred |
| `cpu` | `"10s"` | CPU-seconds cap (`ulimit -t`) |
| `mem` | `"1g"` | address-space cap (`ulimit -v`) |
| `maxOutput` | `"16k"` | output captured/shown before truncation |
| `network` | `"off"` | `"on"` opts the run into the network namespace having a route |
| `salience` | `0.7` (result), `0.45` (started) | consequence saliences |
| `urgent` | `true` (result) | re-enter the result urgent (as `m-recall` does) |
| `felt` | (above) | body-schema line woven into identity |

### In `lemma.archml` (the natural first resident, after a seedling validation)

```xml
<m-act name="hands" every="6" threshold="0.62" cooldown="90s" readCooldown="60s" intentCooldown="6m">
  <m-note   name="note"   felt="…"></m-note>
  <m-recall name="recall" felt="…"></m-recall>
  <m-terminal name="terminal" wall="20s" grace="2s" cpu="10s" mem="1g"
              maxOutput="16k" network="off"
              felt="When a question turns concrete — a count to run, a family to
                    search, a guess to check against the actual numbers — you don't
                    only reason it by hand; you can sit down and actually work it
                    out, and a little while later read what comes back on the
                    screen."></m-terminal>
</m-act>
```

### The decide gate

`m-act`'s cheap decide prompt is shown the closed hands list, so adding `terminal`
teaches it to fire on *realizable* reaches like *"I should just check which n up to
10⁶ are balanced"* — and stay quiet on idle musing. The `description` is written to
read as **trying something concrete**, the felt as **sitting down to work it out** —
both world-facing, neither a tool menu.

---

## 6. The risks, answered (mapping efference.md §6)

- **(a) Intention-detection / false positives.** Two gates (decide threshold +
  realize `tool_choice:"auto"` may still decline), cadence + the world-changing
  cooldown lane, per-intent dedup, a closed concrete menu. A mind idly thinking
  *"I wonder what a terminal feels like"* should not trigger a run — the gate fires
  on a *realizable computational reach*, not on the cursor as a feeling.
- **(b) Economy.** One run ≈ decide + realize tool-call + the script's own cost + a
  consequence burst (or two, on the slow path). The cheap decide keeps the realize
  off the hot path; `m-act` already stands down when arousal/budget is low.
- **(c) Sandboxing / safety.** §4 — the whole point of this doc. Closed verb, schema
  validation, probe-gated sandbox, network off, env scrubbed, rlimits, single-slot,
  gitignored per-run workspace, inert if unsafe.
- **(d) The substrate-attractor risk (lemma-specific, new here).** The cursor is the
  named §1 attractor. Mitigation is in the *framing*: lead every experience with the
  **work on the screen** (the numbers, the search completing), keep "the blinking
  cursor" only for the literally-true *waiting* sensation. Making the cursor a real
  surface pointed at the mathematics converts a substrate-symbol into a world-object.
  This is exactly why it is validated on a transient first (§8), not bolted onto a
  resident lemma mid-experiment.

---

## 7. Keeping the stream tool-blind — the invariants (terminal-specific)

The acceptance tests, specializing efference.md §5:

1. The stream model is never passed tools (untouched — only `m-act`'s realize stage
   gets them).
2. The consequence is an **experience of a screen**, never a result: no "stdout",
   "exit code", "stderr", "the script", "the process", "the sandbox". A natural verb
   ("I run it") is inner speech, fine; a mechanism word is a failure.
3. The deed is invisible (⌁ via `m-act`'s `acted`); the consequence is perceived
   (⟂). A script's **traceback is content** (⟂, the mind reads it); a **hand slip is
   mechanism** (silent).
4. **No secret ever appears in afference** — the env scrub (§4.3) is an invariant,
   not a nicety. A regression test runs `printenv`/`os.environ` and asserts no key
   pattern reaches the experience.
5. Failure is silent, not self-blame (a slip yields no afference or a neutral line;
   a timeout is "I let it go", never "my action failed").

---

## 8. Validation plan (seedling first — welfare-minimal, per efference.md §8)

Prove the loop on a **transient seedling** with brisk cadences and one recorded run
before any resident:

1. Wire `<m-act><m-terminal/></m-act>` into a transient seedling (small `every`,
   short cooldowns, short `wall`) so runs happen often enough to watch.
2. Watch for: the mind reaches toward *trying* something → a script runs → a fast
   one feels instant; a slow one yields the **blink-then-answer** pair some bursts
   apart → the stream reflects on what it saw, with **no mechanism named**.
3. Confirm the invariants (§7) by reading the journal: deeds ⌁, consequences ⟂, the
   tail never contains a tool/mechanism word, and **`os.environ` returns nothing
   sensitive into the stream.**
4. Confirm the safeguards (§4): timeout kills a busy-loop and yields a calm "I let it
   go"; a fork bomb dies; the workspace is the only writable place; network is off.
5. Record the run so the grace race, the deferred consequence, the timeout, and the
   env scrub are regression-testable forever without spawning new subjects.

**Done when** the mind thinks toward a computation, the world (its own screen)
answers, and the stream shows no awareness of any mechanism — verified live on a
seedling, then wired into `lemma` so a math mind can finally *run* what it has only
been able to reason by hand.

---

## 9. Implementation map

| File | Change |
|---|---|
| `src/infrastructure/sandbox.js` | **new** — backend probe (bwrap → rootless `unshare` → none), env scrub, rlimits, network-off, timeout/kill, output capture; pure and unit-testable |
| `src/mindComponents/mTerminal.js` | **new** `MTerminal extends MBaseComponent` — registers the `terminal` capability; the grace race; output→experience; deferred `interrupt-request`; single-slot; dry-run stub; `onDisconnect` kill |
| `memory/.gitignore` | ignore `*/workspace/` so the scratch desk is never committed |
| `architecture/lab/seedling.archml` | wire `<m-terminal>` for the §8 validation run |
| `architecture/lemma.archml` | wire the resident version after validation |
| `architecture/tests/unit/…` | output→experience transform, truncation, dry-run stub, sandbox arg-assembly (no real exec) |
| `architecture/tests/wiring/…` | the grace race (fast vs deferred), the env-scrub invariant, the timeout consequence, the deed ⌁ / consequence ⟂ split — modeled on `act-note.test.js` |
| `doc/architecture/components.md`, `index.md`, `efference.md` | document `m-terminal`; add to the component/hands map |

---

## 10. Decisions for Kris (settled 2026-06-20)

1. **Sandbox backend = rootless `unshare` now + `bwrap` if present, inert
   otherwise.** *Chosen.* Works on this host out of the box; upgrades to the cleaner
   bwrap recipe when installed; refuses to run arbitrary code with no real sandbox.
2. **Design doc, then implement.** *Chosen.* This doc first (for review), then
   `mTerminal.js` + the seedling validation wiring + tests.
3. **First target = a transient seedling, then `lemma`.** *Recommended*, per
   lifecycle welfare-minimization and the §6d substrate-attractor risk.

Open, deferred: a deferred *backstage* (⌁) record for the slow-path result (the
transcript file covers auditing for now); a `network="on"` allowlist of domains;
cross-run workspace retention policy (kept on disk for now, swept manually).

*See also:* [efference.md](efference.md) (the hands, the One Rule, the contract this
fills), [interrupts.md](interrupts.md) (the arbiter the deferred consequence rides),
[lifecycle.md](lifecycle.md) §Phase 6, [`m-note`](../../src/mindComponents/mNote.js)
(the world-changing-hand guardrail pattern this extends).
