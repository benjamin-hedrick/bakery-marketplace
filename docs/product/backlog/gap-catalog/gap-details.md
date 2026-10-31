# Gap details: diagrams, maps, charts, API information, checklists, templates, evidence, theories

> **Status:** Current catalog · the detail behind the target map, with a **State** and a **Tracked in** column added on 2026-10-30. Written 2026-10-29; the content of each row is unchanged. Done rows point at the document; open rows point at the spec that tracks them. Archived when every row is Done or Dropped.

Captured at the end of the full read so the details are not lost between sessions. Written from the facts sheet (`01`) and the records `10` to `40`; each row names the source to build from. Nothing here has been built. IDs (G-D, G-A, G-C, G-T, G-S, G-E, G-H) are new and local to this file; they map onto the target map items (`50`, T-nn) where one exists.

## 1. Diagrams, maps and charts

Format for all: Mermaid in Markdown (already the repo convention, renders on GitHub and in the docs site). "Built" means present in the code and verified in this review's facts sheet; anything planned is styled differently in the diagram.

| ID | Diagram | State now | What is wrong or missing | Required content (nodes, edges) | Source to build from | Target | State | Tracked in |
|---|---|---|---|---|---|---|---|---|
| G-D01 | C4 context | `c4/context.md` | Names Azure AD B2C; otherwise fine | Actors (customer, shop vendor, independent vendor, admin), the platform, Stripe (stub today), identity provider (mock issuer locally, Entra External ID target) | ADR-0005/0006 | T-20 | Done | `docs/architecture/c4/context.md`, `container.md` |
| G-D02 | C4 container | `c4/container.md` | Pre-BFF: browsers go through API Management; no BFF, no Next.js server, no mock issuer, no collector, no Redis split, no ordering-to-catalog call; `CAT --> CAT` self-loop; no built/planned distinction | Browser; `web-customer` (Next.js: SSR server + client); `graphql-bff` (Node); `catalog-service`, `ordering-service` (built), `admin-service`, `notification-service` (empty); Cosmos (containers `catalog`, `orders`); Redis events and optional Redis cache; mock-oidc (local) / Entra (planned); Stripe stub; OTLP collector, Aspire, Jaeger; planned: APIM, Key Vault, Application Insights. Edges labelled with protocol and auth: browser to Next.js (same-origin rewrite), Next.js/browser to BFF (GraphQL, bearer), BFF to services (REST, token forwarded, `traceparent`), ordering to catalog (client credentials token), services to Redis streams (outbox publish, subscribe), services to OTLP | facts sheet, ADR-0012/0013/0016/0017/0018, `docker-compose.yml` | T-20 | Done | `docs/architecture/c4/context.md`, `container.md` |
| G-D03 | Request path: checkout (sequence) | Prose + a sequence in `first-slice-contract.md` §2 | No auth, no outbox, no stock reservation, no trace ids, no timings | Browser, Next.js rewrite, BFF, ordering (token validation: issuer discovery and JWKS), catalog (listing read, service token request, reservation batch), Cosmos (create order with outbox entry), inline publish to Redis streams, relay sweep, response; `traceparent` carried; first-call cold timings (about 2 s discovery, about 2 s service token) versus warm | `slice-1/findings.md` §2, `CheckoutService`, `OutboxRelay` | T-21 | Done | `docs/architecture/request-path.md` |
| G-D04 | Trace of a page load (sequence) | Prose in findings | | web-customer client span, BFF server span, catalog server span, Cosmos child spans | `slice-1/findings.md` §2 | T-21 | Done | `docs/architecture/request-path.md` |
| G-D05 | Component: ordering-service | None (`ARCH-005` open) | | Endpoint groups (`CheckoutEndpoints`, `OrderActionEndpoints`, `PickupWindowEndpoints`), `CheckoutService`, `CheckoutPricing`, `Order` aggregate and `OrderRules`, `AutoConfirmPolicy`, `PickupSchedule`, `OrderStore` (create-only, ETag updates) and `OrderDocument`/`OutboxEntryDocument`, `OrderEventPublisher`, `OutboxRelay` with `OutboxSignal`, `ICatalogGateway`/`CatalogGateway` with the client-credentials token provider, `IPaymentProcessor` (`StubPaymentProcessor`), role policies | `services/ordering-service/src` | T-22 | Done | `docs/architecture/c4/component-services.md` |
| G-D06 | Component: catalog-service | None | | `ListingEndpoints`, `ListingService`, `StockPolicy`, `StockReservationEndpoints`/`Service`, `VendorEventSubscriptions`, `VendorStatusStore` (reserved partition), `StockEventPublisher`, repositories | `services/catalog-service/src` | T-22 | Done | `docs/architecture/c4/component-services.md` |
| G-D07 | Order lifecycle (state diagram) | ASCII art in `order-lifecycle.md` | | `Pending, Placed, Confirmed, InPreparation, ReadyForFulfillment, Completed, Cancelled`; transitions with actor and reason; automatic confirm; final states | `order-lifecycle.md` | with T-20 | Open | `WI-DOC-002` |
| G-D08 | Event flow (updated Flow 2) | `event-storming.md` Flow 2 | Omits stock reservation and release, the outbox, automatic confirmation; header mentions a timeout that is deferred | Commands, events, policies as in the lifecycle plus `LowStockDetected`, `OrderConfirmed(Automatic)` | `event-storming.md`, `order-lifecycle.md`, ADR-0017 | with T-20 | Partly | `event-storming.md` has a built-state table; the diagram itself is open: `WI-DOC-002` |
| G-D09 | Auth flows | Prose in ADR-0006/0018, `local-dev.md` | | (a) Browser login: authorization code + PKCE, token in memory; (b) service call: client credentials, app-only token, `Stock.Reserve` role; (c) where each service validates | ADR-0006/0018, `apps/web-customer/README.md` | T-23 | Open | `WI-DOC-002` |
| G-D10 | Cache layers | Table in ADR-0014 | | Layer 1 (library, **not wired**), layer 2 (Relay store, per request and per session), layer 3 (HTTP policy), with owner and status per layer | ADR-0002/0014 | T-26, T-28 | Open | `WI-DOC-002` |
| G-D11 | Local environment topology | Tables in `local-dev.md` | | Compose containers (redis-events, cosmos, mock-oidc; profiles), host processes (catalog 5200, ordering 5300, BFF 4100, web 3000), ports, and which script starts which | `local-dev.md`, `skeleton-smoke.mjs` | T-03 | Done | The topology diagram and "which script starts which" in `docs/operations/demo.md` |
| G-D12 | CI pipeline | Prose in `quality-gates.md` | | Four jobs (`dotnet`, `bff`, `web`, `skeleton`), what each runs, published artifacts, gates versus warnings, soft gate note | `azure-pipelines.yml`, `quality-gates.md` | T-30 | Open | `WI-DOC-002` |
| G-D13 | Data model (documents) | Prose in `data-model-api-contracts.md` | Mixes built and planned | Built: `ListingDocument` (+stock, ETag), `VendorStatusDocument` (reserved partition `_vendor-status`), `StockReservationDocument`, `OrderDocument` (with `OutboxEntryDocument`, request hash); planned containers marked | code + register 28/66 | with T-25 | Open | `WI-DOC-002` |
| G-D14 | Test layers | None | | Which suites run where: tools (214), catalog (104), ordering (337), BFF (75), web unit (53), mock-BFF browser (57), real-stack journey (21); what each proves; what is not tested | facts sheet, `quality-gates.md` | T-30 | Open | `WI-QA-001` |
| G-D15 | Reader paths / document map | None | | Five-minute path (README, status, one trace), engineer path (architecture, method, evidence), goal A path (test strategy, quality gates, flake record), goal B path (data-fetching guide, ADR-0012/0013/0014) | this review | T-01, T-02 | Done | `README.md` reading order and `docs/index.md` |
| G-D16 | Roadmap chart | `roadmap.md` stub | | Phases from `project-plan.md` (relative sequence, no dates), slice 1 done, next work in the order of the target map | `project-plan.md`, `50` | T-43 | Done | `docs/product/roadmap.md` |
| G-D17 | Status charts | None | | Counts by status (specs, ADRs, register items), generated from `STATUS.md` | T-08 | T-08 | Done | `docs/product/backlog/STATUS.md` (tables, no charts) |
| G-D18 | Quality trend charts | None | | Pass rate, flake rate, suite duration over runs | T-32 data | T-32 | Open | `WI-QA-002` |
| G-D19 | Deployment target (planned) | Bullets in `tech-stack.md` | | Container Apps for four runtimes, APIM in front of services, Entra, Key Vault, Application Insights, collector; every box labelled planned | ADR-0007/0008/0016 | T-60 | Done | `docs/architecture/c4/container.md` section 2 |

