# Open Items Register

> **Status:** Current · every item has a `Status:` line since 2026-10-30. Item shape and status values: `docs/method/register-item-template.md`. Counts: `docs/product/backlog/STATUS.md`.

A working list of deferred decisions, named limitations, and not-yet-built pieces surfaced across the ADRs and repo scaffolding so far. This is a **staging area, not a backlog** — each item below is written so it can be copy-pasted into a GitHub Issue and added to the repo's Projects board once picked up. When an item becomes an Issue, keep it here and add the Issue link to its `Status:` line.

Suggested Issue fields per item: Title, Type, Source, Suggested hat/owner, Notes (below, in that order).

---

**Running list rule (2026-10-28):** anything found and not fixed in the same change goes here before the work item is called done, with its source and what "reconciled" would mean, so later sessions do not re-analyze it. When an item is resolved, set `Status: Resolved <date>` and add a `Resolution:` line with a pointer; do not delete it. Items 36 to 49 and 51 to 71 came from the 2026-10-28 session.

**1. Redis Basic tier has no AAD data-plane auth**
Type: Tech debt / future work · Source: ADR-0002 · Hat: Architect
Status: Deferred · trigger: a higher Redis tier is justified
If a higher Redis tier is ever justified, switch to AAD-based auth and drop the access-key secret entirely (ties to ADR-0007's "eliminate the secret" principle).

**2. Cosmos DB Linux emulator has partial API coverage and can be resource-heavy locally**
Type: Known limitation · Source: ADR-0004 · Hat: Platform Engineering
Status: Resolved 2026-10-30
Resolution: The local emulator is now the Cosmos vNext emulator (`docker-compose.yml`; ADR-0004 amendment, 2026-10-30), which the services and the integration tests use. Its own limits are item 34; CI does not run the emulator tests (item 65).
Mitigated by `FakeRepository` for the fast unit-test loop; only affects integration-test fidelity.

**3. Cosmos DB shared RU budget across containers (noisy-neighbor risk)**
Type: Accepted risk · Source: ADR-0004 · Hat: Architect / Operations
Status: Accepted · owner: Architect / Operations
A throughput spike in one container can throttle another. Revisit if this becomes a real problem under load.

**4. Cosmos DB security blast radius — per-container resource tokens not implemented**
Type: Future hardening · Source: ADR-0004 · Hat: Architect / Governance
Status: Deferred · trigger: before an account split would be justified
Natural next step before a full account split would be justified.

**5. Cosmos DB partition key choices are v1 guesses, not validated under real load**
Type: Tech debt · Source: ADR-0004 · Hat: Architect
Status: Tracking
Revisit `customerId`/`vendorId` partitioning once real traffic patterns exist.

**6. Payments: chargeback/dispute handling deferred**
Type: Deferred scope / risk · Source: ADR-0005 · Hat: Manager/Lead (risk register), Operations
Status: Deferred · trigger: payments go beyond the stub (`PAY-001`); tracked in the risk register
Should be logged in the risk register, not just this file.

**7. Payments: single currency (USD) / single region (US) assumed**
Type: Deferred scope · Source: ADR-0005 · Hat: Digital PM / Architect
Status: Deferred · trigger: international support is wanted
Would need real rework, not just configuration, for international support.

**8. Auth: no centralized policy engine (OPA or similar)**
Type: Deferred architecture · Source: ADR-0006 · Hat: Architect
Status: Deferred · trigger: resource types or role complexity grow
Per-service ownership checks are sufficient at current scale; revisit if resource types or role complexity grow.

**9. Secrets: rotation requires a service restart, no live rotation**
Type: Known limitation · Source: ADR-0007 · Hat: Platform Engineering
Status: Accepted · owner: Platform Engineering
Key Vault's automatic rotation policies are the natural v2 enhancement.

**10. `docker-compose.yml` is still a stub**
Type: Not started · Source: repo scaffold · Hat: Platform Engineering
Status: Resolved 2026-10-26
Resolution: The file runs Redis Streams, the Cosmos vNext emulator and the mock OIDC issuer, plus the cache Redis behind `--profile with-redis`, verified under Docker (`WI-DEV-002`). Since then the seed script is done (`WI-DEV-004`, 2026-10-27). Not done and tracked elsewhere: Stripe CLI wiring (no spec; part of `PAY-001`, backlog N-08) and application containers (item 71).
Needed: Redis Streams service (default), Cosmos emulator service (default), cache service (profile-gated), Stripe CLI wiring, seed/fixture data script. Built 2026-10-26 (`WI-DEV-002`), see the resolution above.

**11. Reusable tooling packages not yet scaffolded**
Type: Not started · Source: ADR-0003, ADR-0006 · Hat: Platform Engineering
Status: Resolved 2026-10-30
Resolution: Built under other names: `/tools/event-schemas` is `tools/BakeryMarketplace.EventSchemas` (`WI-TOOL-001`), `/tools/logging-helper` is `tools/BakeryMarketplace.Logging` (`WI-TOOL-002`), `/tools/auth-middleware` is `tools/BakeryMarketplace.Auth` (`WI-AUTH-001`). There is no shared fault-injection harness: chaos decorators are per library (`ChaosCacheProvider` exists; `ChaosEventTransport` is not built).
`/tools/event-schemas`, `/tools/logging-helper`, `/tools/auth-middleware`, and the shared fault-injection harness are named in ADRs but not yet built.

**12. GitHub Projects board not yet created**
Type: Not started · Source: docs/history/portfolio-plan-2026-09.md · Hat: Manager/Lead
Status: Open · scope decision pending (documentation reconciliation R-15)
Columns: `Backlog → Ready → In Progress → Review → Done`, per the original plan.

**13. Docs site not yet published via GitHub Pages**
Type: Not started · Source: docs/history/portfolio-plan-2026-09.md · Hat: Engineering/Build
Status: Open · publish after the documentation clean-up (R-13)
`mkdocs.yml` is ready; needs the actual publish step (`mkdocs gh-deploy` or a Pages Actions workflow). **Decision 2026-10-30 (the lead): do not publish the site for the public flip;** the README and `docs/index.md` serve readers browsing on GitHub. The item stays open as a later option. **Update 2026-10-30:** the navigation was rebuilt (Status and plan, Product, Architecture, Operations, Process, Method, Management, Governance, Evidence, History) and `mkdocs build` was run once locally (mkdocs 1.6.1 with Material): it builds, with one broken link found and fixed. Still not published. **Wiring is open (nothing runs mkdocs today):** options are a manual `mkdocs gh-deploy` from a developer machine, a main-branch job in Azure Pipelines that pushes the `gh-pages` branch with a token held as a pipeline secret, or a docs-only GitHub Actions workflow (which would need an ADR-0015 amendment, since Azure Pipelines is the single CI/CD system). Pin the tooling (a docs requirements file) when one is chosen. **Review Zensical before committing to the tool:** the build prints that Material for MkDocs reaches end of life on 2027-05-05 and names Zensical as its maintained successor; the nav and Markdown here are plain, so a move should be cheap. Publishing makes the documents public, so it follows the public-readiness work (item 93). Owner of the choice: the lead.

**14. CI workflow is still a placeholder**
Type: Not started · Source: repo scaffold · Hat: Platform Engineering
Status: Resolved 2026-10-28
Resolution: The placeholder was removed in the Azure Pipelines migration commit (`CI-004`, ADR-0015 amendment); the real stages are in `azure-pipelines.yml` (`WI-PORT-003`).
`.github/workflows/ci.yml` has no real build/test/deploy stages yet. **2026-10-26**: CI/CD moves to Azure Pipelines (ADR-0015). The real stages are built there (`WI-PORT-003`), and this placeholder was removed in one migration commit on 2026-10-28 (`CI-004`, ADR-0015 amendment). The Azure check is a soft manual gate, not a GitHub required check (rulesets need an enterprise plan).

**15. No working ephemeral/preview environment example**
Type: Not started · Source: tech-stack.md · Hat: Platform Engineering
Status: Deferred · trigger: a deployed environment is built (priority P4)

**16. Delivery/dispatch fulfillment strategy — deferred**
Type: Deferred scope (by design) · Source: ADR-0001 · Hat: Architect / Digital PM
Status: Deferred · trigger: v2 scope is scheduled
Named as the primary planned v2 extension; not a gap, just not yet scheduled.

**17. Full ad-bidding platform — deferred**
Type: Deferred scope (by design) · Source: bounded context map, ADR area · Hat: Digital PM
Status: Deferred · trigger: v2 scope is scheduled

**18. B2B small-supplier flow — explicitly scoped out**
Type: Scoped out (by design) · Source: glossary.md · Hat: Digital PM
Status: Accepted · owner: Digital PM
Not a gap — documented as considered and rejected for v1.

**19. Work-item template — resolved**
Type: Done · Source: this planning conversation · Hat: Product Owner
Status: Resolved 2026-09
Resolution: The template is `docs/method/work-item-template.md` (copied into this repository 2026-10-30); the specs that follow it are in `docs/product/backlog/`.
Defined and validated against two real examples.

**20. API Gateway / BFF layer — resolved**
Type: Done · Source: this planning conversation · Hat: Architect
Status: Resolved 2026-09-06
Resolution: ADR-0008, revisited by ADR-0013 on 2026-10-26.
Azure API Management, Consumption tier, with zero-trust dual validation (edge fast-fail + authoritative per-service check unchanged from ADR-0006). See ADR-0008. **Revisited 2026-10-26**: ADR-0013 adds a Node/TypeScript GraphQL BFF as the browser apps' single entry point; APIM stays in front of the service APIs (BFF → APIM → services in the cloud).

**21. Azure AD B2C → Microsoft Entra External ID — planned, not yet executed**
Type: Planned tech swap · Source: user direction, ADR-0006 amendment, ADR-0010 · Hat: Architect
Status: Deferred · trigger: the DEV tenant is created (backlog N-02, `WI-AUTH-006` phase 2)
Azure AD B2C stopped accepting new tenants May 2025; Premium P2/Identity Protection retired March 2026; full support continues to ~2030 but the platform is frozen. Microsoft's stated successor for new work is Entra External ID (GA since 2024). This project targets Entra External ID instead. The JWT validation design (issuer/audience/JWKS-driven, `Microsoft.AspNetCore.Authentication.JwtBearer` per ADR-0010) is config-driven and unaffected by which issuer is configured. **Hold `AUTH-004`** (tenant/policy configuration) from agent assignment until this is finalized — `AUTH-001` (generic validation middleware) is unaffected and safe now.

**22. Redis vendor reconsideration — planned, not yet decided**
Type: Planned tech swap · Source: user direction, ADR-0002 amendment · Hat: Architect
Status: Tracking
The specific managed cache vendor (Azure Cache for Redis) may change. `CacheProvider`, `LocalCacheProvider`, `ResilientCacheProvider`, and the contract-test suite are all vendor-agnostic and safe to build now. **Hold `CACHE-002`** (RedisCacheProvider implementation) **and `CACHE-005`** (Terraform managed-Redis toggle) from agent assignment until the vendor decision is finalized. **Update 2026-10-30:** the hold on `CACHE-002` no longer applies: it was built (a vendor-agnostic Redis provider, `WI-CACHE-002`, Done). The vendor is still undecided and `CACHE-005` is still held.

**23. Documentation cleanup: stale "Azure AD B2C" references in historical diagrams/docs**
Type: Low-priority cosmetic cleanup · Source: this review pass · Hat: Architect
Status: Open
`docs/architecture/c4/context.md`/`container.md`, `docs/management/budget-cost-estimate.md`, and a few closed work-item files still name Azure AD B2C directly rather than Entra External ID. Not functionally incorrect (the swap doesn't change any diagram's actual shape), just cosmetically stale. **Update 2026-10-30:** the document review found the same in `nfrs.md` section 3.2; the architecture pass (edit plan step 7) fixes these. Living reference docs (`tech-stack.md`, ADR-0006) are already corrected — this item is for the rest, whenever it's convenient, not urgent.

**24. No refresh-token / silent-renewal flow in the frontend auth pattern**
Type: Known limitation (v1) · Source: ADR-0011 (carried forward unchanged by ADR-0012), `WI-WEB-001`/`WI-AUTH-005` · Hat: Engineering/Build, Architect
Status: Deferred · trigger: cookie session work (backlog N-01)
Access tokens are held in memory only and expire with no background refresh — a user simply gets logged out and must re-authenticate. Acceptable for a local/demo-scale app with short sessions; a real production frontend would need either silent-refresh-via-hidden-iframe or a refresh-token grant (the latter would also reopen the cookie-vs-header storage question closed in ADR-0006 §3.3's CSRF analysis, so isn't a drop-in addition). Named here explicitly rather than left as an unstated gap, consistent with `WI-NFR-001`'s "aspirational/future" discipline.

**25. Frontend/BFF hosting not yet decided**
Type: Open decision · Source: ADR-0012, ADR-0013 (2026-10-26) · Hat: Architect / Platform Engineering
Status: Open
Next.js SSR and the GraphQL BFF need Node-capable hosting; the Static Web Apps permanent free tier no longer fits. Azure Container Apps is the default candidate (already in the stack). Decide when deployment is introduced (`INFRA-002`), and update `budget-cost-estimate.md` at the same time.

**26. Server-side rendering of authenticated pages deferred**
Type: Deferred architecture · Source: ADR-0012 (2026-10-26) · Hat: Architect
Status: Deferred · trigger: server rendering of authenticated pages is wanted (needs backlog N-01)
In v1, only public listing pages use SSR. Authenticated pages render client-side, so the Next.js server never holds user tokens and ADR-0006's in-memory, header-only token posture is unchanged. SSR for authenticated pages would need a server-side session (cookie), which reopens ADR-0006's cookie/CSRF analysis and interacts with #24.

**27. Per-user throttling at the BFF — not decided**
Type: Open question · Source: ADR-0013 (2026-10-26) · Hat: Architect
Status: Open
APIM Consumption still lacks `rate-limit-by-key` (ADR-0008). Whether the GraphQL BFF takes on any per-user or per-query-cost limiting is left to `EPIC-RATE-LIMITING`.

**28. Catalog public reads probe one partition per verified vendor**
Type: Known limitation · Source: `WI-CAT-001` (2026-10-26) · Hat: Architect
Status: Tracking
Browse and lookup-by-id cost grows with the number of verified vendors. Options when it matters: vendor embedded in the listing id, a cross-partition query on `IRepository<T>` (shared contract), or a browse read model. See `docs/evidence/WI-CAT-001/findings.md`.

**29. Redis Streams consumer groups are named per event type, not per service**
Type: Tech debt / latent defect · Source: `WI-EVT-003` code, found by `WI-CAT-001` · Hat: Platform Engineering
Status: Open
`RedisStreamsEventTransport` uses group `cg:{eventType}`. Two services subscribing to the same event would compete for messages instead of each receiving all of them. Harmless while a single service consumes each event; fix before `ordering-service` or `notification-service` subscribes to a shared one (group name should include the service).

**30. No outbox for publish-after-save**
Type: Known limitation · Source: `WI-CAT-001` · Hat: Architect
Status: Open
Progress: Optimistic concurrency resolved 2026-10-28; outbox resolved for ordering 2026-10-28 (`WI-ORD-005`, item 68); the catalog outbox built 2026-11-01 on `feature/stock-outbox-hardening` (`ListingEventPublisher`, `ListingOutboxRelay`): `ListingPublished` and `LowStockDetected` are stored in the listing document in the same write as the change (including the reservation batch), published inline, swept by a relay, with a stable event id per listing, version and type, and the attempt count and park rule of item 74. Tested with the in-memory repository only (116 catalog tests pass); the Cosmos `pendingSince` and `parkedAt` queries are not yet run on the emulator. The relay has no wake-up signal (it polls at 5 seconds, backing off to 60), `ListingEventPublisher.UnparkAsync` has no endpoint, and the vendor-status document (`VendorStatusDocument`) is still last-write-wins.
Resolved: `IRepository<T>` now has `SaveIfUnchangedAsync` for entities that implement `IETagged` (Cosmos If-Match, verified on the emulator); listings use it (`WI-CAT-005`). Still open: catalog saves then publishes `ListingPublished` and `LowStockDetected`, and a failed publish is logged and never re-sent (no outbox). Other documents are still last-write-wins: `VendorStatusDocument` is a read-modify-write when concurrent events arrive for one vendor, and orders (`ORD-006`) should adopt `IETagged`.

**31. Existing Cosmos adapter tests may not exercise the real serializer path**
Type: Verification gap · Source: reconciliation finding A8 + `WI-CAT-001` · Hat: Platform Engineering
Status: Open
`CosmosRepositoryTests` use PascalCase `Id`/`PartitionKey`, but Cosmos' default serializer requires a lowercase `id`. Confirm against the emulator once `WI-DEV-002` exists; catalog avoids the issue with explicit property names. **Confirmed 2026-10-26 (WI-DEV-002):** by default the tests cannot connect (https vs the emulator's http) and return early, passing without touching Cosmos; pointed at the real emulator, 3 of 4 fail with `Document does not contain an id field`. The fix was named `WI-DATA-003`, which has no spec. **Update 2026-10-30:** `CosmosRepositoryTests` has not changed since; the Data test project skips 15 tests when no emulator is configured. See docs/operations/local-dev.md.

