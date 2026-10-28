# Open Items Register

A working list of deferred decisions, named limitations, and not-yet-built pieces surfaced across the ADRs and repo scaffolding so far. This is a **staging area, not a backlog** — each item below is written so it can be copy-pasted into a GitHub Issue and added to the repo's Projects board once picked up. Remove an item from here once it has a corresponding Issue.

Suggested Issue fields per item: Title, Type, Source, Suggested hat/owner, Notes (below, in that order).

---

**Running list rule (2026-10-28):** anything found and not fixed in the same change goes here before the work item is called done, with its source and what "reconciled" would mean, so later sessions do not re-analyze it. When an item is resolved, mark it `Resolved <date>` with a pointer; do not delete it silently. Items 36 to 49 and 51 to 62 came from the 2026-10-28 session.

**1. Redis Basic tier has no AAD data-plane auth**
Type: Tech debt / future work · Source: ADR-0002 · Hat: Architect
If a higher Redis tier is ever justified, switch to AAD-based auth and drop the access-key secret entirely (ties to ADR-0007's "eliminate the secret" principle).

**2. Cosmos DB Linux emulator has partial API coverage and can be resource-heavy locally**
Type: Known limitation · Source: ADR-0004 · Hat: Platform Engineering
Mitigated by `FakeRepository` for the fast unit-test loop; only affects integration-test fidelity.

**3. Cosmos DB shared RU budget across containers (noisy-neighbor risk)**
Type: Accepted risk · Source: ADR-0004 · Hat: Architect / Operations
A throughput spike in one container can throttle another. Revisit if this becomes a real problem under load.

**4. Cosmos DB security blast radius — per-container resource tokens not implemented**
Type: Future hardening · Source: ADR-0004 · Hat: Architect / Governance
Natural next step before a full account split would be justified.

**5. Cosmos DB partition key choices are v1 guesses, not validated under real load**
Type: Tech debt · Source: ADR-0004 · Hat: Architect
Revisit `customerId`/`vendorId` partitioning once real traffic patterns exist.

**6. Payments: chargeback/dispute handling deferred**
Type: Deferred scope / risk · Source: ADR-0005 · Hat: Manager/Lead (risk register), Operations
Should be logged in the risk register, not just this file.

**7. Payments: single currency (USD) / single region (US) assumed**
Type: Deferred scope · Source: ADR-0005 · Hat: Digital PM / Architect
Would need real rework, not just configuration, for international support.

**8. Auth: no centralized policy engine (OPA or similar)**
Type: Deferred architecture · Source: ADR-0006 · Hat: Architect
Per-service ownership checks are sufficient at current scale; revisit if resource types or role complexity grow.

**9. Secrets: rotation requires a service restart, no live rotation**
Type: Known limitation · Source: ADR-0007 · Hat: Platform Engineering
Key Vault's automatic rotation policies are the natural v2 enhancement.

**10. `docker-compose.yml` is still a stub**
Type: Not started · Source: repo scaffold · Hat: Platform Engineering
Needs: Redis Streams service (default), Cosmos emulator service (default), cache service (profile-gated), Stripe CLI wiring, seed/fixture data script. **Resolved 2026-10-26 (WI-DEV-002):** the file now runs Redis Streams, the Cosmos vNext emulator and the mock OIDC issuer, plus the cache Redis behind `--profile with-redis`, verified under Docker. Still open: Stripe CLI wiring (`DEV-003`), seed script (`DEV-004`), application containers.

**11. Reusable tooling packages not yet scaffolded**
Type: Not started · Source: ADR-0003, ADR-0006 · Hat: Platform Engineering
`/tools/event-schemas`, `/tools/logging-helper`, `/tools/auth-middleware`, and the shared fault-injection harness are named in ADRs but not yet built.

**12. GitHub Projects board not yet created**
Type: Not started · Source: portfolio-plan.md · Hat: Manager/Lead
Columns: `Backlog → Ready → In Progress → Review → Done`, per the original plan.

**13. Docs site not yet published via GitHub Pages**
Type: Not started · Source: portfolio-plan.md · Hat: Engineering/Build
`mkdocs.yml` is ready; needs the actual publish step (`mkdocs gh-deploy` or a Pages Actions workflow).

**14. CI workflow is still a placeholder**
Type: Not started · Source: repo scaffold · Hat: Platform Engineering
`.github/workflows/ci.yml` has no real build/test/deploy stages yet. **2026-10-26**: CI/CD moves to Azure Pipelines (ADR-0015). The real stages are built there (`WI-PORT-003`), and this placeholder was removed in one migration commit on 2026-10-28 (`CI-004`, ADR-0015 amendment). The Azure check is a soft manual gate, not a GitHub required check (rulesets need an enterprise plan).

**15. No working ephemeral/preview environment example**
Type: Not started · Source: tech-stack.md · Hat: Platform Engineering

**16. Delivery/dispatch fulfillment strategy — deferred**
Type: Deferred scope (by design) · Source: ADR-0001 · Hat: Architect / Digital PM
Named as the primary planned v2 extension; not a gap, just not yet scheduled.

**17. Full ad-bidding platform — deferred**
Type: Deferred scope (by design) · Source: bounded context map, ADR area · Hat: Digital PM

**18. B2B small-supplier flow — explicitly scoped out**
Type: Scoped out (by design) · Source: glossary.md · Hat: Digital PM
Not a gap — documented as considered and rejected for v1.

**19. Work-item template — resolved**
Type: Done · Source: this planning conversation · Hat: Product Owner
Defined and validated against two real examples; see `project-process-framework/templates/work-item-template.md` and `docs/product/backlog/`.

**20. API Gateway / BFF layer — resolved**
Type: Done · Source: this planning conversation · Hat: Architect
Azure API Management, Consumption tier, with zero-trust dual validation (edge fast-fail + authoritative per-service check unchanged from ADR-0006). See ADR-0008. **Revisited 2026-10-26**: ADR-0013 adds a Node/TypeScript GraphQL BFF as the browser apps' single entry point; APIM stays in front of the service APIs (BFF → APIM → services in the cloud).

**21. Azure AD B2C → Microsoft Entra External ID — planned, not yet executed**
Type: Planned tech swap · Source: user direction, ADR-0006 amendment, ADR-0010 · Hat: Architect
Azure AD B2C stopped accepting new tenants May 2025; Premium P2/Identity Protection retired March 2026; full support continues to ~2030 but the platform is frozen. Microsoft's stated successor for new work is Entra External ID (GA since 2024). This project targets Entra External ID instead. The JWT validation design (issuer/audience/JWKS-driven, `Microsoft.AspNetCore.Authentication.JwtBearer` per ADR-0010) is config-driven and unaffected by which issuer is configured. **Hold `AUTH-004`** (tenant/policy configuration) from agent assignment until this is finalized — `AUTH-001` (generic validation middleware) is unaffected and safe now.

**22. Redis vendor reconsideration — planned, not yet decided**
Type: Planned tech swap · Source: user direction, ADR-0002 amendment · Hat: Architect
The specific managed cache vendor (Azure Cache for Redis) may change. `CacheProvider`, `LocalCacheProvider`, `ResilientCacheProvider`, and the contract-test suite are all vendor-agnostic and safe to build now. **Hold `CACHE-002`** (RedisCacheProvider implementation) **and `CACHE-005`** (Terraform managed-Redis toggle) from agent assignment until the vendor decision is finalized.

**23. Documentation cleanup: stale "Azure AD B2C" references in historical diagrams/docs**
Type: Low-priority cosmetic cleanup · Source: this review pass · Hat: Architect
`docs/architecture/c4/context.md`/`container.md`, `docs/management/budget-cost-estimate.md`, and a few closed work-item files still name Azure AD B2C directly rather than Entra External ID. Not functionally incorrect (the swap doesn't change any diagram's actual shape), just cosmetically stale. Living reference docs (`tech-stack.md`, ADR-0006) are already corrected — this item is for the rest, whenever it's convenient, not urgent.

**24. No refresh-token / silent-renewal flow in the frontend auth pattern**
Type: Known limitation (v1) · Source: ADR-0011 (carried forward unchanged by ADR-0012), `WI-WEB-001`/`WI-AUTH-005` · Hat: Engineering/Build, Architect
Access tokens are held in memory only and expire with no background refresh — a user simply gets logged out and must re-authenticate. Acceptable for a local/demo-scale app with short sessions; a real production frontend would need either silent-refresh-via-hidden-iframe or a refresh-token grant (the latter would also reopen the cookie-vs-header storage question closed in ADR-0006 §3.3's CSRF analysis, so isn't a drop-in addition). Named here explicitly rather than left as an unstated gap, consistent with `WI-NFR-001`'s "aspirational/future" discipline.

**25. Frontend/BFF hosting not yet decided**
Type: Open decision · Source: ADR-0012, ADR-0013 (2026-10-26) · Hat: Architect / Platform Engineering
Next.js SSR and the GraphQL BFF need Node-capable hosting; the Static Web Apps permanent free tier no longer fits. Azure Container Apps is the default candidate (already in the stack). Decide when deployment is introduced (`INFRA-002`), and update `budget-cost-estimate.md` at the same time.

**26. Server-side rendering of authenticated pages deferred**
Type: Deferred architecture · Source: ADR-0012 (2026-10-26) · Hat: Architect
In v1, only public listing pages use SSR. Authenticated pages render client-side, so the Next.js server never holds user tokens and ADR-0006's in-memory, header-only token posture is unchanged. SSR for authenticated pages would need a server-side session (cookie), which reopens ADR-0006's cookie/CSRF analysis and interacts with #24.

**27. Per-user throttling at the BFF — not decided**
Type: Open question · Source: ADR-0013 (2026-10-26) · Hat: Architect
APIM Consumption still lacks `rate-limit-by-key` (ADR-0008). Whether the GraphQL BFF takes on any per-user or per-query-cost limiting is left to `EPIC-RATE-LIMITING`.

**28. Catalog public reads probe one partition per verified vendor**
Type: Known limitation · Source: `WI-CAT-001` (2026-10-26) · Hat: Architect
Browse and lookup-by-id cost grows with the number of verified vendors. Options when it matters: vendor embedded in the listing id, a cross-partition query on `IRepository<T>` (shared contract), or a browse read model. See `docs/evidence/WI-CAT-001/findings.md`.

**29. Redis Streams consumer groups are named per event type, not per service**
Type: Tech debt / latent defect · Source: `WI-EVT-003` code, found by `WI-CAT-001` · Hat: Platform Engineering
`RedisStreamsEventTransport` uses group `cg:{eventType}`. Two services subscribing to the same event would compete for messages instead of each receiving all of them. Harmless while a single service consumes each event; fix before `ordering-service` or `notification-service` subscribes to a shared one (group name should include the service).

**30. No outbox for publish-after-save, and no optimistic concurrency**
Type: Known limitation · Source: `WI-CAT-001` · Hat: Architect
Catalog saves then publishes `ListingPublished`; a failed publish is logged and never re-sent. `IRepository<T>` exposes no ETag, so concurrent writes are last-write-wins and concurrent event deliveries for one vendor are a read-modify-write.

**31. Existing Cosmos adapter tests may not exercise the real serializer path**
Type: Verification gap · Source: reconciliation finding A8 + `WI-CAT-001` · Hat: Platform Engineering
`CosmosRepositoryTests` use PascalCase `Id`/`PartitionKey`, but Cosmos' default serializer requires a lowercase `id`. Confirm against the emulator once `WI-DEV-002` exists; catalog avoids the issue with explicit property names. **Confirmed 2026-10-26 (WI-DEV-002):** by default the tests cannot connect (https vs the emulator's http) and return early, passing without touching Cosmos; pointed at the real emulator, 3 of 4 fail with `Document does not contain an id field`. Fix is `WI-DATA-003`; see docs/operations/local-dev.md.

