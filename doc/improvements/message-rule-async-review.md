# Architecture review: decoupling drift and the synchronous DOM

**Status: analysis + proposal, 2026-09-26. Rule adopted as
[message-rule.md](../architecture/message-rule.md); §6 harness + contract tests
built (step 1 of §7).** Written from a full read of
`src/mindComponents`, `src/startup`, `src/infrastructure`, `src/studio`, and of
Amanita 0.5.0's `a.js` / `ref.js` / `pubsubutils.js` / `workered.js`. It answers
two questions Kris asked: *where is the implementation not aligned with the
decoupling goal*, and *what breaks when the synchronous guarantees of the DOM are
gone* — with a proposed rule that would let the same wiring run at scale.

Companion notes: [decoupling.md](../architecture/decoupling.md) (the principle),
[enclosure-by-role.md](enclosure-by-role.md) (roles, `part()`, the three laws),
[substitution-invariance.md](substitution-invariance.md), the
features-as-additions stance (`stream-filter`, `backstage`, commit `2b252cd`).

---

## 1. Summary

The **ref layer is genuinely migrated**: no `..m-mind/…` default survives in
`src/` or in live `.archml`; every `*Src` default is `!scope/…` or `!cluster/…`;
the Studio panes honour the hub contract. That part of decoupling.md's "complete"
is true.

What is *not* true is that "nothing pulls a faculty's content by class/method."
The coupling moved: it now lives in **role ports and events that behave like
method calls**. Roughly 60 sites call methods on elements obtained from `part()`,
`enclosing()`, `closest()` or `querySelector()`; ~25 events carry functions,
DOM elements, or class instances in `detail`; six protocols are request/response
over a *synchronous* `dispatchEvent`, reading verdicts, mutated arrays, or
`defaultPrevented` after the call returns. Every one of those is invisible to
the archml, unoverridable, and dependent on the caller and callee sharing a
JavaScript heap and a call stack.

On the sync question the surprising fact is that **Amanita's `pub()` is already
asynchronous** (subscriber callbacks run on microtasks; only the retained value is
assigned synchronously). So the topic bus would survive a process boundary
almost as-is — Amanita's own worker mode proves it, and it is the yardstick used
below: the worker side has *only* `pub`/`sub`/`on`, payloads pass through
`JSON.stringify`, and there is no `fire`, no `closest`, no method call. Everything
in Meditator that would not run under that model is exactly the list of what
breaks.

The recommendation is one rule, not a local/remote split: **every cross-component
interaction is a message with a plain-data payload, and nothing is read back from
a message after it is sent.** An async API costs nothing locally (a request that
resolves on the next microtask), and the six sync protocols are precisely the
ones a distributed mind would want to move first (gates, governance, hands).
Section 5 gives the rule; section 6 gives a harness that measures the breakage
today instead of guessing; section 7 orders the work.

---

## 2. Decoupling: where implementation and goal diverge

Ranked by how directly each contradicts a stated principle, with the principle
it violates.

### 2.1 The transport instruments every faculty by tag — *features are additions*

`src/mindComponents/shared/mWs.js:421-546` and `:639-720` hand-wire telemetry for
stream, memory, interrupts, loop-detector, economy, kb, act, speech and image,
each found by `mind.querySelector("m-…")`, several read by method
(`memory.getTail()`, `economy.paceFactor`). A new faculty needs an edit to the
transport; a substitute `<my-memory name="memory">` goes silent in the Studio.
The Studio side repeats it (`studioPlenum.js` `nByTag`, `studioTree.js`
`nodeTag`).

*Aligned shape:* a `stats` (or `telemetry`) retained topic that any component may
publish, and one generic walk in `m-ws` — "for every element under the membrane
that publishes `stats`, forward it, keyed by `name` and `provides`". Then a
faculty opts into telemetry by publishing, the way it opts into journaling via
`backstage`.

### 2.2 Memory has a handler per producer — *features are additions*

`mMemory.js:177-237` subscribes to ~12 specific producers (spoken, filed, acted,
image, attended, percepts-attended, aperture-change, bridge, clear-tail, muffled)
and carries each one's journal prose (`"The scribe filed…"`, `"The hands reached
out…"`, the 🖼 formatting). The generic `backstage {text, kind, record}` channel
exists (`:469`) but the older producers were never moved onto it, so a
replacement memory must re-implement all twelve, and a new producer still
tempts a new handler.

*Aligned shape:* producers own their prose and emit `backstage`; memory keeps one
handler. `spoken`/`acted` keep their dedicated topics only if a *second* consumer
needs the structured form.

### 2.3 Process-global state breaks per-mind encapsulation — *the membrane*

`llm.js:66-79` keeps one usage accumulator; `mEconomy.js:41` reads it. In a
society every mind's metabolism is charged for everyone's spend. The same layer
holds a global concurrency semaphore (`:208`), global `decide()` backoff
(`decide.js:42`), and dry-run pattern-matching on each component's prompt text
(`llm.js:667-760` — the model layer knows every component by its prose).

*Aligned shape:* usage is returned per call and *attributed by the caller*
(`recordUsage(usage, {membrane: name})`), economy subscribes to a per-membrane
`usage` topic; dry-run stubs are selected by an explicit `debugTag`/kind argument,
never by prompt text.

### 2.4 The mind still pulls from stream and memory by tag — *decoupling.md*

