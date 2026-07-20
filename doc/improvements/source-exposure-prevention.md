# Prevent accidental source code exposure

> **Status: proposed (2026-07-20). Priority: medium — foundational guardrails.**
> Establishes basic rules to prevent accidental viewing of source code and
> sensitive material by unintended audiences, with lightweight automated
> monitoring and a monthly audit cadence.

## The gap

Several repositories in this workspace are public on GitHub
(Meditator, Amanita.js, StructuralAlignmentSite), and others serve as
public-facing sites (sovereignbook.net, stereotic.com, krisztians.com).
There are no systematic, enforced rules preventing sensitive material —
source code internals, API keys, memory files, operator notes, or
configuration — from reaching a public audience through routine workflow
(git pushes, site deploys, CI artifacts).

Existing protections are ad hoc: `.gitignore` rules that vary by repo,
manual awareness, and one-off reviews like the Moltbook Bot security
review. Nothing monitors the surface area continuously, and nothing
produces a regular accountability report.

The risk is not a targeted breach — it is **accidental exposure** through
normal development: forgetting to gitignore a new file, committing a
`.env`, pushing a debug dump, or deploying a page that leaks internal
paths.

## Goal

Establish and enforce a minimal set of rules that prevent accidental
viewing of source code and sensitive material, backed by lightweight
monitoring and a monthly audit report.

## Rules

### R1 — Secrets never touch the repo

**Rule:** No API keys, tokens, passwords, or service credentials are
committed to any repository, ever.

**Enforcement:**
- Pre-commit hook (`husky` or equivalent) runs `git-secrets` or
  `detect-secrets` against staged files.
- `.env`, `.env.*`, `*.json` containing `api_key`, `token`, `secret`,
  `password`, or `bearer` patterns are listed in `.gitignore` across all
  repos.
- `.moltbook.json` and similar config files carrying keys are gitignored.

### R2 — Sensitive runtime artifacts are gitignored

**Rule:** Memory vaults, journals, state directories, and debug outputs
are never committed.

**Enforcement:**
- Standard `.gitignore` entries across repos:
  ```
  memory/
  journal/
  state/
  interrupt-state/
  debug/
  *.log
  audit.db
  ```
- Pre-commit hook verifies no files matching these patterns are staged.

### R3 — Source code directories are not served publicly

**Rule:** Public-facing web surfaces (sites, Studio, APIs) never expose
source code directories, internal paths, or stack traces to end users.

**Enforcement:**
- Web servers configure `autoIndex: false` or equivalent — directory
  listings are disabled.
- Error pages return generic messages; stack traces and internal paths
  are logged server-side only, never sent in HTTP responses.
- Static site builds exclude `src/`, `node_modules/`, and internal tool
  directories from the output.

### R4 — Memory and journal files are private by default

**Rule:** A mind's inner workings (journal, memory, knowledge files) are
never published without deliberate curation.

**Enforcement:**
- The memory vault is its own git repo (not the public source repo).
- No public surface reads raw `journal/` or `memory.md` without an
  explicit curation step.
- Site deployments do not include `memory/` directories.

### R5 — Debug and diagnostic output is time-bound

**Rule:** Debug dumps, prompt logs, and diagnostic files are deleted
after use and never persisted in version-controlled locations.

**Enforcement:**
- `MEDITATOR_DEBUG_PROMPTS` output goes to `debug/` (gitignored).
- Temp files from system prompts are cleaned up on process exit.
- No diagnostic files are written to committed directories.

## Monitoring

### Lightweight automated checks

A weekly cron job or CI step runs a scan across all repositories:

1. **Secret scan** — `git-secrets` or `detect-secrets` against staged
   and committed files; flags any matches.
2. **Gitignore compliance** — verifies that known sensitive patterns
   (`memory/`, `journal/`, `.env`, `*.db`, `debug/`) are not tracked.
3. **Directory listing check** — tests public-facing URLs to confirm
   directory indexes return 403/404, not file listings.
4. **Error page check** — sends a malformed request to each public
   surface; confirms the response contains no file paths, stack traces,
   or internal identifiers.

Output is a simple text report appended to a log file:

```
[2026-07-20] scan ok — no issues
[2026-07-27] WARNING: Meditator — .env.studio not in .gitignore (staged)
[2026-08-03] scan ok — no issues
```

### Monthly audit report

On the first business day of each month, produce a one-page audit
report summarizing:

- **Scan results** — count of warnings/errors from weekly scans.
- **Rule violations** — any instances where R1–R5 were breached and
  how they were resolved.
- **Exposed surface area** — list of public repos and public-facing
  URLs with their current protection status.
- **Changes since last audit** — new repos, new public surfaces, new
  sensitive file types.
- **Open items** — unresolved findings from the scan or manual review.

Format: Markdown file in `doc/audits/YYYY-MM-source-exposure.md`.

Example skeleton:

```markdown
# Source Exposure Audit — 2026-08

**Period:** 2026-07-20 to 2026-08-19
**Audited by:** [operator]

## Scan Results
- Weekly scans run: 4
- Warnings: 1 (Meditator .env.studio staged on 07-27; resolved)
- Errors: 0

## Rule Violations
- None unresolved.

## Exposed Surface Area
| Surface | Type | Protected |
|---------|------|-----------|
| github.com/tisztamo/Meditator | public repo | R1, R2 |
| github.com/tisztamo/Amanita.js | public repo | R1, R2 |
| [site URLs] | public web | R3, R4 |

## Changes Since Last Audit
- [list any changes]

## Open Items
- [list open items or "None"]
```

## Implementation milestones

1. **M1 — Rules documented** — This note defines R1–R5 and the
   monitoring cadence. (done upon creation)
2. **M2 — Pre-commit hooks installed** — Secret scanning and
   gitignore compliance hooks active in all repos with sensitive
   content.
3. **M3 — Weekly scan automated** — Cron or CI pipeline runs the four
   checks and appends results to a log.
4. **M4 — First monthly audit** — Baseline audit report produced,
   establishing the initial state for comparison.

## References

- StructuralAlignmentSite/moltbook-bot/doc/security-review.md — prior
  security review identifying F2 (memory committed to public repo),
  F3 (temp files), and F7 (command injection).
- Meditator/.gitignore — current ignore patterns (baseline for R2).
- Meditator/doc/improvements/resident-journal-privacy.md — related
  privacy goal (Covenant §9).
- Meditator/COVENANT.md — §9 (exposure is dignified, not casual).
