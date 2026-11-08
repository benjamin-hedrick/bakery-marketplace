# Non-Functional Requirements

> **Status:** Current · updated 2026-11-08 (facts about what has been run corrected; sections 3.8, 3.9, 5.1 and 5.2 are proposed additions for the lead's review, register item 130). Requirements are targets and decisions; section 8 says what has been measured. Nothing here is deployed. Local load, soak, generated-input and dynamic-scan runs exist (section 8); none is a production-scale test, and no target here has been proved at that scale.

Per `WI-NFR-001`: every requirement below traces to a specific ADR or vision principle — no NFR here should read as invented without that trace. The target numbers (load, availability) were set by the lead as planning assumptions, not derived from measured traffic.

Status legend matches the rest of the project: **[MVP]** binding for v1 · **[MVP-lite]** binding but deliberately minimal · **[Deferred]** named, not built · **[Post-launch]** after go-live.

## 1. Scalability

- **[MVP] Target load**: 50 peak concurrent users, 200 orders/day. Planning assumption, not a load-tested measurement — sized to fit comfortably under this document's other free-tier ceilings with real headroom (see below), not derived from actual measured traffic.
- **[MVP] Compute scaling**: Container Apps consumption plan auto-scales with load (`tech-stack.md`) — no fixed ceiling assumed at this layer.
- **[MVP] Data store ceiling**: Cosmos DB's free tier provides 1,000 RU/s shared across all containers (ADR-0004). At the target load above, sustained throughput is well under this ceiling (tens of RU/s, not hundreds) — not the binding constraint at this scale. **Assumption ceiling**: if sustained throughput approaches 1,000 RU/s, ADR-0004's partition-key choices (v1 guesses, not load-tested) and the shared-account tradeoff need active revisiting.
- **[MVP] Cache scaling**: `LocalCacheProvider`'s per-replica, non-shared nature (ADR-0002) means cache hit rates degrade as replica count grows, by design. Accepted for MVP scale; revisit if horizontal scaling grows significantly.
- **[MVP] Event backbone ceiling**: Azure Event Grid's free grant covers 100,000 operations/month (ADR-0003). A completed order raises 5 events from the Order (`OrderPlaced`, `OrderConfirmed`, `OrderPreparationStarted`, `OrderReadyForFulfillment`, `OrderCompleted`; `docs/architecture/order-lifecycle.md`), and `PickupFulfillment` will add 2 more (`PickupWindowScheduled`, `OrderReadyForPickup`), so plan on about 7. At 200 orders/day that is about 1,400 events/day (~42,000/month), **42% of the free grant**, leaving headroom to roughly 475 orders/day. Event Grid also counts deliveries to each subscription as operations, which this arithmetic does not model, so treat it as a lower bound.
- **[MVP] Gateway ceiling**: Azure API Management Consumption tier's free grant covers 1,000,000 calls/month (ADR-0008). At an estimated ~20,000 API calls/day (browsing, cart, checkout — not just completed orders), that's ~600,000/month — **60% of the free grant**. Since ADR-0013 the browser talks to the BFF, so the calls that reach API Management are the BFF's downstream calls, not the browser's; the estimate is unchanged as an order of magnitude and is unmeasured.
- **Measured locally, not at scale (section 8):** a 66-minute run placed one order every 5 seconds (an order rate far above the 200 a day planning figure) with five live screens and readers at about 16 requests a second, on one developer machine, and lost no order and no screen update outside a planned restart; memory did not grow. It does not test several replicas, a real database tier or many vendors, so the free-tier ceilings above remain arithmetic, not measurement.

## 2. Availability

- **[MVP] Target availability: 99.0% monthly** (≈7.3 hours/month allowed downtime). Explicitly a **self-imposed design target, not an Azure-backed guarantee** — Azure API Management's financially-backed SLA covers only Basic/Standard/Premium tiers, not the Consumption tier used here (ADR-0008); Event Grid and Container Apps' consumption-based pricing similarly doesn't carry the same SLA weight as dedicated-capacity tiers. A single-region, serverless-tier stack with no redundancy investment can't credibly promise more than this without additional spend, so 99.0% is stated as an honest, modest target rather than an inflated one. This is the number `OPS-001` (SLA/SLO) should build its error budget from.

## 3. Security

### 3.1 Zero trust — binding, not aspirational
**[MVP]** Every service authoritatively validates its own authentication and authorization, regardless of what sits in front of it. Source: `docs/product/vision.md` principle 5, ADR-0006, ADR-0008. This is the posture that made ADR-0008's API Gateway decision safe despite Azure API Management's Consumption tier having no VNet/Private Link enforcement (ADR-0008) — a bypassed gateway loses edge optimizations, not security, specifically because of this NFR.

### 3.2 Authentication / Authorization
**[MVP]** Microsoft Entra External ID (the text of ADR-0006 says Azure AD B2C, which stopped accepting new tenants; see its amendment), JWT bearer tokens, role claim + resource-ownership checks per service. Service callers authenticate with OAuth2 client credentials and an app role (ADR-0018, Proposed). Source: ADR-0006. Locally a mock issuer stands in; Entra is not configured.

### 3.3 CSRF
**[MVP]** Applies, and is mitigated. The browser apps keep the login in a server-side session behind an HttpOnly cookie (ADR-0019, `WI-AUTH-007`): `__Host-` name, `Secure` except on loopback, `SameSite=Lax`. Every request that can change state, and the subscription stream, must carry an `Origin` equal to the app's own and a JSON content type, or it is a 403 and changes nothing (`packages/web-session/src/csrf.ts`; tests in the package and in both apps' browser suites). The services themselves still take the bearer token in the `Authorization` header only and never read a cookie: the web app's server turns the session into that header. History: this section used to read "not applicable", conditional on no cookie token storage (ADR-0006) and saying it was invalidated if a cookie session was introduced; the session was built and the section was not updated until 2026-11-02 (register item 130).

