# Activity Log

Reverse-chronological (newest first). Distinct from `project-log.md` (a current-state snapshot/index) — this is a running record of *what happened and when*, so a fresh session with no conversation history can catch up quickly. Append new entries at the top as they happen; don't edit history below.

---

**2026-10-26 — Portfolio-slice decisions adopted; reconciliation pass 1 (WI-PORT-006)**

Reviewed the portfolio planning packet staged in `_incoming/` against the repo. The lead accepted all five decisions:
- **ADR-0012**: Next.js Pages Router + SSR; **supersedes ADR-0011** (React/Vite SPA). SSR for public listing pages only; authenticated pages render client-side, so the auth posture is unchanged.
- **ADR-0013**: Node/TypeScript GraphQL BFF + Relay; amends ADR-0008 (BFF is the browser's entry point; APIM stays in front of service APIs).
- **ADR-0014**: three cache layers. ADR-0002 is retained unchanged as layer 1; Relay and HTTP layers added.
- **ADR-0015**: Azure Pipelines is the CI/CD system of record; GitHub stays source control; amends ADR-0007. `ci.yml` stays until the exit criteria are met.
- **ADR-0016**: OpenTelemetry. W3C `traceparent` is the only propagated correlation mechanism; `X-Correlation-Id` becomes a response-only alias of the trace ID (no inbound adoption); event envelope gains `traceparent` with span links.

Imported `WI-PORT-001`–`007` and `EPIC-PORTFOLIO-SLICE`, plus plans under `docs/management/portfolio-slice/`. Packet defects fixed on import: a reference to a nonexistent eighth work item; unnumbered ADRs; a parallel register; a duplicate evidence ledger; and "no server cache by default", which conflicted with built work. Existing backlog items were kept and annotated: `WEB-001`, `CI-001` and `OBS-002` superseded; `GW-005` obsolete; the `CUST-*` items, `QUE-002`, `CAT-003`, `TOOL-002`, `EVT-001`, `DEV-002`, `CI-002`/`003`, `OBS-001`, `INFRA-002` and `REPO-001` adjusted; `CI-004` added. Open items #25–#27 added.

Full record: `docs/product/backlog/worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`. Docs only; no code changed. Pass 2 (C4, data-model contracts, plans/roadmap, cost) is deferred to `WI-PORT-006`.

---

**2026-09-21 — FulfillmentStrategy Seam / ACL Boundary built (WI-ORD-004 / Delegation Packet 06)**

Completed `WI-ORD-004` (`Delegation Packet 06 — FulfillmentStrategy Seam (ACL Boundary)`):
- **`FulfillmentType` Enum**: Defined `Pickup` (v1 active strategy) and `Delivery` (v2 deferred strategy seam) in `BakeryMarketplace.EventSchemas`.
- **`OrderStatus` Enum**: Standardized the fulfillment-agnostic lifecycle vocabulary matching ADR-0001, `WI-ORD-004`, and `glossary.md`: `Placed → Confirmed → InPreparation → ReadyForFulfillment → Completed` (or `Cancelled`).
- **`FulfillmentDetails` Value Object**: Implemented discriminated value object container storing strategy-specific details (`PickupFulfillmentDetails`, `DeliveryFulfillmentDetails`) opaquely on the Order aggregate without inspecting strategy internals.
- **Event Schemas**: Defined `OrderReadyForFulfillmentPayload` and `OrderFulfillmentCompletedPayload` as the pure domain event communication contract boundary between Ordering and concrete fulfillment strategies.
- **Tests**: Added `FulfillmentContractsTests` in `BakeryMarketplace.EventSchemas.Tests` verifying serialization, factory methods, enum definitions, and schema roundtrips (10/10 tests passing).

Files touched: `tools/BakeryMarketplace.EventSchemas/FulfillmentContracts.cs` (new), `tools/tests/BakeryMarketplace.EventSchemas.Tests/FulfillmentContractsTests.cs` (new).

---

**2026-09-21 — Local Mock OIDC Issuer rebuilt and verified against middleware (WI-AUTH-005 / Delegation Packet 05)**

Completed `WI-AUTH-005` (`Delegation Packet 05 — Local Mock OIDC Issuer (Rebuild/Completion)`):
- **Rebuild context**: Built from a data-record-only baseline (`MockUser.cs`), as Packet 04 had not implemented the endpoints despite being marked Ready.
- **`MockOidcIssuer` endpoints**: Implemented `/.well-known/openid-configuration` (discovery), `/.well-known/jwks.json` (JWKS RSA public key endpoint), `/authorize` (login pick-list UI listing Customer, Vendor, Admin mock users), `/authorize/submit` (code generation with PKCE challenge support), and `/token` supporting both `authorization_code` (PKCE verification) and `client_credentials` direct minting grants.
- **Middleware integration**: Added `MockOidcMiddlewareIntegrationTests` proving full PKCE round-trip tokens are accepted by `AddBakeryAuth`'s actual JWT bearer middleware when configured via Authority/Audience config swap, and verifying clean failure on invalid PKCE `code_verifier`, nonexistent mock users, and untrusted signing keys. Updated `AddBakeryAuth` with optional `requireHttpsMetadata` parameter (defaults `true`, `false` for HTTP `TestServer` dev/test) and `options.MapInboundClaims = false` to preserve standard claim names.
- **Tests**: 23/23 tests passing in `BakeryMarketplace.Auth.Tests`.

Files touched: `tools/BakeryMarketplace.Auth/MockOidcIssuer.cs`, `tools/BakeryMarketplace.Auth/AuthServiceExtensions.cs`, `tools/tests/BakeryMarketplace.Auth.Tests/MockOidcIssuerTests.cs`, `tools/tests/BakeryMarketplace.Auth.Tests/MockOidcMiddlewareIntegrationTests.cs` (new).

---

**2026-09-15 — Redis Streams Event Transport & Resource-Ownership Authorization Pattern built (WI-EVT-003, WI-AUTH-002 / Delegation Packet 03)**

Implemented local event transport and reusable authorization pattern:
- **`WI-EVT-003`**: Implemented `RedisStreamsEventTransport` in `BakeryMarketplace.Eventing` (`IEventPublisher` via `XADD`, `IEventSubscriber` via consumer groups `XREADGROUP`). Added eventType filtering, transparent envelope passthrough, and dead-letter stream support (`{eventType}:dead-letter`) on max retry attempts. Passed `EventTransportContractTests` (6 passed).
- **`WI-AUTH-002`**: Implemented `ResourceOwnershipRequirement`, `ResourceOwnershipHandler<TResource>` and `IResourceWithOwnerId` in `BakeryMarketplace.Auth`. Enforced role-claim short-circuiting prior to calling `IResourceOwnershipChecker`. Added worked reference example (`ListingResource`, `ListingOwnershipHandler` for `PUT /catalog/listings/{id}`). Passed unit tests (11 passed).

Files touched: `tools/BakeryMarketplace.Eventing/BakeryMarketplace.Eventing.csproj`, `tools/BakeryMarketplace.Eventing/RedisStreamsEventTransport.cs` (new), `tools/tests/BakeryMarketplace.Eventing.Tests/RedisStreamsEventTransportTests.cs` (new), `tools/BakeryMarketplace.Auth/IResourceWithOwnerId.cs` (new), `tools/BakeryMarketplace.Auth/ResourceOwnershipRequirement.cs` (new), `tools/BakeryMarketplace.Auth/ResourceOwnershipHandler.cs` (new), `tools/BakeryMarketplace.Auth/ListingOwnershipReferenceExample.cs` (new), `tools/tests/BakeryMarketplace.Auth.Tests/ResourceOwnershipHandlerTests.cs` (new).

---

**2026-09-15 — Concrete Adapter Implementations built for Cosmos DB and Redis (WI-DATA-002, WI-CACHE-002 / Delegation Packet 02)**

Implemented concrete data store and caching adapters behind frozen interfaces:
- **`WI-DATA-002`**: Implemented `CosmosRepository<T>` in `BakeryMarketplace.Data` using `Microsoft.Azure.Cosmos` SDK directly (no ORM, per ADR-0010). `QueryAsync` composes `Func<IQueryable<T>, IQueryable<T>>` over `container.GetItemLinqQueryable<T>` and streams results with `ToFeedIterator()`, strictly enforcing zero raw string query injection protection (`nfrs.md` §3.4). Added `CosmosRepositoryTests` passing the full contract test suite (8 passed).
- **`WI-CACHE-002`**: Implemented `RedisCacheProvider` in `BakeryMarketplace.Caching` using `StackExchange.Redis`. Configured native TTL expiry, `System.Text.Json` serialization, and `AddRedisCacheProvider` DI extension method. Added `RedisCacheProviderTests` passing the full contract test suite (16 passed).

Files touched: `tools/BakeryMarketplace.Data/BakeryMarketplace.Data.csproj`, `tools/BakeryMarketplace.Data/CosmosRepository.cs` (new), `tools/tests/BakeryMarketplace.Data.Tests/CosmosRepositoryTests.cs` (new), `tools/BakeryMarketplace.Caching/BakeryMarketplace.Caching.csproj`, `tools/BakeryMarketplace.Caching/RedisCacheProvider.cs` (new), `tools/BakeryMarketplace.Caching/CachingServiceExtensions.cs`, `tools/tests/BakeryMarketplace.Caching.Tests/RedisCacheProviderTests.cs` (new).

---

**2026-09-15 — Base .NET solution and service project scaffolding built (WI-DEV-001 / Delegation Packet 01)**

Implemented Delegation Packet 01 (`WI-DEV-001`), scaffolding the root solution (`BakeryMarketplace.slnx`) and four empty, buildable ASP.NET Core Web API projects under `/services/<service>/src/`:
- `CatalogService`, `OrderingService`, `AdminService`, `NotificationService` (net8.0, ASP.NET Core Web API).
- Each project references only the `/tools/BakeryMarketplace.*` class libraries required by its documented domain role in `docs/architecture/data-model-api-contracts.md` (`NotificationService` references `.Caching`, `.Eventing`, `.EventSchemas`, `.Logging`; the remaining services also reference `.Auth` and `.Data`).
- Registered `UseCorrelationId()` middleware from `BakeryMarketplace.Logging` and a configurable CORS policy (`Cors:AllowedOrigins`, defaulting to `http://localhost:5173` for local Vite/React SPA development) in each service's `Program.cs`.
- Exposed `GET /health` endpoint on all four services.
- Confirmed Batch 1 delivered code layout: Batch 1 code resides strictly under `/tools`, with no conflicting scaffold assumptions or files created under `/services/`.

Files touched: `BakeryMarketplace.slnx` (new), `services/catalog-service/src/CatalogService.csproj` (new), `services/catalog-service/src/Program.cs` (new), `services/catalog-service/src/appsettings.json` (new), `services/ordering-service/src/OrderingService.csproj` (new), `services/ordering-service/src/Program.cs` (new), `services/ordering-service/src/appsettings.json` (new), `services/admin-service/src/AdminService.csproj` (new), `services/admin-service/src/Program.cs` (new), `services/admin-service/src/appsettings.json` (new), `services/notification-service/src/NotificationService.csproj` (new), `services/notification-service/src/Program.cs` (new), `services/notification-service/src/appsettings.json` (new).

---

**2026-09-14 — Local run functionality reviewed; M1-M5 milestone framework established; Batch 6 (M4) fully detailed**

Reviewed what level of local, browser-visible functionality the currently-planned backlog actually delivers once built — distinct from the batch numbering (which tracks agent-assignment safety, not what a demo can show). Established a new tracking artifact, `docs/product/backlog/LOCAL-MILESTONES.md`:

- **M1** (environment up — Batch 3/3b/`WI-DEV-001`), **M2** (backend walking skeleton — Batch 4/5), **M3** (browser-visible demo — `EPIC-WEB-CUSTOMER`/`QUE-002`) — all already fully scoped by prior work, just newly framed as milestones rather than re-specified.
- **M4** (preferences UI + dietary filtering) and **M5** (admin console UI) — split out as their own milestones per direct instruction, since even full completion of M1–M3 leaves preference data API-only and dietary-safety personalization entirely unconsumed, which is vision principle 1's headline promise. Vendor-facing listing management and everything else already deferred elsewhere stay deferred.
- **M5 deliberately left named-but-unscoped** — flagged in `LOCAL-MILESTONES.md`, no work items drafted, per direct instruction to scope M4 only in this pass.

**Batch 6 (M4) drafted and marked Ready**: `SRCH-001` (dietary-preference filtering — flags conflicts by default, `hideConflicts` opt-in, an explicit product-judgment call stated rather than left open), `CUST-005` (preferences/dietary-profile UI page), `CUST-006` (personalized allergen highlighting + hide-conflicts toggle layered onto the already-built `CUST-002` browse view). Deliberately built as new, additive items rather than folding requirements back into `CUST-002` — `CUST-002` is already Ready with no dependency on preferences/search, and retroactively adding one would put M3 behind M4's prerequisites.

`MASTER-BACKLOG-OUTLINE.md` (`EPIC-SEARCH`, `EPIC-WEB-CUSTOMER`, Agent-Ready Queue's new Batch 6, On Deck list) and `EPIC-WEB-CUSTOMER.md` updated to reflect all three items as detailed and Ready.

Files touched: `LOCAL-MILESTONES.md` (new), `WI-SRCH-001.md`, `WI-CUST-005.md`, `WI-CUST-006.md` (all new), `MASTER-BACKLOG-OUTLINE.md`, `EPIC-WEB-CUSTOMER.md`.

---

**2026-09-13 — Batch 5 fully detailed (PREF-001, PREF-002, VEN-001, VEN-002)**

Continuation of the same day's reconciliation work (see the entry directly below). All four items curated in `BATCH-5-CURATION.md` were drafted as full work items and marked Ready for agents, following the same template every prior batch used.

Two small, real gaps surfaced while detailing them, both resolved in the same pass rather than deferred — consistent with this project's established discipline for newly-discovered naming/contract gaps (`ARCH-004`'s event-storming precedent):

- **`PREF-002`** needed a concrete event name for the Open Host Service publication the bounded context map and glossary had described (as "Preference Snapshot") but never actually named as an event. Named **`PreferenceSnapshotPublished`**; added to `docs/architecture/ddd/glossary.md`'s Key domain events list and to `docs/architecture/data-model-api-contracts.md`'s `catalog-service` Publishes / `ordering-service` Consumes lists.
- **`VEN-001`** needed a vendor self-application endpoint. `docs/architecture/ddd/event-storming.md`'s Flow 1 already named the `ApplyAsVendor` command, but no corresponding endpoint had ever been added to `data-model-api-contracts.md`. Added `POST /admin/vendors` (creates a `VendorProfile`, `Pending` status) plus `GET`/`PUT /admin/vendors/{vendorId}` for a vendor's own profile.

One judgment call flagged rather than resolved silently: `VEN-001`'s Open Points note that the actual contents of `complianceChecklist` for Independent vendors (per the glossary's "added compliance checklist step") aren't decided anywhere — this item stores whatever structure is submitted without validating specific required fields, and a real checklist schema is left as a future business decision.

