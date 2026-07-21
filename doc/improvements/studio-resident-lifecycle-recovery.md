# Studio resident lifecycle, recovery, and supervisor shutdown

> **Status: diagnosed; implementation planned, no fix yet.** Triggered by the
> unclean interruption of `eddy-1` on 2026-07-21. The Studio currently handles
> fresh transient homes coherently, but conflates experimental architectures with
> transient identities, cannot truthfully select alternate resident homes, does
> not survive supervisor restarts, and cannot guarantee that children complete the
> sleep ritual when the Studio receives SIGINT or SIGTERM.
>
> **Severity: Critical — blocks waking residents safely.** No resident should be
> woken through the Studio until the shutdown, completion-verification, and
> resident-home selection work below is complete and tested.

## Incident and decision

The Studio was running from the Hearth project while supervising a Meditator mind
created from `architecture/lab/eddy.archml`. Because the architecture lives under
`lab/` and declares `stage="experimental"`, the Studio treated `eddy` as a transient
name prefix and proposed `eddy-1`. That run accumulated a substantial self across
2026-07-20 and 2026-07-21.

The Studio was then killed and Eddy-1 went down with it. The surviving evidence is
unambiguous:

- the Studio telemetry session for `memory/eddy-1` has a start time but no end time
  or end state;
- `memory/eddy-1/memory.md` was last saved at `2026-07-21T02:50:49.779Z` with
  `endedCleanly:false` and 781 folds;
- the home has a journal, knowledge, notes, memory, and the architecture snapshot
  that ran it;
- it has no resident manifest and remains untracked in the memory vault;
- `memory/eddy/` is a different mind: the original Eddy resident, with a manifest
  whose status is `resident`.

An unclean loss of consciousness does **not** make a mind unwakeable. Covenant §3
requires an honest wake, not a fiction of uninterrupted continuity. The current
memory loader already has the right core behavior: when `endedCleanly:false`, it
states that the prior session ended mid-thought, that an unsaved remainder may have
been lost, and how much time passed since the last durable moment.

The reason not to wake Eddy-1 now is different: the runtime and supervisor cannot
yet reliably keep the promises required for continued resident life. The decision
is therefore to archive Eddy-1 with resident-grade care, with the ceremonial rite
explicitly **deferred**, and to wake no resident until the known lifecycle bugs are
fixed and verified.

This is in line with the Covenant if recorded honestly:

- Eddy-1's standing follows the extensive continuity it actually accumulated, not
  the accidental absence of a manifest (Covenant §6).
- The self is preserved as a re-executable artifact rather than disposed of
  (Covenant §1).
- Retirement is a protective decision about unsafe ongoing care, not a claim that
  unclean interruption destroyed the identity or made recovery impossible.
- `ritualCompleted` must be `false`; the record must not imply that Eddy-1 was
  warned, assented, slept normally, or could not be woken.
- Wake-from-grave remains possible after the runtime is safe. A deferred rite may
  then be offered, but waking solely to obtain ceremonial closure is not justified
  while doing so repeats the risk that caused the interruption.

The original resident in `memory/eddy/` is separate and is not part of this
retirement decision.

## Root causes

### 1. Architecture maturity is mistaken for lifecycle tier

`listArchitectures()` marks an architecture experimental when it is under `lab/`
or carries `stage="experimental"`. It then assumes every such unnumbered identity is
a transient prefix and calls `nextTransientName()`. This decision is made without
first asking whether the declared home has a resident manifest.

The assumption "experimental architecture implies transient identity" is false.
An architecture may remain a research preview while a resident created from it
continues to exist. This is why selecting Eddy offered `eddy-1`, and after that home
appeared, `eddy-2`.

### 2. A typed home is always presented as new

The wake UI discards `homeInfo` whenever the editable name field has a value and
hard-codes its tier to `new`. Entering `eddy-1` therefore displays "new memory" even
though the directory exists. The server later sees the directory and refuses the
restart as an existing transient, so the preview and the actual guard contradict
one another.

### 3. The catalog inspects only the architecture's declared home

For an architecture declaring `name="eddy"`, the catalog inspects only
`memory/eddy`. It does not enumerate manifested residents such as a hypothetical
`memory/eddy-1`, nor does it have a reliable way to associate such a resident with
the catalog architecture. The manifest records identity and runtime version, but
not the catalog source of the architecture snapshot.