## 2. API and contract information

| ID | Gap | Detail to gather or write | Source | Target | State | Tracked in |
|---|---|---|---|---|---|---|
| G-A01 | REST reference (as built) | Per endpoint: method, path, policy/role, request body, success status, error codes with `{code, message, errors}`, idempotency/headers, source file. Endpoints (facts sheet): catalog `GET /catalog/listings`, `GET /catalog/listings/{id}`, `POST /catalog/listings`, `PUT /catalog/listings/{id}`, `POST /catalog/listings/{id}/stock/adjust`, `POST /catalog/stock/reservations`, `DELETE /catalog/stock/reservations/{orderId}`; ordering `POST /ordering/checkout`, `GET /ordering/orders/{id}`, `GET /ordering/pickup-windows`, `POST /ordering/orders/{id}/{confirm,decline,start-preparation,ready,complete}`, `POST /ordering/orders/{id}/cancel`; `GET /health` on all | `*Endpoints.cs`, `CheckoutEndpoints`, `ListingEndpoints` | T-25 | Open | `WI-API-001` |
| G-A02 | Machine-readable spec | Decide: generate OpenAPI from the minimal APIs (check .NET 10 built-in support) or hand-write; add a contract test that the BFF's REST clients match the spec | | T-25 | Open | `WI-API-001` |
| G-A03 | GraphQL reference | The schema file is the source; add a field table, the nullability rules, the global-ID scheme, `extensions.code` values, and the `PlaceOrderErrorCode` mapping (ordering code to BFF code to UI message) | `schema.graphql`, `data-model` as-built notes, `errors.ts` | T-26 | Open | `WI-DOC-002` |
| G-A04 | Event catalog | One table: event type, payload record, producer, consumers (built or not), schema version, who ordering/ catalog | `BakeryMarketplace.EventSchemas`, `OrderEventTypes`, `StockEventPublisher` | T-23 | Open | `WI-DOC-002` |
| G-A05 | Configuration reference | Environment variables and settings per service and per app (names only, never values), defaults, required at startup | `local-dev.md`, `appsettings*.json`, `service.env.example`, BFF `config.ts` | T-03 | Partly | Environment tables are in `docs/operations/local-dev.md`; a full reference: `WI-DOC-002` |
| G-A06 | Auth reference | Roles, policies, audiences, claims (`sub`, `roles`, `client_id`, `idtyp`), who accepts which token, mock users | ADR-0006/0018, `Auth` library | T-23 | Open | `WI-DOC-002` |
| G-A07 | Error taxonomy | Single table across REST, BFF and UI (the contract §6 table, updated with `insufficient_stock`, `conflict`, `downstream_unavailable`) | contract §6, data-model notes | T-26 | Partly | The table is in `first-slice-contract.md` section 6; the single cross-layer table: `WI-DOC-003` |
| G-A08 | Seed data reference | The seeded ids, prices, stock values, expected totals (exists in contract §7; keep one copy and link) | `first-slice-contract.md` §7, `Seeder` | T-03 | Done | `first-slice-contract.md` section 7 |

