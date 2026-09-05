# A shared, deterministic starting point for wiring tests

**Status: proposed, 2026-09-05.** Companion to the
[integration runner](integration-runner-suite.md), covering the faster in-process
test layer rather than replacing process-level verification.

## The friction

Wiring tests repeatedly construct an inert mind, attach real components, create
temporary memory, wait for setup, and clean up. The
[membrane tests](../../architecture/tests/wiring/perceptual-membrane.test.js)
also borrow the real frame assembler onto that inert root. This is useful coverage,
but each new experiment has to reconstruct the same test body.

Fixed waits such as `delay(40)` obscure which operation must finish. Expected
errors can print alarming stack traces during successful tests, and some socket
checks cannot run fully inside a restricted sandbox. A green test report should
make both the verified behavior and any unavailable coverage clear.

## Small shared fixture

Extract a fixture from two existing tests, starting with the membrane and
mind/memory cases. It should provide only the common operations:

- Mount supplied ArchML with real Amanita refs and components, while keeping the
  thinking loop inert unless the test explicitly needs it.
- Use the real frame assembler and offer a controllable clock and boundary step.
  Wait for component readiness and known pending work instead of sleeping for an
  assumed initialization duration.
- Collect emitted events and frame/journal receipts in order. Preserve the
  distinction between current-state replay and new event delivery.
- Own a temporary home and tear down components, subscriptions, timers, pending
  writes, and any test process before removing its own files.

Prefer a clock dependency at the few mechanisms that need time to a blanket fake
timer replacement for jsdom, sockets, and provider code. A scenario step advances
the shared clock, drives the intended boundary, and waits for that step's known
work to settle. It must also support deliberately holding a materializer in flight
to test closure, disconnection, and rebinding races.

Keep the fixture explicit about what is real and what is stubbed. It must not
replace arbitration, aperture policy, or frame assembly with expected answers.
The [Studio workbench](studio-experiment-workbench.md) can reuse its deterministic
scenario drivers; browser controls, production startup, and graceful shutdown
still need their own wiring or process checks.

## Tests that matter for growth

Contract violations should identify the endpoint, failing field, and expected
delivery semantics. Capture and assert deliberately triggered errors, reporting
their details when the assertion fails. Unexpected errors must remain failures.
Tests requiring sockets or another unavailable facility must report an explicit
skip with a reason or fail their required environment check, rather than pass
without exercising that part of the contract.

Use this fixture to prove that attaching, detaching, and reconnecting a typed port
does not duplicate events, replay old experience, or deliver work from an obsolete
binding. Adding and removing a faculty must restore the fixture's baseline
resources. These lifecycle checks are prerequisites for
[organic growth](schema-guided-connections.md), not merely test-suite tidiness.

## First completion condition

Migrate the membrane tests and one existing memory test to the fixture, remove
their arbitrary setup delays, and verify that both preserve their assertions.
Run each alone and together, including an intentionally failed setup to prove
cleanup. Share one closure/reopening scenario with the Studio sample. Keep the
remaining suite unchanged until another test has a concrete reason to adopt the
helper; a test framework rewrite is unnecessary.