**32. Mock OIDC issuer login page reflects query parameters unescaped**
Type: Security defect (dev-only) · Source: `WI-AUTH-005` code, confirmed by `WI-DEV-002` (2026-10-26) · Hat: Platform Engineering
`/authorize` interpolates `redirect_uri`, `state` and `code_challenge` into HTML without encoding, so a crafted link injects script (confirmed with a payload). The issuer is dev-only, loopback-bound in Compose and refuses to start in Production, but the fix is small: HTML-encode the values in `tools/BakeryMarketplace.Auth/MockOidcIssuer.cs`.

**33. Mock users and seed vendor ids do not line up**
Type: Design gap · Source: `WI-DEV-002` / `WI-DEV-004` (2026-10-26) · Hat: Platform Engineering
Ownership requires the token `sub` to equal the listing's `vendorId`; the mock vendor's `sub` is `user-vendor-1`, so seed vendors such as `vendor-shop-001` cannot be edited by any mock user. Resolve in `WI-DEV-004`: seed with the mock user's id, or add matching users to the issuer.

**34. Cosmos SDK and emulator versions are coupled; shared package versions are mixed**
Type: Dependency risk · Source: `WI-DEV-002` (2026-10-26) · Hat: Platform Engineering
The vNext emulator needs Cosmos SDK 3.63.x or newer (3.38.1 and 3.50.0 throw while decoding whole-document queries). `BakeryMarketplace.Data` is now on 3.63.2 with an explicit `Newtonsoft.Json` reference, and the emulator image is pinned to `vnext-EN20261019`. Bump them together, and re-run the catalog journey in docs/operations/local-dev.md when either changes. Related: mixed package versions across tools (reconciliation finding B5, central package management recommended).

