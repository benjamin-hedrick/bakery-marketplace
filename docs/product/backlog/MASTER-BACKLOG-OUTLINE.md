# Master Backlog Outline

A high-level list only — titles and, where already known from existing ADRs/decisions, a short detail. Full work-item detail (per `project-process-framework/templates/work-item-template.md`) comes later, one epic at a time. Two items are already fully drafted as validation examples: `WI-CACHE-001` and `WI-NFR-001` — see `EPIC-CACHING.md`.

Related trackers, not duplicated here: `docs/product/backlog/PARKING-LOT.md` (transient, per-conversation open items), `docs/governance/open-items-register.md` (permanent tradeoffs/tech debt), `docs/ACTIVITY-LOG.md` (chronological record of what's been done).

## Agent-Ready Queue (safe to assign to AI coding agents right now)

**Batch 1 — sent to agents, results not yet reviewed.** Contract tests should be run against whatever comes back before anything in Batch 2's Category-2-risk items (real domain logic depending on these interfaces) gets greenlit — see `ai-collaboration-playbook/open-questions.md`'s multi-agent coordination note.

| Item | Type | What it produces | Status |
|---|---|---|---|
| `WI-CACHE-001` | Interface/Contract | `ICacheProvider` + contract test base | Sent to agent |
| `WI-EVT-001` | Interface/Contract | `IEventPublisher`/`IEventSubscriber` + envelope | Sent to agent |
| `WI-DATA-001` | Interface/Contract | `IRepository<T>` + contract test base | Sent to agent |
| `WI-AUTH-001` | Interface/Contract | JWT middleware + `IResourceOwnershipChecker` | Sent to agent |
| `WI-CACHE-003` | Service Implementation | `LocalCacheProvider` + `ResilientCacheProvider` | Sent to agent |
| `WI-CACHE-004` | Test/Mock/Chaos | `ChaosCacheProvider` + fallback proof tests | Sent to agent |

**Batch 2 — fully independent of Batch 1, zero coordination risk.** Deliberately chosen to not depend on any Batch 1 interface, since Batch 1's actual signatures haven't been verified against spec yet.

| Item | Type | What it produces | Notes |
|---|---|---|---|
| `WI-TOOL-001` | Interface/Contract | Domain event payload records | Independent — only needs `EVT-001`'s documented envelope shape, not its implementation |
| `WI-TOOL-002` | Interface/Contract | Correlation-ID middleware + logging convention | Fully independent |
| `WI-SEC-001` | Infra/Environment | Key Vault + managed identity Terraform | Fully independent — infra, not application code |
| `WI-SEC-003` | Test/Mock/Chaos | Fail-fast secret-validation tests | Fully independent |

**Explicitly held from agent assignment** — do not queue these until the noted decision finalizes:
- `AUTH-004` (Entra External ID tenant/policy config) — open item #21
- `CACHE-002` (RedisCacheProvider) and `CACHE-005` (Terraform Redis toggle) — open item #22

**Deliberately not included in Batch 2**: real domain business logic (`CAT-001`, `ORD-002`, etc.) that would build against Batch 1's interfaces before those are verified. Recommended as the natural Batch 3, once Batch 1's actual code is checked against its spec's documented signatures.

## On Deck (decided priority — update this whenever priority changes)

1. **`ARCH-005`** (Component-level C4 diagrams) — the only item left in `EPIC-ARCH-DOCS`, low priority.

`GOV-001`, `OPS-003`, `ARCH-002`, `ARCH-003`, and `ARCH-004` are all done. `OPS-001` (SLA/SLO) is done. `EPIC-PM-ARTIFACTS` has only `MGMT-003`/`MGMT-006` left, currently not on deck. Full history of prior reprioritizations is in `docs/ACTIVITY-LOG.md`, not repeated here each time.

Legend: 🟢 detail known now (from an existing ADR/decision) · ⚪ title only, detail TBD when picked up

---

## Domain / Product Epics

### EPIC-CATALOG — Catalog & Customization
Scope: Catalog · Primary hat(s): Architect, Engineering/Build · Status: Not Started
- 🟢 CAT-001 (Service Implementation) — Listing CRUD + modifier/add-in model, allergy flags per item (per glossary: Listing, Modifier, Allergy Flag)
- ⚪ CAT-002 (Service Implementation) — Coffee/bakery customization flow (modifier selection UI + validation)
- 🟢 CAT-003 (Integration) — Consumes `CacheProvider` (EPIC-CACHING) for listing reads
- ⚪ CAT-004 (Service Implementation) — Catalog moderation queue hooks (feeds EPIC-ADMIN)

### EPIC-SEARCH — Search & Discovery
Scope: Search & Discovery · Primary hat(s): Architect, Digital PM · Status: Not Started · Hosted in: `catalog-service` (ADR-0009)
- ⚪ SRCH-001 (Service Implementation) — Search/filter by dietary preference (consumes Preference Snapshot per ADR context map)
- 🟢 SRCH-002 (Integration) — Blend sponsored placement into results (Partnership relationship w/ Advertising, per bounded context map)
- ⚪ SRCH-003 (Service Implementation) — Ranking logic, organic vs. sponsored

### EPIC-PREFERENCES — Preferences & Dietary Safety
Scope: Preferences & Dietary Safety · Primary hat(s): Architect, Digital PM · Status: Not Started · Hosted in: `catalog-service` (ADR-0009)
- ⚪ PREF-001 (Service Implementation) — Preference Profile CRUD
- 🟢 PREF-002 (Integration) — Publish Preference Snapshot via Open Host Service (per bounded context map) to Search + Ordering

### EPIC-ORDERING — Ordering & Fulfillment (pickup v1)
Scope: Ordering & Fulfillment · Primary hat(s): Architect, Engineering/Build · Status: Not Started
- ⚪ ORD-001 (Service Implementation) — Cart + checkout
- 🟢 ORD-002 (Service Implementation) — Order aggregate + lifecycle states (`Placed → Confirmed → InPreparation → ReadyForFulfillment → Completed`, per ADR-0001)
- 🟢 ORD-003 (Service Implementation) — Pickup Window scheduling (PickupFulfillment strategy, per ADR-0001)
- 🟢 ORD-004 (Interface/Contract) — `FulfillmentStrategy` interface (the ACL boundary itself, per ADR-0001) — this is the seam a future Delivery strategy would plug into
- 🟢 ORD-005 (Integration) — Publish domain events (`OrderPlaced`, `OrderCustomized`, `PickupWindowScheduled`, `OrderReadyForPickup`, `OrderCompleted` per ADR-0003/glossary) via the event backbone (EPIC-EVENTING)
- 🟢 ORD-006 (Integration) — Consumes `Repository<T>` for Cosmos-backed persistence (EPIC-DATA-STORE)

### EPIC-QUEUE-DISPLAY — Live Order-Queue Display
Scope: Ordering & Fulfillment (read-side) · Primary hat(s): Architect, Engineering/Build · Status: Not Started
- 🟢 QUE-001 (Service Implementation) — Read-model built from order events, not a direct query against the `orders` container (per ADR-0004's CQRS decision)
- ⚪ QUE-002 (Service Implementation) — `web-queue-display` app — live UI

### EPIC-FULFILLMENT-EXT — Delivery/Dispatch (v2, deferred)
Scope: Ordering & Fulfillment (future) · Primary hat(s): Architect · Status: Deferred (by design, not a gap)
- 🟢 FUL-001 (Document/Artifact) — Only item planned for now: keep ADR-0001 current if delivery requirements firm up before this is actually scheduled. No build items exist yet on purpose.

### EPIC-VENDOR-ONBOARDING — Vendor Onboarding & Verification
Scope: Vendor Onboarding & Verification · Primary hat(s): Architect, Digital PM · Status: Not Started · Hosted in: `admin-service` (ADR-0009)
- ⚪ VEN-001 (Service Implementation) — Vendor profile + `VendorType` (Shop | Independent) per glossary
- ⚪ VEN-002 (Service Implementation) — Verification status workflow (`Pending → Verified` / `Suspended`)
- 🟢 VEN-003 (Integration) — Stripe Connect Express onboarding flow (per ADR-0005) — store only the resulting connected-account ID + status, not raw KYC data

### EPIC-ADVERTISING — Advertising / Promotions
Scope: Advertising/Promotions · Primary hat(s): Digital PM, Architect · Status: Not Started · Hosted in: `catalog-service` (ADR-0009)
- ⚪ ADV-001 (Service Implementation) — Sponsored slot assignment (MVP-lite per portfolio-plan.md — simple flag, no bidding engine)
- ⚪ ADV-002 (Document/Artifact) — Monetization model detail (commission % vs. ad revenue split) — overlaps with EPIC-PRODUCT-STRATEGY, listed in both deliberately (see gap note below)

### EPIC-PAYMENTS — Payments & Payouts
Scope: Payments & Payouts · Primary hat(s): Architect, Engineering/Build · Status: Not Started
- 🟢 PAY-001 (Integration) — Stripe Connect destination charges + `application_fee_amount` commission split (ADR-0005)
- 🟢 PAY-002 (Service Implementation) — `payouts` container as reconciliation read-model, populated via Stripe webhooks (ADR-0004 + ADR-0005)
- 🟢 PAY-003 (Test/Mock/Chaos) — Webhook idempotency tests (dedupe on Stripe event ID, same pattern as ADR-0003's event dedupe)
- ⚪ PAY-004 (Service Implementation) — Basic refund initiation (chargebacks explicitly out of scope per ADR-0005 / Open Item #6)

### EPIC-REVIEWS — Reviews / Trust
Scope: Reviews/Trust · Primary hat(s): Digital PM · Status: Not Started · Hosted in: `ordering-service` (ADR-0009)
- ⚪ REV-001 (Service Implementation) — Basic rating tied to completed Order + Vendor (MVP-lite; fraud/trust scoring deferred per portfolio-plan.md)

### EPIC-NOTIFICATIONS — Notifications
Scope: Notifications · Primary hat(s): Engineering/Build · Status: Not Started
- 🟢 NOT-001 (Service Implementation) — Event-triggered dispatch only, no business logic of its own (Conformist, per bounded context map)
- ⚪ NOT-002 (Service Implementation) — Templates: order confirmation, allergy warning, low-stock alert

### EPIC-ADMIN — Admin / Moderation Console
Scope: Admin/Moderation · Primary hat(s): Engineering/Build, Operations · Status: Not Started
- ⚪ ADM-001 (Service Implementation) — Vendor verification queue UI
- ⚪ ADM-002 (Service Implementation) — Listing moderation queue UI
- 🟢 ADM-003 (Service Implementation) — Read-model consumer of other contexts' events (thin, per bounded context map — not a rich domain of its own)

---

## Cross-Cutting Technical Epics

### EPIC-CACHING — see `EPIC-CACHING.md` (existing, 3 of 5 items detailed — `CACHE-001`/`003`/`004` Ready for agents, `CACHE-002`/`005` held per open item #22)

### EPIC-EVENTING — Event-Driven Backbone
Scope: cross-cutting (all contexts) · Primary hat(s): Architect, Platform Engineering · Status: Started (1 of 5 items detailed)
- ✅ EVT-001 (Interface/Contract) — **Detailed, Ready for agents**, see `WI-EVT-001.md` — `IEventPublisher`/`IEventSubscriber` interfaces + envelope shape (ADR-0003), real C# per ADR-0010
- 🟢 EVT-002 (Service Implementation) — `EventGridPublisher`/`EventGridSubscriber` (cloud)
- 🟢 EVT-003 (Service Implementation) — `RedisStreamsPublisher`/`RedisStreamsSubscriber` (local)
- 🟢 EVT-004 (Test/Mock/Chaos) — Contract-test suite + `ChaosEventTransport` (duplicate/out-of-order/delayed/dropped delivery, per ADR-0003)
- ⚪ EVT-005 (Infra/Environment) — Terraform Event Grid custom topic + subscription filters

### EPIC-DATA-STORE — Cosmos DB Repositories
Scope: cross-cutting (all contexts) · Primary hat(s): Architect, Platform Engineering · Status: Started (1 of 4 items detailed)
- ✅ DATA-001 (Interface/Contract) — **Detailed, Ready for agents**, see `WI-DATA-001.md` — `IRepository<T>` interface (ADR-0004), real C# per ADR-0010
- 🟢 DATA-002 (Service Implementation) — `CosmosRepository<T>` per container (`catalog`, `orders`, `vendors`, `preferences`, `reviews`, `payouts`)
- 🟢 DATA-003 (Test/Mock/Chaos) — `FakeRepository<T>` + contract tests against the Cosmos emulator
- ⚪ DATA-004 (Infra/Environment) — Terraform Cosmos account + per-container partition key config

### EPIC-AUTH — Auth/Authz
Scope: cross-cutting (all contexts) · Primary hat(s): Architect, Platform Engineering · Status: Started (1 of 4 items detailed)
- ✅ AUTH-001 (Interface/Contract) — **Detailed, Ready for agents**, see `WI-AUTH-001.md` — JWT middleware + ownership checker, real C# per ADR-0010; explicitly unaffected by the pending Entra External ID swap (open item #21)
- ⚪ AUTH-002 (Service Implementation) — Per-service role + resource-ownership checks (unchanged by `EPIC-API-GATEWAY` — APIM adds an edge fast-fail check per ADR-0008, this remains the authoritative one per zero-trust principles)
- 🟢 AUTH-003 (Test/Mock/Chaos) — Deterministic tests: expired/tampered/malformed token handling (ADR-0006 — explicitly not a live chaos decorator, see ADR's own reasoning)
- 🛑 AUTH-004 (Infra/Environment) — **HOLD — do not assign to agents.** Tenant + policy configuration — targets Microsoft Entra External ID, not Azure AD B2C, per open item #21. Held until that migration decision is finalized.

### EPIC-SECRETS — Secrets Management
Scope: cross-cutting (all contexts) · Primary hat(s): Platform Engineering · Status: Started (2 of 3 items detailed, Ready for agents)
- ✅ SEC-001 (Infra/Environment) — **Detailed, Ready for agents**, see `WI-SEC-001.md` — per-environment Key Vault + managed identity RBAC (ADR-0007)
- 🟢 SEC-002 (Service Implementation) — Cosmos DB access via managed identity (eliminating the connection-string secret, per ADR-0007) — blocked by `DATA-002` (CosmosRepository implementation, not yet detailed)
- ✅ SEC-003 (Test/Mock/Chaos) — **Detailed, Ready for agents**, see `WI-SEC-003.md` — fail-fast startup validation, deterministic tests only per ADR-0007

### EPIC-API-GATEWAY — Azure API Management
Scope: cross-cutting (all frontend-to-service traffic) · Primary hat(s): Architect, Platform Engineering · Status: Not Started
- 🟢 GW-001 (Infra/Environment) — Terraform: APIM Consumption tier resource + route configuration for all four backend services (ADR-0008)
- 🟢 GW-002 (Infra/Environment) — Policy config: `Validate JWT` fast-fail policy + coarse role-based routing, versioned as code in the repo (ADR-0008) — does not replace `AUTH-002`'s per-service checks, both exist
- 🟢 GW-003 (Test/Mock/Chaos) — Static policy-config lint in CI (parses policy XML, asserts expected routes/policies present, no live instance needed)
- 🟢 GW-004 (Infra/Environment) — Shared dev-tier APIM instance for real policy integration testing (same shape as Stripe test-mode testing per ADR-0005)
- 🟢 GW-005 (Infra/Environment) — Local reverse-proxy stand-in (Compose service) mirroring APIM's path-based routing for URL/structural parity
- 🟢 GW-006 (Infra/Environment) — Coarse per-subscription rate-limit policy — overlaps with `EPIC-RATE-LIMITING`'s `RATE-004`, deliberately cross-listed (see gap note below); Consumption tier does not support `rate-limit-by-key`, so this does not cover per-user/per-content abuse prevention

### EPIC-SHARED-TOOLING — Reusable Packages
Scope: cross-cutting · Primary hat(s): Platform Engineering · Status: Started (2 of 4 items detailed, Ready for agents)
- ✅ TOOL-001 (Interface/Contract) — **Detailed, Ready for agents**, see `WI-TOOL-001.md` — domain event payload records, fully independent of batch 1
- ✅ TOOL-002 (Interface/Contract) — **Detailed, Ready for agents**, see `WI-TOOL-002.md` — correlation-ID middleware + structured logging convention
- 🟢 TOOL-003 (Interface/Contract) — `/tools/auth-middleware` — same item as `AUTH-001`, already detailed and Ready for agents there (see `WI-AUTH-001.md`); this line stays as the deliberate cross-listing pointer, not a duplicate
- ⚪ TOOL-004 (Service Implementation) — Shared fault-injection harness (used by EPIC-CACHING, EPIC-EVENTING, EPIC-DATA-STORE chaos items)

---

## Platform Engineering / Delivery Infrastructure Epics

### EPIC-LOCAL-DEV — Local Development Environment
Scope: cross-cutting · Primary hat(s): Platform Engineering · Status: Not Started
- 🟢 DEV-001 (Infra/Environment) — Real `docker-compose.yml`: Redis Streams (default), Cosmos emulator (default), cache Redis (profile-gated), per ADR-0002/0003/0004
- 🟢 DEV-002 (Infra/Environment) — Stripe CLI webhook forwarding setup (ADR-0005)
- ⚪ DEV-003 (Infra/Environment) — Seed/fixture data script

### EPIC-CI-CD — CI/CD Pipeline
Scope: repo-level · Primary hat(s): Platform Engineering · Status: Not Started
- ⚪ CI-001 (Infra/Environment) — Real build/test stages, replacing the current placeholder
- ⚪ CI-002 (Infra/Environment) — OIDC federated deploy step per environment
- ⚪ CI-003 (Infra/Environment) — Ephemeral/preview environment, at least one working example (Open Item #15)

### EPIC-CLOUD-INFRA — Terraform / Cloud Environments
Scope: cross-cutting · Primary hat(s): Platform Engineering, Architect · Status: Not Started
- ⚪ INFRA-001 (Infra/Environment) — Per-environment `.tfvars` (dev/staging/prod), matching existing `/infra/environments` scaffold
- ⚪ INFRA-002 (Infra/Environment) — Container Apps compute + Static Web Apps frontend hosting (per tech-stack.md)

### EPIC-REPO-OPS — Repo/Tooling Meta-Infrastructure
Scope: repo-level · Primary hat(s): Manager/Lead, Platform Engineering · Status: Not Started
- ⚪ REPO-001 (Infra/Environment) — Publish docs site via GitHub Pages (`mkdocs gh-deploy` or Pages Action) — `mkdocs.yml` already ready (Open Item #13)
- ⚪ REPO-002 (Infra/Environment) — GitHub Projects board setup (`Backlog → Ready → In Progress → Review → Done`, per portfolio-plan.md) (Open Item #12)

---

## Architecture & Operations Artifact Epics

### EPIC-ARCH-DOCS — Remaining Architecture Documents
Scope: cross-cutting-artifact · Primary hat(s): Architect · Status: Started (5 of 6 items done — only ARCH-005 left, low priority)
- ✅ NFR-001 (Document/Artifact) — **Done**, see `docs/architecture/nfrs.md` + `WI-NFR-001.md`
- ✅ ARCH-001 (Document/Artifact) — **Done**, see `docs/architecture/c4/context.md` + `container.md` — surfaced and resolved a bounded-context-to-service mapping gap, formalized as ADR-0009
- ✅ ARCH-002 (Document/Artifact) — **Done**, see `docs/architecture/capability-map.md` + `WI-ARCH-002.md` — business-facing re-grouping of `bounded-contexts.md`, consistent with ADR-0009's service mapping
- ✅ ARCH-003 (Document/Artifact) — **Done**, see `docs/architecture/data-model-api-contracts.md` + `WI-ARCH-003.md` — per-service Cosmos document shapes, events, and API endpoints; resolved the event-dedupe store location (CacheProvider) and made the ADR-0004 read-model split concrete (`order-status-readmodel`)
- ✅ ARCH-004 (Document/Artifact) — **Done**, see `docs/architecture/ddd/event-storming.md` + `WI-ARCH-004.md` — surfaced 4 previously-unnamed events (`ReviewSubmitted`, `PayoutReconciled`, `ListingApproved`, `ListingRejected`), added to glossary.md and `data-model-api-contracts.md`
- ⚪ ARCH-005 (Document/Artifact) — Component-level C4 diagrams for `ordering-service` and `catalog-service`, explicitly deferred from `WI-ARCH-001`'s scope — logged now so it's tracked rather than just remembered

### EPIC-OPS-ARTIFACTS — Operations/SRE Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Operations · Status: Started (2 of 4 items done)
- ✅ OPS-001 (Document/Artifact) — **Done**, see `docs/operations/sla.md` + `WI-OPS-001.md` — 99.0% monthly target, error budget policy, latency targets, known failure modes, all traced to `nfrs.md`/ADRs
- ⚪ OPS-002 (Document/Artifact) — Runbook, tied to a real failure mode from the ADRs (candidates: Redis fallback per ADR-0002, Cosmos throttling per ADR-0004)
- ✅ OPS-003 (Document/Artifact) — **Done**, see `docs/operations/monitoring-alerting.md` + `WI-OPS-003.md` — policy layer (thresholds), distinct from `EPIC-OBSERVABILITY`'s implementation layer
- ⚪ OPS-004 (Document/Artifact) — On-call pattern doc (hypothetical)

### EPIC-GOVERNANCE — Governance Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Governance · Status: Started (open items register active, GOV-001 done)
- ✅ (ongoing) `docs/governance/open-items-register.md` — active, not a discrete work item, a living document
- ✅ GOV-001 (Document/Artifact) — **Done**, see `docs/governance/architecture-review.md` + `WI-GOV-001.md` — explicitly distinguishes this project's ADR governance from `project-process-framework/discovery/README.md`'s separate scope
- ⚪ GOV-002 (Document/Artifact) — Explicit scope decision on legal artifacts (Terms of Service, Privacy Policy): in or out for v1, and why. Never appeared anywhere before this review pass, not even as a "scoped out" note — worth an explicit decision either way rather than continued silence, especially given the playbook was deliberately generalized to work for real projects too.

---

## Manager/Lead & Product Strategy Epics

### EPIC-PM-ARTIFACTS — Manager/Lead Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Manager/Lead · Status: Started (3 done, 3 in review, 2 not started)
- 🟡 MGMT-001 (Document/Artifact) — drafted, see `docs/management/project-plan.md` + `WI-MGMT-001.md` — 1 open decision (relative vs. calendar-date phasing)
- 🟡 MGMT-002 (Document/Artifact) — drafted, see `docs/management/risk-register.md` + `WI-MGMT-002.md` — 1 open decision (confirm likelihood/impact ratings)
- ⚪ MGMT-003 (Document/Artifact) — RACI (hypothetical team)
- ✅ MGMT-004 (Document/Artifact) — **Done**, see `docs/process/engineering-standards.md` + `WI-MGMT-004.md`
- 🟡 MGMT-005 (Document/Artifact) — drafted, see `docs/management/budget-cost-estimate.md` + `WI-MGMT-005.md` — 1 open decision (labor/time cost, deliberately not invented)
- ⚪ MGMT-006 (Document/Artifact) — Team structure + hiring plan (hypothetical)
- ✅ MGMT-007 (Document/Artifact) — **Done**, see `docs/management/stakeholder-communications-plan.md` + `WI-MGMT-007.md` — deliberately not blocked on `MGMT-006`
- ✅ MGMT-008 (Document/Artifact) — **Done**, see `docs/process/branching-strategy.md` + `WI-MGMT-008.md` — trunk-based + feature flags, repo-wide versioning; surfaced a new gap (API/URL versioning via APIM, not yet decided — see `PARKING-LOT.md`)

### EPIC-PRODUCT-STRATEGY — Digital PM Artifacts
Scope: cross-cutting-artifact · Primary hat(s): Digital PM · Status: Started (1 of 4 done)
- ✅ PROD-001 (Document/Artifact) — **Done**, see `docs/product/personas.md` + `WI-PROD-001.md`
- ⚪ PROD-002 (Document/Artifact) — Competitive scan
- ⚪ PROD-003 (Document/Artifact) — Monetization model — overlaps with `ADV-002` above; deliberately listed in both places rather than picking one home (see gap note below)
- ⚪ PROD-004 (Document/Artifact) — OKRs / success metrics (north-star safety metric already named in vision; needs the rest)

---

## Launch & Support Epic

### EPIC-GOLIVE-SUPPORT — Go-Live & Refinement
Scope: cross-cutting-artifact (post-MVP) · Primary hat(s): Operations, Manager/Lead · Status: Deferred (post-launch, by design)
- ⚪ LAUNCH-001 (Test/Mock/Chaos) — Incident/game-day drill (real incident if one occurs first; a deliberate drill otherwise, per `project-process-framework/core/phase-sequence.md` Phase 8 guidance)
- ⚪ LAUNCH-002 (Document/Artifact) — Postmortem from the above drill
- 🟢 LAUNCH-003 (Document/Artifact) — Roadmap update naming delivery/dispatch (EPIC-FULFILLMENT-EXT) as the next planned extension
- 🟢 LAUNCH-004 (Service Implementation) — One feature-flagged iteration (uses `FLAG-001`), per `portfolio-plan.md`'s original refinement-phase step — this had dropped out of the outline until this review pass

### EPIC-OBSERVABILITY — Instrumentation
Scope: cross-cutting-artifact · Primary hat(s): Platform Engineering, Operations · Status: Not Started
- ⚪ OBS-001 (Service Implementation) — Application Insights wiring per service
- 🟢 OBS-002 (Integration) — Correlation-ID propagation across services, using `/tools/logging-helper` (`TOOL-002`)
- ⚪ OBS-003 (Document/Artifact) — Actual dashboard construction implementing `OPS-003`'s thresholds (corrected: `OPS-003` is the policy layer this item implements against, not the other way around — see `docs/operations/monitoring-alerting.md`)

### EPIC-RATE-LIMITING — Rate Limiting / Abuse Prevention
Scope: cross-cutting-artifact · Primary hat(s): Architect, Platform Engineering · Status: Not Started
- ⚪ RATE-001 (Service Implementation) — API-level rate limiting
- ⚪ RATE-002 (Service Implementation) — Review/rating abuse detection (fake reviews) — overlaps with `EPIC-REVIEWS`, deliberately cross-listed rather than picked into one home (same pattern as the monetization-model overlap noted below)
- ⚪ RATE-003 (Service Implementation) — Ad-fraud detection basics — overlaps with `EPIC-ADVERTISING`, same deliberate cross-listing
- 🟢 RATE-004 (Infra/Environment) — Coarse per-subscription throttling at the API Gateway — overlaps with `EPIC-API-GATEWAY`'s `GW-006`; per ADR-0008, this does NOT cover `RATE-001`/`002`/`003`'s per-user/per-content concerns, since Consumption tier lacks `rate-limit-by-key`

### EPIC-FEATURE-FLAGS — Feature Flag Implementation
Scope: cross-cutting-artifact · Primary hat(s): Platform Engineering · Status: Not Started
- 🟢 FLAG-001 (Service Implementation) — Feature-flag pattern, per `tech-stack.md`'s configuration-management principle
- ⚪ FLAG-002 (Integration) — First real usage: flagging the refinement-phase iteration (`LAUNCH-004`, added below)

### EPIC-DATA-PRIVACY — Sensitive Data Handling
Scope: cross-cutting-artifact · Primary hat(s): Architect, Governance · Status: Not Started
- ⚪ PRIV-001 (Document/Artifact) — Explicit sensitive-data-handling doc for dietary/allergy data (quasi-health data) — this has been named repeatedly across the vision, NFRs, and glossary but only ever as a mention inside another document; it's been raised often enough to warrant its own artifact rather than staying a paragraph inside `NFR-001`
- ⚪ PRIV-002 (Document/Artifact) — Data retention/deletion policy for customer preference profiles

### EPIC-BACKUP-DR — Backup / Disaster Recovery Baseline
Scope: cross-cutting-artifact · Primary hat(s): Platform Engineering, Operations · Status: Not Started
- ⚪ BDR-001 (Infra/Environment) — Cosmos DB point-in-time restore configuration
- ⚪ BDR-002 (Infra/Environment) — Key Vault soft-delete + purge protection (ties to ADR-0007)
- ⚪ BDR-003 (Document/Artifact) — Lightweight DR runbook — overlaps with `OPS-002`, deliberately cross-listed

### EPIC-FRONTEND-QUALITY — Accessibility & Internationalization
Scope: cross-cutting-artifact · Primary hat(s): Engineering/Build · Status: Not Started
- ⚪ FE-001 (Service Implementation) — Baseline accessibility pass (`web-customer`, `web-admin`, `web-queue-display`) — named early as part of "a reasonably interesting UI," never resurfaced until now
- ⚪ FE-002 (Service Implementation) — i18n scaffolding (even if only English is shipped for v1, per ADR-0005's single-region/currency assumption) — structure now, populate later

### EPIC-BACKLOG-PLANNING — Backlog Meta-Work
Scope: cross-cutting-artifact · Primary hat(s): Product Owner · Status: Not Started
- ⚪ PLAN-001 (Document/Artifact) — Prioritization output (MoSCoW/RICE) applied to this master outline — listed as "Planned" in `project-log.md` but had fallen out of the outline itself until now
- ⚪ PLAN-002 (Document/Artifact) — Sprint plan (first 2–3 sprints), depends on `PLAN-001`

---

## Suggested Build Order (rough — not the formal prioritization exercise)

Not a substitute for `PLAN-001`, just a rough sanity check so the outline isn't just an unordered pile:

1. **Foundational/cross-cutting first**: `EPIC-EVENTING`, `EPIC-DATA-STORE`, `EPIC-AUTH`, `EPIC-SECRETS`, `EPIC-API-GATEWAY`, `EPIC-SHARED-TOOLING`, `EPIC-CACHING` — everything else depends on these existing
2. **Core domain slice**: `EPIC-CATALOG`, `EPIC-PREFERENCES`, `EPIC-ORDERING`, `EPIC-QUEUE-DISPLAY` — the walking-skeleton path from `portfolio-plan.md`'s original Sprint 1/2
3. **Remaining domain epics**: `EPIC-VENDOR-ONBOARDING`, `EPIC-SEARCH`, `EPIC-ADVERTISING`, `EPIC-PAYMENTS`, `EPIC-REVIEWS`, `EPIC-NOTIFICATIONS`, `EPIC-ADMIN`
4. **Delivery infrastructure**: `EPIC-LOCAL-DEV`, `EPIC-CI-CD`, `EPIC-CLOUD-INFRA`, `EPIC-REPO-OPS`
5. **Quality/hardening epics**: `EPIC-OBSERVABILITY`, `EPIC-RATE-LIMITING`, `EPIC-FEATURE-FLAGS`, `EPIC-DATA-PRIVACY`, `EPIC-BACKUP-DR`, `EPIC-FRONTEND-QUALITY` — can run partly in parallel with (3), not strictly after
6. **Artifact epics** (`EPIC-ARCH-DOCS`, `EPIC-OPS-ARTIFACTS`, `EPIC-GOVERNANCE`, `EPIC-PM-ARTIFACTS`, `EPIC-PRODUCT-STRATEGY`) — largely parallel to everything else; not blocked by build progress
7. **Launch**: `EPIC-GOLIVE-SUPPORT`, last

---

## Gaps identified while building this outline (resolved ones kept for history, not deleted)

1. **Deliberate cross-listing (resolved)** — `work-item-template.md` now has a `Shared with epic(s):` field, added specifically because five instances of this (monetization model, `/tools/auth-middleware`, review/ad-fraud abuse detection, the DR runbook, and the gateway rate-limit policy) showed up before the field existed. The five existing cross-listed items above still use the old manual-note style rather than the new field — a small backfill, not yet done, moved to `PARKING-LOT.md` rather than left here.
2. **Non-technical epics' Scope field (resolved)** — standardized to exactly two values (`cross-cutting-artifact`, `repo-level`), both the template and all epics in this file backfilled to match.
3. **API Gateway / BFF layer — resolved.** ADR-0008 decided Azure API Management (Consumption tier) with zero-trust dual validation — APIM performs an edge fast-fail check, every service still independently validates per ADR-0006. `EPIC-API-GATEWAY` added, `AUTH-002` and `RATE-004`/`GW-006` annotated to reflect the actual scope boundary (the gateway does not replace per-service auth or per-user rate limiting — Consumption tier's lack of `rate-limit-by-key` was the key finding that shaped this).
4. **Context completeness (resolved, process-level)** — a "zero trust" assumption existed only in the human's head until an unrelated decision (API Gateway) surfaced it. Fixed at the process level, not just here: `project-process-framework/core/context-completeness.md` now names "surprise as a trigger," two front-loaded checklists (`templates/technology-decision-checklist.md`, `templates/business-decision-checklist.md`) exist for the preventive side, and the work-item template gained categorized (not flat) references, a "You do not need to know about" field, and a transient "Open Points (working)" section. Applied here: `vision.md` gained an explicit zero-trust principle, ADR-0006 gained an explicit token-storage/CSRF note, and `WI-NFR-001` now explicitly requires both plus injection-protection content.
5. **Bounded-context-to-service mapping — resolved.** Formalized as ADR-0009: 13 bounded contexts grouped onto the 4 existing services (`catalog-service`, `ordering-service`, `admin-service`, `notification-service`), with a binding "modular monolith" rule that co-located contexts still communicate through the same interfaces/events they'd use if physically separate. The root cause (scaffolding making a real decision by default, before any decision-record discipline existed) is also fixed at the process level: `core/phase-sequence.md` Phase 4 now requires this mapping be explicit before scaffolding, and both `technology-decision-checklist.md` and `architecture-patterns.md` were updated to name the pattern.