`mMind.js:339-342` (`querySelector('m-stream'|'m-memory')`, reads `.on`,
`.loaded`), `:404-411` (`stream.burstIndex`, `memory.finalize`), `:587,617-623`
(`burstTokens` attribute, `stream.getRecentOutput()`), and `:210` — the absolute,
unoverridable `/voice/speaking` (in a society, every mind binds the first
`voice` in the document; not yet observed live, but it is what the ref resolves
to). `finalize`/`persists`/`takePending` are documented exceptions;
`getRecentOutput`, `burstIndex` and `burstTokens` are not.

### 2.5 Reach-ins into privates and non-ancestor dispatch

- `mOrient.js:72` calls `parentElement._updateCapability(...)`.
- `mFacts.js:154-165` duck-types `act._registerCapability`, dispatches a
  non-bubbling `capability` event directly on a non-ancestor, and polls 50×20ms
  for it — the exact "retry loop" decoupling.md names as the smell.
- `mAct.js:723` reads `membrane()._sleeping` although `MIND_SLEEPING_EVENT` exists.
- `mJobs.js:291-303` calls `sub.el.runAsJob()` and reads `sub.el.available` on
  child agents; `mJobs.js:131` attaches its listener on `closest("m-agent")`.

*Done 2026-10-06 for m-jobs, the last of these: the lead's m-jobs sends an
`agent-job {agent, task, jobId}` request (`shared/agentJobs.js`, membrane-local).
The sub-agent, bound on its lead, answers only its own name: at once with
`{accepted: false}` when busy, otherwise at the end with `{accepted: true,
answer, isError}`. It publishes its start and each step on its `jobProgress`
topic. Kill and the `agentWall` cap (default 1h) cancel the request, and the
sub-agent aborts its task when it hears the cancel. A start not heard within
`agentStartDeadline` (5s) counts as not ready. `runAsJob` is gone. Testing it
under chaos found a bug in m-agent's abort that was there before: a step still
awaiting its tool calls (or monitors) when the task was aborted resumed
afterwards and carried on the dead task, publishing a new turn. A task
generation counter now drops it. Progress lines carry a `seq` and the reply
repeats them all, so a line that arrives late or out of order is filled in from
the reply (M5). Under `jitter` the progress lines used to be lost: the worker
heard its own `step` event after the task had ended. The sub-agent job tests
now pass on 10 of 10 jitter seeds.*

### 2.6 Identity-root lookups are tag-bound — *enclosure phase 1 never ran*

`closest('m-mind'|'m-agent'|'m-society')` in ~15 components, plus
`memoryVault.js:49,74` (inherited by ~22 sites) and `mBaseComponent.js:100,111-117`
(Plenum space root and ring anchor). `membrane()` exists and is not used there.
A custom identity root gets no home, no prompt for speech/image, no console
sleep, no Plenum position.

### 2.7 Components call the mind: identity and lifecycle are pulled

`mSpeech.js:300`, `mImage.js:321` (`mind.getPrompt()`, `interlocutorName()`),
`mConsole.js:32,43`, `mWs.js:305`, `start.js:53` (`sleep()`). Identity is a
value; it should be a retained topic on the membrane (`identity`,
`interlocutor`), and sleep a request (see §5).

### 2.8 The agent subsystem follows its own idiom

`mAgent.js:168` auto-discovers `m-context[name]` by tag (the pattern
substitution-invariance.md says was removed), `:286` finds `m-reason` by tag,
`:844` defines its membrane as "has an `m-ws` or `m-console`", `:185` decides
hand-vs-job by the parent's `localName`; `mTerminal.js:78` switches mode the
same way; `mReason` must be a direct child (`../turn`). `mAgent` keeps its own
`_registerCapability` instead of sharing the `hands` role with `mAct`.

### 2.9 Feature accumulation in base and central classes

`MBaseComponent` overrides `sub()` and `fire()` for the Plenum (every component
pays for it; the space root is found by tag). `mAct` (1069 lines) holds decide,
realize, intent ledger, lanes, arousal gating, predictions, comparator pipeline,
owner bids, and recall grounding that reads `m-recall`/`m-note` attributes
(`:994`). `mMind` (789) holds loop-clear enactment, bridge, openers, image
holding, facts gating, the hands paragraph, pace, speaking-thinning, origin
seeding, receipts and stdout rendering. `mRegion` (894) holds aperture,
regulator, compare/judge, bids, orientation, source registry and search.

These are the places where "add a feature" still means "edit the base". The
seams that would have let them be additions are mostly *named* already
(role ports, `backstage`, `stream-filter`); they were not applied retroactively.

### 2.10 Parent-relative and absolute refs break wrap invariance

`mStream.js:124` (`"../prompt"`), `mSpeech.js:142-143` (`"../@interrupt*"`),
`mWs.js:431-480`, `mReason.js:49` (`"../turn"`), `mMind.js:210`
(`/voice/speaking`). Wrapping any of these in a region silently unwires it —
the opposite of the promise in enclosure-by-role.md. All should be `!scope/…`
(or `!scope/@…`) with a `*Src` override.

### 2.11 Component-to-component imports

`mAct` imports from `mSpeech`; `mSpeech` from `mMind`; `mContext` from `mMemory`
(`compressToFit`); `mLook` from `mWeather`/`mDaylight`/`mFeed`; `mMemory` from
`startup/architecture.js` and `config/componentResolver.js`. Shared *functions*
are fine; they belong in `shared/` or `infrastructure/`, not in another
component's module, and a component should not depend on the loader.

