# Non-Functional Requirements

Per `WI-NFR-001`: every requirement below traces to a specific ADR or vision principle — no NFR here should read as invented without that trace. Fields marked **🔶 NEEDS INPUT** are exactly where `WI-NFR-001` flagged that a human judgment call is required (a real business decision on target numbers), rather than a plausible-sounding value being invented to fill the space. Everything else follows directly from decisions already made.

Status legend matches the rest of the project: **[MVP]** binding for v1 · **[MVP-lite]** binding but deliberately minimal · **[Deferred]** named, not built · **[Post-launch]** after go-live.

## 1. Scalability

- **[MVP] Target load**: 50 peak concurrent users, 200 orders/day. Planning assumption, not a load-tested measurement — sized to fit comfortably under this document's other free-tier ceilings with real headroom (see below), not derived from actual measured traffic.
- **[MVP] Compute scaling**: Container Apps consumption plan auto-scales with load (`tech-stack.md`) — no fixed ceiling assumed at this layer.
- **[MVP] Data store ceiling**: Cosmos DB's free tier provides 1,000 RU/s shared across all containers (ADR-0004). At the target load above, sustained throughput is well under this ceiling (tens of RU/s, not hundreds) — not the binding constraint at this scale. **Assumption ceiling**: if sustained throughput approaches 1,000 RU/s, ADR-0004's partition-key choices (v1 guesses, not load-tested) and the shared-account tradeoff need active revisiting.
- **[MVP] Cache scaling**: `LocalCacheProvider`'s per-replica, non-shared nature (ADR-0002) means cache hit rates degrade as replica count grows, by design. Accepted for MVP scale; revisit if horizontal scaling grows significantly.
- **[MVP] Event backbone ceiling**: Azure Event Grid's free grant covers 100,000 operations/month (ADR-0003). At ~5 domain events per order (`OrderPlaced`, `OrderCustomized`, `PickupWindowScheduled`, `OrderReadyForPickup`, `OrderCompleted`) and 200 orders/day, that's ~1,000 events/day (~30,000/month) — **30% of the free grant**, leaving headroom to roughly 600 orders/day before this ceiling needs revisiting.
- **[MVP] Gateway ceiling**: Azure API Management Consumption tier's free grant covers 1,000,000 calls/month (ADR-0008). At an estimated ~20,000 API calls/day (browsing, cart, checkout — not just completed orders), that's ~600,000/month — **60% of the free grant**.

## 2. Availability

- **[MVP] Target availability: 99.0% monthly** (≈7.3 hours/month allowed downtime). Explicitly a **self-imposed design target, not an Azure-backed guarantee** — Azure API Management's financially-backed SLA covers only Basic/Standard/Premium tiers, not the Consumption tier used here (ADR-0008); Event Grid and Container Apps' consumption-based pricing similarly doesn't carry the same SLA weight as dedicated-capacity tiers. A single-region, serverless-tier stack with no redundancy investment can't credibly promise more than this without additional spend, so 99.0% is stated as an honest, modest target rather than an inflated one. This is the number `OPS-001` (SLA/SLO) should build its error budget from.

## 3. Security

### 3.1 Zero trust — binding, not aspirational
**[MVP]** Every service authoritatively validates its own authentication and authorization, regardless of what sits in front of it. Source: `docs/product/vision.md` principle 5, ADR-0006, ADR-0008. This is the posture that made ADR-0008's API Gateway decision safe despite Azure API Management's Consumption tier having no VNet/Private Link enforcement (ADR-0008) — a bypassed gateway loses edge optimizations, not security, specifically because of this NFR.

### 3.2 Authentication / Authorization
**[MVP]** Azure AD B2C, JWT bearer tokens, role claim + resource-ownership checks per service. Source: ADR-0006.

### 3.3 CSRF
**[MVP]** Not applicable under the current design, stated explicitly rather than by omission: tokens are transmitted via the `Authorization` header only, never stored in or read from a cookie (ADR-0006's token-storage note). Classic CSRF exploits automatic cookie attachment, which does not apply here. **This conclusion is conditional — if any future work item introduces cookie-based token storage (e.g., a refresh-token strategy), this section is invalidated and CSRF-specific mitigation must be added at that time**, per ADR-0006.

### 3.4 Injection protection
**[MVP]** All Cosmos DB access uses parameterized queries via the SDK's query builder — no raw query string construction anywhere in the codebase. Source: this is a new baseline stated here for the first time, feeding into `docs/process/engineering-standards.md`'s secure-coding section (also updated to reference it).

### 3.5 Secrets
**[MVP]** Azure Key Vault, per-environment, accessed via managed identity — no stored credential to reach it. Source: ADR-0007. Where possible, the secret is eliminated entirely rather than well-managed (e.g., Cosmos DB access via managed identity, no connection string at all).

### 3.6 Sensitive data (dietary/allergy information)
**[MVP]** Treated as quasi-health data: surfaced only at relevant touchpoints (browse, customization, cart — not buried, not over-exposed), access scoped to the owning customer and vendors fulfilling that customer's order, not broadly queryable. Source: vision principle 1, glossary's Preference Profile/Snapshot entries. **[Deferred]** A dedicated data-privacy/retention doc (`PRIV-001`) is planned for deeper treatment (retention windows, deletion policy) — this section states the baseline expectation now so it doesn't stay unstated in the interim.

## 4. Compliance

- **[MVP] PCI scope**: SAQ A — card data is tokenized client-side via Stripe.js/Elements and never reaches this system's servers. Source: ADR-0005.
- **[MVP] Region/currency**: single-region (US), single-currency (USD) assumption for v1. Source: ADR-0005. **[Deferred]** Multi-region/multi-currency would require real rework, not configuration.
- **[Deferred, decision pending]** Terms of Service / Privacy Policy scope: not yet decided in or out for v1 — tracked as `GOV-002` in the backlog, not silently absent from this document.

## 5. Reliability / Resilience

- **[MVP]** Cache: circuit-breaker fallback to local cache on managed-Redis failure, regardless of configured backend. Source: ADR-0002.
- **[MVP]** Events: at-least-once delivery, no cross-aggregate ordering guarantee — consumers must be idempotent (dedupe on event ID) and use per-aggregate sequence numbers where order matters. Source: ADR-0003.
- **[MVP]** Data: Strong consistency for the `payouts` container specifically (financial reconciliation data); Session consistency (default) elsewhere. Source: ADR-0004.

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
