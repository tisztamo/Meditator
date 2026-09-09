# Substitution invariance for faculty wiring

> **Status: proposed (2026-09-09).** The [decoupling migration](../architecture/decoupling.md)
> is complete for method reach-in, but auto-discovery defaults still key off
> implementation tags.

## The gap

[Decoupling](../architecture/decoupling.md) replaced sibling method calls with
pub/sub and overridable `*Src` refs. The default for each `*Src` is often built by
`querySelector('m-speech[name]')` (or `m-memory`, `m-act`, …), reading the
element's `name` and constructing `..m-mind/${name}/@spoken`. That fixes call
direction and makes the wire greppable when set explicitly, but the default still
requires the **built-in tag**:

- No matching tag → no subscription (silent skip).
- `<my-speech name="voice">` is not found; only an explicit
  `spokenSrc="..m-mind/voice/@spoken"` in the `.archml` wires it.
- `querySelector` returns one element; auto-discovery cannot fan in from multiple
  producers of the same role.

Hardcoded mind-relative refs such as `..m-mind/stream/chunk` are already
**name-based** on the faculty step (Amanita resolves `stream` as
`[name="stream"]`), so a templating slot swap (`<my-stream name="stream">`) works
there without an override. Auto-discovery is the outlier: it discovers by tag
because the consumer does not know which `name` to assume.

## The requirement

**Substitution invariance** (from [enclosure by role](enclosure-by-role.md)): replacing
a provider of role *R* with another implementation of *R* must not require editing
consumers or sprinkling `*Src` overrides — a custom component from `components/`
that `provides` the same role and keeps the slot `name` should wire the same way
the built-in does.

Today that holds only when the author sets every affected `*Src` by hand, or when
the wiring uses a fixed name ref and the swap keeps the `name`.

## Direction

[Enclosure by role](enclosure-by-role.md) is the proposed mechanism: classes declare
`static provides`, the loader reflects roles onto the DOM, and consumers resolve
providers with `enclosing('faculty')`, `part('source')`, or Amanita refs that step
by role (`..[provides~="mind"]/…`) instead of tag. Phase 0 landed for aperture,
faculty, and arbiter; phase 1 — migrating the `*Src` auto-discovery sites listed
in enclosure-by-role's [migration table](enclosure-by-role.md#migration-surface)
(`m-memory`, `m-mind`, `m-kb`, `m-act`, `m-loop-detector`, …) — is **not** done.

Until then, custom faculty implementations must set explicit `*Src` attributes in
the architecture (or inherit them from an archetype).

## Sites to migrate

The tag-based auto-discovery pattern appears in:

| Consumer | Tag lookups (defaults) |
|----------|------------------------|
| `m-memory` | `m-image`, `m-speech`, `m-kb`, `m-act` |
| `m-mind` | `m-speech`, `m-memory`, `m-facts`, `m-act`, `m-economy`, `m-origin` |
| `m-kb`, `m-act`, `m-loop-detector` | `m-memory` |
| `m-clear-mind`, `m-resurface` | `m-loop-detector` |
| `m-agent` | `m-objective`, `m-context` |

Each should eventually resolve the provider by **role** (and slot `name` where
there are several), not by `querySelector('m-…')`.