### 3.4 Injection protection
**[MVP]** All Cosmos DB access uses parameterized queries via the SDK's query builder — no raw query string construction anywhere in the codebase. Source: this is a new baseline stated here for the first time, feeding into `docs/process/engineering-standards.md`'s secure-coding section (also updated to reference it).

### 3.5 Secrets
**[MVP]** Azure Key Vault, per-environment, accessed via managed identity — no stored credential to reach it. Source: ADR-0007. Where possible, the secret is eliminated entirely rather than well-managed (e.g., Cosmos DB access via managed identity, no connection string at all).

### 3.6 Telemetry and test hooks
**[MVP]** No token, bearer credential, idempotency key, secret or e-mail address may appear in an exported span or a log line; the collector configurations delete `url.query` and `http.url`. Verified once on the slice-1 capture, with a regression test on the catalog's span (`docs/evidence/slice-1/findings.md`; register 38). Test-only behaviors (`ENABLE_TEST_HOOKS`) are inert in Production by configuration, not by convention. Source: ADR-0016, `docs/process/engineering-standards.md`.

### 3.7 Sensitive data (dietary/allergy information)
**[MVP]** Treated as quasi-health data: surfaced only at relevant touchpoints (browse, customization, cart — not buried, not over-exposed), access scoped to the owning customer and vendors fulfilling that customer's order, not broadly queryable. Source: vision principle 1, glossary's Preference Profile/Snapshot entries. **[Deferred]** A dedicated data-privacy/retention doc (`PRIV-001`) is planned for deeper treatment (retention windows, deletion policy) — this section states the baseline expectation now so it doesn't stay unstated in the interim.

### 3.8 Abuse resistance and per-caller limits *(proposed 2026-11-02, register items 128 and 130; the first limits are built, `WI-RATE-001`; the numbers are the lead's to confirm)*
**[MVP, proposed]** What one caller may hold is limited and tested: streams per vendor 5, per login 5, per process and per BFF 500, request body 64 KB, a write timeout and a silence limit (`WI-QUE-003`; built and tested). **Built 2026-11-02 (`WI-RATE-001`, run locally only):** how fast a caller may act is limited in memory, per process: login start and callback 10 a minute per address; `/api/graphql` 120 a minute per login (per address without one); stream opens 10 a minute per login; 600 a minute per address across the web routes, checked before the session store; and a backstop of 600 a minute per source address at the BFF. A refusal is `429` with `Retry-After` and a fixed sentence. The address is the connection's own; `X-Forwarded-For` is read only for as many proxies as `TRUSTED_PROXY_HOPS` says. **Not built:** a shared limiter across replicas, per-user limits at the services, and any test of the limits under load (register item 129). API Management cannot limit per user (ADR-0008). Source: register items 27, 126, 128.

