# Branching & Release Strategy

> **Status:** Current · updated 2026-10-30. The branch and commit practice below is what is done today. The promotion path to environments is the **target**: no environment exists, nothing deploys, and no release has been tagged.

## Decision: trunk-based development, not GitFlow

Short-lived feature branches, merged to `main` quickly, with feature flags (`EPIC-FEATURE-FLAGS`) gating incomplete or risky functionality rather than long-lived feature branches holding it back. Chosen over GitFlow because:
- GitFlow's long-lived `develop`/`release` branches add merge overhead this project's scale doesn't need
- Feature flags already exist as a planned mechanism (`FLAG-001`) — trunk-based development is what actually lets that mechanism pay for itself, rather than having both a flag system and long-lived branches solving overlapping problems

## Branch naming

`feature/<WI-ID>-short-description` (e.g., `feature/CACHE-001-cache-provider-interface`) for a branch that holds one work item, or `feature/<theme>` (e.g., `feature/slice-ordering`) when several related work items travel together (amended 2026-10-28: one commit stays within one work item, but a branch and PR no longer have to; the human lead chose fewer, larger branches to cut merge overhead), `fix/<short-description>` for bugs not tied to a work item. The branch name should make its scope obvious without opening the PR. One commit stays within one work item and its message says which (for example `Step 4: ... (WI-PORT-006)`); `docs/process/engineering-standards.md` has the review rule.

## How a change reaches `main` (what is done today)

1. Work on a themed branch cut from `main`. Commit per unit of work; each message names its work item.
2. Before pushing: rebase on `origin/main`, check `git status` before any `git add -A` (a build directory was once committed that way), and run the gates that apply (`docs/process/quality-gates.md`). When specs, ADRs or the register changed, also run `node scripts/docs/status.mjs --check`; it runs in `node scripts/ci/node-gates.mjs` and in the pipeline's `docs` job, which is a soft gate (register item 90).
3. Push once when the work is ready. If a PR check then fails, do not push a fix per error: reproduce each failure locally, run every pipeline gate against the final tree (`node scripts/ci/linux-check.mjs` for the .NET steps on Linux, the format, lint and typecheck commands for the Node jobs), and push again once everything relevant passes. A failed step skips the later steps in its job, so one fix per push hides what else is wrong.
4. The lead opens and merges the pull request. The pipeline runs on pull requests into `main` (not drafts) and by hand; it is a soft gate that the lead reads (`quality-gates.md`).
5. PR #1 and PR #11 were **merge commits**; later pull requests were **rebase merges**. Both keep every commit of the branch in `main`'s history; a squash would not, and the choice is the lead's per pull request. This matters when a branch carries commits that should not be public (risk R-18 in `docs/management/risk-register.md`).
6. Shared files (the register, the spec banners that feed `STATUS.md`, `epic-catalog.md`, `mkdocs.yml`, `CLAUDE.md`, pipeline YAML) are edited on one branch at a time to avoid conflicts. `docs/history/ACTIVITY-LOG.md` takes no new entries (register item 50); what happened goes in commit messages and the PR description, unresolved items in the register.

## Promotion path (commit → environment): the target, not built

| Stage | Trigger | Environment |
|---|---|---|
| Merge to `main` | PR approved, CI passes | Auto-deploys to `dev` |
| Tagged release (`v<major>.<minor>.<patch>`) | Manually cut from `main` when a coherent set of merged work is ready | Promotes to `staging` |
| Manual approval | After staging validation | Promotes to `prod` |

**Today:** `azure-pipelines.yml` builds and tests; it has no deployment stage and no environment exists. `infra/environments` holds only `dev` (UAT and prod are a later design, ADR-0020), written and checked locally and never planned or applied. There are no git tags and no feature flags yet (`EPIC-FEATURE-FLAGS` is not built), so the trunk-based reliance on flags to hide incomplete work is a plan: today incomplete work simply is not merged.

## Versioning

**Repo-wide semantic version** (`v0.1.0` style), not per-service versioning. Given ADR-0009's modular-monolith grouping (13 bounded contexts across 4 services, all in one repo), independently versioning each service would add bookkeeping without a corresponding benefit at this scale — a single repo-wide version tag is simpler and still gives every release a clear, citable identity.

**Event schema versioning is already decided — this document doesn't re-decide it.** Per ADR-0003: additive fields only where possible; a breaking change gets a new versioned event type name (`OrderPlacedV2`), published alongside the old one during a migration window. The payload records are in `tools/BakeryMarketplace.EventSchemas` and the envelope is in `tools/BakeryMarketplace.Eventing`; they remain the single source of truth.

## Explicitly not decided here

**API endpoint/URL versioning through Azure API Management** is a related but genuinely separate question — APIM supports its own API versioning/revision constructs, and nothing has decided whether/how this project uses them. Not bundled into this document since it's a distinct decision with its own tradeoffs; flagged here rather than silently left unstated. It is recorded in `docs/product/backlog/PARKING-LOT.md`.