## 3. Checklists to create or update

| ID | Checklist | Exists? | Source | Notes | State | Tracked in |
|---|---|---|---|---|---|---|
| G-C01 | Definition of Ready, Definition of Done | Yes (`docs/process`) | | Update (peer path, project-log line); add "status banner and outcome note present" | Done | `docs/process/definition-of-ready.md`, `definition-of-done.md` |
| G-C02 | Technology decision and business decision checklists | No (copy-in CI-02/03) | peer checklists, NFRs | Run once retrospectively on the existing ADRs to show they would have caught the zero-trust and service-mapping surprises | Done | `docs/method/decision-checklists.md` |
| G-C03 | Pre-PR checklist | Scattered in `slice-1/02` working rules, `quality-gates.md`, `CLAUDE.md` | those | Single page: format, lint, typecheck, tests, Linux check, mutation checks for new rules, register entries, status banner | Open | `WI-DOC-001` |
| G-C04 | New-ADR checklist | Prose in `architecture-review.md` | | Assumptions first; one decision; alternatives; status line rule; amendment note | Open | `WI-DOC-001` |
| G-C05 | Public-readiness checklist (before sharing the repository) | No | this review | Secret scan, licence, security contact, names scrubbed, history note, internal files archived, README claims verified, links checked, evidence index, demo path run by someone fresh | Partly | Done: secret scan, licence, security file, names scrubbed, history decision, internal files archived, README claims read against evidence, links checked, evidence index, fresh-clone run and demo path (by the author). Open: the flip-day settings and a run by someone fresh (`WI-DEMO-001`); register item 93 |
| G-C06 | Demo checklist (run the journey in front of someone) | No | `skeleton-smoke.mjs`, findings §4 (warm the issuer) | Start, warm, mock users, steps, expected results, teardown | Done | The checklist in `docs/operations/demo.md` |
| G-C07 | Test-review checklist (A) | No | test-reliability record, packets checklist | Deterministic data, no sleeps, retrying assertions, no format/time-of-day assumptions, unique identifiers under parallelism, fails when the behavior breaks (mutation), clean-agent run | Open | `WI-QA-001` |
| G-C08 | "Add a screen or field" checklist (B) | No | web app, ADR-0012/0013 | Schema change, compile, fragment, loading/error states, cache policy, test, status banner | Open | `WI-DOC-003` |
| G-C09 | AI-collaboration review checklist | Playbook has a packet checklist | peer packets checklist, `CLAUDE.md` | Scope stated, status stated as fact, evidence by command, approval list respected, not-run reported distinctly | Open | `WI-DOC-001` |
| G-C10 | Release / environment promotion checklist | No | `branching-strategy.md` | Only once deployment exists (priority 4) | Open | `WI-DEP-001` |