**35. Eventing Redis tests are not repeatable on one Redis instance; Redis adapter tests can silently use fakes**
Type: Test isolation / verification gap · Source: `WI-PORT-003` (2026-10-28) · Hat: Platform Engineering
`RedisStreamsEventTransportTests` pass on a fresh Redis and `DuplicateEventId_IsDeliveredTwice_ConsumerObservesBoth` fails on an immediate re-run (state left in streams or consumer groups). Separately, with the default `localhost:6379` the Redis cache and event tests connected nothing on the Windows dev machine and ran against in-memory fakes while reporting green; `127.0.0.1:6379` reaches Redis. **Update 2026-10-28:** the test-isolation half is fixed (per-test event types in `EventTransportContractTests`; 5 consecutive runs on one Redis pass; it had become a frequent failure after the .NET 10 upgrade). The silent fallback to fakes remains. CI sidesteps that (fresh container, `127.0.0.1`, and `scripts/ci/redis-touch.mjs` fails the job if Redis saw too few commands). Not fixed: needs per-test stream/group names or cleanup, and an explicit failure instead of a fallback when Redis is expected. Related: #31, finding A8.

**36. The Node tiers export traces with hand-rolled OTLP/JSON, not the Node SDK**
Type: Decision deviation · Source: `WI-PORT-005` (2026-10-28), ADR-0016 item 1 · Hat: Platform Engineering
`services/graphql-bff/src/otlp.ts` (one server span per successful request) and `apps/web-customer/src/lib/relay/otlp.ts` (one client span per BFF call) are two copies of the same small exporter. Each tier already owns its trace context by hand, the SDK would need ESM loader hooks (BFF), and `@vercel/otel` adds seven peer dependencies (web). Reconcile by adopting the OpenTelemetry Node SDK in both (which also adds a catalog-client span and a page-level SSR span) or amending ADR-0016 to accept the exporters. Gaps: no span for 400/404 BFF responses; the web tier has no span for the page render as a whole.

