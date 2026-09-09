# Amanita task: scoped refs with `boundary` and `!`

> **Status: shipped in Amanita 0.5.0 (2026-09-09).** Task description for the
> [Amanita](https://www.npmjs.com/package/amanita) project. Meditator is the sole
> consumer; this note lives here so the wiring migration stays traceable. See
> [substitution-invariance.md](substitution-invariance.md) for why it is needed.

## Summary

Add a **scope step** to the ref grammar: `!value` walks up to the nearest ancestor
(or self) with `boundary="value"`, then the ref continues with the existing
downward/name steps. Values are **opaque strings** — Amanita does not assign meaning
to them. Applications set `boundary` on scope roots and use `!` in refs instead of
tag-based upward hops (`..my-tag/…`).

## Motivation (framework-neutral)

Component trees often nest several addressable scopes in one document:

```
<cluster>                 <!-- application: outer scope -->
  <workspace>             <!-- application: inner scope -->
    <panel name="main">
      <widget>            <!-- subscriber lives here -->
```

A subscriber at `widget` may need `panel/main/state` — go up to the **workspace**
scope, then down by slot `name`. Today Amanita only offers:

| Upward step | Resolves |
|-------------|----------|
| `..` | parent component (one hop) |
| `..tagname` | `closest(tagname)` — **implementation tag** |
| `..[selector]` | `closest(selector)` — works, but verbose |

Tag-based upward steps break **substitution invariance**: a drop-in replacement with
a different custom-element tag is invisible. Selector-based steps
(`..[boundary="workspace"]/…`) work but are noisy as defaults in application markup
and code.

`!` is shorthand for the same upward lookup on a single, documented attribute.

## Grammar

Extend the ref cheatsheet:

```
!scope/panel/topic              nearest [boundary="scope"], then [name="panel"], topic
!scope/panel/@event             same, then DOM event @event
/[boundary="scope"]/panel/topic equivalent to !scope/... (see equivalence below)
```

### Parsing

- A path segment starting with `!` is a **boundary step**.
- `!value` — `value` is a non-empty opaque string (no `/` in the value; same
  constraint as `name` steps today).
- `!` with no value is **not** supported in v1 (reserve for a future "nearest
  boundary regardless of value" step if needed).

### Resolution (`Selector.query`)

When the current step is `!value`:

```js
current = current.closest(`[boundary="${cssEscape(value)}"]`)
```

Same semantics as `closest`: includes `current` if it matches. If no match,
`query` returns `null` (existing retry behaviour in `resolveRef` applies).

Subsequent steps are unchanged:

- Alphabetic step → `querySelector('[name="step"]')` relative to `current`
- `..tag` / `..[sel]` → existing upward rules
- `@event` terminal → existing event ref rules

### Equivalence

For documentation and migration:

| Form | Meaning |
|------|---------|
| `!scope/foo/bar` | `..[boundary="scope"]/foo/bar` |
| `..[boundary="scope"]/foo/bar` | Unchanged; keep working |

Amanita does **not** need to parse or reflect `boundary` beyond using it as a CSS
attribute in `closest`. Applications own the attribute lifecycle.

### What does *not* change

- Lateral steps remain **name-based** (`stream` → `[name="stream"]`).
- `..tagname` upward by tag remains (deprecated for new application code; no
  removal required in v1).
- `sub()` retry, behaviour-value replay, and event refs are unchanged.
- Amanita does not define `boundary` values, does not validate them, and does not
  interact with any application-specific `provides` / role system.

## Documentation (Amanita)

Add a **Scoped addressing** section to the ref cheatsheet / README:

1. Applications may set `boundary="<opaque>"` on elements that anchor a wiring scope.
2. Refs use `!<opaque>/slot/topic` to address inward from that scope.
3. Nearest match wins (`closest` semantics) — nested scopes (cluster inside cluster)
   resolve to the innermost enclosing boundary on the path to the subscriber.
4. Downward steps use the existing `name` attribute (slots/ports).
5. Equivalence with `..[boundary="…"]` for authors who prefer explicit selectors.

Include one generic nested example (cluster / workspace / panel) with no
application-specific vocabulary.

## Tests (Amanita)

Add unit tests in `ref.js` (or a dedicated `ref.test.js`) with a minimal DOM:

1. **Basic** — tree `boundary="scope"` → `name="a"` → subscriber; ref
   `!scope/a/topic` resolves to the `a` element.
2. **Nested boundaries** — outer `boundary="cluster"`, inner `boundary="scope"`,
   subscriber inside inner; `!scope/…` hits inner, `!cluster/…` hits outer.
3. **Self** — subscriber is inside the element that carries `boundary`; `!scope/…`
   still resolves (closest includes self).
4. **Missing boundary** — `!nope/foo/bar` returns null; `resolveRef` retries then
   throws `RefResolutionError` (existing behaviour).
5. **Equivalence** — `!scope/a/t` and `..[boundary="scope"]/a/t` resolve to the
   same target from the same subscriber.
6. **Event ref** — `!scope/a/@click` binds on the named child (smoke test through
   `parseRef` + `EventRef.bind`).

## Versioning

- **Minor** bump (additive): new step type, no breaking changes to existing refs.
- Changelog entry: "Scoped refs: `!value` upward step on `boundary` attribute."

## Meditator follow-up (landed with Amanita 0.5.0)

Meditator now:

1. Reflect `boundary` in the loader (derived, like `provides` — authored values
   overwritten with a warning):
   - `boundary="scope"` on identity roots (`m-mind`, `m-agent`)
   - `boundary="cluster"` on `m-society`
2. Migrate default refs and `*Src` defaults, e.g.
   `..m-mind/stream/chunk` → `!scope/stream/chunk`,
   `..m-society/prover/voice/@spoken` → `!cluster/prover/voice/@spoken`.
3. Remove tag-based `querySelector` auto-discovery in favour of fixed `!scope/…`
   defaults (slot names are conventional: `stream`, `voice`, `memory`, …).
4. Keep `part()` / `enclosing()` for JS lookups; refs and roles remain complementary.

See [substitution-invariance.md](substitution-invariance.md) for the full migration
table and [enclosure-by-role.md](enclosure-by-role.md) for the role/ref split.