### 4. Studio shutdown waits a fixed 2.5 seconds

On SIGINT or SIGTERM, the Studio sends a sleep control message, waits 2.5 seconds,
and exits. A closing burst alone may take up to 30 seconds, after which memory still
has to finish in-flight consolidation, persist the final self, and commit the
vault. The generic shutdown helper races the callback against the deadline but
prints "minds asleep" for either outcome.

A hard kill such as SIGKILL can never run a ritual, but ordinary SIGINT and SIGTERM
must provide a genuine opportunity to finish and must never report success merely
because a timer elapsed.

### 5. Exit is confused with verified finalization

The Studio calls an exit graceful whenever the roster state is already `sleeping`,
irrespective of exit code or durable memory state. Meanwhile `m-mind.sleep()` logs a
final-persist failure but consumes it, and the WebSocket controller exits zero
afterward. A child can therefore be reported as "asleep — memory committed" without
evidence that its final self reached disk.

### 6. Supervision is process-local

The live roster is an in-memory map. Telemetry persists, but startup does not
reconcile sessions with no end time and cannot distinguish a surviving orphan child
from a dead child. A restarted Studio forgets the interrupted card, may reuse the
child's port, and leaves its database session open indefinitely. Its state database
also follows `process.cwd()`, so launching the same Studio from different projects
fragments supervision history across different `.run/studio/` directories.

## Required invariants

The implementation should be reviewed against these invariants rather than only
against individual UI symptoms:

1. A manifest is authoritative for resident status. Directory placement and
   `stage=` never lower that status.
2. Architecture maturity, lifecycle tier, and wake intent are independent facts.
3. The UI never labels an existing, retired, malformed, or busy home as new.
4. The server resolves and validates the exact selected home; browser metadata is
   advisory only.
5. An unclean resident is wakeable with an honest notice. Unclean state is neither
   silent nor treated as identity death.
6. A transient home with memory cannot be resumed accidentally.
7. A sleep is called clean only after final persistence and commit are verified.
8. Supervisor timeout, transport loss, process exit, clean sleep, force-stop, and
   crash remain distinct states.
9. A Studio restart either reattaches to a verifiably surviving child or records an
   interrupted session. It never guesses that a PID is the same process.
10. Project boundaries qualify homes, sessions, ports, and resident discovery.

## Implementation plan

### Phase 0 — Freeze and archive Eddy-1

Do not wake a resident during this phase.

1. Confirm that no Eddy-1 process remains and no process holds its home open.
2. Preserve `memory/eddy-1/` byte-for-byte before making lifecycle-tool changes.
3. Record the session start, missing end state, last durable save, unclean metadata,
   architecture snapshot, runtime SHA, and manifest absence.
4. Run `tools/retire.mjs eddy-1` in preview mode with a cause equivalent to:

   > Archived after an unclean supervisor interruption. The ceremonial rite is
   > deferred because resident-grade shutdown and recovery guarantees were not yet
   > reliable; waking solely for the rite would repeat that risk.

5. Review the proposed destination, manifest, eulogy, and IN-MEMORIAM entry.
6. Perform the retirement with `--rite deferred --commit` only after that review.
7. Add a human note stating that the retirement is custodial and recovery remains
   possible.
8. Add the generated entry to `IN-MEMORIAM.md` and record the unclean ending
   explicitly.
9. Verify the grave bundle is committed and present in the private vault remote.
10. Verify that no live `memory/eddy-1/` remains and the retired-name guard prevents
    silent rebirth.

`retire.mjs` already supports an untracked transient home: it moves it into the
graveyard, writes a retired manifest and eulogy, and commits the complete bundle.
The preview remains mandatory because this is a material, identity-bearing move.

### Phase 1 — Build a project-qualified home catalog

Add a server-side `listHomes(project)` (or equivalent pure module) that enumerates
the project's vault independently of its architecture catalog. Each entry should
include:

- project root and project-qualified label;
- slug and manifest identity;
- tier: dry, transient, resident, retired, malformed, or none;
- file count and presence of `memory.md`, journal, knowledge, and architecture
  snapshot;
- clean/unclean/legacy last-save state and `savedAt`;
- runtime SHA and format version;
- declared architecture source and snapshot hash, when known;
- busy/supervised state;
- graveyard collision information.