`MASTER-BACKLOG-OUTLINE.md` (`EPIC-PREFERENCES`, `EPIC-VENDOR-ONBOARDING`, the Agent-Ready Queue's Batch 5 entry, the On Deck list, and Gap #9's note) and `BATCH-5-CURATION.md` updated to reflect all four items as detailed and Ready, rather than curated-only.

Files touched: `WI-PREF-001.md`, `WI-PREF-002.md`, `WI-VEN-001.md`, `WI-VEN-002.md` (all new), `docs/architecture/ddd/glossary.md`, `docs/architecture/data-model-api-contracts.md`, `MASTER-BACKLOG-OUTLINE.md`, `BATCH-5-CURATION.md`.

---

**2026-09-13 — Frontend framework decided, EPIC-WEB-CUSTOMER detailed, DEV items renumbered, Batch 5 curated — reconciled from a parallel planning session**

This session's content originated in a separate chat within the same project and was reconciled against the repo's actual current state (which had already moved ahead via the 2026-09-12 Batch 3/4 session below) rather than applied blindly. Four pieces of substantive work landed, plus one numbering conflict resolved:

1. **ADR-0011 accepted: React (Vite) SPA**, hosted on Static Web Apps, direct-to-service calls per ADR-0008 — closes the same class of gap ADR-0010 closed for the backend (a framework was never picked, only where it would run). Applies to `web-customer`, `web-admin` (when built), and `web-queue-display`.