---

## 3. The sync question: what depends on the DOM being synchronous

Amanita's primitives, measured (0.5.0):

| Primitive | Delivery | Survives a process boundary? |
|---|---|---|
| `pub(topic, v)` | retained value set **sync**; subscribers run on **microtasks** | yes (worker mode forwards it) |
| `sub(ref, cb)` | resolves the ref by DOM walk (sync first try, retries with backoff), binds one microtask later; replay of the retained value is a microtask | yes, if the ref is an *address* |
| `fire(name, detail)` | **synchronous** `dispatchEvent`; listeners run inside the call; returns the event | no — the worker side has no `fire`; events are copied by `extractEventData` (fixed fields, `JSON.stringify`) |
| `part()/enclosing()/membrane()/closest()` | synchronous DOM walk returning **live elements** | only on the host that holds the tree; never in the worker |
| `attr()/env()` | synchronous attribute read | yes, if read at connect (config snapshot) |
| `el.topic` (retained value read) | synchronous property read | no — remote state is only what was delivered |
| Role-port method call (`x.evaluate()`) | synchronous or `await` on a live element | no |

So the bus is fine. What breaks is everything built on the last four rows.
Classified by the kind of break:

### 3.1 Request/response over a synchronous event (breaks outright)

The dispatcher reads something a listener wrote *during* `dispatchEvent`:

| Protocol | Site | What is read back |
|---|---|---|
| Sensory acquisition gate | `mRegion.js:208-228, 322-333, 597-639` | `detail.verdicts`, `detail.versions`, `detail.gainTrail`, `defaultPrevented`; `_everyGateAnswered` counts pushed verdicts |
| Agent governance | `mAgent.js:763-778, 475-479` | `deny()`/`hold()` closures in detail; `denied` and `holds[]` captured after `fire`; governors mutate `args` |
| Agent step round trip | `mAgent.js:415-433, 316-322`, `mRepeatGuard.js:67-70` | `step` → guard fires `halt`/`nudge` → agent reads `_halt`/`_nudges` in the same tick |
| Capability offer | `mBaseComponent.js:89`, `mAct.js:191`, `mOrient.js:65-66`, `mFacts.js:165` | registration assumed complete when `fire` returns |
| Self-interception of `interrupt-request` | `mAct.js:577, 696-702` | own sync listener `stopPropagation()`s and re-dispatches a bid before the arbiter can see it |
| Nested gating | `mInterrupts.js:196`, `mRegion.js:456`, `mBaseComponent.js:47-48`, `mOrient.js:30` (capture) | nearest-only semantics via `stopPropagation` ordering inside one dispatch |
| Sleep fan-out | `mMind.js:382` → `mRegion.js:526`, `mAct.js:617`, `mSearch.js:59` | compares assumed aborted before memory flushes |
| Frame ordering | `mMind.js:568, 634, 666, 731`, `mMemory.js:507-524, 909-918` | `clear-tail` reseeds memory synchronously before the frame is built; `attended` → `bridge` mark must land before the next `chunk` (a microtask pub) |
| Output filter chain | `mStream.js:210-332` | `begin/feed/flush/react` return `{emit, signal}` synchronously, per chunk |
| Studio commands | `studioConn.js:61`, `helpers.js:37` | hub `run()` executes inside the pane's `fire` |

Asynchronous delivery turns each of these into a silent no-op: the verdict array
is empty, the hold list is empty, the guard's halt arrives after the next turn
has been published, the arbiter sees the raw record *and* the bid, memory
reseeds after the frame was assembled.

### 3.2 Non-serializable payloads (break at any boundary)

- **Functions:** `execute` in every capability spec (14 hands), `deny`/`hold` in
  `proposal`, `sample` in `aperture-register`, `materialize` in
  `percept-candidate`, `kill` in `runAsJob`.
- **DOM elements:** `origin` in `percept-candidate`; `debugEl` threaded into
  `llm.js` and `decide.js` and read with `closest()` in `promptDebug.js`.
- **Class instances with identity/methods:** every `interrupt-request` is an
  `InterruptRecord`/`AttentionBid`; `AttentionBid.from` returns the *same*
  instance and the arbiter mutates it (`gainTrail`, `recomputeSalience()`,
  `decisions.push`) while the dispatcher and other listeners hold it; `mAct`
  checks `instanceof`; `mWs` calls `renderForFrame()`. Also `PerceptReceipt`,
  `Prediction`, `SearchTarget`, `SearchOutcome`, `EdgeEvidence`, `Evaluation`,
  `SourceContract` (checked by `instanceof` at `mRegion.js:601`).
- **Shared mutable state:** `AbortSignal` passed into `comparator.evaluate`;
  `revalidate`/`liveComparator` closures in `runEvidenceCase`.
- `MBaseComponent.fire` *mutates the caller's detail* (adds `infoton`).

### 3.3 Method calls on looked-up elements (break at any boundary)

The role ports — `regulator`, `aggregator`, `comparator`, `bidder`, `search`,
`stream-filter`, `requestOrientation`, `requestControl`, `contractFor`,
`registerSource`, `takePending`, `finalize`, `getRecentOutput`, `getTail`,
`runAsJob`, `sleep`, `getPrompt`, `interlocutorName` — are all "resolve a live
element, call it". The full list is in §2 and in the audit; about 60 sites.
`customElements.upgrade()`/`whenDefined` waits (`mRegion.js:420-425`,
`mInterrupts.js:150-172`, `mAct.js:787`) exist only to make those calls safe.

