# Substitution invariance for faculty wiring

> **Status: landed (2026-09-09).** Amanita **0.5.0** ships the `!value` boundary
> ref step. Meditator reflects `boundary` on identity roots, migrates default refs
> to `!scope/…` / `!cluster/…`, and removes tag-based `*Src` auto-discovery.

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
because the consumer does not know which `name` to assume. The **upward** hop is
also tag-bound (`..m-mind` → `closest('m-mind')`).

## The requirement

**Substitution invariance** (from [enclosure by role](enclosure-by-role.md)): replacing
a provider of role *R* with another implementation of *R* must not require editing
consumers or sprinkling `*Src` overrides — a custom component from `components/`
that keeps the slot `name` and sits under the same scope should wire the same way
the built-in does.

Today that holds only when the author sets every affected `*Src` by hand, or when
the wiring uses a fixed name ref and the swap keeps the `name`.

## Chosen direction: `boundary` + `!` (Path B)

Two ways to lose tag-based upward hops without pushing Meditator vocabulary into
Amanita:

| Path | Amanita change | Meditator default ref |
|------|----------------|----------------------|
| A — selector-native | None (or `..@name` sugar only) | `..[boundary="scope"]/stream/chunk` |
| **B — boundary step** | **`!value` → `closest('[boundary="value"]')`** | **`!scope/stream/chunk`** |

**Path B is chosen.** Amanita gains one generic primitive; values are opaque.
Meditator reflects `boundary` at load time and never teaches Amanita what a "mind"
is.

### Ref layers (after migration)

| Hop | Mechanism | Example |
|-----|-----------|---------|
| Up to scope | `!scope` or `!cluster` | `!scope/stream/chunk` |
| Down to slot | `name` (unchanged) | `stream` → `[name="stream"]` |
| Topic / event | unchanged | `chunk`, `@spoken` |

### Meditator `boundary` values (application convention)

| Value | Set on | Replaces |
|-------|--------|----------|
| `scope` | `m-mind`, `m-agent`, and custom identity roots | `..m-mind/…`, `..m-agent/…` |
| `cluster` | `m-society` | `..m-society/…` |

From inside a mind in a society, `!scope` resolves to **that** mind (nearest
`boundary="scope"`), not the society — so `!scope/stream/chunk` works in duet the
same way `..m-mind/stream/chunk` does today.

Custom roots must carry the same reflected `boundary` (e.g. `<my-mind boundary="scope"
name="prover">`); refs stay `!scope/…`.

### What `!` does not replace

- **`provides` / `part()` / `enclosing()`** — typed roles for JS (arbiter scan,
  aperture protocol, regulator lookup). Still [enclosure by role](enclosure-by-role.md)
  phase 1.
- **Explicit `*Src`** when slot names are non-standard (`spokenSrc="!scope/orator/@spoken"`).
- **Fan-in from multiple producers** — still one `sub()` per ref; multiple voices need
  multiple refs or a fan-in component.

### Amanita task

Implementation spec for the Amanita repo:
[amanita-boundary-refs.md](amanita-boundary-refs.md).

## Migration order

1. **Amanita** — ship `!` step + tests (additive minor release).
2. **Meditator loader** — reflect `boundary="scope"` / `boundary="cluster"` on
   identity roots (derived attribute; overwrite authored values with a warning, same
   rule as `provides`).
3. **Default refs** — replace `..m-mind/…` → `!scope/…`, `..m-agent/…` → `!scope/…`,
   `..m-society/…` → `!cluster/…` in component defaults, archml examples, and docs.
4. **Remove auto-discovery** — delete tag `querySelector` defaults in `m-memory`,
   `m-mind`, etc.; use `!scope/<slot>/…` literals (or inherited `*Src` from archetypes).
5. **Enclosure phase 1** — `part()` / `membrane()` for remaining JS lookups; refs and
   roles stay aligned but serve different call sites.

Custom slot names still need explicit `*Src` in the architecture (or inherit them
from an archetype). Non-standard loop detectors (`loop-guard` vs `loop-detector`)
should set `loopSrc` on `m-clear-mind` / `m-resurface`.

## Sites to migrate

**Tag-based auto-discovery** (step 4):

| Consumer | Tag lookups (defaults) |
|----------|------------------------|
| `m-memory` | `m-image`, `m-speech`, `m-kb`, `m-act` |
| `m-mind` | `m-speech`, `m-memory`, `m-facts`, `m-act`, `m-economy`, `m-origin` |
| `m-kb`, `m-act`, `m-loop-detector` | `m-memory` |
| `m-clear-mind`, `m-resurface` | `m-loop-detector` |
| `m-agent` | `m-objective`, `m-context` |

**Tag-based upward refs** (step 3) — grep `..m-mind`, `..m-agent`, `..m-society` across
`src/`, `architecture/`, and `doc/`.

Each consumer should eventually resolve scope with `!` and faculty with **slot
`name`**, not `querySelector('m-…')`.