2. **`EPIC-WEB-CUSTOMER` added**: `WEB-001` (shared scaffold/PKCE auth), `CUST-002`/`003`/`004` fully detailed and Ready. `QUE-002` (previously title-only in `EPIC-QUEUE-DISPLAY`) detailed to match, sharing `WEB-001`'s scaffold rather than duplicating it. This resolves `MASTER-BACKLOG-OUTLINE.md` Gap #7 (no frontend work items beyond scaffolds) for the customer-facing side; `web-admin` correctly remains untouched since its backend epics (`EPIC-ADMIN`, `EPIC-VENDOR-ONBOARDING`) still don't exist.

3. **`AUTH-005` revised (Size S→M)**: ADR-0011 surfaced a downstream need — a real PKCE browser redirect flow — which the local mock OIDC issuer hadn't been scoped for. Folded directly into `AUTH-005`'s spec (nothing had started building it yet) plus a short amendment note on ADR-0006, rather than treated as a correction to existing code. **Reconciliation note**: the version of `WI-AUTH-005.md` actually committed to the repo after the 2026-09-12 session had not picked up this revision — ADR-0006's amendment note referenced a Size S→M change that the work-item file itself still didn't reflect. Fixed as part of this reconciliation; the file now matches the ADR.

4. **`WI-DEV-001` drafted**: base .NET solution/project scaffold (one ASP.NET Core Web API project per service, per ADR-0010), resolving `worklog-2026-09-07.md`'s gap #1 (no work item had ever existed for this, though every prior work item silently assumed it). Also absorbs `WI-WEB-001`'s previously-dangling CORS open point as a concrete acceptance criterion.