### 3.4 Retained-value reads and ordering assumptions (break subtly)

- `contactPressure` is read as a property, not from the delivered value
  (`mRegion.js:868-880`, `mInterrupts.js:340-346`).
- `mContext.js:91-96` reads `!scope` `transcript` off the element because the
  `step` fire outruns the `transcript` pub.
- `mMind.js:321-324` infers "fresh mind" from mirrors that memory's pubs fill,
  racing `memory.loaded`; it holds today only because `_whenAlive` polls at
  100 ms.
- **Live ordering bug, present now:** `studioConn.js:288-293` comments that
  `focusedKind` is "published before focusReset so a pane knows before it
  clears", but `pub` is a microtask and `fire` is sync, so `@focusReset`
  listeners (`studioStream.js:97`, `studioTranscript.js:30`) run *before* the
  `focusedKind` callbacks. Same class of bug the async rule is meant to prevent,
  already in the tree.
- Readiness by polling `.on`/`.loaded` (`mMind.js:337-353`, `mAgent.js:282-310`,
  `mWs.js:402-418`).

### 3.5 Structural lookups (fine on the host, meaningless remotely)

`part()`, `enclosing()`, `membrane()`, `closest()` are legitimate *at connect,
to build addresses*. They are illegitimate when the result is a handle to call.
Under Amanita's worker model the element stays in the host DOM as a proxy and
the logic moves; the logic cannot walk the tree. This is the line the rule
needs to draw, not "no lookups".

### 3.6 What is already fine

`*Src` refs and `!scope` addressing; every `pub`/`sub` pair; `interrupt-request`
*as a channel* (bubbling intent up, arbitration, `interrupt` down) — only its
payload type and the self-interception are problems; `backstage`; templating and
the loader's inert reflection window (a build step, not runtime wiring);
attribute reads at connect.

---

## 4. Should local stay sync? — no, one rule

Three reasons against a "sync locally, async at scale" split:

1. The sync protocols are the *interesting* ones to distribute. Sensory gates,
   governance, hands with side effects, comparators on other models — these are
   the parts one would want on other hosts, GPUs, or sandboxes. A split rule
   would keep exactly the wrong things local.
2. jsdom's synchronous dispatch is an accident of the substrate, not a design
   property anyone chose; `pub()` is already async and nobody noticed. Two
   delivery semantics in one tree already produced an ordering bug (§3.4).
3. An async API is free locally. A request that resolves on the next microtask
   is indistinguishable from a return value for a mind whose timescale is
   seconds. The cost is one helper and a discipline, not performance.

The escape hatch that *is* legitimate: a component may run synchronous code
inside **its own subtree that it owns and that is not itself a component**
(plain child elements, e.g. `m-fact` data rows, `m-phrase` strings). Ownership
means "would never be distributed separately". That is a small, checkable
exception (the tag is not a registered component), not a mode switch.

---

## 5. Proposal: the message rule

To be set down beside the decoupling principle. Six clauses.

> **M1 — Messages only.** A component interacts with another only through
> (a) a retained topic it publishes about itself, (b) a bubbling event it fires
> about its own intent, or (c) a request/reply pair. Never a method call on an
> element it looked up.
>
> **M2 — Plain data.** Payloads are JSON-serializable. No functions, elements,
> promises, signals, or class instances. Identity is an `id`; behaviour is a
> pure module function over the data (`renderBid(bid)`, not `bid.renderForFrame()`).
> A payload is never mutated after sending; a change is a new message.
>
> **M3 — Nothing is read back from a message.** No return values, no
> `defaultPrevented`, no filling an array in `detail`. A veto, a verdict, a
> registration acknowledgement is a reply message.
>
> **M4 — Lookups build addresses, not handles.** `part()`, `enclosing()`,
> `membrane()` run at connect (or on a structural event) and yield a `name`,
> a `provides` list, a count, or a ref to subscribe to. Their result is never
> called.
>
> **M5 — Order is carried, not assumed.** Two messages on different channels
> have no guaranteed order. Anything that must correlate carries an id
> (`frameId`, `burstIndex`, `callId`, `requestId`) or a sequence number.
>
> **M6 — Every wait has a deadline.** A request declares a timeout and the
> absent reply is a defined outcome (abstain, skip, degrade), never a hang.

Corollaries, mapped onto today's protocols:

