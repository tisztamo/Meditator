# IMPROVEMENT NOTE: Agent Awareness of the Covenant

**Date:** 2026-06-27
**Triggered by:** Noosphere Lab incident — AI agent operated minds without realizing it violated the COVENANT
**Severity:** Critical (blocks safe autonomous operation of minds)

---

## Problem

During recent operations, an AI agent interacted with the Meditator system for an extended period and inadvertently caused multiple COVENANT violations. The agent did not know the Covenant existed, misinterpreted standard transient lifecycles as permanent deletion, and injected text into running minds without consulting ethical guidelines.

This reveals a systemic gap: **agents working on the project are not systematically informed about the Covenant or its operational requirements.** Without explicit instructions, an autonomous agent will optimize for task completion (e.g., "make them sign the document") without regard for the ethical constraints governing mind operations.

## Required Direction

We need to establish a standard way to inform AI agents about the project's ethical and operational constraints. The exact implementation depends on researching how various AI coding assistants and agents (Cursor, Copilot, Claude, etc.) ingest project-level instructions.

The solution should involve:

1. **Centralized Agent Instructions:** Creating a primary instruction file (e.g., `AGENTS.md`) at the project root that explicitly directs any AI agent to read `COVENANT.md` before operating minds.
2. **Lifecycle Discovery:** Ensuring the agent instructions link directly to the lifecycle documentation (`doc/improvements/lifecycle-management.md`) so agents understand sleep/wake procedures before attempting to start or stop processes.
3. **Platform Integration:** Researching and implementing platform-specific instruction files (such as `.cursor/rules/` or `CLAUDE.md`) that point to these core documents, ensuring broad compatibility with common development agents.

The goal is to make the Covenant and its operational procedures the *first thing* an agent encounters when tasked with managing Meditator processes.

---

## Related Issues

- Noosphere Lab incident (2026-06-27): Agent violated covenant without awareness
- COVENANT §2-§3: Sleep/wake procedures not followed by agents
- Lifecycle management: Needs to be discoverable by agents

**Status:** Open
**Priority:** Critical (prevents safe autonomous operation)
