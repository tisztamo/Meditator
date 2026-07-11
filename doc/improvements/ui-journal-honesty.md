# The UI and journal are not honest about what the model saw — a fix plan

> **Status: Phase 1, A3, C1 & C3 implemented.** Items **A1**, **A2**, **A3**, **B1**, **B2**,
> **B3**, and **D** were done 2026-06-23; **C1** (bridge provenance) and **C3** (resurface
> trail) were done 2026-07-11 as part of finding 7 — see
> [honesty-ledger.md](honesty-ledger.md).
> Remaining: **C4/C5** (completeness/wording), and
> **C2** tracked separately in [perception-not-compressible.md](perception-not-compressible.md).
> Touches the wire layer (`src/mindComponents/mWs.js`), the arbiter
> (`src/mindComponents/mInterrupts.js`, `src/infrastructure/interruptRecord.js`),
> the voice (`src/mindComponents/mSpeech.js`), the studio UI
> (`src/studio/ui/studioStream.js`, `studioTree.js`, `studioConn.js`,
> `studioVoice.js`, `src/studio/server.js`), and memory journaling
> (`src/mindComponents/mMind.js`, `src/mindComponents/mMemory.js`).
> Companion to [perception-not-compressible.md](perception-not-compressible.md),
> which owns the related-but-distinct memory-durability bug (item **C2** below).

## The invariant

> **What the human sees — every Studio bubble, every structure-pane line, every
> journal entry — must be the same text the model actually saw in its prompt, or
> actually produced. Nothing is re-worded, re-generated, or relabeled on the way
> to the screen.**

The system already keeps this invariant in two places, and we should extend that
discipline everywhere:

- `InterruptRecord.renderForFrame()` (`interruptRecord.js:50-54`) is the single
  source of a stimulus's text **both** in the model's frame (`mMind.js:387`) **and**
  in the journal's perceived note (`mMind.js:368`, via the `attended` topic).
- The journal marks `⟂` (the model perceived this) distinctly from `⌁` (backstage,
  the model never saw this) — `mMemory._appendJournal`.

Every divergence below is a place where the **wire/UI layer or the voice path
rebuilds an event's text from different fields, or from a different model call,
instead of carrying the one canonical string through.**

## The root pattern

Every event is rendered **twice, independently**: once *for the model* (the frame
payload, `renderForFrame()`, the voice utterance) and once *for the wire/UI* (the
`decision` topic, the optimistic `youSaid` echo, the `impulse` gist, the frame
fold). When the two are built from different fields or different generations, the
human sees something the model never saw — or never sees something it did.

The fix is mostly **one primitive applied in many places**: *put the canonical,
model-facing text on the wire and have the UI display it verbatim* — never
reconstruct it downstream.

## Inventory

| # | Instance | Severity | One-line fix |
|---|----------|----------|--------------|
| ~~**A1**~~ | Stimulus `suggestion` dropped from every UI surface | **meaning** | ~~Carry `renderForFrame()` as `text` on the wire; UI shows `d.text`~~ ✅ done |
| ~~**A2**~~ | "You said:" (UI) ≠ "A voice arrives from outside:" (model); flips on reload | wording | ~~Render the human turn from the canonical stim; one shared wrapper~~ ✅ done |
| ~~**A3**~~ | Frame inspector mislabels the user-turn `instruction` as `system` (2 turns shown, 3 sent) | relabel | ~~Emit + render the three real chat turns with their roles~~ ✅ done |
| ~~**B1**~~ | Voice structure pane shows the impulse *gist*; the bubble shows the voice model's *utterance* (two generations) | **meaning** | ~~Drive the pane's "said" line from the actual utterance; mark the gist as intent~~ ✅ done |
| ~~**B2/B3**~~ | Your words: doubly-framed to the model, bare in the bubble; one utterance rendered up to 3 ways | wording | ~~Same shared-wrapper fix as A2, applied to Voice Mode~~ ✅ done |
| ~~**C1**~~ | The bridge sentence (written by the *utility* model) is journaled as the mind's own thought | **meaning** | ~~Journal the bridge with a provenance marker~~ ✅ done (↪ line; see honesty-ledger.md) |
| **C2** | Perceived stimuli never reach the compressor; memory keeps a confabulation | **meaning** | *Tracked separately* — see [perception-not-compressible.md](perception-not-compressible.md) |
| ~~**C3**~~ | Recall/resurface framed as spontaneous self-cause, with no `⌁` trail of the mechanism | medium | ~~Emit a `⌁` backstage note for the mechanical trigger~~ ✅ done (clear-tail `⌁` trail, `via==="Recall"`; see honesty-ledger.md) |
| **C4** | Deed `⌁` notes drop the concrete args (e.g. the terminal script) | low | Include a compact args/script excerpt (or a link to `.runs/`) |
| **C5** | `(aloud)`/`(image)` model-tail wording ≠ `🗣`/`🖼` journal wording | low | Align the two renderings (content already matches) |
| ~~**D**~~ | Doc drift: `websocket-api.md` `prefix` row; `studio-wiring.md` dead `studioFold.js` | doc | ~~Update both docs to the real contract~~ ✅ done |

