# Traceability: work item to tests to evidence

> **Status:** Generated · do not edit; `node scripts/docs/traceability.mjs` regenerates it and `--check` verifies it. Files are matched by naming the work item id as a whole word, so a missing entry means the link is not written down, not that nothing tests it, and a work item that is a document has no test by nature. Tests are the files under `tests/` and `test/` folders; evidence is `docs/evidence/`.

Of 54 work items marked Done: 29 are named by a test file, 18 by an evidence record, 16 by neither.

| Item | Title | Status | Test files naming it | Evidence records naming it |
|---|---|---|---|---|
| [ARCH-001](WI-ARCH-001.md) | C4 Diagrams — System Context + Container | Done | *none* | `baseline-2026-10-30.md` |
| [ARCH-002](WI-ARCH-002.md) | Capability Map / Business Architecture View | Done | *none* | *none* |
| [ARCH-003](WI-ARCH-003.md) | Data Model / API Contracts (per service) | Done | *none* | *none* |
| [ARCH-004](WI-ARCH-004.md) | Formal Event-Storming Session Output | Done | *none* | *none* |
| [AUTH-001](WI-AUTH-001.md) | JWT validation middleware + resource-ownership helper (/tools/auth-middleware equivalent) | Done | `JwtValidationTests.cs`, `MockOidcMiddlewareIntegrationTests.cs` | *none* |
| [AUTH-002](WI-AUTH-002.md) | Per-service resource-ownership check pattern + reference application | Done | `ResourceOwnershipHandlerTests.cs` | `findings.md` |
| [AUTH-005](WI-AUTH-005.md) | Local mock OIDC issuer — token minting + PKCE authorization-code flow | Done | `MockOidcMiddlewareIntegrationTests.cs` | *none* |
| [AUTH-006](WI-AUTH-006.md) | Service-to-service authentication (OAuth2 client credentials) | In progress | `ClientCredentialsIssuerTests.cs` | *none* |
| [AUTH-007](WI-AUTH-007.md) | Browser sessions: a server-side session behind an HttpOnly cookie (backlog N-01) | In progress | `RefreshTokenGrantTests.cs` | `findings.md`, `ai-usage-2026-11-01.md` |
| [CACHE-001](WI-CACHE-001.md) | Define CacheProvider interface + shared contract test suite | Done | `CacheProviderContractTests.cs` | *none* |
| [CACHE-002](WI-CACHE-002.md) | RedisCacheProvider implementation | Done | `RedisCacheProviderTests.cs` | *none* |
| [CACHE-003](WI-CACHE-003.md) | LocalCacheProvider + ResilientCacheProvider decorator | Done | `LocalCacheProviderTests.cs`, `ResilientCacheProviderTests.cs` | *none* |
| [CACHE-004](WI-CACHE-004.md) | ChaosCacheProvider decorator + fallback proof tests | Done | `ChaosCacheProviderTests.cs` | *none* |
| [CAT-001](WI-CAT-001.md) | Listing CRUD + modifier/allergy-flag model | Done | `ListingApiTests.cs` | `README.md`, `findings.md` |
| [CAT-005](WI-CAT-005.md) | Listing stock fields and vendor stock controls | Done | `ListingStockTests.cs`, `ConcurrencyContractTests.cs` | *none* |
| [CAT-006](WI-CAT-006.md) | Stock reservation and release endpoints | Done | `StockReservationTests.cs`, `BatchContractTests.cs` | *none* |
| [CUST-002](WI-CUST-002.md) | Listing browse + detail view | Done | *none* | `findings.md` |
| [CUST-003](WI-CUST-003.md) | Cart + checkout UI | Done | *none* | *none* |
| [CUST-004](WI-CUST-004.md) | Order confirmation + order status view | Done | *none* | `baseline-2026-10-30.md` |
| [CUST-007](WI-CUST-007.md) | Customer order history list | In review | `order-history.spec.ts`, `order-history.spec.ts`, `customer-orders.test.ts` and 1 more | `baseline-2026-10-30.md`, `status-check-experiment-2026-10-30.md` |
| [DATA-001](WI-DATA-001.md) | Define IRepository<T> interface + contract tests | Done | `FakeRepositoryTests.cs`, `RepositoryContractTests.cs` | *none* |
| [DATA-002](WI-DATA-002.md) | CosmosRepository<T> implementation | Done | `CosmosRepositoryTests.cs` | *none* |
| [DEMO-001](WI-DEMO-001.md) | Demo path: script, checklist, topology and a cold run | In review | *none* | *none* |
| [DEP-001](WI-DEP-001.md) | Deployment path: images, deploy stage, dev environment, post-deploy smoke | In progress | `MockOidcFixedIssuerTests.cs` | `environment-stack-2026-10-31.md`, `images-and-compose-2026-10-31.md`, `terraform-foundation-and-gate-rehearsal-2026-10-31.md` and 2 more |
| [DEV-001](WI-DEV-001.md) | Scaffold the base .NET solution and project structure | Done | *none* | *none* |
| [DEV-002](WI-DEV-002.md) | Real docker-compose.yml | Done | *none* | `findings.md` |
| [DEV-004](WI-DEV-004.md) | Seed / fixture data script | Done | `walking-skeleton.spec.ts`, `SeederTests.cs` | `findings.md`, `findings.md` |
| [EVT-001](WI-EVT-001.md) | Define IEventPublisher/IEventSubscriber interfaces + envelope + contract tests | Done | `EventTransportContractTests.cs`, `InMemoryEventTransportTests.cs` | *none* |
| [EVT-003](WI-EVT-003.md) | RedisStreamsPublisher / RedisStreamsSubscriber implementation | Done | `RedisStreamsEventTransportTests.cs` | `findings.md` |
| [GOV-001](WI-GOV-001.md) | Fill in the architecture review / change-management document | Done | *none* | *none* |
| [MGMT-001](WI-MGMT-001.md) | Draft the execution-level project plan | Done | *none* | `baseline-2026-10-30.md` |
| [MGMT-002](WI-MGMT-002.md) | Draft the risk register | In review | *none* | *none* |
| [MGMT-004](WI-MGMT-004.md) | Draft engineering standards (PR/review guidelines, onboarding) | Done | *none* | *none* |
| [MGMT-005](WI-MGMT-005.md) | Draft the budget / cost estimate | In review | *none* | *none* |
| [MGMT-007](WI-MGMT-007.md) | Draft the stakeholder communications plan | Done | *none* | *none* |
| [MGMT-008](WI-MGMT-008.md) | Draft the branching/release strategy | Done | *none* | *none* |
| [NFR-001](WI-NFR-001.md) | Draft the Non-Functional Requirements document | Done | *none* | *none* |
| [NOT-001](WI-NOT-001.md) | Notification service: consume order events and dispatch through a sender adapter | In review | `RedisBatchDeliveryTests.cs` | `README.md`, `ai-usage-2026-11-03.md` |
| [NOT-002](WI-NOT-002.md) | Notification templates for the order lifecycle | In review | *none* | `README.md`, `ai-usage-2026-11-03.md` |
| [OPS-001](WI-OPS-001.md) | Draft the SLA/SLO document | Done | *none* | *none* |
| [OPS-002](WI-OPS-002.md) | Runbook: first scenario and the template | Done | *none* | `runbook-event-broker-2026-10-30.md` |
| [OPS-003](WI-OPS-003.md) | Draft the monitoring/alerting plan | Done | *none* | *none* |
| [ORD-001](WI-ORD-001.md) | Checkout (payment stubbed) | Done | `CheckoutApiTests.cs`, `CheckoutServiceTests.cs` | *none* |
| [ORD-002](WI-ORD-002.md) | Order aggregate + lifecycle states | Done | `OrderLifecycleTests.cs` | *none* |
| [ORD-003](WI-ORD-003.md) | PickupFulfillment strategy implementation | In progress | `PickupWindowApiTests.cs` | `baseline-2026-10-30.md` |
| [ORD-004](WI-ORD-004.md) | FulfillmentStrategy interface (ACL boundary) | Done | `FulfillmentContractsTests.cs` | *none* |
| [ORD-005](WI-ORD-005.md) | Publish Order domain events via event backbone | Done | `OrderEventTests.cs`, `OutboxHostTests.cs`, `OutboxTests.cs` | *none* |
| [ORD-006](WI-ORD-006.md) | Order persistence via Repository<T> | Done | `CosmosOrderStoreTests.cs`, `OrderPersistenceTests.cs` | *none* |
| [ORD-007](WI-ORD-007.md) | Order action endpoints (confirm, decline, start, ready, complete, cancel) | Done | `OrderActionApiTests.cs`, `OrderActionTests.cs` | *none* |
| [ORD-008](WI-ORD-008.md) | Automatic confirmation of simple orders | Done | `journey.spec.ts`, `stack.spec.ts`, `vendor-queue.spec.ts` and 2 more | *none* |
| [PORT-001](WI-PORT-001.md) | Prove Next.js Pages Router + Relay SSR | Done | *none* | `README.md`, `findings.md`, `findings.md` |
| [PORT-002](WI-PORT-002.md) | Walking skeleton: Next.js SSR → GraphQL BFF → C# API | Done | `walking-skeleton.spec.ts` | `README.md`, `findings.md`, `findings.md` |
| [PORT-003](WI-PORT-003.md) | Quality and CI baseline (Azure Pipelines) | Done | *none* | `README.md`, `findings.md`, `findings.md` and 2 more |
| [PORT-005](WI-PORT-005.md) | Verify trace propagation and safe logs | Done | `TracingTests.cs` | `README.md`, `findings.md`, `findings.md` and 2 more |
| [PORT-006](WI-PORT-006.md) | Reconcile existing artifacts with ADR-0012 to ADR-0016 | Done | *none* | `baseline-2026-10-30.md` |
| [PORT-007](WI-PORT-007.md) | First-slice domain/API contract and GraphQL mapping | Done | *none* | *none* |
| [PROD-001](WI-PROD-001.md) | Draft personas / Jobs-to-be-Done | Done | *none* | *none* |
| [PROD-004](WI-PROD-004.md) | Success metrics and OKRs | In review | *none* | *none* |
| [QA-001](WI-QA-001.md) | Test strategy and guides | Done | `accessibility.spec.ts` | `status-check-experiment-2026-10-30.md` |
| [QA-002](WI-QA-002.md) | Quality metrics and scripted baselines | In progress | *none* | `latency-2026-10-30.md`, `quality-report-2026-10-30.md` |
| [QUE-001](WI-QUE-001.md) | Order-status read-model (event-fed, not direct query) | Done | `vendor-orders.test.ts`, `VendorOrderReadModelTests.cs` | *none* |
| [QUE-002](WI-QUE-002.md) | web-queue-display app — live UI | Done | `queue.spec.ts` | `ai-usage-2026-11-01.md` |
| [QUE-003](WI-QUE-003.md) | Live updates to the vendor queue: push over a stream, polling kept (backlog N-04, ADR-0021) | Done | `vendor-live.spec.ts`, `live.spec.ts`, `graphql-stream.test.ts` and 6 more | `README.md`, `graphql-sse-review-2026-11-02.md`, `real-stack-2026-11-02.md` and 3 more |
| [QUE-004](WI-QUE-004.md) | The vendor's actions in the queue display: confirm, decline, start, ready, complete | In review | `vendor-actions.spec.ts`, `actions.spec.ts`, `queue.spec.ts` and 1 more | `real-stack-2026-11-02.md`, `ai-usage-2026-11-02-b.md` |
| [RATE-001](WI-RATE-001.md) | First rate limits: per address and per login at the web apps, a coarse backstop at the BFF (register item 128) | In review | `rate-limit.spec.ts`, `rate-limit.test.ts`, `rate-limit.test.ts` | `run-2026-11-02.md`, `load-soak-2026-11-03.md`, `ai-usage-2026-11-02-b.md` |
| [SEC-001](WI-SEC-001.md) | Per-environment Key Vault + managed identity RBAC grants (Terraform) | Built | *none* | `baseline-2026-10-30.md` |
| [SEC-003](WI-SEC-003.md) | Fail-fast startup validation for missing/malformed secrets | Done | *none* | *none* |
| [SEC-005](WI-SEC-005.md) | Threat model, fuzz and property tests, load and soak, a dynamic scan, and a review statement (register item 129) | In review | `security-headers.spec.ts`, `security-headers.spec.ts`, `fuzz.test.ts` and 3 more | `fuzz-2026-11-02.md`, `load-soak-2026-11-03.md`, `zap-2026-11-03.md` and 1 more |
| [TOOL-001](WI-TOOL-001.md) | Domain event payload records (/tools/event-schemas) | Done | `DomainEventPayloadsTests.cs` | *none* |
| [TOOL-002](WI-TOOL-002.md) | Structured logging + correlation-ID helper (tools/BakeryMarketplace.Logging) | Done | *none* | *none* |
