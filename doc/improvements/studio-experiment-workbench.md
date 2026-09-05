# Experiments in Studio, with small samples

**Status: proposed, 2026-09-05.** Studio is the intended place to view and manipulate
demonstrations. The current command-line membrane demo is a seed for a sample,
not the intended user interface.

## The improvement

Make a short path from selecting an experiment to changing an input and seeing
its consequence in the existing Studio stream, structure tree, and Plenum.
Use small ArchML samples and their configured components. Share the scenario
driver with automated tests so the visual demonstration exercises the same
mechanism the tests verify.

Start with an experiment entry in Studio's existing architecture selection flow
and a compact control panel for the selected sample. Controls send ordinary
`studio-command` events through the hub; observations return over the existing
telemetry path. Follow the [Studio mesh](../studio-wiring.md), extending its
commands and telemetry only where the sample needs them. The runtime owns clock
advancement, sensory policy, and connection changes; the browser observes their
results instead of simulating a second version of the mechanism.

## First sample: perceptual contact

Adapt [`demo-membrane.mjs`](../../scripts/dev/demo-membrane.mjs) into a selectable
sample with these controls: introduce a simulated change, open/soften/narrow/close
attention, advance the scenario clock or one boundary, and reset the dry sample.

On one short timeline, show the detector header, aperture state and pressure,
arbitration verdict, the resulting frame marker, and the typed journal receipt.
An accepted bid may still be crowded out; the display must distinguish this from
entering a frame. Closed content stays withheld across telemetry, logs, tooltips,
and replay. Simulated provenance and the actually received text rendition remain
visible once admitted.

The sample should make three observations easy: closure makes no rendering call;
reopening samples the present instead of releasing a backlog; contact pressure
falls after a fresh observation enters the frame. Use a shared scenario clock
and explicit completion signals, so a button advances a settled step rather than
merely changing a displayed timestamp.

## Next sample: connections that find one another

As [port contracts](schema-guided-connections.md) arrive, expose them on the
existing structure/Plenum selection surface. Selecting a port should show its
current bindings and eligible partners, plus explanations for incompatible or
unavailable endpoints. Clearly distinguish a suggested edge from an installed
edge and from traffic that actually crossed it.

For the spatial phase, a small sample can introduce a new source, show which
nearby compatible faculty it selects, and later show one missing faculty being
grown from an allowed archetype. Ordinary camera movement changes only the view.
Any control that changes runtime position or topology is an explicit experiment
command, with the resulting runtime state reflected back into Studio.

## Scope and completion

The first implementation needs the membrane sample and its controls; connection
inspection follows the schema work. A generic visual programming editor, a
separate demonstration site, and a parallel graph renderer are not prerequisites.

Dry samples are explicitly labeled and isolated from resident homes. Reset and
time manipulation belong to those samples, not to an attached resident's life.
Live experimentation continues through Studio's existing lifecycle controls and
the [resident recovery plan](studio-resident-lifecycle-recovery.md).

The first slice is complete when a user can select the sample in Studio, step
through closure and fresh contact, and see the same trace that its automated
scenario asserts. Reloading the viewer should recover the sample's current state
without replaying old commands or presenting missed events as new experience.