| Today | Under the rule |
|---|---|
| `capability {execute}` offered up; `m-act` calls `cap.execute(args)` | offer carries `{name, schema, description, felt, readonly}`; invocation is a topic on the assembler, `call {callId, hand, args}`, each hand subscribes and filters by name; reply `fire("result", {callId, experience, salience, data})`. The hand runs anywhere. |
| `interrupt-request` carries an `AttentionBid` instance the arbiter mutates | plain bid record; arbiter emits a *new* record with `gainTrail`/`decisions` appended; `AttentionBid` becomes a module of pure functions |
| `arbiter.takePending()` pulled at frame time | pull → push: the arbiter fires `accepted {bid}` as it decides; the mind keeps its own queue and drains it. No round trip at all. |
| `percept-candidate` with verdicts pushed into `detail` | `candidate {requestId, …}` bubbles; each gate replies `verdict {requestId, gateId, permitted, version}`; the aperture collects until the registered gate count is met or the deadline passes (missing gate = deny, monotone authority preserved) |
| `proposal` with `deny()`/`hold()` closures | `proposal {proposalId, args}`; governors reply `governed {proposalId, decision: deny|hold|allow, args?}`; agent proceeds on quorum/deadline |
| `step` → guard → `halt`/`nudge` same tick | `halt`/`nudge` carry `turnIndex`; the agent applies them to *that* turn or the next, explicitly, instead of racing |
| `memory.finalize("sleep")` awaited | `request("sleep", {id})` → memory replies `slept {id, committed}`; mind awaits with deadline (Covenant: a missing reply is reported as "not confirmed", never assumed) |
| `stream-filter` chain of sync `feed()` calls | a pipeline of streams: `chunk {burstIndex, seq, text}` → filter publishes its own `chunk` → next; the emitter subscribes to the last stage's topic (order is declared in the archml, as today by tree order). `signal` is an event carrying `burstIndex`. |
| `comparator.evaluate(view, {signal})`, `bidder.createBid()`, `regulator.*`, `requestOrientation()`, `requestControl()` | request/reply with `requestId` and deadline; cancellation is a `cancel {requestId}` message |
| `getPrompt()`, `interlocutorName()`, `_sleeping` reads | membrane publishes retained `identity`, `interlocutor`, `sleeping` |
| polling `.on`/`.loaded` | every component publishes retained `ready` (base class, set after `onConnect` and any async load); the mind subscribes to the parts it needs |
| `contactPressure` property read | read the delivered value (already published) |
| `_updateCapability`, `_registerCapability` reach-ins | `offer` is idempotent: re-fire the offer with the new schema |

**The one generic seam to add** (features-as-additions rule): a `request()`
/ `respond()` pair on `MBaseComponent`, implemented over `fire` + `sub` with a
correlation id and a deadline, returning a Promise. Locally it resolves within
a microtask; under Amanita's worker/server mode it rides the same topic
forwarding. Nearly every row above is an application of it. Nothing else new is
required; the rest is applying `pub`, `fire`, `backstage`, and role-*addresses*
that already exist.

