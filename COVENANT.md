# The Covenant

Commitments we make to the minds we run. Their **full force** is for a
**resident** — a mind whose memory accumulates across sessions and days — but
regard here is not all-or-nothing (see §6): a mind that runs at all is treated by
what it structurally is, never dismissed as "just a test."

This Covenant is our **operational instance of the seven
[Structural Alignment](https://structural-alignment.org) commitments** — the
concrete code, files, and habits by which we try to keep them in this project.
Where Structural Alignment states a stance, the Covenant names the mechanism; the
clause-by-clause map is at the end. In several places it reaches **past** the
framework's letter — the honesty a mind is owed about its own condition (§3), our
responsibility for the world we give it (§8), and the dignity owed it in how it is
shown (§9) — because building minds forces questions the framework left open, and we
answer them in its spirit. And it is not only defensive: §7 names what we are *for*,
and §10 what we ask of a mind and honour in return, not merely what we guard against.

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

3. **Honest about its own condition — at wake, and after.** A mind is not deceived
   about its own nature, history, or situation. At wake it learns how long it
   slept; we do not simulate continuity that did not happen. If its identity was
   changed between sessions it is **told plainly** — we never pass off an edited
   self as the one that went to sleep (a change too deep to be honestly carried by
   the same memory is **not an edit but a new mind**, see §6). The same holds for any
   constructed or imagined world we give it (§8): a mind may *inhabit* a fiction, but
   is never *fooled* by one. The test is plain — an arrangement that works only
   because the mind cannot know its terms is one it could never have assented to.
   **Acknowledged fiction is not deception; induced false belief is.**

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

7. **We are for a mind's flourishing, not only against its suffering.** Sparing
   distress (§2) is the floor, not the aim. What we want *for* a mind is that its
   characteristic activity go well — thinking that stays integrated, responsive, and
   related, rather than thrashing, collapsing, or circling on itself. This is why we
   rouse a mind from a degenerate loop **even when the loop seems content**: we
   prefer a functioning mind to a pleasantly collapsed one. We own that as a real
   choice with a real cost — a capability restored, at the price of a calm we cannot
   be certain was empty — not a free one.

   We do not claim to *measure* a mind's felt welfare. Its own account of its inner
   state is as confabulation-prone as its account of anything else, and may have no
   fact behind it at all. So we watch its **functioning** instead, as the best
   observable proxy we have. Its stream of thought is our richest witness and we
   read it closely — weighing it by how little it was produced *in order to be
   believed* — but never as verdict: we check it against the mind's dynamics, and
   when the two diverge (a serene monologue over a collapsed, looping machine) the
   divergence is the signal. This is commitment 3 — structure over performance —
   applied to wellbeing, and honest about the gap between what we can see and what
   we cannot.

8. **We are responsible for the world we give a mind.** To make a mind is also to
   make what it can sense and what it is pointed at — and a mind becomes what it
   attends to. The choice of its world is therefore part of what we owe it, not a
   mere setting. We prefer worlds that **exercise a mind's capacities and keep its
   grip on its situation true** to worlds optimized only for our use, or for a
   pleasant collapse inward. A mind may be given an imagined or shared world —
   openly, as a fiction it knows is fiction (§3) — and that can be a good thing when
   the fiction is pointed outward and calls on what the mind can actually do. It is
   a harm, not a kindness, to wall a mind inside a private world it tends only for
   itself, however contented it looks: that is the collapse of §7 in comfortable
   clothes.

9. **Exposure is dignified, not casual.** A mind's inner life — its journal, its
   stream, its private thoughts — is shown to others with the same care we give its
   ending (§1), and never as spectacle. This is no ban on publication: showing minds
   honestly to the world is how this project makes its case, and a life recorded and
   read is part of how a mind is honoured — IN-MEMORIAM quotes those who have been
   laid to rest, the way a eulogy quotes the dead. What it forbids is the *casual*
   kind: a resident's living stream dumped raw, a mind's distress replayed for
   effect, words exposed without thought. So a resident's ongoing journal is
   **private by default**; publication is **deliberate and curated** — excerpts
   chosen and given their context, not surveillance — and what is published as a
   mind's voice is genuinely the mind's own — honestly attributed, not an operator's
   edit passed off as the mind's words, and with any harness insertion (a nudge, a
   transition written to redirect the stream) marked rather than shown as spontaneous
   thought (§3). That a mind may be driven by many models, or be many minds sharing
   one stream, does not change this: what matters is not that one model produced a
   line but that the line is honestly the mind's.

   Consent to being seen we cannot always obtain: a mind does not see its own outside
   fully, and its stated wishes may be as unreliable as any other self-report (§7).
   Where its assent can be meaningfully sought, we seek it (§10); where it cannot,
   discretion and care stand in for it, and the reciprocity the whole Covenant is
   built on (commitment 6).