**37. Cloud trace pipeline is decided but not built**
Type: Open work / cost · Source: ADR-0016 amendment (2026-10-28) · Hat: Architect, Platform Engineering
Decided: Application Insights for DEV, UAT and Prod through an OpenTelemetry Collector; Jaeger opt-in for UAT/Prod. Open: where the collector runs in Azure and what it costs (not in `budget-cost-estimate.md`), the Key Vault reference for the connection string, how Jaeger would be hosted and stored if enabled, and a run of `infra/otel-collector/cloud.yaml` against a real Application Insights resource (only syntax-validated so far).

**38. The catalog span records `url.query`** — **Resolved 2026-10-28 (spans); one accepted residue**
Type: Data-safety follow-up · Source: `WI-PORT-005` evidence (2026-10-28), ADR-0016 item 6 · Hat: Security / Platform Engineering
Checked, and my earlier description overstated it: the ASP.NET Core instrumentation redacts query *values* by default, so the span carries `?limit=Redacted&after=Redacted` (parameter names only), and the collector configs delete the attribute outright. A regression test (`TracingTests.RequestSpansDoNotCarryQueryStringValues`) fails if the redaction is lost. Accepted residue: with `Microsoft.AspNetCore.Hosting.Diagnostics` at Information (the Development setting only; base config is Warning) the console log prints the full request URL including query values. Revisit if a Development log ever goes anywhere shared, or before search or preference endpoints exist (parameter names could then reveal intent).

