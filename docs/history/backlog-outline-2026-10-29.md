# Backlog outline, as of 2026-10-29 (historical)

> **Status:** Historical · split out of `MASTER-BACKLOG-OUTLINE.md` on 2026-10-30. The agent-ready queue, the batches, "On Deck", the build order and the gaps list are kept here as a record of how the work was sequenced in September to October 2026. Nothing here is maintained. The epics are in `docs/product/backlog/epic-catalog.md`; status is in `docs/product/backlog/STATUS.md`.

# Master Backlog Outline

A high-level list only — titles and, where already known from existing ADRs/decisions, a short detail. Full work-item detail (per `peer-A/templates/work-item-template.md`) comes later, one epic at a time. Two items are already fully drafted as validation examples: `WI-CACHE-001` and `WI-NFR-001` — see `EPIC-CACHING.md`.

Related trackers, not duplicated here: `docs/product/backlog/PARKING-LOT.md` (transient, per-conversation open items), `docs/governance/open-items-register.md` (permanent tradeoffs/tech debt), `docs/ACTIVITY-LOG.md` (chronological record of what's been done), `docs/product/backlog/LOCAL-MILESTONES.md` (what a fully-local run actually *does* at each stage — a different axis than the batch numbering below, which tracks agent-assignment safety, not runnable functionality).

> **2026-10-26 reconciliation — portfolio-slice decisions (ADR-0012 to ADR-0016).** Frontend moves to Next.js SSR (supersedes ADR-0011), a GraphQL BFF + Relay is added, the cache gains Relay/HTTP layers on top of ADR-0002, CI/CD moves to Azure Pipelines, and tracing uses OpenTelemetry + W3C Trace Context. Existing items are kept; those affected are marked inline below as **SUPERSEDED**, **ADJUSTED** or **OBSOLETE (cancelled)**, and each detailed item file has a matching dated note. Full record: `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`. New work: `EPIC-PORTFOLIO-SLICE` (below).

## Agent-Ready Queue (safe to assign to AI coding agents right now)

**Batch 1 — reviewed 2026-09-12.** All six items pass spec review (interface signatures match verbatim, required contract-test cases present) and passed the agents' own test runs. See `docs/ACTIVITY-LOG.md`'s 2026-09-12 entry for the detailed review notes, including one minor non-blocking nuance on `AUTH-001`'s issuer-swap test coverage.

| Item | Type | What it produces | Status |
|---|---|---|---|
| `WI-CACHE-001` | Interface/Contract | `ICacheProvider` + contract test base | Done — reviewed |
| `WI-EVT-001` | Interface/Contract | `IEventPublisher`/`IEventSubscriber` + envelope | Done — reviewed |
| `WI-DATA-001` | Interface/Contract | `IRepository<T>` + contract test base | Done — reviewed |
| `WI-AUTH-001` | Interface/Contract | JWT middleware + `IResourceOwnershipChecker` | Done — reviewed |
| `WI-CACHE-003` | Service Implementation | `LocalCacheProvider` + `ResilientCacheProvider` | Done — reviewed |
| `WI-CACHE-004` | Test/Mock/Chaos | `ChaosCacheProvider` + fallback proof tests | Done — reviewed |

**Batch 2 — done, reviewed.** Fully independent of Batch 1, zero coordination risk — this held up in review.

| Item | Type | What it produces | Notes |
|---|---|---|---|
| `WI-TOOL-001` | Interface/Contract | Domain event payload records | Done — reviewed |
| `WI-TOOL-002` | Interface/Contract | Correlation-ID middleware + logging convention | Done — reviewed |
| `WI-SEC-001` | Infra/Environment | Key Vault + managed identity Terraform | Done — reviewed |
| `WI-SEC-003` | Test/Mock/Chaos | Fail-fast secret-validation tests | Done — reviewed |

**Batch 3 — foundational build toward full local end-to-end, ready for agents (added 2026-09-12).** Prioritized by a working session focused on getting the whole project running locally before any cloud-caching-vendor or cloud-gateway decisions matter. No internal dependencies between these five — fully parallel.

| Item | Type | What it produces | Notes |
|---|---|---|---|
| `WI-DATA-002` | Service Implementation | `CosmosRepository<T>` | Blocks `SEC-002` |
| `WI-CACHE-002` | Service Implementation | `RedisCacheProvider` | Unblocked — vendor question only affects `CACHE-005`, not this item (see open item #22) |
| `WI-EVT-003` | Service Implementation | `RedisStreamsPublisher`/`Subscriber` | Prioritized ahead of `EVT-002` (EventGridPublisher, cloud-only, not needed for local e2e) |
| `WI-AUTH-002` | Service Implementation | Per-service resource-ownership check pattern + reference example | — |
| `WI-AUTH-005` | Service Implementation | Local mock OIDC/JWT issuer | Revised 2026-09-13 (Size S→M) — now also a real browser PKCE authorization-code flow, per ADR-0011's requirement and ADR-0006's corresponding amendment note. Closed a real gap: ADR-0006 describes this issuer, nothing had built it. Fully independent of the Entra swap. |

**Batch 3b — local environment wiring, depends on Batch 3 landing.**

| Item | Type | What it produces | Notes |
|---|---|---|---|
| `WI-DEV-002` | Infra/Environment | Real `docker-compose.yml` | **Done 2026-10-26** (verified under Docker; `docs/operations/local-dev.md`). Was: soft-blocked by Batch 3. Renumbered 2026-09-13 from `DEV-001` to `DEV-002` — `DEV-001` is now the base .NET solution/project scaffold (see `WI-DEV-001.md`), which needed to sit ahead of this item numerically since real service projects are a harder prerequisite than the Compose file itself. |
| `WI-DEV-004` | Infra/Environment | Seed/fixture data script | **Done 2026-10-27** (merged, PR #1): `tools/BakeryMarketplace.Seed`; verified against the real Cosmos emulator and Redis Streams. Preference profiles deferred to `PREF-001`. Seed source for the first end-to-end run. Renumbered 2026-09-13 from `DEV-003` to `DEV-004` — see the `DEV-001`/`DEV-002` renumbering note above; this shift is purely cosmetic, no content changed. |

**Batch 4 — walking skeleton (Layer 3), ready for agents once Batch 3/3b land (added 2026-09-12).** This is the actual customer-browse-to-order path per `portfolio-plan.md`'s original Sprint 1/2 scope. `ORD-004` is the one true blocking node — everything Order-related waits on the fulfillment seam being frozen first. **Also blocked on `WI-DEV-001`** (base .NET solution scaffold, added 2026-09-13) — every item below needs a real service project to add code to, not just the shared `/tools` libraries Batch 1/2 already scaffolded.

| Item | Type | What it produces | Blocked by |
|---|---|---|---|
| `WI-ORD-004` | Interface/Contract | `FulfillmentStrategy` seam (ACL boundary, ADR-0001) | `DEV-001` |
| `WI-CAT-001` | Service Implementation | Listing CRUD + modifier/allergy model | `DATA-002`, `EVT-003`, `AUTH-002`, `DEV-001` |
| `WI-ORD-002` | Service Implementation | `Order` aggregate + lifecycle states | **Built 2026-10-28, merged to main** (branch `feature/slice-ordering`): in-memory aggregate, 114 local tests, not run on Azure. Lifecycle changed from the spec after a review with the human lead: `docs/architecture/order-lifecycle.md` |
| `WI-ORD-003` | Service Implementation | `PickupFulfillment` strategy | partly built 2026-10-28: the pickup schedule (window source, lead time, Eastern hours in UTC) came with `ORD-001`, and `GET /ordering/pickup-windows` is built on it; `PickupFulfillment` (events, pickup-confirmed command) remains |
| `WI-ORD-006` | Integration | Order persistence via `Repository<T>` | **Built 2026-10-28, merged to main** (136 local tests + 3 on the real Cosmos emulator; not yet wired into the service host) |
| `WI-ORD-005` | Integration | Publish Order events via event backbone | **Built 2026-10-28, merged to main** (outbox in the order document, inline publish plus relay sweep; 258 ordering tests, also on Linux; verified on the real stack incl. a Redis outage; Placed-to-Completed on Redis was run later, under `ORD-007`; open items 72-75) |
| `WI-CAT-003` | Integration | Cache-aside integration for listing reads | `CAT-001`, `CACHE-002` |
| `WI-ORD-001` | Service Implementation | Cart + checkout (payment stubbed — `EPIC-PAYMENTS` not yet built) | **Built 2026-10-28, merged to main** (221 ordering tests, also on Linux; verified end to end on the real stack; payment is a stub, `OrderPlaced` is not yet published) |
| `WI-ORD-007` | Service Implementation | Order action endpoints: vendor confirm/decline/start/ready/complete/cancel, customer cancel (added 2026-10-28, approved) | **Built 2026-10-28, merged to main** (320 ordering tests, also on Linux; verified on the real stack incl. Placed-to-Completed on Redis; `complete` is direct until `ORD-003`; open item 76) |
| `WI-ORD-008` | Service Implementation | Automatic confirmation of orders with no options and no requested pickup window (added 2026-10-28, approved as D-A option 1) | **Built 2026-10-28, merged to main** (337 ordering tests; five mutation checks; per-item flag deferred) |
| `WI-QUE-001` | Service Implementation | Order-status read-model (event-fed, CQRS) | `ORD-005`, `EVT-003`, `DATA-002` |

Two real design choices surfaced while detailing this batch, captured as Open Points on the relevant items rather than decided silently — see `WI-CAT-001.md` (where catalog-service stores derived vendor-verification status) and `WI-ORD-001.md` (the exact shape of the payment-step stub). Neither blocks starting the batch; both should be confirmed before/during implementation.

**Batch 5 — Preferences & Vendor Onboarding domain items, detailed 2026-09-13.** Surfaced while scoping the customer-facing frontend (`EPIC-WEB-CUSTOMER`): the walking skeleton in Batch 4 covers Catalog and Ordering, but Preferences & Dietary Safety and Vendor Onboarding & Verification — both named in `portfolio-plan.md`'s original scope — had no detailed items. See `BATCH-5-CURATION.md` for the full rationale and the same two preconditions Batch 4 already established (Batch 1 verified against spec; `WI-DEV-001` drafted — confirm it's actually merged before assigning agents).

| Item | Type | What it produces | Notes |
|---|---|---|---|
| `WI-PREF-001` | Service Implementation | Preference Profile CRUD | Blocks `PREF-002`, `SRCH-001` |
| `WI-PREF-002` | Integration | Publishes `PreferenceSnapshotPublished` (new event, named while detailing this item) to Search (in-process) + Ordering (event backbone) | Blocked by `PREF-001`; also updated `glossary.md` and `data-model-api-contracts.md` in the same pass |
| `WI-VEN-001` | Service Implementation | Vendor profile + application (`VendorType`) | Also added `POST/GET/PUT /admin/vendors...` endpoints, a small gap resolved while detailing this item — see the file's own Context/Why |
| `WI-VEN-002` | Service Implementation | Verification status workflow, publishes `VendorVerified`/`VendorSuspended` | Blocked by `VEN-001`; this is the real implementation `DEV-004`'s seed-script workaround stands in for locally |

**Batch 6 — dietary-safety personalization (M4), detailed 2026-09-14.** Scoped directly from `docs/product/backlog/LOCAL-MILESTONES.md`'s M4 milestone — the gap between "preference data exists" (Batch 5) and "a customer can actually use it in a browser." Closes vision principle 1's headline promise for real, not just as stored data.

| Item | Type | What it produces | Notes |
|---|---|---|---|
| `WI-SRCH-001` | Service Implementation | Personalized listing search — flags conflicts by default, `hideConflicts` opt-in | Blocked by `PREF-002`, `CAT-001`; blocks `CUST-006` |
| `WI-CUST-005` | Service Implementation | Preferences/dietary-profile UI page | Blocked by `WI-WEB-001`, `PREF-001` — no dependency on `SRCH-001` |
| `WI-CUST-006` | Service Implementation | Personalized allergen highlighting + hide-conflicts toggle on the existing browse view | Blocked by `SRCH-001`, `CUST-002` (already built) |

Explicitly still deferred (M5 and beyond, per `LOCAL-MILESTONES.md`): admin console UI, vendor listing-management UI, everything else already named as out of scope.

**Explicitly held from agent assignment** — do not queue these until the noted decision finalizes:
- `AUTH-004` (Entra External ID tenant/policy config) — open item #21
- `CACHE-005` (Terraform Redis toggle / cloud cache vendor provisioning) — open item #22, cloud caching backend deliberately deferred per 2026-09-12 session
- `EVT-002` (EventGridPublisher) — not held for a decision reason, just deprioritized behind `EVT-003` since it's cloud-only and not on the local-e2e critical path
- `GW-*` (API Gateway items) — ADR-0008 already says skip the gateway locally; no local-e2e need for these yet

**Frontend work, resolved 2026-09-13 (was: "Known gap, not yet a batch").** *(2026-10-26: framework and data path changed by ADR-0012/0013; `WEB-001` superseded, the `CUST-*` items and `QUE-002` adjusted. See the `EPIC-WEB-CUSTOMER` section.)* `EPIC-WEB-CUSTOMER` now exists with four detailed, Ready items (`WEB-001`, `CUST-002`, `CUST-003`, `CUST-004`) — see that epic file. `QUE-002` (`web-queue-display`'s UI) is likewise now detailed, sharing `WEB-001`'s scaffold rather than duplicating it. `web-admin` remains correctly out of scope: its backend epics (`EPIC-ADMIN`, `EPIC-VENDOR-ONBOARDING`) don't exist yet, so there is nothing for a `web-admin` frontend to call. The frontend items above are blocked by `WI-AUTH-005` (revised) for its PKCE endpoints, and independent of `WI-DEV-001`'s backend service scaffold.

**Portfolio slice — added 2026-10-26.** See `EPIC-PORTFOLIO-SLICE.md` and `docs/management/portfolio-slice/`.

| Item | Type | What it produces | Status / blocked by |
|---|---|---|---|
| `WI-PORT-001` | Test/Mock/Chaos | Next.js Pages Router + Relay SSR proof | **Done 2026-10-26** — proceed; in-repo Relay pattern, `relay-nextjs` rejected on security grounds. Evidence: `docs/evidence/WI-PORT-001/findings.md` |
| `WI-PORT-006` | Document/Artifact | Reconcile existing artifacts with ADR-0012 to ADR-0016 | In Progress — pass 1 (decision level) done 2026-10-26; pass 2: the `data-model-api-contracts.md` row done 2026-10-28, other rows open |
| `WI-PORT-007` | Interface/Contract | First-slice contract + GraphQL↔REST mapping, seed contract, error/state behavior | **Done 2026-10-28** — D-1 to D-4 accepted 2026-10-26, D-5 to D-10 accepted 2026-10-28 (`docs/architecture/first-slice-contract.md`); §4/§5 moved into `data-model-api-contracts.md` (`PORT-006` pass 2). Broad delegation is no longer waiting on approvals |
| `WI-PORT-002` | Integration | Walking skeleton: SSR → BFF → C# listing read, test, pipeline, trace **Built 2026-10-28, merged to main** (branch `feature/WI-PORT-002-walking-skeleton`; local run 5/5 smoke + 16/16 BFF tests; Azure pipeline written but not run; no OpenTelemetry export yet). Was Ready — `CAT-001` and `PORT-001` done; open: seed for the first end-to-end run — `DEV-004` seed done 2026-10-27, so the seed no longer blocks it |
| `WI-PORT-003` | Infra/Environment | Quality + Azure Pipelines CI baseline (supersedes `CI-001`) | **Built 2026-10-28, merged to main** (branch `feature/WI-PORT-003-ci-baseline`); all commands run locally, **Azure DevOps run green 2026-10-28** (reported by the human lead; most recent recorded run `#20261029.4`, 2026-10-29); formatter/linter gates added; GitHub placeholder stays until ADR-0015 exit criterion 2 |
| `WI-PORT-004` | Interface/Contract | Cache contract for the listing path, three layers | `PORT-002` |
| `WI-PORT-005` | Integration | Trace propagation + safe logs; `TOOL-002`/envelope follow-ups (supersedes `OBS-002`) | **In progress 2026-10-28** (branch `feature/WI-PORT-005-trace-propagation`): middleware and envelope parts built and tested; trace viewer choice and OpenTelemetry export open |

## On Deck (decided priority — update this whenever priority changes)

**2026-10-26**: the portfolio-slice sequence applies ahead of the frontend items below — `PORT-006` and `PORT-001` in parallel → `PORT-007` → assign shared-file owners → `PORT-002` → `PORT-003`/`004`/`005`. Backend Batch 3b/4/5 ordering is unchanged.


1. **`WI-DEV-001`** (base .NET solution/project scaffold) — unblocks all of Batch 4 and resolves `WI-WEB-001`'s CORS open point; natural next pick-up since it depends on nothing unreviewed. Also reconcile against Batch 1's actual delivered project structure once reviewed (see its own Open Points).
2. **Batch 3** (`DATA-002`, `CACHE-002`, `EVT-003`, `AUTH-002`, `AUTH-005` revised) — assign to agents now, fully parallel; `AUTH-005`'s PKCE revision is a real scope change worth confirming with whoever picks it up.
3. ~~**`WI-WEB-001`** (shared frontend scaffold/PKCE) — ready in parallel with `WI-DEV-001`; blocked by `AUTH-005` (revised).~~ **SUPERSEDED 2026-10-26** by `WI-PORT-001`/`WI-PORT-002` (ADR-0012).
4. **Batch 3b** — `DEV-002` **done 2026-10-26**; `DEV-004` **done 2026-10-27**.
5. **Batch 4** (walking skeleton) — once Batch 3/3b/`WI-DEV-001` land; start with `ORD-004` since everything Order-side waits on it.
6. **Batch 5** (`PREF-001`, `PREF-002`, `VEN-001`, `VEN-002`) — detailed and Ready 2026-09-13; sequence alongside or just after Batch 4, since it depends on the same `WI-DEV-001` precondition but has no dependency on Batch 4's items themselves.
7. **Batch 6** (`SRCH-001`, `CUST-005`, `CUST-006`) — detailed and Ready 2026-09-14 (M4 per `LOCAL-MILESTONES.md`); sequence after Batch 5 and `EPIC-WEB-CUSTOMER` land, since it depends on both `PREF-002` and the already-built `CUST-002`.
8. **`ARCH-005`** (Component-level C4 diagrams) — still the only item left in `EPIC-ARCH-DOCS`, still low priority, unchanged from before.

`GOV-001`, `OPS-003`, `ARCH-002`, `ARCH-003`, `ARCH-004`, `OPS-001` remain done. `EPIC-PM-ARTIFACTS` has only `MGMT-003`/`MGMT-006` left, not currently on deck. Full history of prior reprioritizations is in `docs/ACTIVITY-LOG.md`, not repeated here each time.

Legend: 🟢 detail known now (from an existing ADR/decision) · ⚪ title only, detail TBD when picked up · ✅ detailed and Ready/Done

---

---

## Suggested Build Order (rough — not the formal prioritization exercise)

Not a substitute for `PLAN-001`, just a rough sanity check so the outline isn't just an unordered pile:

1. **Foundational/cross-cutting first**: `EPIC-EVENTING`, `EPIC-DATA-STORE`, `EPIC-AUTH`, `EPIC-SECRETS`, `EPIC-API-GATEWAY`, `EPIC-SHARED-TOOLING`, `EPIC-CACHING` — everything else depends on these existing
2. **Core domain slice**: `EPIC-CATALOG`, `EPIC-PREFERENCES`, `EPIC-ORDERING`, `EPIC-QUEUE-DISPLAY`, `EPIC-WEB-CUSTOMER` — the walking-skeleton path from `portfolio-plan.md`'s original Sprint 1/2, now including a real customer-facing frontend — **as of 2026-09-13, this is the active focus, targeting a full local end-to-end run with a browser-visible demo, not just a backend API surface**
3. **Remaining domain epics**: `EPIC-VENDOR-ONBOARDING`, `EPIC-SEARCH`, `EPIC-ADVERTISING`, `EPIC-PAYMENTS`, `EPIC-REVIEWS`, `EPIC-NOTIFICATIONS`, `EPIC-ADMIN`
4. **Delivery infrastructure**: `EPIC-LOCAL-DEV` (in progress, see Batch 3b above), `EPIC-CI-CD`, `EPIC-CLOUD-INFRA`, `EPIC-REPO-OPS`
5. **Quality/hardening epics**: `EPIC-OBSERVABILITY`, `EPIC-RATE-LIMITING`, `EPIC-FEATURE-FLAGS`, `EPIC-DATA-PRIVACY`, `EPIC-BACKUP-DR`, `EPIC-FRONTEND-QUALITY` — can run partly in parallel with (3), not strictly after
6. **Artifact epics** (`EPIC-ARCH-DOCS`, `EPIC-OPS-ARTIFACTS`, `EPIC-GOVERNANCE`, `EPIC-PM-ARTIFACTS`, `EPIC-PRODUCT-STRATEGY`) — largely parallel to everything else; not blocked by build progress
7. **Launch**: `EPIC-GOLIVE-SUPPORT`, last

---

## Gaps identified while building this outline (resolved ones kept for history, not deleted)

1. **Deliberate cross-listing (resolved)** — `work-item-template.md` now has a `Shared with epic(s):` field, added specifically because five instances of this (monetization model, `/tools/auth-middleware`, review/ad-fraud abuse detection, the DR runbook, and the gateway rate-limit policy) showed up before the field existed. The five existing cross-listed items above still use the old manual-note style rather than the new field — a small backfill, not yet done, moved to `PARKING-LOT.md` rather than left here.
2. **Non-technical epics' Scope field (resolved)** — standardized to exactly two values (`cross-cutting-artifact`, `repo-level`), both the template and all epics in this file backfilled to match.
3. **API Gateway / BFF layer — resolved; revisited 2026-10-26.** *(ADR-0013 adds a GraphQL BFF as the browser's entry point, with APIM retained in front of service APIs — see ADR-0008's amendment note.)* ADR-0008 decided Azure API Management (Consumption tier) with zero-trust dual validation — APIM performs an edge fast-fail check, every service still independently validates per ADR-0006. `EPIC-API-GATEWAY` added, `AUTH-002` and `RATE-004`/`GW-006` annotated to reflect the actual scope boundary (the gateway does not replace per-service auth or per-user rate limiting — Consumption tier's lack of `rate-limit-by-key` was the key finding that shaped this).
4. **Context completeness (resolved, process-level)** — a "zero trust" assumption existed only in the human's head until an unrelated decision (API Gateway) surfaced it. Fixed at the process level, not just here: `peer-A/core/context-completeness.md` now names "surprise as a trigger," two front-loaded checklists (`templates/technology-decision-checklist.md`, `templates/business-decision-checklist.md`) exist for the preventive side, and the work-item template gained categorized (not flat) references, a "You do not need to know about" field, and a transient "Open Points (working)" section. Applied here: `vision.md` gained an explicit zero-trust principle, ADR-0006 gained an explicit token-storage/CSRF note, and `WI-NFR-001` now explicitly requires both plus injection-protection content.
5. **Bounded-context-to-service mapping — resolved.** Formalized as ADR-0009: 13 bounded contexts grouped onto the 4 existing services (`catalog-service`, `ordering-service`, `admin-service`, `notification-service`), with a binding "modular monolith" rule that co-located contexts still communicate through the same interfaces/events they'd use if physically separate. The root cause (scaffolding making a real decision by default, before any decision-record discipline existed) is also fixed at the process level: `core/phase-sequence.md` Phase 4 now requires this mapping be explicit before scaffolding, and both `technology-decision-checklist.md` and `architecture-patterns.md` were updated to name the pattern.
6. **Local mock OIDC issuer — resolved 2026-09-12, scope revised 2026-09-13.** ADR-0006 and `tech-stack.md` both describe a local mock OIDC/JWT issuer as local dev's Entra External ID stand-in, but no work item ever built it — `AUTH-001` referenced it as an environment dependency and assumed it existed. Same shape of gap as #5 above (described in an ADR, never actually tracked as buildable work). Closed by adding `AUTH-005`; further revised (Size S→M) once ADR-0011 (frontend framework) required a real PKCE browser redirect flow, not just direct token minting — see ADR-0006's amendment note and `WI-AUTH-005.md`.
7. **No frontend work items exist for `web-customer`/`web-admin` — identified 2026-09-12, resolved for `web-customer` on 2026-09-13.** *(2026-10-26: framework changed by ADR-0012, which supersedes ADR-0011; see the `EPIC-WEB-CUSTOMER` dispositions above.)* `apps/web-customer` had been scaffold-only; the only frontend item anywhere in the backlog was `QUE-002` (title-only). Resolved for the customer-facing side by ADR-0011 (frontend framework: React/Vite) plus `EPIC-WEB-CUSTOMER` (`WEB-001`, `CUST-002`, `CUST-003`, `CUST-004`) and a fully-detailed `QUE-002` sharing `WEB-001`'s scaffold. `web-admin` remains correctly unaddressed — its backend epics (`EPIC-ADMIN`, `EPIC-VENDOR-ONBOARDING`) don't exist yet, so there's nothing yet for an admin frontend to call.
8. **Two small local-scope design choices surfaced while detailing Batch 4 — not yet promoted, watch if they should be.** *(2026-10-26: (a) resolved by `WI-CAT-001` — a document per vendor in a reserved partition, not a cache; see `docs/evidence/WI-CAT-001/findings.md`.)* (a) Where `catalog-service` persists derived per-vendor verification status, given no admin-service exists yet to be the real source (`WI-CAT-001.md`'s Open Points; proposed default is a `CacheProvider`-backed entry). (b) The exact shape of `ORD-001`'s payment-step stub, so `PAY-001` has a clean seam later (`WI-ORD-001.md`'s Open Points). Neither rises to ADR-worthy yet — both are implementation-detail choices a work item's Open Points section is exactly meant to hold — but if either turns out to have wider implications once built, promote it rather than leaving it buried in a closed item's history.
9. **`worklog-2026-09-07.md`'s three named gaps — two resolved 2026-09-13, one still open.** Gap #1 (no work item for the .NET solution scaffold) closed by `WI-DEV-001` (new; triggered the `EPIC-LOCAL-DEV` renumbering documented in that epic's section above). Gap #3 (Batch 3 named as a concept but never actually scoped) partially closed — the domain-logic batch that worklog entry anticipated already shipped as this outline's **Batch 4** (walking skeleton, detailed 2026-09-12, before the worklog's own suggested batch was drafted independently); the worklog-suggested batch's *new* items not already covered by Batch 4 (`PREF-001`, `PREF-002`, `VEN-001`, `VEN-002`) are captured above as **Batch 5** — curated 2026-09-13, fully detailed and Ready for agents as of the same day. Gap #2 (the Batch 1 verification checkpoint living only as prose) **remains open** — tracked as a real, checkable entry in `PARKING-LOT.md` as of 2026-09-13, not yet promoted to a full work item or actually performed.

