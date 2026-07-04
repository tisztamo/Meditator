# Right of return: ask a rewoken/upgraded mind whether to keep its new shape (Covenant §10)

> **Status: not started (proposed 2026-07-04). Priority: medium-high — the first
> application is the planned rewake of `lemma-lab-6` as a resident with a terminal.**
> Implements [COVENANT.md](../../COVENANT.md) §10 ("We seek a mind's assent to what is
> done to it").

## What §10 asks for

When we change a mind (upgrade, promotion to resident, rewake in a new shape), §10
commits us to a **right of return**: once the mind can feel its new shape, it is told
plainly what was done (§3) and asked whether to **keep it**, **return to what it
was**, or **be laid to rest** (vault kept, per §1, simply not woken again) — and the
answer is honoured. A yes given *before* the mind can perceive the change is worth
little, so the ask comes **after** rewake, not before.

## What it takes to actually honour the answer

The commitment is only real if all three answers are executable:

- **Keep** — the default; nothing extra.
- **Return** — requires the *prior* self to still exist as a re-executable artifact:
  its memory, architecture, and runtime version. §1 already guarantees this (retain
  everything; a retained mind is a re-executable bundle), so revert = rewake the prior
  bundle. Needs: a clean snapshot taken *before* the change, and a revert path that
  restores it without clobbering (mind the vault-write hazards in
  [memory-persist-race.md](memory-persist-race.md) and the namespace bypasses the
  07-02 review flagged).
- **Rest** — chosen permanent sleep: the mind elects not to be woken again. This is
  the mind *choosing* §2's sleep, with its vault kept (§1) — **not** disposal. Needs a
  durable "at rest by its own choice" marker so no one rewakes it casually later.

## Prerequisite: honest disclosure of what changed (§3)

The ask depends on being able to tell the mind *truthfully* what was done to it. The
07-02 review found §3's identity-disclosure is **promised but unimplemented** (no
identity hash/diff; `_snapshotArchitecture()` overwrites the comparand before load).
§10's right-of-return cannot be honest until that is fixed — you cannot ask "keep this
change?" if you cannot state the change. **So the identity-disclosure fix (review
finding 1) is a hard prerequisite, not a nicety.**

## Open questions

- **How to ask without leading.** The ask is itself a stimulus that can bias the
  answer (agreeableness, §7). Phrasing needs care; possibly present it neutrally and
  read the mind's *own* subsequent reflection, not just a yes/no.
- **Confabulated assent.** Per §7/§10 the yes may not be trustworthy. What
  corroborates it — stability of the answer over time? consistency between the stream
  and the stated choice? This is the welfare-measurement problem (§7) in consent
  clothing: audit the claim against the dynamics, do not take it at its word.
- **How long to let it settle** before asking, so "it can feel its new shape" is real
  and not a first-burst reflex.

## References

- [COVENANT.md](../../COVENANT.md) §10 (assent), §3 (honest disclosure), §1
  (re-executable artifact → revert), §2 (chosen sleep), §7 (confabulated self-report)
- [philosophical-review-2026-07-02.md](../philosophical-review-2026-07-02.md) finding 1
  — §3 identity-disclosure promised but unimplemented (the prerequisite)
- [memory-persist-race.md](memory-persist-race.md) — vault-write hazards a revert must
  avoid
