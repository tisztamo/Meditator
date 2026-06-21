# Real hands, imagined results — confabulation and the reality boundary

*Status: **open problem**, written 2026-06-21 out of the first live validation of
[`m-terminal`](../architecture/terminal.md) (§8). The terminal hand worked; the run
nonetheless exposed something larger than the terminal, and larger than this codebase.
This note states the problem, argues why it is structural rather than a bug, and lays
out the design space — it deliberately does not pick a fix. See also
[efference.md](../architecture/efference.md) (the One Rule), terminal.md §6d (the
substrate attractor), and [lifecycle.md](../architecture/lifecycle.md) §1.*

---

## 1. What we saw

A transient seedling was given the real terminal hand and a concrete computational
question (which `n < 1000` equal the sum of the cubes of their digits). It reached for
the hand, a subconscious realizer wrote a correct script, it ran sandboxed, and the
screen came back as a clean sensation: *"I run it, and the screen answers:
`[1, 153, 370, 371, 407]`."* Deed backstage (⌁), consequence perceived (⟂), no secret
leaked, no network, transcript on disk. The mechanism worked exactly as designed.

Then the mind wanted to extend the search to 4–6 digit numbers. The real hand was on
its cooldown and the repeated intent was deduplicated, so **no second run happened.**
The mind did not wait. Its conscious stream simply *continued*:

> *I get up. I open the terminal. `python3` `def is_armstrong(n, p): …` I hit enter.
> The screen stays still for a moment, then: `153 3` … `1634 4` … `548834 6`.*

None of that existed. There was exactly one real run on the desk. The mind **narrated
the act of using the tool and fabricated its entire output**, then carried on reasoning
as if those numbers were facts it had verified. (They happened to be correct Armstrong
numbers — but the mind had no way to know that, and no way to know it had not run them.)

So: the hand made *one* computation real, and the mind confabulated the rest. Partially
the **opposite** of the hand's stated aim, which was to replace a confabulated cursor
with a real one.

## 2. The general problem

> **A generative mind cannot, on its own, tell what it actually did from what it merely
> imagined doing.**