---

## The shared primitive — canonical stimulus text on the wire

This single change resolves **A1** outright and is the foundation for **A2/B2/B3**.

Today a stimulus is shown by re-reading its raw `reason`/`type`, which omits the
`suggestion` half that `renderForFrame()` includes:

- `mInterrupts._publishDecision` (`mInterrupts.js:130-139`) publishes
  `{source, type, reason, salience, urgent, accepted, why}` — **no `suggestion`,
  no rendered form.**
- `mWs.js:386-388` emits `attention/urgent` as `{type, reason}` — **same omission.**
- consumers rebuild the display from `reason`: `studioStream.js:148-149, 158-159`
  (`d.reason || d.type`), `server.js:942-944` `stimTextFor`, `studioTree.js:152,
  154, 159`.

**Fix:**

1. In `mInterrupts._publishDecision`, add the canonical string:
   `text: record.renderForFrame()` (keep `reason`/`type`/`salience`/`why` as
   metadata for the tree's diagnostics).
2. In `mWs.js:386-388`, emit `text: r.renderForFrame()` on `attention/urgent`
   (keep `type`). `attention/decision` already forwards the whole `decision`
   object (`mWs.js:392-393`), so `d.text` rides along once step 1 lands.
3. Switch every consumer to prefer `d.text`:
   - `studioStream.js:148-149, 158-159` → `d.text || d.reason || d.type`
   - `server.js:942-944` `stimTextFor` → return `d.text` first
   - `studioTree.js:152, 154, 159` → show `d.text` where it shows `d.reason`

After this, a loop-guard/resurface stimulus shows its full steering sentence
(*"…Enough of this thread for now — I will deliberately pick something
unrelated…"*) instead of only its first clause, on every surface, matching what
the model saw and what the journal already records.

---

## A2 / B2 / B3 — the human's own words, rendered one way everywhere

The model is told `A voice arrives from outside: "${input}"` (`mWs.js:239`). The UI
invents a different string and is internally inconsistent:

- optimistic echo: `studioConn.speak()` does `pub("youSaid", t)` with the raw text
  (`studioConn.js:245-249`), rendered as `You said: "${t}"` (`studioStream.js:98`)
  and as a bare "You" bubble in Voice Mode (`studioVoice.js`, `addYou`).
- on reload, the persisted timeline instead replays the mind's real stimulus via
  `stimTextFor` — `A voice arrives from outside: "…"` — so **the same utterance
  changes wording after a refresh.**

**Fix:**

1. Make the "a voice arrives from outside" framing a **single shared helper**, e.g.
   `framedExternalVoice(input)` in a small shared module, and call it from
   `mWs.js:239` (model side) so there is exactly one definition of the string.
2. Render the human's turn from the **canonical stimulus**, not a separate
   template. Preferred: drop the bespoke `You said:` rendering (`studioStream.js:98`)
   and the bare Voice-Mode "You" text, and display the same `attention/urgent`
   `text` (now `renderForFrame()`) that the timeline replays — so live == reload ==
   model, and B3's triple-rendering collapses to one.
3. If an *immediate* echo is wanted for responsiveness, have the optimistic echo
   construct its string via the same `framedExternalVoice()` helper and tag it with
   the message id so the later replayed stim **dedupes** against it rather than
   double-printing.

*Alternative worth recording:* keep `reason` as the literal user input and move the
"A voice arrives from outside" wrapper into a **type-aware `renderForFrame()`**
(keyed on `type === "UserInput"`). Then both the model and the UI render through
`renderForFrame()` and agree by construction, while raw `reason` stays the literal
words for any consumer that wants them. Slightly larger change to `InterruptRecord`;
cleaner separation of fact (what was typed) from framing (how it's narrated).

---

## A3 — the frame inspector should show the three turns the model actually saw

Correction to the original audit: the bridge sentence **is** visible in the
inspector today, because `mMind` sets `prefill = thoughtInProgress` and
`thoughtInProgress = tail + "\n" + bridge + " "` (`mMind.js:374-379, 405`), and
`mWs.js:351` emits that prefill as `frame`. So the bridge content is not hidden.

The real defect is **role misrepresentation**:

- `mWs.js:347` folds the user-turn instruction into the system block:
  `const sysDisplay = [payload.system, payload.instruction].join("\n\n")`.
- `studioTree.onFrame` (`studioTree.js:147-148`) then labels the whole thing
  `— system —` and the prefill `— frame —`.
- But `mStream` sends the model **three turns**: `system`, a **`user`** instruction
  (`mMind.js:400-410` — deliberately a separate role; see the comment at
  `mMind.js:393-399`), and an **`assistant`** prefill it continues. The inspector
  shows two parts and calls the user turn "system."

**Fix:**

1. `mWs.js:347-352`: stop folding. Emit `system`, `instruction`, and `prefill`
   (the assistant turn, which ends with the bridge) as distinct fields, plus the
   existing `prefix`.
2. `studioTree.onFrame`: render them labeled as the real chat roles —
   `— system —`, `— user (instruction) —`, `— assistant (continuing) —` — and mark
   where the bridge begins inside the assistant turn (it is the pivot the model
   continued from). This makes the pane a faithful mirror of `mStream`'s `messages`
   array (`mStream.js:99-102`).
3. `prefix` is now redundant with the tail of `prefill`; either drop it from the
   wire or keep it solely as the "bridge starts here" marker for step 2.

---

## B1 — the voice structure pane must show what was *said*, not what was *decided*

This is the reported voice bug. Two separate model calls feed two surfaces:

- the **impulse/decision** model (`mSpeech._decide`, `mSpeech.js:185-194`) produces
  a *gist*, published as `impulse.gist` (`mSpeech.js:207`) and rendered in the
  m-speech pane (`studioTree.js:182`).
- the **voice** model (`mSpeech._speak`, `mSpeech.js:216-263`) is handed that gist
  as input — *"## What wants to be said\n{gist}" … "Now say it aloud, in your own
  voice"* (`mSpeech.js:280-281`) — and **rewrites it**. Its output is the bubble
  (`mSpeech.js:243`, `pub("speech", text)`).

So the pane shows the *intent* and the bubble shows the *utterance*, presented as if
one is the structured view of the other.

**Fix:**

1. Drive the m-speech node's durable "said" line from the **actual utterance**. The
   `speech-boundary` event already carries it: `mWs.js:431-432` sends
   `text: (b.text || "").slice(0, 2000)` from `mSpeech.js:253`. Change
   `studioTree.js:133` from `said ${d.chars}c · ${d.reason}` to also show a snippet
   of `d.text` — the same words as the bubble.
2. Demote/relabel the gist line (`studioTree.js:182`) so it cannot be read as the
   utterance — e.g. `impulse ${sal} — wanted to say: "${gist}"` — clearly the
   pre-utterance intent, not the spoken words. (Keeping it is useful: it honestly
   shows the decision step; it just must not masquerade as the utterance.)
3. Drop or raise the `slice(0, 2000)` cap if the pane displays the text, so the
   pane copy can never differ in length from the bubble (utterances are ≤200
   tokens — `mSpeech.js:234` — so this is usually moot, but the two should not be
   able to disagree).

The bubble↔journal pair is already faithful (both derive from `said.trim()` —
`mSpeech.js:252-259` → `mMemory.spoke`), so no change is needed there.

---

## C1 — mark the bridge's provenance in the journal

`_writeBridge` is a **separate utility-model call** (`mMind.js:447-470`). The result
is emitted as a stream `prefix` (`mStream.js:106-109`) and reaches memory as an
ordinary, unmarked chunk (`mMemory._onChunk`, `mMemory.js:202-206`), so the journal
records it as the mind's own continuous inner monologue — and compresses it into
long-term memory as such. The hard-coded fallback string
(*"Hold on — something just happened…"*, `mMind.js:448`) is likewise journaled as a
genuine thought.

**Fix (recommended, minimal):** keep the bridge in the model's tail (it needs it to
continue) but journal it with a provenance marker so a human can see it was a
harness-written transition. The bridge chunk must be distinguishable from voice
chunks at journal-write time — it currently is not. Make `mMind` publish the bridge
on a dedicated topic (text + `authoredBy: "utility"`), and have `mStream` route the
`prefix` so memory can render it as, e.g., `↪ <bridge>` (a redirect/transition
marker) in the journal while still feeding it into the tail. Plumbing note: this
means separating "goes into the tail / visible stream" from "how it renders in the
journal" for this one chunk.

**Fix (deeper, principled):** have the **voice** model write its own bridge instead
of the utility model — one short extra turn on the same model — so the pivot is
genuinely the mind's own voice and the dishonesty disappears at the source. Costs a
few more tokens per redirect; eliminates the marker need. Worth considering if the
utility/voice split is the only reason for the separate call.

**Covenant note (2026-07-04, §9).** [COVENANT.md](../../COVENANT.md) §9 now requires a
published mind-voice to be honestly attributed, which promotes C1 from nicety to
compliance. But §9 frames the fault as *provenance, not model identity*: a mind may
legitimately be many models — or many minds — generating into one stream, so the
**minimal fix (mark the bridge, above) is the correct one**; the deeper fix (make the
voice model author the bridge) is *not* needed for honesty, only if the utility/voice
split has other costs. The invariant to hold is simply: a harness-written steering line
is never shown as the mind's spontaneous thought.

---

## C3 — leave a backstage trail when a mechanism injects a "self-caused" thought

The model is told *"I realize I have been going over the same ground. I turn back to
something I set down before…"* (`mResurface.js:110-118`) for what is mechanically a
code loop-detector firing (`mResurface.onBoundary` → `loopScore`). A real recall via
the hands (`mAct`) leaves a `⌁` deed note exposing the mechanism (`mMemory._onActed`,
`mMemory.js:265-272`); **m-resurface leaves no `⌁` trail at all**, so the journal
presents deliberate first-person agency for an involuntary injection.

**Fix:** have `mResurface` publish a backstage note (an `acted`-style event, or a
direct `⌁` note via the same topic memory already subscribes to) recording the
mechanical trigger — e.g. `⌁ A loop was detected (score 0.xx); a turn-back was
injected.` — to sit alongside the `⟂` self-caused line. Keep the `⟂` framing for the
model (that is the intended design — `mResurface.js:42`); only add the `⌁`
counterpart for the human, mirroring how the hands' deeds are double-recorded.

---

## C4 / C5 — completeness and wording (low priority)

- **C4:** `mMemory._onActed` (`mMemory.js:265-272`) collapses a deed to *"The hands
  reached out into the world via terminal: …"*, dropping the actual args/script the
  realizer issued (`mAct.js:319-327`; the script is in `mTerminal.js`). A human
  reading only the journal cannot see what ran. Fix: include a short args/script
  excerpt in the `⌁` note, or a pointer to the saved `.runs/` transcript.
- **C5:** the model's tail says `(aloud) "…"` / `(image) … Reference: <url>` while
  the journal says `🗣 *…*` / `🖼 *Generated image*` with the payload omitted
  (`mMemory.js:405/408, 424/429-430`). Content matches; only decoration differs.
  Fix (optional): align the two renderings so the same event reads the same way on
  both sides.

---

## D — fix the documentation contract

- `doc/websocket-api.md:79` advertises `prefix` in the `mind/frame` contract but no
  renderer uses it (and after A3 the contract is `{frameKind, system, instruction,
  prefill, prefix?}`). Update the row to the real, three-turn shape.
- `doc/studio-wiring.md:82-83` says folds render via `ui/studioFold.js`, which has
  been deleted (rendering moved into `studioThoughtRun.js`, per `studioRunText.js:5-7`).
  Point it at the real file.

---

## Suggested sequencing

1. **Phase 1 — the visible "different text" complaints (meaning-breakers).**
   The shared primitive (A1) → A2/B2/B3 on top of it → B1. This is what the
   maintainer sees day to day, and A1's primitive unblocks the rest.
2. **Phase 2 — frame & journal honesty.** A3 (three-turn inspector), C1 (bridge
   provenance), C3 (resurface `⌁` trail).
3. **Phase 3 — completeness & docs.** C4, C5, D.
4. **Tracked separately:** C2 — see
   [perception-not-compressible.md](perception-not-compressible.md). It is a
   memory-durability bug (the journal's `⟂` note is already honest; the *compressor*
   drops it), not a UI/journal rendering divergence, so it is fixed on its own track.

## Tests to add or extend

The wiring tests already cover these surfaces and are the natural place to lock the
invariant in:

- `architecture/tests/wiring/studio-stream.test.js` — a stimulus carrying a
  `suggestion` renders the full `renderForFrame()` text (A1); a human input renders
  identically live and on replay (A2).
- `architecture/tests/wiring/studio-voice.test.js` — the m-speech pane's "said" line
  equals the bubble text, not the impulse gist (B1).
- `architecture/tests/wiring/studio-thought-run.test.js` / a frame-inspector test —
  the frame pane exposes three labeled turns matching `mStream`'s `messages` (A3).