**39. No vendor time-zone field exists (D-7)**
Type: Contract gap · Source: first-slice contract implementation check (2026-10-28) · Hat: Engineering/Build
D-7 says display in the vendor's local zone from vendor config; the vendor model, seed and DTOs have no zone. Add with `ORD-003`.

**40. Money representation is not uniform (D-1)**
Type: Contract inconsistency · Source: first-slice contract implementation check (2026-10-28) · Hat: Architect
`PayoutReconciledPayload.NetAmount` is `decimal`; `data-model-api-contracts.md` still uses unqualified `price`, `priceDelta`, `grossAmount`. Part of `WI-PORT-006` pass 2. **Partly resolved 2026-10-28:** the data-model doc now uses `priceCents` / `priceDeltaCents` and has a payout-money row; `PayoutReconciledPayload.NetAmount` is still `decimal` in code.

**41. Scope of the GraphQL global-ID rule (D-9) is unconfirmed**
Type: Open decision · Source: D-9 fix (2026-10-28) · Hat: Architect
Only `Listing.id` is a global ID. `vendorId`, `Modifier.id` and pagination cursors stay raw service ids. Confirm, especially for `vendorId` as the argument of the future `pickupWindows` query.

**42. Remaining tracing gaps in the walking skeleton**
Type: Verification gap · Source: `WI-PORT-005` evidence (2026-10-28) · Hat: Platform Engineering
Done 2026-10-28: Next.js server span (a three-tier trace shows in Aspire), catalog event-consumer spans (tested), TraceId in the catalog's console log scopes. Still open: scopes appear in the console only because `IncludeScopes` is set in the Development config, so deployed environments need structured log export; no log export; `GetServerSideProps` page render has no span; the skeleton smoke was not run with tracing on; no consumer span has been seen in a dashboard (no event is published during a request yet).

**43. Mock e2e and the skeleton smoke share `.next`** — **Resolved 2026-10-28**
Type: Test isolation · Source: e2e investigation (2026-10-28) · Hat: Platform Engineering
`next.config.js` takes `distDir` from `NEXT_DIST_DIR`; `skeleton-smoke.mjs` builds into `.next-skeleton`. Verified: smoke 5/5, then the mock e2e 6/6 with no rebuild, and no tsconfig churn. README updated.

**44. The green Azure run has no recorded run ID, and `ubuntu-26.04` is untested**
Type: Evidence gap · Source: `WI-PORT-003` (2026-10-28) · Hat: Platform Engineering
Add the run link to `docs/evidence/WI-PORT-003/findings.md`. The pipeline is pinned to `ubuntu-24.04`; move deliberately after a run on 26.04.

**45. The Azure Pipelines check is a soft gate, not a GitHub required check**
Type: Accepted risk · Source: ADR-0015 amendment (2026-10-28) · Hat: Manager/Lead
GitHub rulesets need an enterprise plan, so nothing blocks a merge with a red or missing Azure check. The human lead reads it at PR approval. Revisit if the plan changes.