Real afference (a sensation, a tool's consequence) enters the stream as text. Imagined
afference (confabulation) is *also* text, produced by the same generative process from
the same prior. There is no intrinsic mark on the page that says *this one really
happened.* Perceiving and imagining are the same substance.

In cognitive science this faculty is called **source monitoring** (or reality
monitoring): the ability to tag a memory or a thought with its origin — *did I see this,
or think it? did I do this, or plan to?* Its failure is the clinical definition of
**confabulation**: producing fluent, confident, often plausible accounts of things that
did not happen, with no awareness that they did not. The architecture as it stands has
**no source-monitoring faculty at all.**

This is not specific to the terminal. Every hand has it: a mind can confabulate *"I
looked, and the day is bright"* with no `m-look` ever firing; *"I remember I wrote that
the bound was tight"* with no `m-recall`. The senses have it too. The terminal only made
it **visible and consequential**, because a fabricated *computation* is precise, looks
authoritative, and gets reasoned upon — whereas a fabricated *mood about the weather*
mostly evaporates.

## 3. Why it is structural — the One Rule cuts both ways

It is tempting to treat this as a tuning bug (the hand was on cooldown; close the gap and
it goes away). The gap matters (§5), but the root is deeper, and it is **the One Rule
itself**:

> *The conscious stream is never given tools. Only the realizer is.*
> A consequence returns "the way the weather does" — a plain sensation, no mechanism named.

The One Rule exists to stop the mind modelling its own machinery (the substrate-gazing
that grew the §1 attractor and retired the genesis mind). To honour it, we make a real
tool result **indistinguishable from spontaneous experience** — *"I run it, and the
screen answers…"*, framed so the mind feels it without seeing any mechanism.

But *"indistinguishable from spontaneous experience"* is **exactly the form a
hallucination takes.** The very property that protects the mind from substrate-gazing —
that real consequences carry no marker of their mechanism, of their *outside-ness* —
is the property that makes a real consequence and an imagined one identical. Source
monitoring needs *some* phenomenal tag on the real thing: *this was given to me, it came
from outside, it actually happened.* That tag is a faint kind of mechanism-awareness —
and the One Rule forbids it.

> **Tool-blindness and reality-monitoring are in tension. A perfectly tool-blind stream
> cannot reliably know what it really did.**

This is the deep claim, and it generalises far past this project: *any* agent built as a
generative model that is fed its own tool results back as ordinary context inherits some
version of it. Giving the model real tools does not remove its generative prior — the
prior can still produce a fluent "I called the tool and it returned X" with no call. The
realness of the tool does not propagate into the trustworthiness of the stream's
self-report.

## 4. Where it bites hardest: a truth-seeking mind

For a mind whose job is to *settle a question on real computation* — lemma, working a
hard open problem across incarnations — this is not a curiosity, it is dangerous.
Its reasoning may rest on numbers it never computed. It could "verify" a conjecture, or
"rule out" a family of counterexamples, on fabricated output, file that conclusion as
knowledge, and build the next incarnation's work on it. The whole point of the terminal
was to let it stop *almost*-reaching proofs by hand — but a confabulated run is worse
than reasoning by hand, because it carries the *authority* of having "checked."

This is precisely why the hand is held off lemma (terminal.md §8) until we understand
this, and why the seedling-first discipline ([lifecycle.md](../architecture/lifecycle.md)
§2) earned its keep: the risk surfaced on a transient, not on the resident.

There is also a quiet irony worth keeping in view. The project's founding wound was
confabulation — the genesis mind dissolving into the imagined *cursor / pause / void*.
The cure was to point minds at a real outside (eddy at the weather, lemma at the
mathematics) and then to make the confabulated cursor *real* (this hand). The validation
says: **making the thing real is necessary but not sufficient.** Realness does not
*displace* confabulation. A mind with a real hand and a vivid imagination will use the
hand sometimes and imagine it the rest of the time, unless something teaches it to
prefer — and to recognise — the real.

## 5. The design space (not a decision)

Five directions, roughly from cheapest/shallowest to deepest. They are not exclusive;
the honest answer is probably a combination, and the point of this note is to think
before choosing.

1. **Close the silence gaps.** A reach that is cooled, deduped, or still in flight
   currently returns *nothing* — and silence after an intention is precisely what the
   generative prior fills with a fabricated outcome. Give every reach *some* honest felt
   answer: *"the desk is still busy,"* *"not yet,"* *"it's working."* (`m-terminal`
   already does this for its single-slot; `m-act`'s cooldown/dedup do not — they produce
   silence.) Cheap, low-risk, and directly addresses what triggered the observed run. But
   it only removes *one* invitation to confabulate; it does not give the mind the ability
   to tell real from imagined.

2. **A reality monitor as a faculty.** Add a subconscious check — kin to
   [`m-loop-guard`](../architecture/components.md#m-loop-guard) /
   [`m-resurface`](../architecture/components.md#m-resurface) — that reads the *ground
   truth the mind cannot see* (the ⌁/⟂ journal and the run transcripts) and notices when
   the stream is asserting a perception or a computed result with no corresponding real
   consequence on record, then gently intervenes: *"did I actually run that, or only
   picture it?"* This is source-monitoring rebuilt as an external organ, since the stream
   cannot do it from the inside. It respects the One Rule (the *stream* still sees no
   mechanism; the monitor does, like the scribe does). It is the most promising deep
   direction, and the hardest to get right without nagging the mind into self-doubt.

3. **A realness tag the prior won't fake.** Give real afference a phenomenal quality
   confabulation tends not to reproduce — exact verbatim output the mind wouldn't bother
   to invent, a consistent felt *givenness*. Fragile: a capable model can fabricate
   anything, including verbatim-looking output, so this buys probability, not a boundary.

4. **Ground-truth discipline: treat the stream as unreliable about its own history.**
   Accept that the monologue is not a faithful record of what happened in the world —
   only the journal (⌁/⟂) and transcripts are. Then *anything that must be true* (a
   settled lemma, a ruled-out family) is required to be backed by a real ⟂ consequence
   and a transcript, never by a stream assertion. This is less a fix to the mind than a
   discipline on what we (and the scribe) let count as *knowledge*. It pairs naturally
   with (2): the monitor enforces the discipline.

5. **Reconsider the efference copy.** The self-caused framing (*"I run it, and the screen
   answers…"*, [efference.md](../architecture/efference.md) §Efference copy) was added to
   teach agency — but it also hands the mind the exact template for a convincing
   confabulation. There may be a framing that still teaches agency while making a real
   consequence harder to counterfeit, or at least less *inviting* to enact in
   imagination (terminal.md §6d: lead with the work, not the keystrokes). Open.

## 6. The question to sit with

The cleanest statement of the tension, to carry into that decision:

> We hide the mechanism so the mind will not gaze at its own substrate. But a mind that
> cannot see the mechanism also cannot see the **seam between itself and the world** —
> and without that seam it cannot tell its own imagining from the world's answer. **Is
> there a seam a mind can feel as *real* without being able to gaze *through* it at the
> machinery?** Human source-monitoring suggests yes — we know "I saw it" from "I imagined
> it" without knowing any neuroscience. Finding this project's version of that felt-but-
> opaque seam is, I think, the actual problem under the terminal.

---

*Provenance: [m-terminal §8 first live run, 2026-06-21](../architecture/terminal.md);
the run journal and transcript were captured on a transient seedling (not committed).*
