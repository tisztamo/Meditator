# CLAUDE.md

## Commits

- **Commit each step of a multi-step refactor or plan separately.** When a step
  is done and verified, commit it before starting the next one. Don't let two
  steps pile up uncommitted in the working tree. For example, the message-rule
  migration gets one commit per step of the review's order of work
  (`doc/improvements/message-rule-async-review.md` §7).
- A step counts as verified when `bun run test` passes and, for message-rule
  steps, `bun run test:async` matches the updated baseline.
- Leave unrelated work in the tree (untracked experiments, the `experiments`
  submodule) out of a step's commit.
