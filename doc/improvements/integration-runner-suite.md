# Integration runner suite

Goal: catch "the parts are present but not actually wired" failures. Unit and jsdom
wiring tests are still the fast inner loop; this suite runs whole architectures in
dry mode and asserts externally visible invariants.

## Existing layers

- **Unit tests** (`bun test architecture/tests/unit`): pure parsers, prompt helpers,
  small state machines, and deterministic component logic.
- **Wiring tests** (`bun test architecture/tests/wiring --max-concurrency 1`):
  jsdom component graphs with real Amanita refs/events, but usually no full
  process, no WebSocket server, and no long-running scheduler.
- **Smoke tests** (`bun tools/smoke-run.mjs`): dry-run process startup plus a
  WebSocket probe and a bounded dry-fast run.
- **Live tests** (`bun run test:live`): opt-in checks that need credentials or a
  manually running mind.

The missing layer is a deterministic process-level integration runner: start real
architectures in `MEDITATOR_DRY_RUN=1`, inject stimuli through the same public
interfaces users use, and fail if expected cross-component effects do not appear.

## Proposed command shape

Add a runner:

```sh
bun tools/integration-runner.mjs
bun tools/integration-runner.mjs --case duet-hears-peer
bun tools/integration-runner.mjs --keep-logs
```

Add package scripts:

```json
{
  "test:integration": "bun tools/integration-runner.mjs",
  "test:all": "bun run test && bun run test:smoke && bun run test:integration"
}
```

## Runner contract

Each case is a small descriptor:

```js
{
  name: "duet-hears-peer",
  arch: "architecture/tests/integration/duet-dry.archml",
  env: { MEDITATOR_DRY_RUN: "1", MEDITATOR_SANDBOX_BACKEND: "none" },
  timeoutMs: 30000,
  probes: [
    waitForWs(7627),
    focusMind("checker"),
    waitForEvent("speech-boundary", { mind: "prover" }),
    assertTimelineContains("checker", /Prover says:/),
    assertJournalContains("checker", /Prover says:/)
  ]
}
```

The important rule: probes should observe public surfaces - WebSocket messages,
stdout, journals, memory files, and process exit - rather than reaching into live
component objects. That keeps the suite honest about the deployed wiring.

## First cases

1. **duet-hears-peer**
   - Starts a two-mind society in dry mode.
   - Forces or waits for `prover` to speak.
   - Asserts `checker` receives a peer stimulus and journals/fragments a frame with
     `Prover says:`.
   - This catches the deaf-ear bug: `voice/spoken` would never receive the fired
     `@spoken` event.

2. **commons-relay-hears-members**
   - Starts a three-mind society using `m-commons`.
   - Asserts a member speech appears once for every non-speaker and never loops back
     to the speaker.
   - Catches event/topic drift in `m-commons` and `m-ear`.

3. **human-voice-preempts**
   - Starts one dry mind with `m-ws`.
   - Sends text through the WebSocket input path.
   - Asserts an External voice stimulus reaches the arbiter and appears in the next
     frame/journal with the canonical voice framing.

4. **terminal-dry-deed-and-consequence**
   - Starts an architecture with `m-act` and `m-terminal`.
   - Asserts no real sandbox backend is used, the deed is backstage, and only the
     screen consequence enters attention.
   - Extends the current wiring test to process-level dry run.

5. **memory-survives-restart**
   - Runs a mind long enough to produce tail/journal state, sleeps it, restarts with
     the same temporary home, and asserts the loaded tail and compressed topics are
     visible through the public stream.

## Implementation notes

- Use temporary architecture copies and temporary memory homes under `/tmp`.
- Always kill child processes in `finally`, `SIGINT`, and `SIGTERM` handlers.
- Keep timeouts short and case-local; one hung case should not hide the failing
  invariant.
- Normalize WebSocket telemetry into an in-memory event log, then write the log to
  `logs/integration/<case>.jsonl` only on failure unless `--keep-logs` is set.
- Require dry mode by default and fail fast if a case tries to run live without an
  explicit `live: true` marker.
- Prefer one assertion per wiring contract: source emits, target hears, memory
  records, UI/socket reports. Avoid asserting exact generated prose except for dry
  stubs and canonical framing strings.
