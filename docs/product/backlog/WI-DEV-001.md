> **Status:** Done · evidence: `BakeryMarketplace.slnx` and the projects it lists

```
WI ID:               DEV-001
Title:                Scaffold the base .NET solution and project structure
Type:                 Infra/Environment
Epic:                 EPIC-LOCAL-DEV
Shared with epic(s):  EPIC-SHARED-TOOLING (the /tools libraries this scaffold wires up already exist as folders)
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 S
```

**Context / Why**
ADR-0010 describes the intended solution structure — one .NET solution, one ASP.NET Core Web API project per service (`CatalogService`, `OrderingService`, `AdminService`, `NotificationService`), shared class libraries for everything under `/tools` — but no `.sln`/`.csproj` file for the services actually exists yet, and no work item was ever created to build it. This was surfaced explicitly in `worklog-2026-09-07.md` (gap #1): every prior work item silently assumed this scaffold exists (e.g., `WI-TOOL-001` references being "placed in the shared `BakeryMarketplace.EventSchemas` class library... referenced by each service project"). This item builds that scaffold so the assumption is no longer implicit, and so Batch 4 (the walking-skeleton items, which add real code to these four service projects) can proceed cleanly.

Also resolves `WI-WEB-001`'s Open Point on CORS: the CORS policy each service needs for the frontend's local origin is added directly as an acceptance criterion here, rather than waiting on a separate not-yet-detailed item.

**Numbering note**: this item is `DEV-001` as of 2026-09-13. `EPIC-LOCAL-DEV` previously had a different item already occupying `DEV-001` (the real `docker-compose.yml`, drafted 2026-09-12) — that item and the epic's other two items were renumbered up by one (`DEV-001→002`, `DEV-002→003`, `DEV-003→004`) so this genuinely more-foundational item could take the `DEV-001` slot. See `WI-DEV-002.md` and `WI-DEV-004.md` for the renamed files, and `epic-catalog.md`'s `EPIC-LOCAL-DEV` section for the full renumbering note.

**Inputs / References**
- *Decisions*: ADR-0010 (solution structure, one project per service, shared `/tools` libraries), ADR-0008 (frontend calls services directly — informs the CORS addendum below)
- *Interfaces*: none consumed — this item creates project scaffolding, not application logic
- *Environment/tooling*: `docs/architecture/tech-stack.md` (per-environment structure, local-dev table), existing `/tools/BakeryMarketplace.*` folders and their already-built `.csproj` files (`BakeryMarketplace.Caching`, `.Eventing`, `.Data`, `.Auth`, `.EventSchemas`, `.Logging`, `.Secrets` — all already scaffolded per `tools/BakeryMarketplace.slnx`)
- *Test/chaos methodology*: not applicable — this is project scaffolding, not testable behavior itself
- *Business context*: none

**You do not need to know about**
- Any service's actual business logic — this item creates empty ASP.NET Core Web API projects with correct project references, not working endpoints
- Real Azure deployment specifics — this is the local/solution-structure concern only; Terraform/Container Apps provisioning is separate (`EPIC-CLOUD-INFRA`)

**Out of scope**
- Does not implement any controller/endpoint logic inside the four service projects — empty, buildable Web API projects only
- Does not reconcile whatever ad hoc scaffold assumptions Batch 1's agents may have already made independently — see the Open Point below; that reconciliation is a follow-up, not this item's job
- Does not build `docker-compose.yml` itself (Redis Streams, Cosmos emulator, seed data) — that's `WI-DEV-002.md`; this item only adds the CORS-relevant service registration piece each service project needs so that item has something real to configure against

**Requirements / Acceptance Criteria**
- One `.sln` (or `.slnx`, consistent with the existing `tools/BakeryMarketplace.slnx` convention) at the repo root or `/services` level, referencing:
  - Four ASP.NET Core Web API projects: `CatalogService`, `OrderingService`, `AdminService`, `NotificationService` (net8.0, per ADR-0010), placed under their existing `/services/<name>/src` folders
  - Project references from each service to the specific `/tools/BakeryMarketplace.*` libraries it actually needs (e.g., `CatalogService` references `.Caching`, `.Data`, `.Auth`, `.EventSchemas`, `.Logging`; `NotificationService` references `.Eventing`, `.Logging` only — no service references a tool library it has no documented need for)
- Each service project builds successfully (`dotnet build`) with no application logic beyond a minimal health-check endpoint (`GET /health`) proving the project runs
- Each service project registers `UseCorrelationId()` (`WI-TOOL-002`) and a basic CORS policy allowing the frontend's local dev origin (configurable, not hardcoded) — this is the concrete piece `WI-WEB-001`'s CORS open point needed to attach to
- A short note added to `docs/history/ACTIVITY-LOG.md` (as part of this item's own completion) confirming whether Batch 1's delivered agent code already made its own conflicting scaffold assumptions — if so, flag as a reconciliation follow-up, don't silently overwrite

**Dependencies**
- Blocks: all of Batch 4 (`ORD-004`, `CAT-001`, `ORD-002`, `ORD-003`, `ORD-006`, `ORD-005`, `CAT-003`, `ORD-001`, `QUE-001` — every one of them needs a real service project to actually add code to, not just the shared `/tools` libraries Batch 1/2 already scaffolded), `WI-WEB-001`'s CORS open point
- Blocked by: none — all seven `/tools` libraries already exist and build independently
- Can be worked in parallel with: `EPIC-WEB-CUSTOMER`'s items (frontend scaffold is independent of backend solution structure), Batch 3 (`DATA-002`, `CACHE-002`, `EVT-003`, `AUTH-002`, `AUTH-005`)

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: verify this against Batch 1's actual delivered code, not just against ADR-0010's description in isolation — if Batch 1's agents already assumed a different structure, that discrepancy must be surfaced explicitly (per `worklog-2026-09-07.md`'s recommended action), not quietly reconciled without a note.

**AI-agent suitability**
Yes, with one flagged caveat. The scaffold itself is fully specified by ADR-0010 and the existing `/tools` structure — no judgment call needed. The one thing that isn't agent-resolvable in isolation: whether Batch 1's already-delivered code conflicts with this structure can only be checked once Batch 1's actual output is reviewed (already done — see `docs/history/ACTIVITY-LOG.md`'s 2026-09-12 entry) — the reconciliation Open Point below should be treated as confirmed-clear unless that review's notes say otherwise.

**Open Points (working)**
- [x] Reconcile against Batch 1's actual delivered project structure **Resolved 2026-09-15:** the scaffold found no conflict with the Batch 1 layout (activity log, 2026-09-15). -- — the 2026-09-12 review pass checked signatures/contract-tests against spec but did not specifically check for a conflicting solution/project-layout assumption; worth a quick confirmation pass rather than assuming silence means clear.