**Numbering conflict found and resolved**: the new `WI-DEV-001` (.NET solution scaffold) was drafted independently under the ID `DEV-001` — the same ID the 2026-09-12 session had already assigned to the real `docker-compose.yml` item within `EPIC-LOCAL-DEV`. Rather than force the more-foundational new item into a later slot, `EPIC-LOCAL-DEV`'s existing three items were shifted up by one: `docker-compose.yml` is now `DEV-002` (was `DEV-001`), Stripe CLI wiring is now `DEV-003` (was `DEV-002`, title-only, no file to rename), and the seed/fixture script is now `DEV-004` (was `DEV-003`). No file's *content* changed as part of this beyond the ID itself and a small number of internal cross-references (`WI-CAT-001.md`'s Open Points named the old seed-script ID and was corrected). See `MASTER-BACKLOG-OUTLINE.md`'s `EPIC-LOCAL-DEV` section for the full note.

**Batch naming conflict found and resolved**: the parallel session had also curated a 9-item "Batch 3" of domain-logic work (`CAT-001`, `PREF-001`, `PREF-002`, `ORD-002`, `ORD-004`, `ORD-006`, `QUE-001`, `VEN-001`, `VEN-002`), intended to resolve `worklog-2026-09-07.md`'s gap #3 ("Batch 3 was named as a concept but never actually scoped"). By the time this was reconciled, five of those nine items (`CAT-001`, `ORD-002`, `ORD-004`, `ORD-006`, `QUE-001`) had already been independently curated, detailed, and marked Ready as this repo's own **Batch 4** (the 2026-09-12 walking-skeleton batch) — for the same underlying reason. Rather than duplicate those five under a second name, only the four genuinely new items (`PREF-001`, `PREF-002`, `VEN-001`, `VEN-002` — Preferences & Vendor Onboarding, neither of which has any detailed item yet) were kept, renamed to **Batch 5** and recorded in `BATCH-5-CURATION.md`. These four are curated, not yet detailed as full work items — that remains a follow-up.

**Still open, carried forward rather than silently dropped**: `worklog-2026-09-07.md` gap #2 (the Batch 1 verification checkpoint living only as narrative, never a checkable to-do) was claimed as "tracked in `PARKING-LOT.md`" by the reconciled session's own notes, but on inspection it had never actually been added there. Added now as a real parking-lot entry rather than left as an inaccurate claim.

Also added: `docs/governance/open-items-register.md` item #24 (no refresh-token/silent-renewal in the frontend auth pattern — already present from the 2026-09-12+ reconciliation, confirmed accurate here) and two new parking-lot entries (refresh-token decision, shared frontend-package extraction deferred until `web-admin` gives a real third instance).

All updated/new files from this reconciliation: `docs/architecture/adr/0011-frontend-framework.md` (already present, verified unchanged), `docs/architecture/adr/0006-auth-authz-model.md`'s amendment note (already present, verified unchanged), `docs/product/backlog/EPIC-WEB-CUSTOMER.md`, `WI-WEB-001.md` (open point updated), `WI-CUST-002.md`, `WI-CUST-003.md`, `WI-CUST-004.md`, `WI-QUE-002.md` (all already present, verified unchanged), `WI-AUTH-005.md` (overwritten — see reconciliation note above), `WI-DEV-001.md` (new), `WI-DEV-002.md` (renamed from the old `WI-DEV-001.md`), `WI-DEV-004.md` (renamed from the old `WI-DEV-003.md`), `WI-CAT-001.md` (cross-reference fixed), `BATCH-5-CURATION.md` (new, reconciled from a differently-scoped "Batch 3" draft), `MASTER-BACKLOG-OUTLINE.md`, `PARKING-LOT.md`.

**2026-09-12 — Batch 1/2 code review completed; new local-first context set; Batch 3 and Batch 4 (walking skeleton) detailed and committed**

Three distinct pieces of work landed in this session:

1. **Batch 1/2 spec review.** All six Batch 1 items and all four Batch 2 items were reviewed against their `WI-*.md` specs (signatures, contract-test coverage, acceptance criteria) — agents had already run their own tests, so this was a read-through-against-spec pass, not a fresh test execution. Result: everything matches. One minor, non-blocking nuance on `AUTH-001` — the "different Authority" test proves issuer-mismatch rejection with one signing key and two issuer strings, narrower than the spec's implied "two independently configured mock issuers," but not treated as a defect. `TOOL-001`'s tests round-trip 4 of 14 payload records as a representative spot-check rather than all 14 — acceptable given these are data-only records, noted for completeness.

2. **New context locked in, reshaping priorities.** Confirmed: (a) Entra External ID is the real target (unchanged), but its **local** counterpart — the mock OIDC issuer named in ADR-0006/`tech-stack.md` — turned out to have no work item at all, a real gap of the same shape as the bounded-context-to-service mapping gap that produced ADR-0009. Closed by adding `AUTH-005`. (b) Redis: build `RedisCacheProvider` now and use real local Redis, since the vendor-reconsideration open item (#22) only concerns the *cloud* managed-Redis vendor, not the local Redis-protocol implementation — `CACHE-002` unblocked accordingly; `CACHE-005` (the cloud Terraform toggle) stays held. (c) Priority reframed around getting a full backend walking skeleton running locally end-to-end before any further cloud-vendor or cloud-gateway decisions matter.

3. **Batch 3 (foundational local build) and Batch 4 (walking skeleton) fully detailed and added to `MASTER-BACKLOG-OUTLINE.md`.** Batch 3: `DATA-002`, `CACHE-002`, `EVT-003`, `AUTH-002`, `AUTH-005` (new) — fully parallel, no internal dependencies. Batch 3b: `DEV-001`, `DEV-003` (docker-compose and seed data, at the time — see the 2026-09-13 entry above for their subsequent renumbering to `DEV-002`/`DEV-004`) — real `docker-compose.yml` and seed data, depends on Batch 3 landing. Batch 4: `ORD-004`, `ORD-002`, `ORD-003`, `ORD-006`, `ORD-005`, `CAT-001`, `CAT-003`, `ORD-001`, `QUE-001` — the actual customer-browse-to-order path, with `ORD-004` (the `FulfillmentStrategy` seam) as the one true blocking node per ADR-0001's design. Two real, small design choices surfaced while detailing this batch and were captured as Open Points rather than decided silently: where `catalog-service` stores derived per-vendor verification status (no admin-service exists yet to be the real source), and the exact shape of `ORD-001`'s stubbed payment step (since `EPIC-PAYMENTS` isn't built yet). `DEV-003`'s (now `DEV-004`'s) seed script was given the job of publishing `VendorVerified` directly for seeded vendors as the interim local substitute for the not-yet-built vendor-verification workflow.

**A real scope gap was also identified and deliberately not folded into this batch**: no work item anywhere builds an actual frontend beyond scaffolds — `apps/web-customer`/`web-admin` are empty folders, and `QUE-002` (the only frontend item in the whole backlog) is title-only. This means a fully working Batch 3/4 backend is not, on its own, a browser-visible demo. Logged to `PARKING-LOT.md` and to `MASTER-BACKLOG-OUTLINE.md`'s Gaps section (#7) rather than assumed away — **resolved for `web-customer` in the 2026-09-13 entry above.**

**Tooling note worth carrying forward**: this session's environment cannot currently run `dotnet restore`/`dotnet test` — `nuget.org` is not in the allowed outbound domains (only `pypi.org`/`npmjs.org`/`crates.io`/`github.com` and adjacents are). All Batch 3/4 work should be planned assuming an agent (or a session with `nuget.org` added) does the actual build/test verification, consistent with how Batch 1/2 were handled.

All 16 new/updated work-item files (`WI-DATA-002`, `WI-CACHE-002`, `WI-EVT-003`, `WI-AUTH-002`, `WI-AUTH-005`, `WI-DEV-001`, `WI-DEV-003`, `WI-ORD-004`, `WI-ORD-002`, `WI-ORD-003`, `WI-ORD-006`, `WI-ORD-005`, `WI-CAT-001`, `WI-CAT-003`, `WI-ORD-001`, `WI-QUE-001`) plus updated `MASTER-BACKLOG-OUTLINE.md`, `EPIC-CACHING.md`, and `PARKING-LOT.md` are committed as part of this entry.

**2026-09-07 — Batch 2 agent-ready items: deliberately independent of Batch 1**
Batch 1's six items were sent to separate AI coding agents; results not yet reviewed. Rather than immediately queue more work that depends on Batch 1's interfaces (real domain logic against `ICacheProvider`/`IRepository<T>`/etc.), Batch 2 was deliberately scoped to items with **zero dependency** on Batch 1 at all: `TOOL-001` (domain event payload records — only needs `EVT-001`'s documented envelope shape, not its implementation), `TOOL-002` (correlation-ID middleware), `SEC-001` (Key Vault Terraform), `SEC-003` (fail-fast secret validation). This is the concrete answer, in practice, to `ai-collaboration-playbook`'s long-standing open question about multi-agent interface-drift risk — that entry updated to reflect it's now being tested for real, not just theorized. Recommended next step once Batch 1 is reviewed: verify actual signatures against spec, then unblock real domain-logic work (`CAT-001`, `ORD-002`, etc.) as Batch 3. **Update 2026-09-12: this review happened — see that day's entry above.**

**2026-09-07 — C# locked in, two pending tech swaps handled proactively, 6 work items made agent-ready**
Direct instruction: C# / .NET 8 / ASP.NET Core Web API for all services (ADR-0010) — resolves the language gap surfaced by the C4-component-diagram discussion. Two tech-choice adjustments flagged for later: Azure AD B2C → Microsoft Entra External ID (verified via search: B2C stopped accepting new tenants May 2025, P2 retired March 2026, Entra External ID is Microsoft's stated successor) and a possible Redis vendor swap. Both handled the same way — an amendment note on the relevant ADR (0006 for auth, 0002 for cache) confirming the core design is unaffected, plus new `open-items-register.md` entries (#21, #22) naming exactly which not-yet-built work items to hold from agent assignment (`AUTH-004`; `CACHE-002`/`CACHE-005`) versus which are safe regardless (everything interface/contract-level, since both swaps are config-driven, not code-driven, thanks to ADR-0010's library choices). Six work items detailed with real C# signatures and added to a new **Agent-Ready Queue** in `MASTER-BACKLOG-OUTLINE.md`: `CACHE-001`, `EVT-001`, `DATA-001`, `AUTH-001`, `CACHE-003`, `CACHE-004`. `tech-stack.md` updated (new Language/Framework row, Auth/Cache rows reflect pending swaps). One low-priority cleanup item logged (#23) for stale "Azure AD B2C" mentions in historical diagrams — living reference docs already corrected, closed work items left as-is.

**2026-09-07 — Formal event-storming session output drafted**
`WI-ARCH-004` completed. `docs/architecture/ddd/event-storming.md` walks 4 business processes end-to-end (vendor onboarding & listing publication, order lifecycle, review & payout, listing moderation) using Command→Aggregate→Event→Policy→Read Model vocabulary. As expected for this kind of exercise (same shape as ADR-0009's origin), it surfaced 4 real business events that had never been named anywhere: `ReviewSubmitted`, `PayoutReconciled`, `ListingApproved`, `ListingRejected`. All four added to `glossary.md`; `data-model-api-contracts.md`'s `ordering-service` and `admin-service` event lists corrected to match, rather than left as a second inconsistency. `EPIC-ARCH-DOCS` is now 5 of 6 items done — only `ARCH-005` (component-level C4, low priority) remains.

**2026-09-07 — Data model / API contracts drafted**
`WI-ARCH-003` completed. `docs/architecture/data-model-api-contracts.md` makes ADR-0004's containers and ADR-0009's service groupings concrete: document shapes, events published/consumed, and API endpoints per service. Resolved one previously-undecided detail along the way — where the at-least-once-delivery dedupe store required by ADR-0003 actually lives (the existing `CacheProvider`, not a new mechanism) — and made ADR-0004's CQRS decision concrete with an explicit `order-status-readmodel` container, distinct from the source-of-truth `orders` container. `EPIC-ARCH-DOCS` is now 4 of 5 done; only `ARCH-004` (event-storming) and `ARCH-005` (component-level C4, low priority) remain.

**2026-09-07 — Capability map / business architecture view drafted**
`WI-ARCH-002` completed. `docs/architecture/capability-map.md` re-groups the existing bounded contexts into 5 business-facing capability domains (Customer Experience, Vendor Enablement, Trust & Safety, Monetization, Platform Operations), each traced to its bounded context, hosting service (ADR-0009), and served persona. Deliberately reuses the existing core/supporting/generic classification and MVP-line legend rather than inventing new categories — this document's value is a different audience, not a new decision.

**2026-09-07 — Governance and monitoring criteria locked down before finishing architecture**
`WI-GOV-001`/`WI-OPS-003` drafted, both fully Done, per direct request to settle these before `ARCH-002`/`003`/`004`. `docs/governance/architecture-review.md`: codifies practices this project was already using (state-assumptions-first, amend-don't-rewrite per ADR-0006's precedent, periodic audit cadence) rather than inventing a new process — and explicitly distinguishes its scope from `project-process-framework/discovery/README.md`, which governs the framework's own evolution, not this project's ADRs. `docs/operations/monitoring-alerting.md`: warning/critical thresholds for every free-tier ceiling and the SLA error-budget burn rate, all derived from existing numbers in `nfrs.md`/`sla.md`. Corrected a backwards cross-reference discovered in the process — `EPIC-OBSERVABILITY`'s `OBS-003` had described itself as feeding this document, when the actual relationship is the reverse (this document is the policy layer, `OBS-003` implements against it).

**2026-09-07 — Stakeholder communications plan and branching strategy drafted (third priority override)**
`WI-MGMT-007`/`WI-MGMT-008` drafted, both fully Done, no open decisions. `docs/management/stakeholder-communications-plan.md`: role-based (not name-based, since `MGMT-006` doesn't exist yet), with escalation triggers wired directly to the SLA's error-budget policy and the risk register rather than invented generic triggers. `docs/process/branching-strategy.md`: trunk-based development chosen over GitFlow specifically because it's what lets the already-planned feature-flag mechanism (`EPIC-FEATURE-FLAGS`) pay for itself; repo-wide versioning chosen over per-service versioning given ADR-0009's modular-monolith grouping. Surfaced a new, explicitly-named gap while drafting: API endpoint/URL versioning through Azure API Management has never been decided — added to `PARKING-LOT.md` rather than silently bundled into this document or left unstated. Only `MGMT-003` (RACI) and `MGMT-006` (team/hiring) remain not-started in `EPIC-PM-ARTIFACTS`.

**2026-09-07 — Engineering standards, budget estimate, and personas drafted (second priority override)**
`WI-MGMT-004`/`WI-MGMT-005`/`WI-PROD-001` drafted — On-Deck queue explicitly updated to show this as a second consecutive reprioritization ahead of the architecture-artifact items. `docs/process/engineering-standards.md`: PR/review guidelines, an onboarding path that deliberately starts narrow (project-log → on-deck → the specific work item's categorized references, not "read the whole repo"), and the secure-coding baseline promised in `nfrs.md`. `docs/management/budget-cost-estimate.md`: confirmed the architecture is genuinely ~$0/month except managed Redis, verified at $16.06/month (Basic C0) against Azure's current pricing rather than an earlier casual "a few dollars" estimate. `docs/product/personas.md`: full personas for all 4 glossary actors, each explicitly connected to a specific product decision rather than generic marketplace boilerplate.

**2026-09-07 — Project plan + risk register drafted (priority override)**
`WI-MGMT-001`/`WI-MGMT-002` drafted — a deliberate jump ahead of the standing On-Deck queue (which had `ARCH-003` next), noted explicitly rather than silently overriding it. `docs/management/project-plan.md`: 8 phases with entry/exit criteria and a current-status marker, deliberately using relative sequencing instead of fabricated calendar dates. `docs/management/risk-register.md`: 11 risks synthesized from existing ADRs/open items, plus one new PM-level risk (R-10, backlog size vs. likely pace) that hadn't been captured anywhere else. Both flagged with one open decision each rather than invented answers.

**2026-09-07 — SLA/SLO document drafted**
`WI-OPS-001` completed. 99.0% monthly uptime target and error budget (~7.3 hours/month) derived directly from `nfrs.md`, not invented fresh. Explicit error-budget policy (feature-flag freeze + incident review on exhaustion), latency targets per path, and every known failure mode (cache fallback, Cosmos ceiling, APIM's lack of its own SLA, event-delivery lag) traced to its source ADR. On-deck queue advanced to `ARCH-003` next.

**2026-09-07 — On-deck queue + activity log established**
Added `ARCH-005` (component-level C4 diagrams — explicitly deferred from `WI-ARCH-001`'s scope) to the backlog. Added an "On Deck" priority section to the top of `MASTER-BACKLOG-OUTLINE.md`. Created this file. Process fix: `project-process-framework` core phase sequence and checklists updated to require this same discipline (on-deck queue + activity log) on future projects, not just this one.

**2026-09-07 — ADR-0009: Bounded-Context-to-Service Mapping**
Formalized the 13-bounded-context → 4-service grouping that was surfaced (not decided) while drafting C4. Modular monolith rule established: co-located contexts still communicate through the same interfaces/events they'd use if physically separate. Root-cause process fix landed in `project-process-framework`: Phase 4 now requires this mapping be explicit *before* scaffolding; `technology-decision-checklist.md` gained a "Service/deployment decomposition" section; `architecture-patterns.md` names the pattern; `context-completeness.md` now distinguishes "implicit decision by early action" as a second failure mode alongside "unstated human assumption."

**2026-09-07 — C4 diagrams (Context + Container)**
`WI-ARCH-001` drafted and completed. Context diagram clean. Container diagram surfaced the bounded-context-to-service gap above (resolved same day via ADR-0009).

**2026-09-07 — NFR document drafted in full**
`WI-NFR-001` completed. Seven sections: scalability, availability, security (zero trust, CSRF, injection, secrets, sensitive data), compliance, reliability/resilience, extensibility, aspirational/future. Two fields required real business input rather than invented numbers — resolved: 50 peak concurrent users / 200 orders/day target load, 99.0% monthly target availability (explicitly self-imposed, since APIM Consumption tier carries no Azure-backed SLA).

**2026-09-07 — Context-completeness discipline established**
Triggered by a real incident: a "zero trust" security posture existed only in the human's head until an unrelated decision (API Gateway) surfaced it. Fixed at the process level (`project-process-framework/core/context-completeness.md`, two new front-loaded checklists, a `discovery/` layer with promotion criteria) and applied to this project (`vision.md` gained an explicit zero-trust principle, ADR-0006 gained a token-storage/CSRF note, `WI-NFR-001` required both).

**2026-09-07 — ADR-0008: API Gateway**
Azure API Management, Consumption tier, zero-trust dual validation (edge fast-fail check + authoritative per-service check, unchanged from ADR-0006). Confirmed via live research that Consumption tier lacks VNet/Private Link and the self-hosted gateway option — both accepted, not worked around, because of the zero-trust posture.

**2026-09-07 — Work-item template defined, validated, and template gaps fixed**
`project-process-framework/templates/work-item-template.md` created (Epic + Work Item shape, 6 types). Validated against two real, structurally different items (`WI-CACHE-001` interface/contract, `WI-NFR-001` document/artifact) before being treated as settled. Gaps found and fixed during real use: categorized (not flat) references, a "You do not need to know about" field, a transient "Open Points (working)" section, a `Shared with epic(s)` field (5 real instances of cross-listing surfaced the need), and standardized non-technical `Scope` values.

**2026-09-07 — Full master backlog outline built**
~33 epics across every hat (`docs/product/backlog/MASTER-BACKLOG-OUTLINE.md`), with a rough suggested build order. Several missing epics identified and added in a dedicated review pass (Observability, Rate Limiting, Feature Flags, Data Privacy, Backup/DR, Frontend Quality, Backlog Meta-Work) plus a missing refinement-phase item and a legal-scope decision item.

**2026-09-07 — ADR-0001 through ADR-0007 accepted**
Fulfillment strategy extensibility, cache strategy, event-driven backbone, data store choice, payments buy-vs-build, auth/authz model, secrets management. Full detail in `docs/architecture/adr/`.

**2026-09-07 — Three-repo split**
Separated the reusable process framework (`project-process-framework`), AI-collaboration mechanics (`ai-collaboration-playbook`), and this project's implementation (`bakery-marketplace`) into three independent repos with no cross-references baked in.

**2026-09-07 — Foundational planning**
Vision one-pager, bounded context map, glossary, `portfolio-plan.md`, and the initial repo skeleton (4 services, 3 apps) all established. This is where the bounded-context-to-service mapping gap actually originated (see the ADR-0009 entry above) — the services were named here, before any decision-record discipline existed to catch it.