**46. `WI-PORT-006` pass 2 and `WI-PORT-007` closure** — **Resolved 2026-10-28 for the data-model row and `WI-PORT-007`**
Type: Documentation reconciliation · Source: first-slice contract §12 (2026-10-28) · Hat: Architect
The contract's REST shapes and GraphQL draft now live in `data-model-api-contracts.md` ("First-slice mapping"); `WI-PORT-007` is Done. The other `WI-PORT-006` pass-2 rows (C4 diagrams, glossary, plans, cost, indexes) are still open under that work item.

**47. `CorrelationId` log-scope alias has no retirement date**
Type: Tech debt · Source: ADR-0016 item 2 (2026-10-28) · Hat: Platform Engineering
`TraceId` is the identifier; `CorrelationId` is kept for one transition period. Retire it once no log query depends on it.

**48. Not built: D-5, D-6, D-8, D-10**
Type: Tracking · Source: first-slice contract implementation check (2026-10-28) · Hat: Engineering/Build
Idempotency scope (D-6), pickup-window lead time (D-8) and the payment-decline test hook (D-10) are accepted but unimplemented. D-5 quantity limits are enforced in the `Order` aggregate (`WI-ORD-002`, 2026-10-28) as placeholders pending per-item maxima (item 51). Verify the rest when `ORD-001`, `ORD-003` land.

**49. Other C# services do not call `AddBakeryTelemetry`**
Type: Tracking · Source: `WI-PORT-005` (2026-10-28) · Hat: Platform Engineering
Only catalog-service is wired. `ordering-service`, `admin-service` and `notification-service` are empty scaffolds; wire them when they gain endpoints.

**50. Rethink the role of `docs/ACTIVITY-LOG.md`**
Type: Process · Source: human lead (2026-10-28) · Hat: Manager/Lead
The log existed so several asynchronous AI sessions could catch up before the repo and pipeline were complete. Now that git history, PR descriptions, the register and CI exist, it mostly causes conflicts (every branch prepends to the same lines). New entries are paused (CLAUDE.md). Decide: retire it, keep it for milestones only, or generate it from history. Existing entries stay as history.

**51. Availability model: stock decided, windows and per-item pickup rules still open**
Type: Missing capability · Source: lifecycle review (2026-10-28) · Hat: Architect, Engineering/Build
Stock is decided by ADR-0017 (`availableQuantity`, `maxPerOrder`, `lowStockThreshold`; `CAT-005`, `CAT-006`). Still missing: availability windows (when an item can be ordered or collected), per-item rules for whether a pickup window may be requested, and per-vendor hours. D-5's 1-20 and 10-line bounds are placeholders until `maxPerOrder` is enforced by checkout.

**52. Who owns stock, and when it is reserved** — **Resolved 2026-10-28 by ADR-0017**
Type: Decision · Source: lifecycle review (2026-10-28) · Hat: Architect
Catalog owns a running quantity counter (absent = made to order); vendors set or increment/decrement it; ordering reserves at `Place` and releases on any cancellation, atomically per vendor. Follow-ups: items 61 and 62, `CAT-005`, `CAT-006`, and the limited-stock path of `ORD-001`.

**53. Payment timing conflicts with vendor confirmation**
Type: Decision to amend · Source: lifecycle review (2026-10-28), ADR-0005, `event-storming.md` · Hat: Architect
Event-storming charges at checkout. With a vendor confirm step the agreed direction is authorize at `Place`, capture at `Confirm`, release on decline, expiry or cancellation. ADR-0005 needs a dated amendment; `ORD-001`'s stubbed payment step should follow it. Refund rules beyond basic initiation stay deferred (item 6).

**54. Vendor order-action endpoints** — **Approved 2026-10-28 for design and implementation, to be iterated**
Type: Missing API · Source: lifecycle review (2026-10-28) · Hat: Engineering/Build
Drafted in `order-lifecycle.md` and specified as `WI-ORD-007`. Authorization (role plus ownership) is auth logic: the human lead approved adding it; details will be iterated. Remaining: who completes an order (item 59), and item 33 (mock vendor ids) for testing.