### 3.9 Security verification *(proposed)*
**[MVP, proposed]** Security-sensitive work (auth, sessions, anything holding a connection or parsing outside input) is verified at the level in [`verification-policy.md`](../process/verification-policy.md): abuse cases as acceptance criteria, tests shown to fail without the property, a dependency review, an adversarial pass before building and before review. Run locally under `WI-SEC-005` (2026-11-02 to 11-03): a threat model, generated-input tests, a 66-minute soak, an OWASP ZAP scan of both web apps and the BFF (no high finding) and a review statement (`docs/governance/review-statement.md`); a dependency audit and SBOMs followed on 2026-11-07 (`WI-SEC-004`). Every security review so far was a read by the agent that wrote the code plus the lead's review; there has been no independent review or penetration test. The review statement says what has and has not been reviewed (register items 93 and 129).

## 4. Compliance

- **[MVP] PCI scope**: SAQ A — card data is tokenized client-side via Stripe.js/Elements and never reaches this system's servers. Source: ADR-0005.
- **[MVP] Region/currency**: single-region (US), single-currency (USD) assumption for v1. Source: ADR-0005. **[Deferred]** Multi-region/multi-currency would require real rework, not configuration.
- **[Deferred, decision pending]** Terms of Service / Privacy Policy scope: not yet decided in or out for v1 — tracked as `GOV-002` in the backlog, not silently absent from this document.

## 5. Reliability / Resilience

- **[MVP]** Cache: circuit-breaker fallback to local cache on managed-Redis failure, regardless of configured backend. Source: ADR-0002.
- **[MVP]** Events: at-least-once delivery, no cross-aggregate ordering guarantee — consumers must be idempotent (dedupe on event ID) and use per-aggregate sequence numbers where order matters. Source: ADR-0003.
- **[MVP]** Data: Strong consistency for the `payouts` container specifically (financial reconciliation data); Session consistency (default) elsewhere. Source: ADR-0004. The `payouts` container does not exist yet.
- **[MVP]** Order events are not lost when the broker is down: they are stored with the order and published by an outbox relay (`WI-ORD-005`; [patterns](patterns.md)).
- **[MVP]** A repeated checkout never creates a second order or takes stock twice (idempotency by a derived order id; stock reservation keyed by the order id; ADR-0017).
- **[MVP]** Stock reservation is atomic per vendor and a released reservation is final (ADR-0017).
- **[MVP]** Behaviour when each dependency fails, and how each case was established, is listed in [patterns](patterns.md) section 14; the review of that behaviour is register item 89.

### 5.1 Long-lived connections and real-time delivery *(proposed)*
- **[MVP, proposed]** A vendor's screen reflects an order change within a stated time. Measured, not yet a target: 68 ms p50 and 99 ms p95 on a local stack with one screen and a light load (`docs/evidence/WI-QUE-003/real-stack-2026-11-02.md`). Proposed target for the lead to set: p95 under 1 second, with polling every 7 seconds as the fallback bound.
- **[MVP]** A stream is bounded in count, time and silence (section 3.8); a client that is slow, stops reading or leaves does not hold a stream or a lock (`WI-QUE-003`).
- **[MVP, proposed]** Behaviour under load is stated and tested: the limits are reached and the refusal is clean; many screens reconnecting together after a restart do not overload the services. Tried locally with five screens (the stream limit held and the sixth open ended the oldest; after an ordering restart every screen reopened and caught up, `docs/evidence/WI-SEC-005/load-soak-2026-11-03.md`); a larger reconnection burst has not been tried (register item 129).

### 5.2 Observability *(proposed)*
- **[MVP-lite, proposed]** The stream's metrics exist (counts of streams, refusals, closes). Nothing requires them to be exported or read; the requirement to be set is which metrics a long-lived-connection feature must emit and which alert reads them (`docs/operations/monitoring-alerting.md`).

## 6. Extensibility

- **[MVP, designed for Deferred]** Fulfillment Strategy interface — pickup is the only implemented strategy; delivery/dispatch plugs into the same seam without reworking the Order aggregate. Source: ADR-0001.
- **[Deferred]** Full ad-bidding platform — sponsored placement is a simple flag for v1, not an auction engine. Source: bounded context map.

## 7. Aspirational / Future — explicitly not v1

Named here so they're a tracked decision, not a silent gap:

- Multi-region / multi-currency support (§4)
- Delivery/dispatch fulfillment strategy (§6, ADR-0001)
- Full ad-bidding platform (§6)
- Per-container Cosmos DB resource tokens for finer-grained access control (ADR-0004's named future hardening)
- Redis tier upgrade for AAD-based auth, eliminating the last unavoidable access-key secret (ADR-0002/ADR-0007)
- Live secret rotation without service restart (ADR-0007)
- Centralized authorization policy engine, e.g. OPA, if resource-type/role complexity grows (ADR-0006)

## 8. Measured so far

Nothing below is a target. All numbers are from one developer machine, Windows 11, local stack; none is a load test. Sources: `docs/evidence/slice-1/findings.md` and `docs/evidence/baseline-2026-10-30.md`.

| What | Result |
|---|---|
| First checkout on a cold stack | about 4.7 s, of which about 4 s was two fetches from a cold mock issuer |
| Later checkouts | 55 to 78 ms through the BFF, ordering and catalog |
| First whole browser journey on a cold stack | about 9.7 s; later journeys 1 to 1.5 s (not comparable with the checkout figures above) |
| Mock-backed browser suite, 10 runs of 57 tests | 0 failures; 27.6 to 30.0 s per run |
| Real-stack journeys, 3 runs of 21 | 0 failures; 18.9 to 19.7 s per run |
| Server-rendered isolation | 200 of 200 concurrent requests contained only their own fixture |
| Scripted latency run (`scripts/dev/measure-latency.mjs`, warm stack, 50 rounds of reads and 20 orders, sequential) | BFF listings query p95 33 ms, home page p95 42 ms, pickup windows p95 5 ms, checkout p50 63 ms and p95 75 ms; the first checkout after a stack start 4.6 s (`docs/evidence/latency-2026-10-30.md`) |
| Mock-backed browser suite, 10 runs of 62 tests (`scripts/ci/repeat-suite.mjs`) | 0 failures in 620 executions; failure-rate bound 0.62%; 31.4 to 34.2 s a run (`docs/evidence/quality-report-2026-10-30.md`) |
| Load and soak of the live vendor queue (`scripts/dev/load-test.mjs`, 66 minutes, 2026-11-03): five open streams, one order every 5 seconds, readers at about 16 requests a second, ordering restarted at the midpoint | 762 orders and none missed by any of the 5 screens (3,810 arrivals); order sent to on screen p50 110 ms, p95 146 ms; 63,922 reads answered, p50 20 ms, p95 37 ms; the only failures (154 reads, 4 orders, each a generic error) fell inside the 19-second restart; no memory growth after the first 5 minutes. Part of the run overlapped with the author's own test suites, so the tail (p99, the 1,510 ms maximum) is the less reliable figure (`docs/evidence/WI-SEC-005/load-soak-2026-11-03.md`) |
| Per-client rate limiting under load (3 minutes, with and without a client address, 2026-11-07) | one shared counter: 51 of 54 orders refused outside the outage; per-client counting: 55 placed and none refused (`docs/evidence/WI-SEC-005/client-address-load-2026-11-07.md`) |
| The catalog's listing cache (`WI-CAT-003`, three runs each, 2026-11-07) | BFF listings query p50 about 20 ms to about 3 ms, server-rendered home page about 24 ms to about 8 ms; checkout and pickup windows unchanged. In-process provider, a small seeded catalog (`docs/evidence/WI-CAT-003/after-2026-11-07.md`) |
| Generated-input tests of the BFF and the session package (fixed seed) | found two defects in the BFF, both fixed (a request that ended the process; a caller's mistake reported as an internal error) and measured the missing limit on an operation's cost (one 62 KB request opened 57 downstream calls; register 135, a size limit followed); the session package's tests found nothing (`docs/evidence/WI-SEC-005/fuzz-2026-11-02.md`) |
| OWASP ZAP baseline of both web apps and an API scan of the BFF (2026-11-03, two runs) | no high finding; two medium per web app (`unsafe-inline` for scripts and styles, documented, not fixed); the low findings fixed (`docs/evidence/WI-SEC-005/zap-2026-11-03.md`) |
| Cross-browser (Chromium, Firefox, WebKit, phone profiles), mock-backed, 2026-11-06 | customer app 663 of 665, queue display 296 of 300; the earlier 13 failures were classified as 4 test flaws and 1 reporting difference, no application defect (`docs/evidence/cross-browser/`) |

**No latency budget exists** (register item 100 proposes setting one from these data). ADR-0013 asks for one for the BFF "once measured"; the table above is one local data point, not a budget. The 99.0% availability target (section 2) has no measurement, because nothing is deployed.