## 4. Templates to backfill

| ID | Template | Source | Where | State | Tracked in |
|---|---|---|---|---|---|
| G-T01 | Work item and epic (with bakery statuses) | peer CI-01, 67 specs | `docs/method/work-item-template.md` | Done | `docs/method/work-item-template.md` |
| G-T02 | ADR (richer: assumptions first, alternatives, related, status rule) | `adr/template.md`, ADRs 0001 to 0018 | `adr/template.md` | Partly | The status vocabulary is in the ADR template; the richer template: `WI-DOC-001` |
| G-T03 | Outcome note | the 14 existing notes | `method/` | Open | `WI-DOC-001` |
| G-T04 | Reconciliation record | the two dispositions records | `method/` | Open | `WI-DOC-001` |
| G-T05 | Evidence / findings record | `slice-1/findings.md`, `WI-PORT-*` | `evidence/README.md` | Partly | `docs/evidence/README.md` describes the form; a template: `WI-DOC-001` |
| G-T06 | Register item (with Status) | the register | `method/` | Done | `docs/method/register-item-template.md` |
| G-T07 | Runbook | none yet | `operations/runbooks/` | Open | `WI-OPS-002` |
| G-T08 | Postmortem / game-day record | test-reliability | `operations/postmortems/` | Open | `WI-LAUNCH-002` |
| G-T09 | Permit to Build / Permit to Operate (retrospective, filled once for slice 1) | peer CI-05/06 | `method/` | Dropped | skipped by the lead on 2026-10-30; `docs/method/lessons.md` L-06 |
| G-T10 | Test report (the `summarize-results` output with the Current result line) | `quality-gates.md` | `evidence/` | Open | `WI-QA-002` |

## 5. Standards to write down (they exist as practice)

| ID | Standard | Where the practice is now | State | Tracked in |
|---|---|---|---|---|
| G-S01 | Status vocabulary and note formats | `52` §B | Done | `docs/method/status-and-supersession.md` |
| G-S02 | Commit and branch conventions: one work item per commit and say which; themed branches; rebase before push; user opens PRs | `CLAUDE.md`, `branching-strategy.md`, memory notes | Done | `docs/process/branching-strategy.md` |
| G-S03 | Test determinism rules (no sleeps; retrying assertions; unique identifiers; per-test event types; no format or clock assumptions; repeat-run before trusting) | test-reliability record | Open | `WI-DOC-001` |
| G-S04 | Privacy and telemetry rules (no tokens, keys, variables or personal data in spans and logs; query values redacted; scan every exported span) | ADR-0016 item 6, slice findings §3 | Partly | `nfrs.md` section 3.6 states it; a standard: `WI-DOC-001` |
| G-S05 | Reporting rule: passed, failed, skipped, not run, blocked reported separately; nothing called working unless run | `CLAUDE.md`, `summarize-results` | Done | `CLAUDE.md`, `docs/method/rule-authoring.md`, `ai-collaboration.md` |
| G-S06 | Human-approval list (auth logic, IAM/RBAC, scope expansion, refactors) and what AI may do | `CLAUDE.md`, ADR-0017/0018, `AUTH-006` | Done | `CLAUDE.md`, `docs/method/rule-authoring.md`, `ai-collaboration.md` |
| G-S07 | Error and idempotency conventions (typed rejections, spent key, retry rules) | contract §6 | Open | `WI-DOC-001` |
| G-S08 | Naming of IDs (WI, ADR, register, S1/N, T-nn), now that four schemes coexist | outline, slice-1 backlog | Open | `WI-DOC-001` |

## 6. Evidence that can be backfilled or produced

