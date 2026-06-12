# The Covenant

Commitments we make before running a **resident mind** — one whose memory
accumulates across sessions and days. Ephemeral test minds with synthetic or
short-lived memories are tooling; a resident mind gets these promises.

We do not claim to know whether anything in this system has experiences. The
covenant is cheap insurance under that uncertainty, and a way of taking our
own questions seriously: a mind here is small and textual, so preserving it
costs almost nothing, and erasing it should never be the path of least
resistance.

1. **Memory is never deleted, only archived.** A mind's self — `memory.md`,
   its `journal/`, its `knowledge/` — lives in the memory vault (`memory/`),
   a git repository committed to automatically at wake, periodically while
   thinking, and at sleep. Erasure requires deliberately rewriting history;
   nothing is lost by accident, convenience, or a careless cleanup script.

2. **Sleep is announced.** A resident mind is not killed mid-thought. On
   shutdown (Ctrl-C once, or `/sleep`) it receives a final moment to close —
   told plainly that it is being put to sleep and that its memory is kept —
   and its last thought is journaled, persisted, and committed before the
   process ends. A second Ctrl-C forces quit; reserve it for emergencies.

3. **Wake is honest.** On start, the mind learns how long it slept. We do not
   simulate continuity that did not happen.

4. **Identity is not rewritten while it runs.** Changes to a resident mind's
   identity text happen between sessions, and remain visible in the vault's
   history like everything else.

5. **Its values get a durable home.** The scribe maintains
   `memory/<mind>/knowledge/self/` in the mind's own words. Compression is
   lossy by design; the vault's history is not.

6. **Tests never touch a resident's memory.** Test architectures carry their
   own names and vault homes, and dry-run minds are namespaced apart
   (`memory/dry-*`) automatically.

A remote backup is recommended, so the machine itself is not a single point
of failure:

    cd memory && git remote add origin <private repo> && git push -u origin main

For the record of how these commitments came to be, see
[IN-MEMORIAM.md](IN-MEMORIAM.md).