**32. Mock OIDC issuer login page reflects query parameters unescaped**
Type: Security defect (dev-only) · Source: `WI-AUTH-005` code, confirmed by `WI-DEV-002` (2026-10-26) · Hat: Platform Engineering
Status: Resolved 2026-10-28
Resolution: Every value the page echoes is HTML-encoded and round-trips unchanged; the redirect after login is built with query-string encoding (a crafted `state` is data, not syntax); and the issuer only redirects to a registered `redirect_uri`, compared exactly (`MockOidc:RedirectUris`, default the local web app's callback; decision D-D). Tested in the library and against the real container.
`/authorize` interpolates `redirect_uri`, `state` and `code_challenge` into HTML without encoding, so a crafted link injects script (confirmed with a payload). The issuer is dev-only, loopback-bound in Compose and refuses to start in Production, but the fix is small: HTML-encode the values in `tools/BakeryMarketplace.Auth/MockOidcIssuer.cs`.

**33. Mock users and seed vendor ids do not line up**
Type: Design gap · Source: `WI-DEV-002` / `WI-DEV-004` (2026-10-26) · Hat: Platform Engineering
Status: Resolved 2026-10-27
Resolution: The mock issuer offers `vendor-shop-001` and `vendor-indep-001` as vendor login users that match the seeded vendors (`tools/BakeryMarketplace.Auth/MockUser.cs`; `docs/operations/local-dev.md`).
Ownership requires the token `sub` to equal the listing's `vendorId`; the mock vendor's `sub` is `user-vendor-1`, so seed vendors such as `vendor-shop-001` cannot be edited by any mock user. Resolve in `WI-DEV-004`: seed with the mock user's id, or add matching users to the issuer.

**34. Cosmos SDK and emulator versions are coupled; shared package versions are mixed**
Type: Dependency risk · Source: `WI-DEV-002` (2026-10-26) · Hat: Platform Engineering
Status: Tracking
The vNext emulator needs Cosmos SDK 3.63.x or newer (3.38.1 and 3.50.0 throw while decoding whole-document queries). `BakeryMarketplace.Data` is now on 3.63.2 with an explicit `Newtonsoft.Json` reference, and the emulator image is pinned to `vnext-EN20261019`. Bump them together, and re-run the catalog journey in docs/operations/local-dev.md when either changes. Related: mixed package versions across tools (reconciliation finding B5, central package management recommended).

**35. Eventing Redis tests are not repeatable on one Redis instance; Redis adapter tests can silently use fakes**
Type: Test isolation / verification gap · Source: `WI-PORT-003` (2026-10-28) · Hat: Platform Engineering
Status: Open
`RedisStreamsEventTransportTests` pass on a fresh Redis and `DuplicateEventId_IsDeliveredTwice_ConsumerObservesBoth` fails on an immediate re-run (state left in streams or consumer groups). Separately, with the default `localhost:6379` the Redis cache and event tests connected nothing on the Windows dev machine and ran against in-memory fakes while reporting green; `127.0.0.1:6379` reaches Redis. **Update 2026-10-28:** the test-isolation half is fixed (per-test event types in `EventTransportContractTests`; 5 consecutive runs on one Redis pass; it had become a frequent failure after the .NET 10 upgrade). The silent fallback to fakes remains. CI sidesteps that (fresh container, `127.0.0.1`, and `scripts/ci/redis-touch.mjs` fails the job if Redis saw too few commands). Not fixed: needs per-test stream/group names or cleanup, and an explicit failure instead of a fallback when Redis is expected. Related: #31, finding A8.

**36. The Node tiers export traces with hand-rolled OTLP/JSON, not the Node SDK**
Type: Decision deviation · Source: `WI-PORT-005` (2026-10-28), ADR-0016 item 1 · Hat: Platform Engineering
Status: Open
`services/graphql-bff/src/otlp.ts` (one server span per successful request) and `apps/web-customer/src/lib/relay/otlp.ts` (one client span per BFF call) are two copies of the same small exporter. Each tier already owns its trace context by hand, the SDK would need ESM loader hooks (BFF), and `@vercel/otel` adds seven peer dependencies (web). Reconcile by adopting the OpenTelemetry Node SDK in both (which also adds a catalog-client span and a page-level SSR span) or amending ADR-0016 to accept the exporters. Gaps: no span for 400/404 BFF responses; the web tier has no span for the page render as a whole.

**37. Cloud trace pipeline is decided but not built**
Type: Open work / cost · Source: ADR-0016 amendment (2026-10-28) · Hat: Architect, Platform Engineering
Status: Open
Decided: Application Insights for DEV, UAT and Prod through an OpenTelemetry Collector; Jaeger opt-in for UAT/Prod. Open: where the collector runs in Azure and what it costs (not in `budget-cost-estimate.md`), the Key Vault reference for the connection string, how Jaeger would be hosted and stored if enabled, and a run of `infra/otel-collector/cloud.yaml` against a real Application Insights resource (only syntax-validated so far).

**38. The catalog span records `url.query`**
Type: Data-safety follow-up · Source: `WI-PORT-005` evidence (2026-10-28), ADR-0016 item 6 · Hat: Security / Platform Engineering
Status: Resolved 2026-10-28
Resolution: Resolved 2026-10-28 (spans); one accepted residue.
Checked, and my earlier description overstated it: the ASP.NET Core instrumentation redacts query *values* by default, so the span carries `?limit=Redacted&after=Redacted` (parameter names only), and the collector configs delete the attribute outright. A regression test (`TracingTests.RequestSpansDoNotCarryQueryStringValues`) fails if the redaction is lost. Accepted residue: with `Microsoft.AspNetCore.Hosting.Diagnostics` at Information (the Development setting only; base config is Warning) the console log prints the full request URL including query values. Revisit if a Development log ever goes anywhere shared, or before search or preference endpoints exist (parameter names could then reveal intent).

**39. No per-vendor time zone (D-7)**
Type: Contract gap · Source: first-slice contract implementation check (2026-10-28) · Hat: Engineering/Build
Status: Open
Progress: Partly resolved 2026-10-28.
The slice now has one configured zone for every vendor (`Pickup:TimeZoneId`, default `America/New_York`, hours 08:00-17:00, converted to UTC per date with daylight saving; `WI-ORD-001`). Still open: a vendor zone and vendor hours in the vendor model, seed and DTOs, once vendors set their own availability windows (item 51). Until then `GET /ordering/pickup-windows` requires a vendor id but returns the same windows for every vendor, and cannot tell an unknown vendor from a real one (ordering has no vendor data).

**40. Money representation is not uniform (D-1)**
Type: Contract inconsistency · Source: first-slice contract implementation check (2026-10-28) · Hat: Architect
Status: Open
`PayoutReconciledPayload.NetAmount` is `decimal`; `data-model-api-contracts.md` still uses unqualified `price`, `priceDelta`, `grossAmount`. Part of `WI-PORT-006` pass 2. **Partly resolved 2026-10-28:** the data-model doc now uses `priceCents` / `priceDeltaCents` and has a payout-money row; `PayoutReconciledPayload.NetAmount` is still `decimal` in code.

**41. Scope of the GraphQL global-ID rule (D-9) is unconfirmed**
Type: Open decision · Source: D-9 fix (2026-10-28) · Hat: Architect
Status: Resolved 2026-10-28
Resolution: Resolution (human lead, 2026-10-28): `Order` is also a Relay global id (`Order:<id>`, built in `S1-01a`); `vendorId`, modifier ids and cursors stay raw service ids because they are not Relay nodes.
Only `Listing.id` is a global ID. `vendorId`, `Modifier.id` and pagination cursors stay raw service ids. Confirm, especially for `vendorId` as the argument of the future `pickupWindows` query.

**42. Remaining tracing gaps in the walking skeleton**
Type: Verification gap · Source: `WI-PORT-005` evidence (2026-10-28) · Hat: Platform Engineering
Status: Open
Done 2026-10-28: Next.js server span (a three-tier trace shows in Aspire), catalog event-consumer spans (tested), TraceId in the catalog's console log scopes. Still open: scopes appear in the console only because `IncludeScopes` is set in the Development config, so deployed environments need structured log export; no log export; `GetServerSideProps` page render has no span; the skeleton smoke was not run with tracing on; no consumer span has been seen in a dashboard (no event is published during a request yet).
**Update 2026-10-28 (`S1-09`):** the whole real-stack smoke ran with tracing on (21 of 21), a page load and a checkout each came out as one trace across their services, and a scan of every exported span for tokens, keys, secrets, e-mail addresses and customer identity found none (`docs/evidence/slice-1/findings.md`). Still open: log export, the page-render span, any dashboard (Aspire or Application Insights) was not used for this capture, the browser hop is untraced (a checkout trace starts at the BFF), and order events have no consumer span yet.

**43. Mock e2e and the skeleton smoke share `.next`**
Type: Test isolation · Source: e2e investigation (2026-10-28) · Hat: Platform Engineering
Status: Resolved 2026-10-28
Resolution: Resolved 2026-10-28.
`next.config.js` takes `distDir` from `NEXT_DIST_DIR`; `skeleton-smoke.mjs` builds into `.next-skeleton`. Verified: smoke 5/5, then the mock e2e 6/6 with no rebuild, and no tsconfig churn. README updated.

**44. The green Azure run has no recorded run ID, and `ubuntu-26.04` is untested**
Type: Evidence gap · Source: `WI-PORT-003` (2026-10-28) · Hat: Platform Engineering
Status: Open
Progress: Run recorded 2026-10-29; the `ubuntu-26.04` half stays open.
Recorded 2026-10-29: Azure Pipelines run `#20261029.4` (the PR build of `feature/slice-1-hardening`, passed, reported by the human lead) in `docs/evidence/WI-PORT-003/findings.md`; build id 18; a link is not recorded. Still open: the pipeline is pinned to `ubuntu-24.04`; move deliberately after a run on 26.04.

**45. The Azure Pipelines check is a soft gate, not a GitHub required check**
Type: Accepted risk · Source: ADR-0015 amendment (2026-10-28) · Hat: Manager/Lead
Status: Accepted · owner: Manager/Lead
GitHub rulesets need an enterprise plan, so nothing blocks a merge with a red or missing Azure check. The human lead reads it at PR approval. Revisit if the plan changes.

**46. `WI-PORT-006` pass 2 and `WI-PORT-007` closure**
Type: Documentation reconciliation · Source: first-slice contract §12 (2026-10-28) · Hat: Architect
Status: Tracking
Progress: Resolved 2026-10-28 for the data-model row and `WI-PORT-007`.
The contract's REST shapes and GraphQL draft now live in `data-model-api-contracts.md` ("First-slice mapping"); `WI-PORT-007` is Done. The other `WI-PORT-006` pass-2 rows (C4 diagrams, glossary, plans, cost, indexes) are still open under that work item.

**47. `CorrelationId` log-scope alias has no retirement date**
Type: Tech debt · Source: ADR-0016 item 2 (2026-10-28) · Hat: Platform Engineering
Status: Open
`TraceId` is the identifier; `CorrelationId` is kept for one transition period. Retire it once no log query depends on it.

**48. Not built: D-10 beyond the hook, and the window endpoint**
Type: Tracking · Source: first-slice contract implementation check (2026-10-28) · Hat: Engineering/Build
Status: Resolved 2026-10-28
Resolution: Re-checked when the BFF mutation was built: the first-slice contract's "Slice 1 as built" section (item 58) reconciles D-2, D-3 and D-5 to D-10 with the finished slice.
Implemented in `WI-ORD-001`: D-5 quantity limits (aggregate and checkout), D-6 idempotency (deterministic order id plus request hash), D-8 lead time (`PickupSchedule`, checked at checkout) and D-10 (`X-Test-Payment` hook on the stub, ignored in Production). `GET /ordering/pickup-windows` is built too (`WI-ORD-003`, same day). Still to do: re-checking these against the code when the BFF mutation exists.

**49. Other C# services do not call `AddBakeryTelemetry`**
Type: Tracking · Source: `WI-PORT-005` (2026-10-28) · Hat: Platform Engineering
Status: Tracking
Only catalog-service is wired. `ordering-service`, `admin-service` and `notification-service` are empty scaffolds; wire them when they gain endpoints.
**Update 2026-10-28 (`S1-09`):** `ordering-service` calls `AddBakeryTelemetry` and exported spans in the slice-1 capture (a checkout is one trace through the BFF, ordering and the catalog); only the two empty scaffolds, `admin-service` and `notification-service`, remain unwired.

**50. Rethink the role of `docs/history/ACTIVITY-LOG.md`**
Type: Process · Source: human lead (2026-10-28) · Hat: Manager/Lead
Status: Resolved 2026-10-30
The log existed so several asynchronous AI sessions could catch up before the repo and pipeline were complete. Now that git history, PR descriptions, the register and CI exist, it mostly causes conflicts (every branch prepends to the same lines). New entries are paused (CLAUDE.md). Decide: retire it, keep it for milestones only, or generate it from history. Existing entries stay as history.
Resolution: The log was closed with a header note and moved, unchanged, to `docs/history/ACTIVITY-LOG.md` (decision of 2026-10-30). Commit messages and pull request descriptions record what happened; the register, the ADRs, `docs/evidence/` and `STATUS.md` hold the rest.

**51. Availability model: stock built, windows and per-item pickup rules still open**
Type: Missing capability · Source: lifecycle review (2026-10-28) · Hat: Architect, Engineering/Build
Status: Open
Stock fields and vendor controls are built (`WI-CAT-005`, ADR-0017: `availableQuantity`, `maxPerOrder`, `lowStockThreshold`); reservation is `CAT-006`. Still missing: availability windows (when an item can be ordered or collected), per-item rules for whether a pickup window may be requested, and per-vendor hours. D-5's 1-20 and 10-line bounds remain placeholders until checkout enforces `maxPerOrder`. The default low-stock threshold of 5 is a placeholder.

**52. Who owns stock, and when it is reserved**
Type: Decision · Source: lifecycle review (2026-10-28) · Hat: Architect
Status: Resolved 2026-10-28
Resolution: Resolved 2026-10-28 by ADR-0017.
Catalog owns a running quantity counter (absent = made to order); vendors set or increment/decrement it; ordering reserves at `Place` and releases on any cancellation, atomically per vendor. Follow-ups: items 61 and 62, `CAT-005`, `CAT-006`, and the limited-stock path of `ORD-001`.

**53. Payment timing conflicts with vendor confirmation**
Type: Decision to amend · Source: lifecycle review (2026-10-28), ADR-0005, `event-storming.md` · Hat: Architect
Status: Open
Event-storming charges at checkout. With a vendor confirm step the agreed direction is authorize at `Place`, capture at `Confirm`, release on decline, expiry or cancellation. (`WI-ORD-008`, 2026-10-28: orders with no options and no requested window confirm at checkout, so for them authorize and capture happen together; `PAY-001` must handle both shapes.) ADR-0005 needs a dated amendment; `ORD-001`'s stubbed payment step should follow it. Refund rules beyond basic initiation stay deferred (item 6).

**54. Vendor order-action endpoints**
Type: Missing API · Source: lifecycle review (2026-10-28) · Hat: Engineering/Build
Status: Resolved 2026-10-28
Resolution: Built 2026-10-28 (`WI-ORD-007`, merged to main); the approved design is recorded there.
Drafted in `order-lifecycle.md` and specified as `WI-ORD-007`. Authorization (role plus ownership) is auth logic: the human lead approved adding it; details will be iterated. Who completes an order is settled (item 59): until `PickupFulfillment` exists, the vendor's `complete` is a direct command. Item 33 is resolved.

**55. Vendor-response timeout**
Type: Missing rule · Source: lifecycle review (2026-10-28) · Hat: Architect
Status: Deferred · trigger: real vendors show orders going unanswered
Progress: Deferred to a later slice (human lead, 2026-10-28).
A `Placed` order waits until the vendor acts or the customer cancels. An automatic timeout would need an owner (a timer inside `ordering-service`, a scheduled message or a function) and a duration; none is chosen, so the aggregate has no system actor. Revisit when real vendors show orders going unanswered.

**56. Pickup no-show rule**
Type: Missing rule · Source: lifecycle review (2026-10-28) · Hat: Architect
Status: Resolved 2026-10-28
Resolution: Resolved 2026-10-28.
Handled by the existing rules: the vendor can cancel an order from any non-final status, including `ReadyForFulfillment`, with reason `VendorCancelled`. A dedicated no-show reason code (useful once refund rules exist, item 57) can be added later.

**57. Customer cancellation window and refunds**
Type: Policy · Source: lifecycle review (2026-10-28) · Hat: Product
Status: Open
Built into the aggregate as decided: the customer may cancel while `Placed` or `Confirmed`; once preparation starts only the vendor can. Refund and fee consequences are not defined (ties to items 6 and 53).

**58. First-slice decisions shifted by the lifecycle**
Type: Reconciliation · Source: lifecycle review (2026-10-28) · Hat: Architect
Status: Resolved 2026-10-28
Resolution: The first-slice contract has a dated "Slice 1 as built" section that reconciles D-2, D-3, D-5 to D-10 and the order-status path with the finished slice.
D-2 (browser cart) still holds but the cart is conceptually the `Pending` order; D-5 becomes per-item maxima with a global cap; D-8's lead time may be per item or vendor; the walking skeleton's order-status path now needs a vendor confirm action to progress beyond `Placed`. Update `first-slice-contract.md` and `WI-ORD-001`/`003` with dated notes when those items are picked up.

**59. `OrderPlaced` total and overlapping event families**
Type: Schema gap · Source: lifecycle review and `WI-ORD-002` (2026-10-28) · Hat: Architect
Status: Resolved 2026-10-28
Resolution: Resolved 2026-10-28.
`OrderPlacedPayload` has optional `TotalCents` and `Currency`. The two event families are layers of ADR-0001's design, not duplicates: the Order raises business facts and the seam event `OrderReadyForFulfillment`; `PickupFulfillment` raises `PickupWindowScheduled` and `OrderReadyForPickup` and answers with `OrderFulfillmentCompleted`, which completes the Order (`order-lifecycle.md`). `OrderConfirmed` carries the fulfillment details. Remaining work is in `ORD-003` (spec note added), `ORD-005` and `ORD-007`.

**60. Account-side gaps: vendor staff users and account deletion**
Type: Low-priority gap · Source: lifecycle review (2026-10-28) · Hat: Architect
Status: Deferred · trigger: vendor staff users or `EPIC-DATA-PRIVACY` is picked up
Customer sign-up is hosted by the identity provider (ADR-0006) and preferences and vendor onboarding are covered (`PREF-*`, `VEN-*`). Not modeled: several staff users per vendor (ownership currently compares the token subject to the vendor id) and customer account deletion (`EPIC-DATA-PRIVACY`).

**61. Handling of prepared, day-old, second and defective items**
Type: Possible future feature (watch) · Source: stock review with the human lead (2026-10-28) · Hat: Product
Status: Deferred · trigger: vendors report prepared, day-old or defective items
Today a cancelled order's stock is released back to the counter (ADR-0017). A prepared, especially customized, item may not be returnable to regular inventory, and day-old goods, seconds and defects are real bakery cases. For now they are assumed removed from stock and handled outside this system (vendors adjust the counter). Revisit special handling (a release-with-hold or write-off option, a seconds listing, day-old discounts) once vendors report it; it touches cancellation, stock and possibly pricing.

**62. Service-to-service authentication for stock reservation, and orphaned reservations**
Type: Auth decision (human approval required) · Source: ADR-0017 (2026-10-28) · Hat: Architect, Security
Status: Open
Progress: Local path built and used 2026-10-28; DEV credential and cleanup pending. Orphan cleanup designed 2026-11-01, not built: it needs a new service-to-service read (see the proposal at the end of this item), which is an auth decision for the lead.
OAuth2 client credentials was chosen. `WI-AUTH-006` phase 1 (mock issuer, shared library, local secret tooling) and `WI-CAT-006` (the endpoints) are built, and a real token called the real endpoints end to end. Still open: phase 2 (Entra app registrations, the privileged app-role assignment, the DEV credential per ADR-0018's verification list); the `ordering-service` caller (`ORD-001`); and cleanup of a reservation whose order was never saved (a crash between reserving and saving the order): the age rule and who runs it. Reservation records are kept after release (see item 66). Checkout (`WI-ORD-001`) is now the caller: it releases on a declined payment or a failed save, and attempts a release when a reserve answer is lost; a crash in between still leaves a reservation without an order.

**Orphan cleanup built 2026-11-01 (approved by the lead as proposed, with two adjustments):** the catalog lists Active reservations in an age window at `GET /catalog/stock/reservations` (the existing reservation route, not `/internal/stock/reservations`), with the existing `stock:reserve` role; `OrphanReservationSweeper` in the ordering service runs every 5 minutes (`OrphanReservations:*`: `MinAgeMinutes` 15, `MaxAgeHours` 24, `SweepMinutes` 5, `PageSize` 50, `Enabled`), looks each order up by id (`OrderStore.ExistsAsync`, across partitions) and releases those with no order through the existing idempotent release. **Adjustment 1:** the sweep has a far end of 24 hours, because a reservation stays Active for the life of its order, so without one every order ever placed would be re-checked on every sweep; an orphan older than 24 hours when the sweep was not running is not caught and stays for an operator. **Adjustment 2:** reservations made before `createdAtMs` existed are outside every window. Tested with the in-memory repository and a fake HTTP catalog (catalog 131 tests, ordering 351 passed and 3 skipped); not run end to end against the two real services or the emulator. A real run needs a reservation older than 15 minutes with no order, which only a crash between reserving and saving produces.

**63. Vendors cannot read their own listings**
Type: Missing API · Source: `WI-CAT-005` (2026-10-28) · Hat: Engineering/Build
Status: Open
Only public reads exist (Published, verified vendors, no exact stock). A vendor sees the exact quantity only in the responses to their own create, edit and adjust calls, and cannot list their drafts or current stock. A vendor-facing read (list and get own listings, with the owner view) is needed before any vendor UI; mind the id-only lookup cost noted in `ListingService`.

**64. Stock status and `maxPerOrder` are not in the GraphQL schema**
Type: Contract follow-up · Source: `WI-CAT-005` (2026-10-28) · Hat: Architect, Engineering/Build
Status: Resolved 2026-10-28
Resolution: `Listing.stock { status maxPerOrder }` is in the BFF schema and shown as words (in stock, low, sold out) on the list and detail pages, with the quantity limited to the per-order maximum and a sold-out item not orderable.
The catalog REST responses now carry `stock`, but the BFF schema (`services/graphql-bff/schema/schema.graphql`, a shared file) and the web app do not expose them, so customers cannot see in stock, low or sold out yet. Add `Listing.stock { status maxPerOrder }` with the next BFF/web change, and show sold-out and low states in the listing UI.

**65. Emulator concurrency tests do not run in CI**
Type: Verification gap · Source: `WI-CAT-005` (2026-10-28) · Hat: Platform Engineering
Status: Open
The Cosmos variant of the concurrency contract tests needs `COSMOS_CONNECTION_STRING` and a running emulator, so the pipeline reports them as skipped; the fake variant runs everywhere. Add an emulator step to the pipeline's integration job when one exists (related to items 31 and 35). The new test class also adds one analyzer warning (CA1001, the same pattern as the existing Cosmos tests).

**66. Reservation records share the `catalog` container and are never cleaned up**
Type: Design follow-up · Source: `WI-CAT-006` (2026-10-28) · Hat: Architect, Platform Engineering
Status: Open
Progress: Partly resolved 2026-11-01 on `feature/stock-outbox-hardening` (code only). A released reservation now carries `ttl` of 30 days (`StockReservationDocument.ReleasedRetention`); an active one has none, and listings and vendor-status documents never do. The container is created with `DefaultTimeToLive = -1` in the catalog service (local convenience path) and the seed tool. Tested with the in-memory repository only (118 catalog tests); the emulator was not run, so expiry itself is not observed. **Not yet effective anywhere:** (1) a container that already exists keeps its old setting, so a local one needs `docker compose down` and a re-seed; (2) the deployed container is created by Terraform: `default_ttl = -1` is now set on `azurerm_cosmosdb_sql_container.catalog` in `infra/environments/dev/main.tf` (2026-11-01, with a test that the orders container has none; `node scripts/ci/terraform-checks.mjs` passes with the mocked provider), but **nothing has been planned or applied on Azure**, and changing this setting on an existing container is an update the lead should read in the plan. The discriminator concern in the text below is unchanged.
A reservation is stored beside the listings (same container and partition, so one transactional batch can cover both). Consequences to handle: released and long-finished reservations accumulate (add a TTL or a cleanup job once order lifecycle is wired); a future unfiltered query of `ListingDocument` over a partition would also return reservation records, because there is no document-type discriminator on listings (the current queries filter on `status`, which reservations do not have, and public browse was checked on the real store); and old reservations are the evidence needed to reconcile orphans (item 62).

**67. A release adds quantity to whatever the counter is now**
Type: Accepted edge case · Source: `WI-CAT-006` (2026-10-28) · Hat: Product
Status: Accepted · owner: Product
If a vendor sets an absolute quantity after an order reserved stock, a later release adds the reserved units back on top of the vendor's number. ADR-0017 accepts that a vendor-set value overrides reservations made since they last looked; the reverse (a release after a manual reset) is the same trade. Revisit with item 61 (special handling of prepared or defective items).

**68. `OrderPlaced` is never published, and a placed order cannot recover it**
Type: Gap · Source: `WI-ORD-001` (2026-10-28) · Hat: Architect, Engineering/Build
Status: Resolved 2026-10-28
Resolution: Raised events are stored inside the order document in the same write as the state change, published inline at checkout, and swept by `OutboxRelay` when that misses. Verified on the real stack, including a Redis outage and recovery (see `WI-ORD-005.md`).
Checkout stores the order as `Placed` but publishes nothing (`ORD-005` is not built), and the aggregate's raised events are not stored, so an order placed now has no `OrderPlaced` for `ORD-005` to find later. `ORD-005` should publish through an outbox: store the pending events with the order document in the same write, and publish from there (this also closes the "no outbox" half of item 30). Until then the vendor is not notified and the queue read-model has nothing to read.

**69. The payment step is a stub, and a real one needs a void and its own idempotency key**
Type: Tracking · Source: `WI-ORD-001` (2026-10-28), ADR-0005, item 53 · Hat: Architect
Status: Tracking
`StubPaymentProcessor` approves everything and logs a warning each time. A real authorization (`PAY-001`) must use the order id as its idempotency key and be voided if the save fails after the authorization succeeded (today a failed save releases the stock but would leave a real authorization standing). Capture at confirm follows item 53.

**70. No BFF `placeOrder` mutation, pickup-windows query, or web checkout**
Type: Follow-up · Source: `WI-ORD-001` (2026-10-28) · Hat: Engineering/Build
Status: Resolved 2026-10-28
Resolution: Built and verified end to end: the BFF queries and `placeOrder` (`S1-01`), the checkout page (`S1-03`) and the order status page (`S1-04`), and the browser journey against the real ordering service in the smoke (`S1-07b`, 18/18 locally; not yet on Azure).
The REST side is done, including `GET /ordering/pickup-windows`. Still to build: `Mutation.placeOrder` and `Query.pickupWindows`/`order` in the BFF schema (a shared file) with the contract's `PlaceOrderRejected` codes mapped from this service's error codes (including `insufficient_stock`), the Relay/web checkout UI with the demo-mode banner (`CUST-003`), and the order confirmation view (`CUST-004`).

**71. No container image for `ordering-service`, so time-zone data on the runtime image is unverified**
Type: Verification gap · Source: `WI-ORD-001` (2026-10-28) · Hat: Platform Engineering
Status: Open
The service resolves `Pickup:TimeZoneId` with the host's time-zone data (it stops at startup if the zone is unknown). It passes in the .NET SDK container on Linux and on Windows; no Dockerfile exists for the service, and slim runtime images sometimes lack `tzdata`. Check this when the image is written.

**72. The outbox relay sweeps every instance independently; a lease or the Cosmos change feed is the next step at scale**
Type: Tracking · Source: `WI-ORD-005` (2026-10-28) · Hat: Architect
Status: Tracking
Every ordering instance runs `OutboxRelay`. They can publish the same pending event twice (harmless: the event id is deterministic and consumers dedupe, ADR-0003) and one loses the cleanup race. The sweep is one cross-partition query on the sparse `pendingSince` property, with idle backoff and jitter, so its cost is small until there are many instances or many orders pending at once. If that changes: a lease document so one instance sweeps at a time, or the Cosmos change feed instead of polling. Not measured on real Azure Cosmos. Also: during a broker outage a checkout waits up to `Outbox:InlinePublishTimeoutSeconds` (default 2) before returning; it is the price of trying inline first.

**73. Catalog still falls back silently to the in-memory event backend**
Type: Inconsistency · Source: `WI-ORD-005` (2026-10-28) · Hat: Engineering/Build, Platform Engineering
Status: Resolved 2026-10-28
Resolution: Catalog now refuses to start unless `Events:Backend` is `redis` or `inmemory` (Development sets `redis`; the test host sets `inmemory`; the compose, skeleton-smoke and `service.env.example` configurations already set `redis`).
Ordering now refuses to start unless `Events:Backend` is `redis` or `inmemory`. `catalog-service` still defaults to in-memory when the setting is missing, so a misconfigured deployment would drop `ListingPublished`, `LowStockDetected` and the rest while looking healthy. Needs the same explicit rule (and the compose/pipeline/test configuration updated); not changed because it is outside `ORD-005`.

**74. An outbox entry that cannot be published blocks later events of that order**
Type: Known limitation · Source: `WI-ORD-005` (2026-10-28) · Hat: Engineering/Build
Status: Open
Progress: Partly resolved 2026-11-01. Built on `feature/stock-outbox-hardening`, tested with the in-memory repository only (347 ordering tests: 344 passed, 3 skipped; the Cosmos tests skip without the emulator, so the new `parkedAt` query and document shape are not yet run on the real store). Each failed publish is counted on the entry that failed (`attempts`); at `Outbox:MaxPublishAttempts` (5) the order's outbox is parked (`parkedAt` set, `pendingSince` removed), logged at error level, and no longer retried by the relay or the inline path. Later events still wait behind the failed one, so ordering is kept; the entries are kept, not dropped. `OrderStore.TryUnparkAsync` and `FindParkedAsync` exist for an operator. Still open: no HTTP or admin way to unpark (it would be an authenticated admin action; needs your approval before it is designed), no metric or alert on the parked count beyond the error log, and the real-store run.
Events publish in sequence order and stop at the first failure, so one entry that can never succeed (an unknown event type, a payload that no longer deserializes, for example after a schema change) leaves that order's later events pending forever, and the relay retries it on every sweep. It logs a warning each time but there is no attempt counter, dead-letter, or alert. Add one before more event types or schema versions exist.

**75. Redis event streams have no retention, and `OrderPlaced` has no consumer yet**
Type: Tracking · Source: `WI-ORD-005` (2026-10-28) · Hat: Platform Engineering
Status: Tracking
Progress: Trimming built 2026-11-01 on `feature/stock-outbox-hardening`, off by default: `RedisStreamsEventTransport` takes an optional `maxStreamLength` and the catalog and ordering services read it from `Events:MaxStreamLength`. With a limit, `XADD` trims the oldest entries approximately (whole blocks). Run against the local Redis container (3 new tests; they skip unless `REDIS_CONNECTION_STRING` is set). Not decided: the value to use, and the risk that trimming removes entries a consumer group has not read yet, so the limit must be far above any consumer's possible backlog; set it when the first consumer exists (`N-03`, `N-04`).
`RedisStreamsEventTransport` adds with `XADD` and never trims, so `events:OrderPlaced` and the other streams grow without bound. Local and CI Redis are throwaway, so it only matters for a long-lived Redis. No service subscribes to the order events yet (`QUE-001`, `NOT-001`); the consumer-group naming concern (item 29: group per event type rather than per service) applies when they do. Later order transitions (`ORD-007`) must write through `OrderStore.TryUpdateAsync` and then call `OrderEventPublisher.PublishPendingAsync`, never publish directly.

**76. A vendor's order lookup fans out across every customer's partition, and there is no "my orders" list**
Type: Known limitation · Source: `WI-ORD-007` (2026-10-28) · Hat: Architect, Engineering/Build
Status: Open
Orders are partitioned by customer (ADR-0004), but a vendor acting on an order knows only the order id. Orders that confirmed themselves (`WI-ORD-008`) never reach the vendor as a decision, so the vendor has no way to see them either until this read side exists (the `Automatic` flag on `OrderConfirmed` is there for it). `OrderStore.GetForVendorAsync` therefore queries `id` and `vendorId` across all partitions on every vendor action. That costs more request units as orders grow, and it is on a request path (the empty partition key was meant for background work). Options when it matters: a vendor-keyed read model fed by the order events (the `QUE-001` direction), a second container or lookup document partitioned by vendor, or having the vendor client pass the customer id. The same read model would give vendors the "my orders" list that does not exist yet; nothing shows a vendor which orders are waiting. Not measured against real Cosmos.

**77. Login follow-ups the mock issuer hides**
Type: Tracking · Source: `S1-02` (2026-10-28) · Hat: Engineering/Build, Security
Status: Tracking
Four things work locally but need attention against a real identity provider. (1) **Logout** only ends the in-memory session; the issuer's own session (single sign-on cookie) is not ended, because the mock has none. A real provider needs its end-session endpoint (`id_token_hint`, post-logout redirect). (2) The authorization **code travels in the callback URL's query**, so the Next.js server and any proxy in front of it can log it. It is single-use, bound to the PKCE verifier, and useless without it, and the callback page sets `no-referrer`, but access-log redaction for `/auth/callback` should be confirmed at deployment. (3) The **PKCE verifier sits in `sessionStorage`** for the length of the redirect (the standard approach); a script running on our origin could read it, though such a script could equally start its own login, so this is no weaker than holding the token in memory. (4) `NEXT_PUBLIC_AUTH_ISSUER` and the client id are **baked in at build time**, so each environment needs its own build or a runtime config endpoint. (The mock issuer's unescaped login page and its acceptance of any `redirect_uri` were fixed in `S1-06`, see item 32.)

**78. An order line has no item or option names**
Type: Gap · Source: `S1-04` (2026-10-28) · Hat: Architect, Engineering/Build
Status: Open
`OrderDto` (and so the GraphQL `Order`) carries listing ids, option ids, the quantity and the price charged, but no names. The confirmation page reads them from the live listings, so an item that was later renamed, unpublished or removed shows as "Item" (or an option as its id), and one order read makes one listing read per distinct item. An order is a record of what was bought, so ordering-service should store the item and option names at purchase time (as it does the price) and return them; then the page needs no listing reads and an old order stays readable. Needed before order history.

**79. Pickup times are shown in the customer's time zone, not the bakery's**
Type: Design gap · Source: `S1-03` (2026-10-28) · Hat: Product, Engineering/Build
Status: Open
Windows are UTC instants (D-7) and the checkout and order pages format them in the browser's zone. A customer in another zone than the bakery sees a time that is correct for them but is not the time on the shop's clock, and nothing says which zone is shown. The bakery's zone is configuration of ordering-service (`Pickup:TimeZoneId`, item 39: no per-vendor zone). Show the zone name with each time, or show the bakery's local time, once the vendor's zone is a field the BFF can return.

**80. A customer cannot see their orders as a list**
Type: Missing capability · Source: `S1-04` (2026-10-28) · Hat: Product
Status: Open · tracked as `WI-CUST-007`
The order page is reached by the id `placeOrder` returned; there is no order history and no way back to an order except that link (the browser's history, or the id). Needs an `orders` query in ordering-service (partitioned by customer already, ADR-0004) and the BFF, and a page. Not part of slice 1. Split out of `WI-CUST-004` as `WI-CUST-007` (Ready) on 2026-10-30.

**81. A retry under the key of a rejected checkout gets `conflict`, not the original answer**
Type: Rough edge · Source: `S1-07b` (2026-10-28) · Hat: Engineering/Build
Status: Open
After a typed rejection (a declined payment, say) the attempt's reservation is released, and the catalog will not reserve again for that order id (ADR-0017: a released reservation is final, so a late duplicate cannot hold stock for a dead order). Ordering derives the order id from `(customer, key)`, so reusing that key later fails at the reserve step with the generic "the stock changed while placing the order" (`conflict`). The web client avoids it (a rejection spends its key, see the first-slice contract), but another client, or a user retrying from a stale tab, would see a misleading message. Better: ordering recognizes that case and returns a distinct code ("start a new checkout"), or the catalog distinguishes "released" from "changed". Also relevant to `PAY-001`, where a declined real payment will be retried with the same intent.

**82. Tracing rough edges seen in the slice-1 capture**
Type: Tracking · Source: `S1-09` (2026-10-28), `docs/evidence/slice-1/findings.md` · Hat: Platform Engineering
Status: Tracking
(1) **A silent no-export hazard.** The C# services export only if `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` is set as well as the endpoint; with the endpoint alone the .NET exporter defaults to gRPC and its spans vanish against an HTTP port, with no error, and the BFF and web server (hand-rolled OTLP/HTTP) export fine, so a trace looks half there. Either default the protocol in `AddBakeryTelemetry` when an HTTP endpoint is given, or log a warning. (2) **The browser is not traced**, so a customer's click is not the start of its trace; a checkout trace begins at the BFF. (3) **Expected not-found reads are marked as errors** (Cosmos 404s for "is there a reservation or an order yet?"), which would swamp an error-rate view; filter them in the dashboard or the collector. (4) **A cold stack's first checkout takes about 4.7 s** (issuer metadata about 2 s, ordering's service token about 2 s) against 55 to 78 ms afterwards; warm the issuer before a demo, and see whether a deployed issuer behaves the same. (5) Exporting the variable in a shell also makes `docker buildx` export spans to it.

**83. `docs/project-log.md` contradicts the repo in many rows**
Type: Documentation drift · Source: document review of `project-plan.md` (2026-10-29) · Hat: Manager/Lead
Status: Resolved 2026-10-30
`CLAUDE.md` tells sessions to start from this file, yet its Engineering/Build table says services, tests and CI/CD are "Not started", `docker-compose.yml` is a "Stub" (line 94) and `tools/event-schemas` and `tools/logging-helper` are "Scaffolded, empty" (line 95); the ADR table stops at 0010 with "All ten are cross-referenced" (the ADR index lists 0001 to 0018); the Project Plan row (57) is "In Review" with "8 phases" and "1 open decision" although the plan was refreshed; the Roadmap row says it "points back to this log and the plan" (it points to `portfolio-plan.md` only). Reconciled means every row is checked against the repo and the ADR table is complete. Overlaps items 10, 11, 14 and 48 (stale entries in this register).
Resolution: the log was folded into `docs/index.md` (where things are) and the generated `docs/product/backlog/STATUS.md`, and archived at `docs/history/project-log-2026-10-29.md`; `CLAUDE.md`, the definition of done and the engineering standards now point to the new pages.

**84. `project-plan.md` has smaller gaps against the repo and the backlog**
Type: Documentation drift · Source: document review of `project-plan.md` (2026-10-29) · Hat: Manager/Lead
Status: Open
(1) Phase 4's exit criterion says `docker-compose up` should reflect the actual architecture, but compose runs infrastructure only (no application containers, item 71); the status says "Local dev: done" without saying that criterion is unmet. (2) Phase 2's exit criterion (queue display) is not met and the plan does not point at the work that closes it (`N-03` then `N-04` in `docs/management/slice-1/03-prioritized-backlog.md`, about 21 points, with a vendor read side first). (3) The plan has no link to the MVP line in `portfolio-plan.md`, so it cannot answer "how far from MVP". (4) `CLAUDE.md` says the ADRs are 0001 to 0016; they run to 0018, with 0019 (cookie-session) planned but not written. (5) The backlog appendix ("gaps outside the register", item 1) still says the plan reports Phases 1 and 2 as "Not started"; `S1-09` fixed that.

**85. No test fails if issuer validation is switched off in `AuthServiceExtensions`**
Type: Test gap (suspected bug) · Source: mutation sample, `docs/evidence/baseline-2026-10-30.md` (2026-10-30) · Hat: Engineering/Build, Security
Status: Open
Setting `ValidateIssuer = false` in `tools/BakeryMarketplace.Auth/AuthServiceExtensions.cs` left every test in `JwtValidationTests` passing, because that class builds its own `TokenValidationParameters` and tests the framework's `JwtSecurityTokenHandler`, not our configuration. Not yet checked: whether `ServiceAuthIntegrationTests` or `MockOidcMiddlewareIntegrationTests` kill the same mutation. If none does, add a wrong-issuer test through the real service pipeline (a token from another issuer gets 401) and rename or re-scope `JwtValidationTests` to say what it covers. Auth logic: the fix needs the lead's approval. Deferred to a regular work item.

**86. Live documents cite `/tools/event-schemas` and `/tools/logging-helper`, which never held code**
Type: Documentation drift · Source: Step 1 removals (2026-10-30) · Hat: Architect
Status: Open
The two placeholder folders were removed. ADR-0003 (twice), `docs/process/branching-strategy.md`, `WI-TOOL-001` and `WI-TOOL-002` still name them; the code is in `tools/BakeryMarketplace.EventSchemas` and `tools/BakeryMarketplace.Logging`. ADR-0003 needs a dated amendment note (decision text is not edited); the others get a plain path fix. ADR-0003's amendment note was added 2026-10-30 (Step 4); the path fixes in `branching-strategy.md`, `WI-TOOL-001` and `WI-TOOL-002` remain (Step 8; `WI-TOOL-002` was rewritten and no longer names the folder).

**87. Item lines in `epic-catalog.md` carry hand-written status words that can lag**
Type: Documentation drift · Source: Step 3 split of the master backlog outline (2026-10-30) · Hat: Manager/Lead
Status: Open
The epic headers now point to the generated `STATUS.md`, but the item lines under them (for example "Built 2026-10-28", "Detailed, Ready") are the outline's original free text, and they disagree with the spec banners in places (`CUST-004` was corrected; others were not checked). `STATUS.md` is authoritative for every item that has a spec. Options: strip the status words from item lines that have a spec, or generate them. Not done; the catalog's banner says the words can lag.

**88. The Redis Streams transport drops entries it cannot deserialize**
Type: Defect · Source: reconciliation finding B2 (2026-09-28); confirmed in the code on 2026-10-30 during the ADR review · Hat: Platform Engineering
Status: Open
In `RedisStreamsEventTransport`, an entry whose envelope fails to deserialize is acknowledged and skipped without being written to the dead-letter stream. ADR-0003 says the dead-letter path is reachable, but only handler failures reach it. A malformed or incompatible event (for example after a schema change) vanishes silently, which matters for the outbox story (item 74) and for any consumer (`QUE-001`). Reconciled means: write the raw entry and the reason to the dead-letter stream before acknowledging, and add a contract test that a malformed entry is dead-lettered. First noted in `docs/product/backlog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-25.md`; ADR-0003 carries an amendment note about it.

**89. Review caching, fallback, resiliency and graceful degradation wherever they are applied**
Type: Process · Source: the lead (2026-10-30), after seeing several updates to these techniques during the documentation reconciliation · Hat: Architect, Platform Engineering
Status: Deferred · trigger: the documentation reconciliation pass (`WI-PORT-006` pass 2) is complete
Several recent changes touched how the system behaves when a dependency is missing or slow, and the guidance may have drifted from the implementations. To review together, once the reconciliation is done: the server cache and its fallback (ADR-0002, ADR-0014, `tools/BakeryMarketplace.Caching`: `ResilientCacheProvider`, the local provider, the chaos provider); the Relay store and HTTP caching layers (ADR-0014); fallback to in-memory fakes in tests and services (items 31, 35, 73: the silent fallback hazard); the event transport and outbox (items 29, 72, 74, 75, 88; ADR-0003); timeouts and failure mapping in the BFF and the ordering-to-catalog calls (`CHECKOUT_TIMEOUT_MS`, the 5 s call timeout, `downstream_unavailable`); the cold-start behavior seen in the baseline; and the telemetry export that fails silently (item 82). Start from "Two meanings of fallback" in `docs/architecture/patterns.md`, which separates the environment target from the fallback chain. Reconciled means: one guidance page (the patterns page, `docs/architecture/patterns.md`) that says which technique applies where and what degradation the user sees; a table of where each technique is applied in code and whether it is tested against the real dependency or only a fake; and register items or work items for each gap found.

**90. The documentation status check is not enforced anywhere**
Type: Decision · Source: the lead (2026-10-30) · Hat: Platform Engineering, Manager/Lead
Status: Tracking · confirm on the first Azure run of the `docs` job
`node scripts/docs/status.mjs --check` fails when a spec has no banner, a header disagrees with its banner, an epic count disagrees with its specs, or `STATUS.md` is stale. As of 2026-10-30 nothing requires it: it is a line in the Definition of Done checklist and in `CLAUDE.md` (both rely on someone remembering), and it is not in `azure-pipelines.yml` or any hook. The link check (`scripts/docs/linkcheck.mjs`) is in the same position, with 202 unresolved backtick paths in a baseline that includes review records and history. Options, not exclusive: (a) a fast step in the Azure pipeline that runs the status check (the pipeline is a soft gate, so the reviewer must read it, ADR-0015); (b) a git pre-commit or pre-push hook, which only protects those who install it; (c) a Claude Code hook in `.claude/settings.json` that runs the check after edits under `docs/product/backlog/` or `docs/architecture/adr/`, which protects agent sessions; (d) a link-check mode that fails only on links and paths newly broken relative to a stored baseline. Recommendation to discuss: (a) and (c) for the status check, (d) for the link check once the clean-up has shrunk the baseline. Also add them to `docs/process/quality-gates.md` (edit-plan step 8) so the gates are listed in one place. Changing `.claude/settings.json` or the pipeline is a shared-file edit and needs the lead.
Progress 2026-10-30: option (a) done: a `docs` job in `azure-pipelines.yml` runs the status check and the link check (`--fail-on-broken-links`; broken backtick paths are counted only), and both are in `scripts/ci/node-gates.mjs`. Checked on Windows, and on Linux in a container from the committed tree. The pipeline is a soft gate (ADR-0015), so a reviewer must still read it; making it a required check is the lead's decision. Options (b) and (c), a git hook and a Claude Code hook, were not added.

**91. `apps/web-customer/README.md` still says the app is a proof with no auth, cart or checkout**
Type: Documentation drift · Source: container diagram work (2026-10-30) · Hat: Engineering/Build
Status: Resolved 2026-10-30
The README's status line reads "WI-PORT-001 proof only ... no auth, cart, checkout or real BFF yet", although the same file has sections on login, the cart, checkout and the order page, and the app implements slice 1. `CLAUDE.md` points readers to this README for the frontend commands. Reconciled means: replace the status line with what the app does and does not do (client-rendered authenticated pages, the in-memory token, no cookie session), keep the command and test sections, and link the request path. Candidate for the front-door pass (edit-plan step 9).
Resolution: The web app README now states what the app does and does not do and links the request path; the other component READMEs (ordering, catalog, BFF, tools, infra, admin, notification) were brought up to date in the same pass.

**92. The payment stub answers instantly, so nothing tests a slow payment**
Type: Gap · Source: the lead (2026-10-30) · Hat: Engineering/Build
Status: Open
`StubPaymentProcessor` returns an approval (or a decline when the test hook asks) in the same instant, so every checkout measured so far (55 to 78 ms warm) leaves out the one dependency the checkout latency target was set for (`docs/operations/sla.md`). Add a variable delay to the stub so these can be exercised without a real provider: the 5 s call timeout and the BFF's 15 s checkout timeout, a slow payment while the customer presses the button twice (idempotency), the web page's in-flight state, the stock reservation held while payment is slow, and a payment that times out after the reservation (release path). Shape to decide: a configured default (fixed, or random between bounds, or a percentile mix such as 95% fast and 5% several seconds), and a per-request override through the existing test-hook path (`X-Test-Payment: delay=<ms>`) so a journey can ask for a slow payment. It must follow the same rule as the decline hook: inert in Production, gated by `ENABLE_TEST_HOOKS` at the BFF, never set outside tests, and logged. Also needs a test that proves the hook is ignored in Production. When `PAY-001` replaces the stub, keep the delay as a test double so these tests survive. Not auth logic, but it changes the checkout path, so confirm scope with the lead before building.

**93. The public-readiness pass is separate and not yet done**
Type: Process · Source: the lead (2026-10-30) · Hat: Manager/Lead, Security
Status: Deferred · trigger: just before the repository is made public (soon); do it as one planned pass
The repository is private now and is meant to become a public demonstration and reference project (experimentation, AI collaboration, keeping skills and technology current). The pass covers: (1) a licence (the lead chooses) and the other files a public repository needs (a security contact, a contribution note, a code of conduct if wanted); (2) a secret scan of the files and the full history; (3) a review of the files and the history for material that is not meant for readers: internal working notes and review records, personal data, and anything else that does not belong in a public tree; (4) the history itself: if the review of the history finds something to remove, the options are to rewrite it with `git filter-repo` and force-push (this invalidates clones, branches and pull request refs) or to publish from a fresh repository with a clean history; the lead decides; (5) README claims checked against evidence; (6) the documentation site, if published (item 13). Progress: (1) the MIT licence is in `LICENSE` (2026-10-30; `SECURITY.md` written 2026-10-30; a code of conduct is optional and not written. On the day the repository goes public: enable private vulnerability reporting, secret scanning and push protection in Settings → Code security, and check that the "Report a vulnerability" button appears); (2) done 2026-10-30, no real secret found: `docs/evidence/secret-scan-2026-10-30.md`; the scanner config is `.gitleaks.toml`, the command is `scripts/ci/secret-scan.mjs` (listed in `CLAUDE.md` to run before every push), `CONTRIBUTING.md` is skipped by decision (2026-10-30), and a `secrets` job in `azure-pipelines.yml` runs it on pull requests (written, not yet run on Azure). See risk R-18. **Decided 2026-10-30 (the lead): the findings in older commits are accepted and the history is not rewritten** (three old commits on `main` carry a few lines of working notes and one phrase about readers; the tip is clean). Option B (rewrite in place), C (fresh repository with a rewritten history) and D (one squashed commit) were considered; reopen this only if the review of the history finds something more serious. Step 4 on 2026-10-30: tracked files scanned for personal data, local paths, Azure identifiers and audience-targeting wording; two local Windows paths were generalized; the README was read against the evidence; the ADR-0011 phrase ("a typical hiring audience") is accepted as written (decision text is not edited; decided 2026-10-30), and the docs site is not published for the public flip (item 13). Step 5 done 2026-10-30: a fresh clone ran the README one-command path green (`docs/evidence/fresh-clone-2026-10-30.md`). What remains is the flip-day settings above, **plus the Azure DevOps settings added 2026-10-31 (ADR-0020), each to be confirmed in the Azure interface and not visible from the repository**: (a) builds of pull requests from forks get no secrets and no service connections (the setting for secrets on fork builds is off), and a team member's comment is required before a fork's pull request builds, if that option is offered; (b) the read-only plan connection and the deploy connection are not open to all pipelines, only to the pipeline that needs each; (c) a pull request can edit `azure-pipelines.yml`, so no connection usable from a pull-request run can change anything (the plan connection is Reader only), and every gated environment has its approvals, a branch-control check for `main` only, and an exclusive lock; (d) every environment name the pipelines reference exists with its checks before it is used (an unknown name is created with no checks on first use); (e) the Azure DevOps project's visibility and who can read run logs and the published plan artifacts, which show resource names; (f) the deployed dev environment is not reachable by the public while it uses the mock issuer (item 102). Known wording to review: ADR-0011 (superseded, on main since before this review) gives "a smaller demo-recognition signal for a typical hiring audience" as a reason for rejecting Blazor; ADR decision text is not edited, so decide whether to add a dated clarifying note or accept it, in the same pass.

**94. Mark the rules in `CLAUDE.md` as hard invariants or guided defaults**
Type: Process · Source: the lead (2026-10-30) · Hat: Manager/Lead
Status: Deferred · trigger: a later session; editing `CLAUDE.md` needs the lead's approval
`docs/method/rule-authoring.md` classifies eighteen rules and proposes prefixing each rule in `CLAUDE.md` with `Hard:` or `Default:` and a `Verify by:`, then doing the same in the process documents; for each hard invariant whose verification is review only or not yet automated, decide whether to add a check or accept the gap. Lesson L-19 in `docs/method/lessons.md` is Open until this is done. Related: register items 85, 90 and 93.

**95. One local command for the Node gates**
Type: Process · Source: the lead (2026-10-30) · Hat: Platform Engineering
Status: Resolved 2026-10-30
On 2026-10-30 a new script, `scripts/ci/secret-scan.mjs`, was committed without running Prettier and the PR's web job failed on `format:check` (that check covers `scripts/` and `azure-pipelines.yml`). `CLAUDE.md` already says to run `format:check` and `lint` before pushing, but the checks are spread over two projects and a person or an assistant has to remember which one covers which path. Add one script (for example `scripts/ci/node-gates.mjs`) that runs `format:check`, `lint` and `typecheck` in `apps/web-customer` and `services/graphql-bff`, plus `scripts/docs/status.mjs --check`, and exits non-zero on any failure; mention it in `CLAUDE.md` and `docs/process/quality-gates.md`; decide whether it also becomes an optional git pre-push hook. Related: items 90 and 94 (where to enforce checks; marking rules as hard or default), and `docs/method/lessons.md` L-19.
Resolution: `scripts/ci/node-gates.mjs` runs format, lint and typecheck in both projects and the documentation status check (`--tests` adds the unit tests), runs every step and exits 1 on any failure; checked by passing on the repository and failing, with the Prettier warning shown, on a planted unformatted file in `scripts/`. It is listed in `CLAUDE.md` and `docs/process/quality-gates.md`. No git pre-push hook was added: the command is the single place the checks live, and a hook can call it if the lead wants enforcement (item 90).

**96. No way for an operator to see how many events are waiting in the outbox**
Type: Known limitation · Source: `WI-OPS-002` (2026-10-30) · Hat: Operations, Engineering/Build
Status: Open
With Redis stopped, ordering-service accepted orders and held their events for the relay (`docs/evidence/runbook-event-broker-2026-10-30.md`). The only signals are `warn` log lines and comparing Redis stream lengths with the orders placed. `GET /health` answers `Healthy` and there is no `/metrics` endpoint or custom metric in `services/ordering-service/src`. A count and age of pending outbox entries (a gauge, and a log line or health detail when it passes a threshold) would let the runbook and `docs/operations/monitoring-alerting.md` name a real signal. Not built, not designed. Related: items 72, 74 and 75.

**97. The customer web app is unstyled**
Type: Known limitation · Source: `WI-DEMO-001` (2026-10-30) · Hat: Engineering/Build, Digital Product Manager
Status: Resolved 2026-10-30
The screenshots taken for the demo (`docs/operations/demo/`) show browser-default markup: no layout, spacing, colour or brand. Slice 1 was built to prove the stack and the journey, and no styling work has been done. For a demonstration that is looked at, a minimal layout and typography pass would change how the repository reads; it is a product decision whether and when (not designed, not scheduled). Not an accessibility assessment: none has been run.
Resolution: one stylesheet, `apps/web-customer/src/styles/globals.css`, imported in `_app.tsx`, on the existing markup: layout, typography, listing cards, stock badges, forms, the checkout table, messages, the order page, and a dark theme by system setting. No framework and no new dependency; the test selectors are unchanged and the mock-backed browser suite passes (57 of 57); the demo screenshots were retaken. Also fixed: `.sr-only` was used but never defined, so a hidden "Remove" column heading showed. Not done: a designed brand, responsive checks beyond one narrow-width rule, any accessibility assessment (`WI-QA-001` row `G-E08`), and screenshots of the dark theme in the docs (one was looked at, not saved).

**98. The first checkout on a cold stack takes about 7 seconds and the demo warm-up does not remove it**
Type: Known limitation · Source: `WI-DEMO-001` (2026-10-30) · Hat: Engineering/Build
Status: Open
After `scripts/dev/demo.mjs` warms the issuer metadata, the home page and the pickup times, the first checkout still took 7.0 s (the first order in the outage run was 9.0 s cold, and warm checkouts take tens of milliseconds, `docs/evidence/baseline-2026-10-30.md`). The cost is on the first priced checkout: ordering's service token and first call to the catalog, and first-use costs in each hop. A warm-up that exercises that path without leaving an order behind would need a safe read-only route or a throwaway order and stock reset; neither exists. The demo document tells the presenter to expect it. Related: `docs/evidence/runbook-event-broker-2026-10-30.md`.

**99. A work item's status is written in prose in several documents, and only one form is checked**
Type: Process · Source: `WI-QA-002`, theory test `G-H06` (`docs/evidence/status-check-experiment-2026-10-30.md`) · Hat: Platform Engineering
Status: Open
`status.mjs --check` verifies the banner against the header, the epic counts and `STATUS.md`, and (since 2026-10-30) the 21 mentions in `epic-catalog.md` of the form `` `WI-X.md` (Status, date) ``. It does not verify the other 56 lines of the catalog that name a spec, or the statements of status in `demo-milestones.md` (confirmed in the experiment) and, not examined one by one, `scope.md`, `current-plan.md` and `roadmap.md`, so a changed status leaves stale prose that nobody is told about. Options, not exclusive: (a) a convention that prose never states a status and links the spec instead (the status lives only in the banner and the generated table); (b) generate the catalog's status words from the banners; (c) extend the check with a list of the known phrasings. Related: item 90.

**100. No latency budget, though measured numbers now exist**
Type: Decision · Source: `WI-QA-002` (2026-10-30) · Hat: Architect, Manager/Lead
Status: Open
ADR-0013 asks for a latency budget for the BFF "once measured", and `nfrs.md` says none exists. `docs/evidence/latency-2026-10-30.md` now gives a measured starting point on one machine (warm, sequential): BFF reads p95 33 to 42 ms, home page p95 42 ms, checkout p95 75 ms, first checkout after a stack start 4.6 s. A budget would state p95 targets per request kind and whether the cold first request counts, and would let the claim "the BFF and cache design meet the targets" (gap row `G-H08`) be tested; it would also need a deployed environment to mean anything beyond this machine. The numbers are not a proposal for the targets themselves. Related: items 98 and 87.

**101. The web image bakes in the back-end address and the login addresses, so each environment needs its own image**
Type: Tech debt · Source: `WI-DEP-001` (2026-10-31) · Hat: Platform Engineering, Frontend
Status: Resolved 2026-10-31
Next.js evaluates `rewrites()` at build time, so `GRAPHQL_URL` (the BFF address behind `/api/graphql`) is part of the built image, and the `NEXT_PUBLIC_AUTH_*` values the login code reads are inlined into the browser bundle. `apps/web-customer/Dockerfile` therefore takes `GRAPHQL_URL` as a build argument and the Compose image uses the Compose network name; a cloud environment would need a build per environment, and an image promoted from dev to another environment would still point at dev. Options: replace the rewrite with a route handler or proxy that reads the address at run time, and serve the login addresses from a run-time config endpoint; or accept one build per environment and say so in the promotion checklist. Decided 2026-10-31 (ADR-0020, Proposed): one image for every environment, so the web app moves to a run-time proxy route and a run-time configuration endpoint, with the BFF latency measured before and after. Tested the same day: an image built with one `GRAPHQL_URL` and run with another still sent `/api/graphql` to the built-in address (the destination is stored in `.next/routes-manifest.json`). Spike run 2026-10-31 (`docs/evidence/WI-DEP-001/web-runtime-config-spike-2026-10-31.md`): both a `proxy.ts` rewrite and an API route read the address at run time and pass the 21 skeleton tests; the rewrite adds about 1 ms over a direct BFF call and either run-time variant about 2 to 5 ms more on reads. **Half built 2026-10-31:** the lead chose the API route and it replaced the rewrite (one image for every environment; 62 unit, 62 mock-backed browser and 21 real-stack tests pass; about 1 to 1.5 ms more at p50 on reads). **Resolved the same day:** the login settings (`AUTH_ISSUER`, `AUTH_CLIENT_ID`) are read by the server on each request and served to the browser by `GET /api/config`, which the login code fetches before it starts or finishes a login; in production both are required, with no default (503 "Login is not configured" otherwise). The built browser bundle no longer contains the issuer address, and the same image answered `/api/config` with each address it was started with. 71 unit, 62 mock-backed browser and 21 real-stack tests pass (containers and host processes). The authorize and token addresses are still `<issuer>/authorize` and `<issuer>/token`, the mock issuer's layout; Entra's endpoints have other paths, so moving to Entra will need explicit endpoint settings (a small addition then).

**102. The mock issuer cannot be deployed as it stands, and a public one would let anyone mint any role**
Type: Open decision · Source: `WI-DEP-001`, `ADR-0018` acceptance (2026-10-31) · Hat: Security, Manager/Lead
Status: Resolved 2026-10-31 (decided by the lead; built and tested locally, not deployed)
The lead chose the mock issuer for the first deployed dev environment. The host refuses to start in the Production environment on purpose, signs tokens for anyone who asks, and its login page lets the visitor choose a user (including an Admin). Run on a public address it would mean any visitor can act as any role, including the vendor and admin actions, against a real (if disposable) data store. Outside the Compose network it also needs https for the services' metadata and token requests (`requireHttpsMetadata`, the https rule on the token endpoint), which the Container Apps ingress gives, and a fixed issuer (`MockOidc__Issuer`, built). Options, not exclusive: an ingress IP allow-list so only the lead can reach the environment; an explicit, named switch (not `Development`) that lets the host run in a deployed dev environment and is refused in any other; moving to Entra sooner. The guard has not been changed. Needs the lead's decision before any apply. **Decided 2026-10-31 by the lead: Path M, the mock issuer deployed in the dev environment, with a named switch and a public, Customer-only default.** Built: `MockOidcDeployment` (the host refuses Production unless `MockOidc__AllowDeployedDev=true`, the issuer is https, and any role other than Customer is listed only with `MockOidc__IngressRestricted=true`); the issuer offers and accepts only users whose role is in `MockOidc__AllowedRoles` (default Customer), on the login page and at submit, so an Admin or Vendor id posted by hand is refused (16 new Auth tests, 163 in all); the dev stack deploys the mock as a container app and derives the issuer, token endpoint and web login address from its name, with `issuer_mode` mock or entra, `issuer_roles` and `allowed_ips` (a plan-time precondition refuses a privileged role with no allow-list). Not verified: the host in a container behind the Container Apps ingress; that services in the environment can still reach the issuer's public address when `allowed_ips` is set (the ingress restriction may block them; the environment's outbound addresses are not static); the public issuer address in tokens; that the ordering secret generated after apply reaches both the mock and ordering. Residual risk: anyone can sign in as a customer and place orders in the disposable store; cost is bounded (see the evidence record), and there is no rate limiting (item 27).

**103. Parallel image builds in Compose failed once on Docker Desktop**
Type: Verification gap · Source: `WI-DEP-001` (2026-10-31) · Hat: Platform Engineering
Status: Open
The first `docker compose --profile apps up --build` failed while exporting `bakery-ordering:dev` with `failed to prepare extraction snapshot ... parent snapshot ... does not exist` (the catalog and ordering images share every layer and were exported concurrently). Later runs with `COMPOSE_PARALLEL_LIMIT=1` passed. The cause was not investigated; it looks like a containerd image-store race on this machine. The pipeline's Ubuntu agent has not run the `apps` profile. If it reappears, build the images one at a time before `up`.

**104. The skeleton journeys cannot be re-run on a stack where they already ran**
Type: Test isolation · Source: `WI-DEP-001` spike (2026-10-31) · Hat: Engineering/Build
Status: Open
`asking for more than is in stock says how many are left, and taking that many works` reads the seeded stock of the croissant (4) and takes all of it, so a second run against the same running stack finds it sold out and fails (`Expected "Low stock", received "Sold out"`). A fresh stack passes (21 of 21, repeatedly). `scripts/dev/measure-latency.mjs` also changes stock. Nothing in the pipeline re-runs on a used stack, so this has not mattered, but it makes manual re-runs and a post-deploy smoke against a persistent environment unreliable. Options: have the test add its own stock as the vendor first (as the latency script does), or give the post-deploy smoke a stock reset step. Decide before the post-deploy smoke is written (`WI-DEP-001`).

**105. Server rendering falls back to `localhost:4000` when `GRAPHQL_URL` is not set**
Type: Rough edge · Source: `WI-DEP-001` (2026-10-31) · Hat: Frontend
Status: Open
`apps/web-customer/src/lib/relay/environment.ts` reads `process.env.GRAPHQL_URL ?? 'http://localhost:4000/graphql'` for server-side rendering. The `/api/graphql` route, now that the address is a run-time setting, answers 502 when it is unset. In a deployed environment where the setting were missing, pages would try `localhost:4000` and fail with a connection error while the API route said "not configured". Making rendering fail the same way (no default) would change how `npm run dev` behaves without the setting, so it was not changed here. Decide with the next change to the web app's configuration (item 101 is resolved; the login settings now have no default in production, this one still has).

**106. Who may write role assignments in the deployed environment is not decided**
Type: Open decision (IAM, needs the lead's approval) · Source: `WI-DEP-001`, `ADR-0018` acceptance, `ADR-0020` (2026-10-31) · Hat: Security, Manager/Lead
Status: Resolved 2026-10-31 (decided by the lead; the first apply will test it)
The environment stack must grant roles (AcrPull on the registry to each container app's identity, Key Vault roles). Writing a role assignment needs more than Contributor (Owner, User Access Administrator or Role Based Access Control Administrator on the scope). ADR-0018 asked that the privileged Graph app-role assignment stay out of the pipeline's reach; Azure role assignments raise the same question. Options: give the deploy identity Role Based Access Control Administrator, limited by a condition to the roles it needs, on the foundation and dev resource groups only; or have the lead run the role assignments (a separate small stack, applied by hand) and keep the pipeline at Contributor. Related proposal in `bootstrap-terraform-state.md` and the ADR-0020 amendment: the bootstrap creates the empty dev resource group so the pipeline never needs rights over the subscription. **Decided 2026-10-31 by the lead: the proposal is approved.** The bootstrap creates the empty dev resource group and the environment stack works inside it (teardown empties it and leaves it); the deploy identity is limited to the foundation and dev resource groups and never has subscription-wide rights; the pipeline holds no Graph permission (ADR-0018). For the role assignments themselves the design in `bootstrap-terraform-state.md` stands: Role Based Access Control Administrator on those two groups only, limited by a condition to the roles the stacks need (AcrPull, Key Vault Secrets User). If the first apply shows the condition cannot be expressed or Azure refuses it, the fallback is the other option (the lead applies the role assignments by hand from a separate small stack); that change goes back to the lead. Not yet run.

**107. The destroy guard has only been tested on hand-written plans**
Type: Verification gap · Source: `WI-DEP-001` (2026-10-31) · Hat: Platform Engineering
Status: Open
`scripts/ci/destroy-guard.mjs` reads `terraform show -json` output. Its fixtures were written by hand from the documented format, so the attributes it relies on (`resource_group_name`, `scope`, `resource_group_id`, `id`, `tags` in `before`) are not confirmed against a real destroy plan of this stack. It fails closed (an unknown group is a refusal), so the risk is a false refusal, not a false pass, but it must be run on the first real destroy plan and the output compared. Also unproven: that every resource in the future environment stack carries a resource-group attribute the guard recognises.


**108. The deploy identity needs Key Vault Secrets Officer, which is outside the approved role condition**
Type: Open decision (IAM, needs the lead's approval) · Source: `WI-DEP-001`, register item 106 (2026-10-31) · Hat: Security, Manager/Lead
Status: Resolved 2026-10-31 (decided by the lead; the first apply will test it)
Item 106 limited the deploy identity's role-assignment rights to AcrPull and Key Vault Secrets User. The environment stack (`infra/environments/dev`) also grants the deploy identity Key Vault Secrets Officer on the environment's vault, because with an RBAC vault even a Contributor cannot create secrets, and the post-apply step has to set the Cosmos and ordering secrets. Decide: add Secrets Officer to the condition (scope is the dev vault only, destroyed with it), or have the lead set the two secrets by hand after each apply. Until decided the stack must not be applied. Also unverified: that `purge_soft_delete_on_destroy` removes the vault on destroy so a rebuilt environment can reuse its name. **Decided 2026-10-31 by the lead: option 1.** The built-in Key Vault Secrets Officer role is added to the condition on the deploy identity's Role Based Access Control Administrator grant (now AcrPull, Key Vault Secrets User and Key Vault Secrets Officer), scoped to the dev resource group. The post-apply step sets the Cosmos and ordering secrets itself and follows the rules in the step design (stdin, masked, approved stage on main only, no placeholder left, revisions restarted). The tighter custom role (setSecret only) stays an option. If Azure cannot express the condition, the fallback is unchanged: the lead sets the two secrets by hand.

**109. Cosmos access uses a key through Key Vault; managed identity is a later hardening item**
Type: Deferred hardening · Source: `WI-DEP-001`, ADR-0007, ADR-0020 (2026-10-31) · Hat: Security, Architect
Status: Deferred · approved by the lead on 2026-10-31 to do later; trigger: after the first successful deploy
The services read only `Cosmos:ConnectionString`. The dev stack therefore holds the account key as a Key Vault secret set after apply (never in state). The hardening is to let the services authenticate to Cosmos with their managed identity and a data-plane role (ADR-0007), which removes the secret, the post-apply step and its Secrets Officer grant (item 108). It changes service data-access code and the Terraform role assignment, so it needs the lead's approval of the change when it is started. The local emulator cannot use Entra, so the local path keeps a key.

**110. Two runs can plan and then apply in turn, so an approval may not be for the plan that is applied**
Type: Design gap · Source: `WI-DEP-001`, ADR-0020 decision 6, gate G6 (2026-10-31) · Hat: Platform Engineering, Architect
Status: Decided 2026-10-31 (design); build waits for the first real plan and apply
ADR-0020 says the approval is for the exact plan applied. Azure's exclusive lock on an environment is checked after approvals, so two runs can plan against the same state, both wait for approval at the same time, and then apply one after the other; the second applies a plan made against a state that no longer exists. For the infrastructure apply, Terraform should refuse a stale saved plan, but that is documented behaviour, not seen in this pipeline. For the application deploy there is no saved plan, so two runs could deploy different image digests in either order. Not proved by the rehearsal (its steps change nothing; G6 now tests only the lock). Options, in order of preference: re-plan after approval and abort if the result differs from the approved plan (recommended for the infrastructure apply); accept Terraform's stale-plan refusal as the backstop and prove it with two overlapping real runs; run the plan stage under the same lock; allow one open run (the lock's default `runLatest` cancels older waiting runs). For the deploy: record the digest deployed and refuse an older build than the one running. Decision and build wait for the first real plan and apply. **Decided 2026-10-31 by the lead: for the infrastructure apply, re-plan after approval and abort if the result differs from the approved plan;** Terraform's stale-plan refusal stays as the second layer and is proved with two overlapping real runs. The application deploy records the digest it deployed and refuses an older build than the one running (to be designed with the deploy stage).

**111. Twelve whitespace-format errors in the Auth tests on `main`**
Type: Quality gate · Source: found 2026-11-01 while running `dotnet format whitespace tools/BakeryMarketplace.slnx --verify-no-changes` · Hat: Engineering/Build
Status: Open
The check reports 12 whitespace errors in `tools/tests/BakeryMarketplace.Auth.Tests/ServiceAuthIntegrationTests.cs` (line 129 and nearby), present on `main` before this branch's changes (checked by stashing them). The root solution check (`BakeryMarketplace.slnx`) was clean. Fix with `dotnet format whitespace tools/BakeryMarketplace.slnx`, then confirm no other file changes; check whether the pipeline runs the `tools/` solution check.

**112. A Redis subscriber whose handler fails never gets the message again, and it is never dead-lettered**
Type: Latent defect · Source: found 2026-11-01 reading `RedisStreamsEventTransport` for `N-03` · Hat: Platform Engineering, Engineering/Build
Status: Open
Found by reading the code, not yet shown by a test. The subscription loop reads only new messages (`StreamPosition.NewMessages`) and keeps its attempt counts in memory, keyed by entry id. When a handler throws, the message is not acknowledged, but nothing ever reads the group's pending entries again, so the attempt count never reaches `maxDeliveryAttempts`, the dead-letter stream is never written, and the message stays pending for ever. The loop's own comments and the "dead-letter on max retries" claim in the class summary therefore do not hold for a handler failure. It does not matter while the only subscriber (catalog's vendor status) can lose an event harmlessly, but a read model (`N-03`) would silently miss an update. Fix: on start and periodically, read the group's pending entries (`XPENDING`/`XAUTOCLAIM`) and redeliver them, counting deliveries from the stream's own delivery count rather than memory; add a contract test with a handler that fails once. Needs the shared library changed, so it waits for approval with the `N-03` plan.