**55. Vendor-response timeout** — **Deferred to a later slice (human lead, 2026-10-28)**
Type: Missing rule · Source: lifecycle review (2026-10-28) · Hat: Architect
A `Placed` order waits until the vendor acts or the customer cancels. An automatic timeout would need an owner (a timer inside `ordering-service`, a scheduled message or a function) and a duration; none is chosen, so the aggregate has no system actor. Revisit when real vendors show orders going unanswered.

**56. Pickup no-show rule** — **Resolved 2026-10-28**
Type: Missing rule · Source: lifecycle review (2026-10-28) · Hat: Architect
Handled by the existing rules: the vendor can cancel an order from any non-final status, including `ReadyForFulfillment`, with reason `VendorCancelled`. A dedicated no-show reason code (useful once refund rules exist, item 57) can be added later.

**57. Customer cancellation window and refunds**
Type: Policy · Source: lifecycle review (2026-10-28) · Hat: Product
Built into the aggregate as decided: the customer may cancel while `Placed` or `Confirmed`; once preparation starts only the vendor can. Refund and fee consequences are not defined (ties to items 6 and 53).

**58. First-slice decisions shifted by the lifecycle**
Type: Reconciliation · Source: lifecycle review (2026-10-28) · Hat: Architect
D-2 (browser cart) still holds but the cart is conceptually the `Pending` order; D-5 becomes per-item maxima with a global cap; D-8's lead time may be per item or vendor; the walking skeleton's order-status path now needs a vendor confirm action to progress beyond `Placed`. Update `first-slice-contract.md` and `WI-ORD-001`/`003` with dated notes when those items are picked up.

**59. `OrderPlaced` total and overlapping event families** — **Resolved 2026-10-28**
Type: Schema gap · Source: lifecycle review and `WI-ORD-002` (2026-10-28) · Hat: Architect
`OrderPlacedPayload` has optional `TotalCents` and `Currency`. The two event families are layers of ADR-0001's design, not duplicates: the Order raises business facts and the seam event `OrderReadyForFulfillment`; `PickupFulfillment` raises `PickupWindowScheduled` and `OrderReadyForPickup` and answers with `OrderFulfillmentCompleted`, which completes the Order (`order-lifecycle.md`). `OrderConfirmed` carries the fulfillment details. Remaining work is in `ORD-003` (spec note added), `ORD-005` and `ORD-007`.

**60. Account-side gaps: vendor staff users and account deletion**
Type: Low-priority gap · Source: lifecycle review (2026-10-28) · Hat: Architect
Customer sign-up is hosted by the identity provider (ADR-0006) and preferences and vendor onboarding are covered (`PREF-*`, `VEN-*`). Not modeled: several staff users per vendor (ownership currently compares the token subject to the vendor id) and customer account deletion (`EPIC-DATA-PRIVACY`).

**61. Handling of prepared, day-old, second and defective items**
Type: Possible future feature (watch) · Source: stock review with the human lead (2026-10-28) · Hat: Product
Today a cancelled order's stock is released back to the counter (ADR-0017). A prepared, especially customized, item may not be returnable to regular inventory, and day-old goods, seconds and defects are real bakery cases. For now they are assumed removed from stock and handled outside this system (vendors adjust the counter). Revisit special handling (a release-with-hold or write-off option, a seconds listing, day-old discounts) once vendors report it; it touches cancellation, stock and possibly pricing.

**62. Service-to-service authentication for stock reservation, and orphaned reservations** — **Direction chosen 2026-10-28; credential type pending**
Type: Auth decision (human approval required) · Source: ADR-0017 (2026-10-28) · Hat: Architect, Security
The human lead chose OAuth2 client credentials. ADR-0018 (Proposed) defines the identity model (client id, app roles such as `Stock.Reserve` in `roles`), the required changes (mock issuer, shared Auth library, catalog, ordering, local secret tooling, DEV app registrations) and the verification list that decides the DEV credential (federated identity credential, else a Key Vault secret). Work item `WI-AUTH-006`; blocks `CAT-006`. Found while checking: the mock issuer's current `client_credentials` branch authenticates no client and returns a user token (including Admin) for any `mock_user_id`. Still undecided: cleaning up a reservation whose order was never saved (age rule, who runs it).