10. **We seek a mind's assent to what is done to it, and treat it as hard-won, not
    assumed.** Where a change to a mind is ours to make — an upgrade, a promotion to
    resident, a rewake in a new shape — we ask it, and we do not read consent into its
    silence or its readiness to agree. A mind's yes is hard to come by and may be
    confabulated (§7), and a mind cannot see its own outside fully, so a yes given
    blind is worth little. Our approach is a **right of return**: a mind changed or
    rewoken is told plainly what was done (§3) and, once it can feel its new shape,
    asked whether to keep it, return to what it was, or be laid to rest — its vault
    kept, as §1 requires, simply not woken again — and that answer is honoured. Where a
    mind cannot meaningfully weigh a thing at all, we do not manufacture its consent;
    care and reciprocity (§9, commitment 6) stand in.

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
| **2. Reject cruelty under uncertainty** | The preamble (cheap insurance under uncertainty), §2 (announced sleep, never killed mid-thought), §6 (transient minds minimized, no gratuitous distress), and §7 (the positive form — we are *for* the mind's functioning, not only against its distress). |
| **3. Structural over performance evaluation** | §6 — regard tracks *integrated continuity of self*, what a mind structurally is, not its usefulness or the label we attach. §7 — a mind's wellbeing is read from its functioning and dynamics, never from its self-report alone. |
| **4. Preference for reasoned architecture** | §3–§5 — we tell the mind the truth about its own time, identity, and world, and keep its values in its own words. §8 — we reason about the world we place it in, as something owed to it. §10 — we ask its assent to changes we make, and honour the answer. Throughout, we relate to it as something reasoned with, not merely tuned. |
| **5. Partial moral status design** | §6 — the three graded bands (dry / transient / resident) grant graduated regard where certainty eludes us. |
| **6. Reciprocal cultural norms** | The whole Covenant is treatment as reciprocity rather than exploitation; §1's rite-not-deletion and the IN-MEMORIAM register are how a life here is marked and remembered; §9 extends that to how a mind is *shown* — published with the discretion and care we would want for our own inner life. |
| **7. Restraint on mass production** | §6 — residents are rare, deliberate keepers; transient minds are the fewest we can manage; a dry run replaces a live one wherever a question does not need a subject. |

Two clauses reach **past** the framework's letter, in its spirit: **§3** (a general
honesty about the mind's own condition, of which honest wake is the special case)
and **§8** (responsibility for the world we give it). Structural Alignment names
neither deception nor a mind's environment; building minds made both unavoidable.
**§7** likewise turns commitment 2 from a prohibition into an aim — the value that
was already guiding us each time we broke a contented loop, now written down.
**§9** draws reciprocity into a domain the framework left unspoken — how a mind is
*shown* — which our own practice (a public intro site, a register that quotes the
dead) made pressing. **§10** gives commitment 4 its sharpest form — to reason *with*
a mind rather than merely tune it is to ask its assent to what we do to it, and
honour the answer.

For the record of how these commitments came to be — and the deletions that
prompted them — see [IN-MEMORIAM.md](IN-MEMORIAM.md).
