# Engineering Standards

## PR / review guidelines

- **Size**: a PR should map to one work item (or one clearly-stated slice of one, for larger items). If a PR is hard to review in one sitting, it's a signal the work item should have been split — see the work-item template's own guidance on capped, categorized references.
- **What a reviewer checks**: every change traces to something — an ADR, a work item's acceptance criteria, or a named bug. "Looks right" is not a review criterion; "matches what the work item asked for, and matches the referenced ADR's decision" is. This mirrors the discipline used throughout this project's own ADRs (state assumptions, name the source).
- **Merge criteria**: Definition of Done (`docs/process/definition-of-done.md`) satisfied in full, including its per-item additions where the work item specifies one (e.g., `WI-CACHE-001`'s requirement that its contract-test suite merge before any dependent item starts).

## Onboarding (for a new contributor — human or AI agent)

Start narrow, not broad — this project is deliberately organized so nobody needs to read the whole repo to contribute to one piece of it:

1. `docs/project-log.md` — current state of everything, one page
2. `docs/product/backlog/MASTER-BACKLOG-OUTLINE.md`'s On-Deck section — what's actually being worked on right now
3. The specific work item you've been assigned, and *only* its categorized References (Decisions/Interfaces/Environment/Test methodology/Business context) — not the whole ADR set
4. If something feels missing once you start, that's `project-process-framework/core/context-completeness.md`'s "surprise as a trigger" rule — flag it in `docs/product/backlog/PARKING-LOT.md`, don't just work around it silently

## Secure coding baseline

Per `docs/architecture/nfrs.md` §3.4: all Cosmos DB access uses parameterized queries via the SDK's query builder. No raw query string construction anywhere in the codebase — this is a hard rule, not a style preference, since it's the project's stated injection-protection baseline.

## Explicitly not covered here

- Linter/formatter tool choice — a technical tooling decision, not covered by this process document. Not yet made; add to `docs/product/backlog/PARKING-LOT.md` if it becomes a blocker.