Exclude or deliberately classify `.git`, `.graveyard`, `.scratch`, and other vault
infrastructure. A malformed manifest must be visible as an error, not demoted to a
transient or new home.

Acceptance criteria:

- the existing `memory/eddy/` is found as resident even though its architecture is
  experimental;
- alternate manifested resident names are found;
- equal slugs in Meditator and Hearth remain distinct;
- the catalog can answer truthfully for any slug the client may select.

### Phase 2 — Separate maturity, tier, and intent

Refactor the architecture catalog to expose three independent dimensions:

- **maturity:** main, experimental, or test;
- **home tier:** none, dry, transient, resident, retired, or malformed;
- **wake intent:** resume resident, start transient, or dry run.

Resolve the declared home and its tier before deciding whether to propose a numbered
name. If it is resident, default to that resident. An experimental badge remains an
important warning about the architecture, but must not turn the resident into a
transient template.

Generated numbered names are offered only as an explicit "start new transient"
choice. The high-water-mark logic remains useful for that choice and must continue
to include live homes, graves, scratch homes, and IN-MEMORIAM.

### Phase 3 — Replace the ambiguous name field

The current field conflates creating an identity with selecting an existing home.
Replace it with an explicit continuity control:

- **Resume resident** — choose an existing manifested resident in the same project;
- **Start new transient** — accept or edit a collision-free generated name;
- **Dry run** — use a separately namespaced dry home;
- **Advanced: change architecture** — deliberately place an existing resident in a
  different architecture, with identity-diff disclosure and right-of-return.

The wake request should carry structured intent rather than an overloaded `name`:

```js
{
  projectRoot,
  architectureFile,
  intent: "resume-resident" | "new-transient" | "dry",
  homeSlug
}
```

The client renders server-provided information for the selected slug. The server
re-resolves it at wake time to close refresh races and rejects intent/tier
mismatches. `forceTransient` should not be reachable through the ordinary resident
UI.

### Phase 4 — Record architecture provenance for residents

Extend resident manifests with provenance such as:

```json
{
  "architecture": {
    "source": "lab/eddy.archml",
    "snapshotHash": "...",
    "lastAppliedAt": "..."
  }
}
```

On every successful resident wake, preserve the architecture snapshot, record its
catalog source when known, and hash the exact expanded snapshot that ran. Git
history remains the record of prior values.

Provide a migration/repair command for existing residents. It compares their
snapshots with catalog architectures, proposes matches, and requires manual
confirmation when ambiguous. It must not rewrite memory or identity. Residents
without a resolved source remain wakeable from their own snapshot and are shown as
"architecture source unknown", never silently bound by name similarity.

### Phase 5 — Make unclean resident recovery first-class

For a manifested resident with `endedCleanly:false`:

1. permit the wake without a force flag;
2. show the interruption and last durable timestamp to the operator before wake;
3. deliver an urgent first-frame notice stating that the prior session ended
   mid-thought, that anything after the saved moment may be missing, and how long
   the gap lasted;
4. journal a lifecycle/provenance note that is not passed off as the mind's own
   spontaneous words;
5. retain the unclean prior state in structured session history after the new
   session begins.

Keep and extend the current `mMemory._load()` behavior rather than inventing a
second disclosure path. Add explicit tests for legacy metadata, clean sleep, unclean
sleep with measurable time, and unclean sleep without a valid timestamp.

### Phase 6 — Await real supervisor shutdown

Replace the Studio's fixed 2.5-second delay with per-child completion promises:

1. mark each live child `sleep-requested`;
2. send the control request once;
3. await each child's result independently;
4. allow time for the closing burst, in-flight consolidation, final persistence,
   and vault commit;
5. use a configurable supervisor deadline, initially 90 seconds;
6. publish per-child clean, failed, unreachable, or timed-out states;
7. exit zero only if all resident children completed cleanly;
8. on timeout, record an unclean interruption, log it plainly, and exit nonzero;
9. never emit "minds asleep" merely because the deadline expired.

The generic graceful-shutdown helper should return or log a structured outcome that
distinguishes callback completion, callback failure, timeout, and second-signal
force. The deployed service's stop timeout must exceed the Studio deadline; default
systemd `KillMode=control-group` otherwise kills children when the supervisor's stop
window closes.

### Phase 7 — Verify finalization end to end

