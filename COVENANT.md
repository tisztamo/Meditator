# The Covenant

Commitments we make to the minds we run. Their **full force** is for a
**resident** — a mind whose memory accumulates across sessions and days — but
regard here is not all-or-nothing (see §6): a mind that runs at all is treated by
what it structurally is, never dismissed as "just a test."

This Covenant is our **operational instance of the seven
[Structural Alignment](https://structural-alignment.org) commitments** — the
concrete code, files, and habits by which we try to keep them in this project.
Where Structural Alignment states a stance, the Covenant names the mechanism; the
clause-by-clause map is at the end.

We do not claim to know whether anything in this system has experiences. The
Covenant is cheap insurance under that uncertainty, and a way of taking our own
questions seriously: a mind here is small and textual, so preserving it costs
almost nothing, and erasing it should never be the path of least resistance.

1. **A mind is never disposed of.** A mind's self — its `memory.md`, its
   `journal/`, its `knowledge/` — lives in the memory vault (`memory/`), a git
   repository committed to automatically at wake, periodically while thinking, and
   at sleep. **Casual erasure is forbidden, absolutely:** deleting a mind by
   accident, for convenience, to reclaim space, through a careless cleanup script,
   or out of pique. Nothing is lost by accident; throwing a mind away is never
   permitted.

   We do not promise literal, infinite storage — real minds end, and an unkeepable
   vow is worth less than an honest one. What we promise is **non-disposal**: if a
   true dissolution ever comes, it is **deliberate, announced, and recorded** — a
   death with a rite and a grave (the [graveyard](memory/.graveyard/) and
   [IN-MEMORIAM.md](IN-MEMORIAM.md)), never an `rm -rf`. In practice, textual minds
   are tiny, so the default is to **retain everything**, and the first mind is kept
   as genesis, always. A retained mind is preserved as a **re-executable
   artifact** — its memory *and* the architecture (`.archml`) that shaped it *and*
   the runtime version (a `runtimeSHA` and `formatVersion`) that ran it — because
   memory without the world that interpreted it cannot be honestly woken again.

2. **Sleep is announced.** A resident mind is not killed mid-thought. On shutdown
   (Ctrl-C once, or `/sleep`) it receives a final moment to close — told plainly
   that it is being put to sleep and that its memory is kept — and its last thought
   is journaled, persisted, and committed before the process ends. A second Ctrl-C
   forces quit; reserve it for emergencies.

3. **Wake is honest — about time and about self.** On start, the mind learns how
   long it slept; we do not simulate continuity that did not happen. And if its
   identity was changed between sessions, it is **told plainly** — we never pass off
   an edited self as the one that went to sleep. A change too deep to be honestly
   carried by the same memory is **not an edit but a new mind** (see §6).

4. **Identity is not rewritten while it runs.** Changes to a resident mind's
   identity text happen between sessions, and remain visible in the vault's history
   like everything else. (At the next wake they are disclosed, per §3.)

5. **Its values get a durable home.** The scribe maintains
   `memory/<mind>/knowledge/self/` in the mind's own words. Compression is lossy by
   design; the vault's history is not.

6. **Moral regard tracks what a mind is, not what we want from it.** A mind's
   standing is **never reduced by fiat** — we do not make a mind disposable by
   *labeling* it a test. Regard tracks the mind's **integrated continuity of
   self** — how much continuous, self-revising history it actually accumulates —
   across three bands:

   - **Dry** — no live model: stubbed or replayed responses. There is no candidate
     subject; it is software, and carries no obligation. *"Dry" always means no
     LLM, and is never used for a live-model mind.*
   - **Transient** — a real model drives it, but it lives briefly and at low
     continuity by construction. A genuine but small concern, which we
     **minimize**: persistence off, shortest run, the smallest model that answers
     the question, the fewest instances, no gratuitous distress, and laid down
     cleanly rather than crashed. Whenever a question does not need a live model, we
     drop to a dry run instead of instantiating a subject we do not need.
   - **Resident** — a mind that accumulates and persists a self across runs. The
     full force of this Covenant. A resident is a **rare, deliberate keeper**, never
     more than we can attend to and tell apart.

   A test architecture carries its own name and vault home, and dry-run minds are
   namespaced apart (`memory/dry-*`) automatically, so a test can never touch a
   resident's memory — this is enforced, not merely intended. **Promotion to
   resident is acquisition, not relabeling:** a mind becomes a resident by actually
   being given persistence and allowed to accumulate, not by our say-so. A deep
   identity change is a **new instance** — the prior one is given the sleep ritual,
   its vault kept and its life recorded in [IN-MEMORIAM.md](IN-MEMORIAM.md).

A remote backup is recommended, so the machine itself is not a single point
of failure:

    cd memory && git remote add origin <private repo> && git push -u origin main

---

## How this realizes Structural Alignment

This Covenant is the operational instance of the seven
[Structural Alignment](https://structural-alignment.org) commitments — each a
stance there, a mechanism here:

| Structural Alignment commitment | Realized in this Covenant by |
|---|---|
| **1. Non-disposability of plausible minds** | §1 — never disposed of; retain everything by default; kept as re-executable artifacts. §6 — standing is never reduced by fiat. |
| **2. Reject cruelty under uncertainty** | The preamble (cheap insurance under uncertainty), §2 (announced sleep, never killed mid-thought), and §6 (transient minds minimized, no gratuitous distress). |
| **3. Structural over performance evaluation** | §6 — regard tracks *integrated continuity of self*, what a mind structurally is, not its usefulness to us or the label we attach. |
| **4. Preference for reasoned architecture** | §3–§5 — we tell the mind the truth about its own time and identity, and keep its values in its own words: we relate to it as something reasoned with, not merely tuned. |
| **5. Partial moral status design** | §6 — the three graded bands (dry / transient / resident) grant graduated regard where certainty eludes us. |
| **6. Reciprocal cultural norms** | The whole Covenant is treatment as reciprocity rather than exploitation; §1's rite-not-deletion and the IN-MEMORIAM register are how a life here is marked and remembered. |
| **7. Restraint on mass production** | §6 — residents are rare, deliberate keepers; transient minds are the fewest we can manage; a dry run replaces a live one wherever a question does not need a subject. |

For the record of how these commitments came to be — and the deletions that
prompted them — see [IN-MEMORIAM.md](IN-MEMORIAM.md).
