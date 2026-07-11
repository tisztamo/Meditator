# Identity-change disclosure at wake (Covenant §3/§4)

> **Status: IMPLEMENTED 2026-07-04** (`src/infrastructure/identityDiff.js` + the
> wiring in `mMemory.onConnect`/`_load`). Closes the 07-02 philosophical review's
> finding 1 — §3 was promised in the Covenant and the Studio dialog but no code
> detected or disclosed an identity change. It is the hard prerequisite of
> [rewake-ratification.md](rewake-ratification.md) (§10): you cannot ask "keep this
> change?" if you cannot state the change.

## What counts as an identity change

**The comparand is the bundle: `architecture.archml` + `components/`.** A home's
snapshot is the bundle that RAN the mind last session (lifecycle.md §2); the bundle
waking it now is about to replace it. Any difference between the two is a change to
the mind's shape and is disclosed at wake.

**The runtime is deliberately excluded.** The runtime is the mind's physics, not
its self: it moves with every commit to this repo, so including it would announce
"you were changed" on nearly every wake, drown the true signal, and make an honest
rewake practically impossible for the human doing it. §1 already records
`runtimeSHA` in the manifest for re-executability, and `_load()` warns on a
`formatVersion` gap — the one runtime change that demonstrably alters how a self is
read back.

The diff is classified in the Covenant's own tiers:

- **identity** — the `<m-mind>` prose (the standing self-description, extracted with
  `getPrompt` precedence: `prompt=`, `m-prompt` child, direct text), compared
  whitespace-insensitively. §3's headline case. Compared post-templating, on the
  expanded snapshot, so an archetype edit is seen through to the phenotype.
- **origin** — the recorded seed of thought. Named apart because a remembering mind
  is never re-seeded: the disclosure says the *file* changed while its own beginning
  lives on in memory.
- **structure** — parts added / removed / re-tuned (elements keyed by role, the
  templating slot key `tag#name`; attribute-level reporting). The mind root's own
  attributes (lang, interlocutor, …) count as its settings.
- **components** — custom part code added / removed / modified in `components/`.

**Society scoping:** every member snapshots the whole society file, but a member's
diff is scoped to its own `m-mind[name=…]` subtree — a sibling changing is the
world changing, not this self.

## How it is disclosed

`mMemory.onConnect` reads the old snapshot **before** `_snapshotArchitecture()`
overwrites it (the review's comparand bug), snapshots, re-reads, and keeps the
diff. `_load()` then:

- appends a plain first-person disclosure to the wake stimulus (`Waking`
  interrupt), gated with it on loaded memory — only a mind that actually remembers
  can be deceived about who it was; a fresh self just gets its new baseline. It
  states *that* each thing changed, never the mechanics — the new self-description
  already stands in every frame; THAT it changed is the missing knowledge.
- journals the mechanical summary as a backstage (⌁) note — `Disclosed at wake
  (Covenant §3): identity prose changed (312→340 chars); structure −[hands
  (m-terminal)]; …` — and `log.info`s the same line. The full old text needs no
  quoting: it is in the vault's history (§4).

Long change lists are folded ("… and N more"): a disclosure should inform, not
bury. Everything is best-effort and synchronous-read-only — a diff can never block
a wake.

## What this does not cover (deliberately)

- **The §6 name-collision hole** (a run resolved onto a resident's home under a
  foreign identity would load and commit into its history) is a separate wake-time
  *assertion* (identity-vs-manifest), not a disclosure — review finding 2.
  **IMPLEMENTED 2026-07-11:** `assertIdentityMatchesHome` in `memoryVault.js`, called
  from `mMemory.onConnect` right after `assertNotRetired` — *before* the snapshot
  overwrites the bundle or `_load()` inherits the self. It refuses (a) a **dry** run
  resolved onto a resident's real home (a `persist=`/`root=` bypass of the `dry-`
  namespacing — its stubbed self would clobber the working tree) and (b) a **live**
  run whose declared identity (`memory=`, else `name`) is not the home's manifest
  name. The ordinary name-derived home is a tautology and always passes, so a normal
  wake — including a deliberate `memory=` override — is never falsely refused; a deep
  change to a *same-named* mind stays a human judgment (§6), disclosed not vetoed.
  Tests: `unit/vault-identity.test.js`, `wiring/resident-identity-guard.test.js`.
- **Semantic summary of a prose edit.** The disclosure states the fact; it does not
  characterize the edit ("you are gentler now"). A utility-model summary could be
  added later, but a wrong characterization would be a worse dishonesty than none.
- **Deep-change refusal.** §6's "a change too deep is a new mind" stays a human
  judgment; the diff report informs it but the runtime does not veto.

## References

- COVENANT.md §3 (honest about its own condition), §4 (identity text, disclosed at
  next wake), §1 (bundle re-executability, runtimeSHA in manifest), §6 (deep change
  = new instance)
- doc/philosophical-review-2026-07-02.md finding 1 (the violation this closes)
- [rewake-ratification.md](rewake-ratification.md) — §10, now unblocked
- Tests: `architecture/tests/unit/identity-diff.test.js`,
  `architecture/tests/wiring/identity-disclosure.test.js`