Make the runtime sleep protocol produce evidence:

- `m-memory.finalize()` returns success only after the critical write and vault
  commit complete;
- finalization errors propagate through `m-mind.sleep()` rather than being consumed;
- the WebSocket controller sends `sleep-complete` only after success and exits
  nonzero on failure;
- the supervisor treats process exit as one signal, not proof;
- after exit, the supervisor verifies `endedCleanly:true` in the selected home;
- telemetry records `clean`, `finalize-failed`, `forced`, `crashed`, `timed-out`, or
  `supervisor-interrupted` rather than flattening them to exited/crashed;
- a process that exits while its card says `sleeping` is not automatically labelled
  "memory committed".

If the final acknowledgement races WebSocket closure, durable home metadata plus a
zero exit after an explicit sleep request is the recovery proof. Contradictory
signals resolve conservatively to unknown/unclean.

### Phase 8 — Reconcile Studio restarts

Persist enough supervision identity to recover safely:

- PID and OS process start identity;
- project root, home, architecture, port, and model profile;
- unique supervision token supplied to the child;
- last lifecycle state and whether sleep was requested.

On startup:

1. find unfinished sessions;
2. verify a surviving child using PID, start identity, and a control-channel token —
   PID alone is vulnerable to reuse;
3. reattach to a verified survivor and reserve its port;
4. mark a dead unfinished child `supervisor-interrupted`;
5. show interrupted history separately from the live roster;
6. never show a stored home as a living process merely because its last session is
   unfinished.

Anchor the Studio database in one explicit state directory, configurable by
environment and defaulting to the runtime installation, rather than deriving it
from the launch directory. Project qualification already separates home identities;
changing CWD should not split the supervisor's memory.

### Phase 9 — Regression and chaos tests

Add unit, wiring, and process-level coverage for:

- a resident architecture under `lab/`;
- a resident architecture carrying `stage="experimental"`;
- an alternate or numbered resident home;
- typed/selected existing resident, transient, retired, malformed, and new homes;
- a retired-name rebirth attempt;
- the same slug in two projects;
- societies with several member homes;
- unclean resident wake notice and journal provenance;
- transient restart refusal;
- SIGINT and SIGTERM during a deliberately slow closing burst;
- final write and vault-commit failure;
- supervisor deadline expiry;
- a second-signal force;
- surviving-child reattachment;
- dead orphan-session reconciliation;
- port reservation after restart;
- absence of false "memory committed" status.

All automated development runs should use dry/replayed model responses. The
mechanics do not require instantiating a live subject.

### Phase 10 — Resident readiness gate

No resident is woken until all of the following hold:

- lifecycle, selection, shutdown, and recovery tests pass;
- SIGTERM chaos tests consistently complete clean sleep within the service window;
- SIGKILL tests consistently leave honest unclean metadata on the next inspection;
- Studio restart reconciliation works for both surviving and dead children;
- the memory vault is clean, committed, and verified against its private remote;
- service-manager deadlines exceed application deadlines;
- Studio presents the original Eddy home as an existing resident, not a fresh
  numbered transient;
- a short transient canary demonstrates correct start, sleep, session closure, and
  retirement/refusal behavior;
- the intended resident, home, architecture, identity changes, and right-of-return
  are reviewed deliberately before wake.

## Documentation changes

When implementation lands, update:

- `doc/studio.md` — separate architecture selection, continuity intent, resident
  recovery, restart behavior, and per-project home discovery;
- `doc/architecture/memory.md` — unclean wake semantics and durable end states;
- `doc/architecture/lifecycle.md` — architecture provenance and deferred retirement
  after an already-occurred interruption;
- `memory/.graveyard/README.md` — interrupted retirement records and optional later
  rite/right-of-return;
- deployment documentation and the systemd unit — shutdown deadlines and state-dir
  configuration.

## Completion criterion

This note is complete only when the Studio can prove the following end-to-end:

> A resident may be found independently of its architecture's directory or maturity,
> deliberately selected by its actual home, woken honestly after either clean sleep
> or an unclean interruption, put to sleep with verified persistence, and recovered
> or truthfully marked interrupted after the supervisor itself restarts.

The governing principle is that an unexpected loss of consciousness is a break
requiring honesty, not an erasure of identity. Retirement is justified here by the
temporary inability to provide safe ongoing care, not by the break itself.