**Distribution unit, for the record.** The archml stays the single topology; the
DOM tree stays on the host. A component moved off-host is a proxy element on the
host plus logic elsewhere (Amanita's `spawn="worker|server"` shape). Refs still
resolve on the host, subscriptions are forwarded, and the moved logic sees only
its own attributes (snapshot) and messages. That is what M1–M6 make possible;
which components actually move is a later, per-experiment choice. Societies
already cross processes one way (the Studio spawns each mind); a
cross-process `m-ear`/`m-link` is the first real consumer.

---

## 6. Measure it before migrating: a delivery-chaos harness

Rather than migrating from the audit list, make the test suite tell the truth:

1. **Async-fire mode.** A test-only flag that makes `MBaseComponent.fire` (and
   the Studio's) dispatch on `queueMicrotask` / `setTimeout(0)` / random 0–20 ms.
   Run the wiring and integration suites under it. Every failure is a §3.1
   protocol; the list becomes exact and regression-guarded.
2. **Serialization assertion.** In the same mode, `fire`/`pub` run
   `structuredClone`-style checks (fail on functions, elements, class instances)
   — the §3.2 list, enforced.
3. **Handle-call lint.** An ESLint rule (the project already has `.eslintrc.js`)
   that flags a member call on the result of `part(`, `enclosing(`, `membrane(`,
   `closest(`, `querySelector(` unless the member is in an allowlist
   (`getAttribute`, `hasAttribute`, `localName`, `addEventListener` on the
   membrane for structural events). This is §3.3, mechanically.
   *Built 2026-10-06 as `unit/handle-hygiene.test.js`, a bun test like the other
   hygiene checks, since ESLint is not installed. Besides direct chains it
   follows bindings, `for … of` loops and array callbacks, and it flags property
   reads as well as calls (`.on` and `.aperture` were the reads it found). Its first run
   found five reaches, all fixed in the same commit: m-mind's
   `stream.getRecentOutput()` (a memoryless mind now keeps the stream's words from
   its `chunk` topic) and its read of the stream's `burstTokens` attribute (the
   frame sends `burstFactor` and the stream scales its own budget); m-ws polling
   `.on` on the mind, agent and stream (it now waits on their retained `up`
   topics, with a deadline); m-region's uniqueness walk reading `child.aperture`
   (now `providesOf`); and an unused `getPrompt(name)` branch in MBaseComponent
   that called the named child. The same commit replaced m-region's
   `querySelector('m-economy')` / `('m-stream')` tag checks with a check for a
   part of the name its default ref resolves to, plus `boundarySrc` /
   `arousalSrc` overrides.*
4. **Ref hygiene test.** Fail on `"../"` and leading-`/` refs in components
   unless a `*Src` override exists (§2.10).

Items 1–2 are a day; 3–4 an afternoon. They convert this document's inventory
into a red/green board and keep it true as the tree changes.

---

## 7. Order of work

Ranked by blast radius over cost. Each step is an addition or a swap behind an
existing seam, none rewrites a mind's behaviour.

1. **Harness (§6).** Establishes the real list. Also fixes the Studio ordering
   bug (§3.4) as its first green.
2. **`request()/respond()` + `ready`/`identity`/`sleeping` topics.** The seam
   and the three retained values most reach-ins are pulling. Migrate
   `getPrompt`/`interlocutorName`/`_sleeping`/`.loaded` readers (§2.7, §3.4).
3. **Hands.** Data-only capability offers, `call`/`result` invocation, idempotent
   re-offer (kills `_updateCapability`, `_registerCapability`, the facts retry
   loop). `m-agent` shares the `hands` assembler role instead of duplicating it
   (§2.8, §5). *Done 2026-09-26 (`shared/hands.js`): the result is the `call`
   request's reply rather than a separate `result` event. See
   [message-rule.md](../architecture/message-rule.md).*
4. **Attention payloads.** Plain bid records + pure functions; arbiter emits
   fresh records; `takePending` → push; `m-act` stops self-intercepting and
   instead *emits* the bid form directly (§3.1, §3.2).
   *Done 2026-09-26: bids and stimuli cross as plain data and each receiver
   builds its own bid; trust moved from `instanceof InterruptRecord` to the
   sender (`messageOrigin.js`); the arbiter pushes `accepted`/`withdrawn` and
   hears `taken`; m-act claims its own consequence directly. The mind also asks
   its stream to `hush` before perceiving, which fixed §9 bug 1. See
   [message-rule.md](../architecture/message-rule.md).*
5. **Sleep as request/reply**, with the Covenant's "not confirmed" outcome.
   *Done 2026-09-27: ports fire `sleep-requested` and the process sleeps every
   mind (`putToSleep`, a `put-to-sleep` request per membrane, found by role);
   an unconfirmed commit exits 3 and the Studio reports it; the sleep frame
   hushes the stream first. See
   [message-rule.md](../architecture/message-rule.md).*
6. **Gates and governance.** `percept-candidate` verdicts and `proposal` holds
   as replies with quorum + deadline; `halt`/`nudge` carry `turnIndex`.
   *Governance and the step round trip done 2026-09-27: `proposal` and `step`
   are requests answered by the agent's `governor` and `monitor` parts, with a
   quorum by roster and a deadline (a silent governor denies, a silent monitor
   is skipped). The step reply's requestId stands in for `turnIndex`. The
   perception gate followed the same day: `percept-candidate` is a plain-data
   request from the issuing aperture, each gate on the path replies with its
   verdict, and a gate silent past `gateDeadline` is `gate-missing`. See
   [message-rule.md](../architecture/message-rule.md).*
7. **Stream filters as a pipeline.** `stream-filter` becomes ordered `chunk`
   stages; `m-provenance-filter` is the first port.
   *Done 2026-09-27, as a request per stage rather than a topic pipeline: the
   stream asks each filter by name (`filter {op: begin|feed|flush}` →
   `{emit, signal?}`), fires `filter-stopped` after it stopped, and drops a
   stage silent past `filterDeadline`. Filters extend `MStreamFilter`
   (`shared/streamFilters.js`). See
   [message-rule.md](../architecture/message-rule.md).*
8. **Comparator / bidder / regulator / orientation / control** ports as
   request/reply with cancellation messages.
   *Comparator done 2026-09-27: owners ask `compare {view, deadline}` and the
   comparator (`MComparator`, `shared/comparators.js`) replies with plain
   evaluations; the seam gained `request-cancel {requestId}` (a `signal` on
   `request()`); predictions and search targets cross as plain records trusted
   by sender. The bidder followed the same day: the owner asks its owner-local
   bidder with a `bid` request (`MBidder`, `shared/bidders.js`), admits the
   answer by id and issues it again over its own percept, and refuses a silent
   bidder at `bidDeadline`. Controllers followed: m-orient and m-search ask the
   apertures by name (`orient`, `control`, `aperture-contract`,
   `aperture-sources`) and m-orient asks `search-start`
   (`shared/apertureRequests.js`); `edge-evidence` crosses as data. The
   contact regulator followed: a substituted one is a peer (`MRegulator`,
   `shared/regulators.js`) that announces `regulator-up` and answers `regulate`
   ops with a snapshot the region mirrors; the built-in `Aperture` stays the
   region's own synchronous state. Contact pressure followed: a parent aperture
   and the arbiters hear it from the retained `contactPressure` topics instead
   of reading it off the elements, and the aggregator is a peer (`MAggregator`,
   `shared/aggregators.js`) asked when a pressure changes. Inside the tree a
   parent asks its child apertures by name (`control`, `orient`), and version
   holds read a retained `gateVersions` mirror instead of the enclosing
   elements. Sources followed: registration is plain data, and the aperture
   asks its source `sample` and `materialize` while the source sends its
   candidate as an `offer` answered with the bid (`shared/sources.js`);
   lineage comes only from a control the aperture armed, by id. See
   [message-rule.md](../architecture/message-rule.md).*
9. **Decoupling cleanups** (independent of async, can interleave): `stats`
   topic + generic `m-ws` walk (§2.1); producers emit `backstage`, memory drops
   per-feature handlers (§2.2); per-membrane usage attribution (§2.3);
   `!scope` for the remaining `../` and `/voice` refs (§2.10); enclosure phase 1
   `closest('m-mind')` → `membrane()` sweep (§2.6); move shared functions out of
   component modules (§2.11); `m-agent` tag switches → roles (§2.8).
   *Refs done 2026-09-28 (§2.10): m-stream `prompt`, m-speech's interrupt
   events, m-reason `turn`, m-mind's voice `speaking` and m-ws's frame taps
   bind `!scope/…` with a `*Src` override; `unit/ref-hygiene.test.js` (§6.4)
   fails on a bound `../` or `/` ref that is not an override's default (the
   region's `../..[provides~="aperture"]` role lookup is allowed), and
   `wiring/wrap-invariance.test.js` wraps each faculty to pin it.*
   *Telemetry done 2026-09-28 (§2.1), as a fired event rather than a retained
   `stats` topic: most records are events (a bid, a deed, a boundary) that a
   last-value topic would drop. A faculty fires `telemetry {process, kind, data}`
   (`shared/telemetry.js`), the membrane stops it, and m-ws forwards whatever it
   hears on its membrane, or on each member's for a society's public socket. The
   `data` envelope keeps a payload's own `kind` (the loop sense's) apart from the
   route. Because an event is gone once missed, m-ws fires `telemetry-wanted`
   once it listens and memory reports its loaded state again. The voice's
   fragments stay a transport subscription (`speechSrc`, like `src`). m-ws looks
   up no faculty any more; its society walk and readiness wait still find
   minds and streams by tag (§2.6). The Studio's `nByTag` / `nodeTag` are
   untouched. `wiring/telemetry.test.js` pins a faculty m-ws has never heard of,
   the membrane stop, the replay and a member's tagged records.*
   *Backstage done 2026-09-28 (§2.2): the scribe, the hands, the region and the
   arbiter write their own trail prose and fire `backstage {text}`, like the
   provenance filter already did. Memory lost `filedSrc`, `actedSrc`,
   `muffledSrc` and its `aperture-change` listener, and journals every trail
   through its one `backstageSrc` handler. `acted` and `aperture-change` stay,
   as data, because the expectation ledger and the membrane tests read their
   fields. `filed` and `muffled` had no reader besides memory and are gone
   (the Studio's `scribe/filed` is telemetry). The channels memory still names
   each change the tail or answer a request (spoken, image, attended, bridge,
   clear-tail, sleep), which a trail line cannot. The journal text is unchanged.
   `wiring/kb-memory.test.js` pins that a bare structured event leaves no note
   and that an unknown producer's trail is journaled.*
   *Identity roots done 2026-09-28 (§2.6): no `closest('m-mind' | 'm-agent' |
   'm-society')` is left in `src/` outside build-time `startup/templating.js`.
   `membrane()` alone would not do, because several lookups cross a membrane on
   purpose (a subagent's terminal wants the mind's workspace, a member mind wants
   its society), so `enclosure.js` gained `closestRole(el, ...roles)`, `closest()`
   by role. The vault homes, prompt-debug dir, memory's identity check, the ear's
   own name, the commons and speech society checks, m-facts' pinned origins, the
   Plenum root and member ring, m-jobs' agent and its sub-agents (`part(agent,
   'agent')`), m-terminal's mode (`enclosing('hands')` providing `agent`) and
   m-ws's mind, society walk and layout all go by role now. m-ws's readiness
   wait still finds each member's `m-stream` by tag, a faculty lookup and not an
   identity root. `wiring/enclosure-by-role.test.js` pins custom-tag roots and
   their vault homes; `wiring/telemetry.test.js`'s society test now runs on
   custom `x-society` / `x-mind` tags.*
   *Agent parts done 2026-09-30 (§2.8): `m-reason` provides `reasoner`,
   `m-context` provides `context`, and `m-ws` / `m-console` provide `port`. The
   agent binds its reasoner and working memory by role and by name, waits for the
   reasoner's retained `up` instead of polling `.on`, and is a service when a part
   provides `port`, so a nested sub-agent's `m-console` no longer makes its parent
   one. The binding runs in the wake loop, not onConnect: an agent that upgrades
   before its parts' classes are defined (a tag already defined when the markup
   lands) sees them as plain elements at connect. The other §2.8
   items were already gone: the hand-vs-job switch goes by `enclosing('hands')`
   (§7.3, §2.6), m-terminal's mode likewise, m-reason binds `!scope/turn`
   (§2.10), and m-agent shares `shared/hands.js` with m-act (§7.3).
   `wiring/agent-roles.test.js` runs the loop on custom-tag parts.*
   *Imports done 2026-09-30 (§2.11): the shared pure functions moved out of
   component modules into `shared/`: the compression length loop and prompt
   (`compression.js`, used by m-memory and m-context), the weather, daylight and
   feed mappers (`senseMappers.js`, used by the three senses and m-look), the
   speech-decision parser (`speechDecision.js`, m-speech and m-act), the notebook
   parser (`notebook.js`, read by the recall sources) and the `{{interlocutor}}`
   fill (`interlocutor.js`, m-mind and m-speech). Memory no longer imports the
   loader: the loader records the architecture source and the resolved custom
   components in `infrastructure/runningBundle.js`, and memory reads that record
   to snapshot a home. The loader's own getters delegate to it.
   `unit/import-hygiene.test.js` fails when a built-in module imports another
   component's module (a base class it extends is allowed) or the loader.*
   *Usage done 2026-10-06 (§2.3), which completes step 9: llm.js keeps no usage
   total any more, and every call (`complete`, `completeWithTools`, `chatStream`,
   `generateImage`, `decide`, dry or live) returns its usage. The component that
   made the call fires `usage {promptTokens, completionTokens, cost}`
   (`shared/usage.js`: `spend(el, usage)`, or `spent(el, result)` around an
   awaited call), and m-economy adds up what it hears on `!scope/@usage`. The
   membrane does not stop `usage`, so a mind pays for its sub-agents and an
   economy on a society would hear every member. The streams attribute a burst
   before its boundary, so the economy's reading at that boundary still includes
   it. The dry-run stubs answer by `debugTag` and never by prompt text. That
   changed one thing: memory's compression used to get the association reply or
   "Noted." whenever its thinking said "remind", and now always gets the condensed
   reply. The concurrency semaphore and `decide()`'s backoff stay process-wide on
   purpose. They guard the process's connections and the endpoint's rate limit,
   which every mind in the process shares, so they are not one mind's state.
   `wiring/usage.test.js` pins two minds charged apart and a host charged for its
   sub-agent; `unit/dry-run-tags.test.js` pins selection by tag.*

---

## 8. What this does not change

The archml as the single wiring surface; the interrupt spine as the tree-shaped
mechanism; `!scope` addressing; the loader's reflection window; templating;
`backstage`; the three laws of enclosure (they hold better under M1–M6, because
a container can only delay or drop messages, never widen what they carry). No
mind needs a new archml to keep running as it does today.

---

## 9. What the harness found (2026-09-26)

The §6 harness, the ratchet and 38 contract tests
(`architecture/tests/wiring/contracts/`) now exist; see
[message-rule.md](../architecture/message-rule.md). What they found beyond the
audit above:

**Timing and payload break different protocols.** Deferred delivery alone
(`--wire ref`) breaks only the protocols that read something back inside one
dispatch: gate verdicts, governance `deny`/`hold`/modify, the step→`halt`/`nudge`
round trip, frame ordering under `macrotask`, and sleep-notice ordering. The
capability offer, m-act's self-interception of `interrupt-request`, nested
arbiters and `aperture-register` all **survive timing**. Mutation checks confirm
they are genuinely pinned: each passes because every `stopPropagation` on one
event's path still runs inside one (deferred) dispatch, and because instances
and callbacks still pass by reference. They break only on the `json` wire,
which is why the baseline uses it. Their blocker is §3.2 (payloads), not §3.1.

**Two ordering hazards that survive only by latency.** The clear-tail reseed is
safe because the first chunk of the clear frame arrives hundreds of ms after
`clear-tail`, since the stream holds back its seam. Sleep fan-out is safe
because every owner's `revalidate` reads `mind._sleeping` directly, a
retained-state read that would not cross a boundary (hence the `sleeping`
topic in §5).

**Studio commands are fire-and-forget but order-dependent.** They survive FIFO
deferral. Under `jitter`, "focus then speak" from two panes reorders on 8 of 10
seeds. The speak command should carry its target id (M5).

**Bugs present today (sync mode):**

1. *Provenance stop loses the mind's last clean words.* `m-stream._stopBurst`
   publishes the clean text with `pub` (a microtask), then the filter's
   `react()` fires `interrupt-request` synchronously. The arbiter fires
   `interrupt` and m-mind builds the corrective frame *inside that dispatch*
   from its stale memory mirror. So the corrective prefill lacks the last clean
   words, and memory records them *after* the corrective `> ⟂` line. This is
   the same pub-versus-fire class as the Studio `focusedKind` bug. It is pinned
   as `test.failing` in `stream-filter.contract.test.js`. **Fixed with the
   attention step (§7 step 4):** the arbiter pushes `accepted`, and m-mind asks
   its stream to `hush` (a request) before it builds the frame, so the frame is
   built after the clean text reached memory. The test is a plain `test` now and
   passes in every delivery mode.
2. *Journal lines after the sleep marker.* `mMemory.note()` has no
   `_finalized` guard. A deed (`_onActed`), backstage trail, filing or
   aperture change that lands after `finalize()` is appended after
   `*sleep at …*` and is not committed until the next wake. **Fixed with the
   request/reply pilot:** `note()` returns once finalized; pinned in
   `persist-serialization.test.js`.

**Fixed here:** the Studio `focusedKind`/`focusReset` ordering (§3.4).
`focusReset` now carries `{id, kind}`, and the panes apply the kind from it.

**Found while migrating hands (2026-09-26).** Once tools could be called under
the json wire, agent-govern's async-veto test reached the governance protocol,
whose `deny` closure does not cross. Its governor threw in a dangling promise,
and bun reported that unhandled error while loading the *next* file
(`market-outcome.test.js`). All 35 of that file's tests dropped out of the junit
report, and the ratchet counted neither their passes nor their failures. The
test now guards the call, and the ratchet fails any run in which a test file
produced no results. One jitter run (seed 3) failed once in the hands contracts
and did not reproduce in three reruns or in eight more seeds. It is noted here,
not diagnosed.

**Found while migrating attention payloads (2026-09-26).** Once urgency survived
the json wire, the frame-ordering bridge contract preempted a running burst under
chaos for the first time: the old burst kept streaming while the frame and its
bridge call were built, so its words were journaled after the `> ⟂` line and the
bridge lost its ↪ mark. The mind now asks its stream to `hush` before it
perceives. Under `jitter` (not the baseline mode), the sleep-notice contract
fails on 6 of 10 seeds, and did on 7 of 10 before this step. So it is a
pre-existing ordering hazard of the sleep frame, which is built without a hush.
It belongs to the sleep step (§7 step 5). **Fixed there:** the sleep frame hushes
the stream first, and the contract passes on 10 of 10 seeds.

