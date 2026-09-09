# Branching & Release Strategy

## Decision: trunk-based development, not GitFlow

Short-lived feature branches, merged to `main` quickly, with feature flags (`EPIC-FEATURE-FLAGS`) gating incomplete or risky functionality rather than long-lived feature branches holding it back. Chosen over GitFlow because:
- GitFlow's long-lived `develop`/`release` branches add merge overhead this project's scale doesn't need
- Feature flags already exist as a planned mechanism (`FLAG-001`) — trunk-based development is what actually lets that mechanism pay for itself, rather than having both a flag system and long-lived branches solving overlapping problems

## Branch naming

`feature/<WI-ID>-short-description` (e.g., `feature/CACHE-001-cache-provider-interface`), `fix/<short-description>` for bugs not tied to a work item. Consistent with `engineering-standards.md`'s "a PR should map to one work item" rule — the branch name should make that mapping obvious without opening the PR.

## Promotion path (commit → environment)

| Stage | Trigger | Environment |
|---|---|---|
| Merge to `main` | PR approved, CI passes | Auto-deploys to `dev` |
| Tagged release (`v<major>.<minor>.<patch>`) | Manually cut from `main` when a coherent set of merged work is ready | Promotes to `staging` |
| Manual approval | After staging validation | Promotes to `prod` |

This maps directly onto the per-environment structure already established in `tech-stack.md` (dev/staging/prod `.tfvars`) and feeds `EPIC-CI-CD`'s pipeline items (`CI-001`/`CI-002`) — this document should exist before those are built, not after.

## Versioning

**Repo-wide semantic version** (`v0.1.0` style), not per-service versioning. Given ADR-0009's modular-monolith grouping (13 bounded contexts across 4 services, all in one repo), independently versioning each service would add bookkeeping without a corresponding benefit at this scale — a single repo-wide version tag is simpler and still gives every release a clear, citable identity.

**Event schema versioning is already decided — this document doesn't re-decide it.** Per ADR-0003: additive fields only where possible; a breaking change gets a new versioned event type name (`OrderPlacedV2`), published alongside the old one during a migration window. `/tools/event-schemas` remains the single source of truth.

## Explicitly not decided here

**API endpoint/URL versioning through Azure API Management** is a related but genuinely separate question — APIM supports its own API versioning/revision constructs, and nothing has decided whether/how this project uses them. Not bundled into this document since it's a distinct decision with its own tradeoffs; flagged here rather than silently left unstated. Candidate for `PARKING-LOT.md` if it becomes a real blocker before `EPIC-API-GATEWAY`'s remaining items are built.
