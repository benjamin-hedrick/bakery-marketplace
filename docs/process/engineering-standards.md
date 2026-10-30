# Engineering Standards

> **Status:** Current · rewritten 2026-10-30. Numbers and commands elsewhere (`docs/process/quality-gates.md`) are the source for gates.

## PR / review guidelines

- **Size:** a commit maps to one work item and says which. A branch and PR may group several related work items under one theme (`docs/process/branching-strategy.md`). If a PR is hard to review in one sitting, it is a signal the work item should have been split; the work-item template caps and categorizes references for the same reason.
- **What a reviewer checks:** every change traces to something: an ADR, a work item's acceptance criteria, or a named bug. "Looks right" is not a review criterion; "matches what the work item asked for, and matches the referenced ADR's decision" is. This is the discipline the ADRs use themselves (state assumptions, name the source).
- **Merge criteria:** the Definition of Done (`docs/process/definition-of-done.md`) is satisfied in full, including any per-item addition the work item specifies (for example `WI-CACHE-001`'s requirement that its contract-test suite merge before any dependent item starts). The Azure Pipelines check is a soft manual gate (ADR-0015), so the reviewer reads it.
- **Evidence:** a status of Done needs an evidence pointer on the spec banner. Report passed, failed, skipped and not-run results separately; do not describe anything as working that has not been run.

## Onboarding (for a new contributor, human or AI agent)

Start narrow, not broad. This project is organized so nobody needs to read the whole repository to contribute to one piece of it:

1. `docs/index.md` (where everything is, one page) and `docs/product/backlog/STATUS.md` (the status of every work item)
2. `docs/product/backlog/current-plan.md`: what is built and what is being worked on now
3. The work item you were assigned, and only its categorized References (Decisions, Interfaces, Environment, Test methodology, Business context), not the whole ADR set. A Ready item is written so you do not need the rest: that is context completeness (`docs/method/glossary.md`), and the Definition of Ready checks it.
4. If something feels missing once you start, that is a surprise, and the surprise rule applies (`docs/method/glossary.md`): write it down in `docs/product/backlog/PARKING-LOT.md` or, if it is durable, in the open-items register (`docs/method/register-item-template.md`). Do not work around it silently.

## Secure coding baseline

Per `docs/architecture/nfrs.md` §3.4: all Cosmos DB access uses parameterized queries through the SDK's query builder. No raw query string construction anywhere in the codebase. This is a hard rule, not a style preference, since it is the project's stated injection-protection baseline. Secrets never go in files (`CLAUDE.md`); `ENABLE_TEST_HOOKS` is never set outside tests.

## Explicitly not covered here

- Linter and formatter choice: decided 2026-10-28; see `docs/process/quality-gates.md`.