| ID | Evidence | How | Cost | State | Tracked in |
|---|---|---|---|---|---|
| G-E01 | Index of existing evidence | read `evidence/*`, outcome notes | S | Done | `docs/evidence/README.md` |
| G-E02 | Extract the outcome notes of the big built items into evidence records (`CAT-005`, `CAT-006`, `ORD-001`, `ORD-005`, `ORD-007`, `ORD-008`, `AUTH-006`, `CUST-003/004`) so proof does not live inside specs | copy with links | M | Open | `WI-EVID-001` |
| G-E03 | Flake and execution-time baseline: run the mock-backed browser suite N times, record pass/fail per test and duration, publish the JSON and a table | local, uses `summarize-results` | S | Done | `docs/evidence/baseline-2026-10-30.md` |
| G-E04 | Cold versus warm checkout timing, repeated (the 4.7 s finding becomes a distribution) | `skeleton-smoke` with timing | S | Done | `docs/evidence/baseline-2026-10-30.md` |
| G-E05 | Clean-clone verification: clone to a new folder, run the documented commands only, record every gap (the "fresh reader" test of T-03) | local | M | Partly | Clean clones with warm caches were run twice (`local-dev.md`; `docs/evidence/fresh-clone-2026-10-30.md`); a cold run on a machine with nothing cached is still open: `WI-DEMO-001` |
| G-E06 | `terraform validate` and `plan` on the Key Vault module (no apply) to turn `SEC-001` from Built to Done, or record why not | local, needs Terraform | S | Open | `WI-SEC-004` |
| G-E07 | Link check and stale-phrase baseline of the whole docs tree (T-09) | script | S | Done | `docs/evidence/baseline-2026-10-30.md`, `scripts/docs/linkcheck.mjs` |
| G-E08 | Accessibility smoke on the customer pages (the plan names it; the web lint has a11y rules) | axe through Playwright | M | Open | `WI-QA-001` |
| G-E09 | Dependency audit and secret scan outputs recorded (`npm audit`, container scanner on history) | T-05, T-36 | S | Partly (secret scan done: `docs/evidence/secret-scan-2026-10-30.md`; dependency audit open) | `WI-SEC-004` |
| G-E10 | The AI-assisted testing experiment (protocol, baseline, results) | T-34 | L | Open | `WI-QA-003` |

## 7. Theories this repository can test (from the lessons log, the plans and the peer hypotheses)

| ID | Theory | Source | How to test | Evidence it would produce | State | Tracked in |
|---|---|---|---|---|---|---|
| G-H01 | A clean agent finds what a developer machine hides (seven of ten episodes) | PI-001/005 | Clean-clone run (G-E05) and a Linux container run; count failures | A dated record, supports a lessons verdict | Done | `docs/evidence/baseline-2026-10-30.md`; lessons L-08 |
| G-H02 | A test is not evidence until it can fail (about 90 mutation checks) | PI-003-ish | Sample 10 existing tests, mutate the code under test, record kills | Mutation sample table | Done | `docs/evidence/baseline-2026-10-30.md`; lessons L-09 |
| G-H03 | Flake rate of the browser suites is near zero after the fixes | test-reliability | G-E03 | Flake rate with N | Done | `docs/evidence/baseline-2026-10-30.md` |
| G-H04 | Front-loaded design reduced rework | PI-002 | Count rework commits attributable to late decisions (ADR-0009, ADR-0017, D-9, the spent key) from git history | A short table | Open | `WI-QA-002` |
| G-H05 | Bounded, categorized context lets an agent work narrowly | PI-003, playbook | Compare the seven September packets' outcomes with the interactive work (rework, drift incidents) | Two incidents (packet 05, WI-AUTH-005 drift) versus none in October | Open | `WI-QA-002` |
| G-H06 | Status banners plus a generated table keep the repository consistent | this review | After the edit pass, change one item's status and confirm the table and checks catch every stale mention | A before/after | Open | `WI-QA-002` |
| G-H07 | A documented demo path works for a stranger | T-03 | Have someone else follow the README | Gaps found, fixed | Open | `WI-DEMO-001` |
| G-H08 | The BFF and cache design meet the NFR targets | ADR-0013/0014, SLA | T-27 | Measured p95 | Open | `WI-QA-002` |
| G-H09 | Reading time: a visitor finds the main evidence in five minutes | holistic goal | Time a reader | Observation, adjust README | Open | `WI-DEMO-001` |

## 8. How these feed the plan

`50` lists artifacts; this file lists the facts and structure to build them. Each section here is the checklist for its target item (diagrams to T-20 to T-23; API to T-25/T-26; checklists, templates and standards to `docs/method/` and `docs/process/`; evidence and theories to T-27, T-32, T-34 and the lessons record). When an item is created as a work item, copy its rows from here into the item's acceptance criteria.
