# SLA / SLO

> **Status:** Current · updated 2026-10-30. The targets are unchanged planning assumptions. What changed is that this page now says what has been measured, which is very little: nothing is deployed, no load test has been run, and there is no dashboard, so none of the targets below can be checked today.

Every number here traces to `docs/architecture/nfrs.md` or a named ADR — none are invented fresh in this document. Per `WI-OPS-001`.

## Uptime target

**99.0% monthly availability** (≈7.3 hours/month allowed downtime), sourced directly from `nfrs.md` §2.

**This is a self-imposed design target, not an Azure-backed guarantee.** Azure API Management's financially-backed SLA covers only Basic/Standard/Premium tiers — not the Consumption tier used here (ADR-0008) — and Event Grid/Container Apps' consumption-based pricing similarly doesn't carry the same SLA weight as dedicated-capacity tiers. This platform cannot inherit an uptime number from Azure; 99.0% is this project's own honest target for a single-region, serverless-tier stack with no redundancy investment.

## Error budget policy

At 99.0%/month, the error budget is **~7.3 hours of downtime or severe degradation per month**. When the budget is exhausted in a given month:
- **Feature-flagged iterations pause** — no new non-critical feature flags are enabled until the following month, per the feature-flag mechanism in `EPIC-FEATURE-FLAGS`
- **An incident review is required** before resuming normal release cadence — this is the same postmortem practice already planned for `EPIC-GOLIVE-SUPPORT`, just triggered earlier if the budget is burned before an actual major incident occurs
- This is a lightweight, portfolio-appropriate policy — it does not include financial penalties, customer credits, or other real-SLA mechanics, consistent with the "self-imposed target" framing above

## Latency targets

Planning assumptions, informed by the target-load numbers in `nfrs.md` §1 (50 peak concurrent users, 200 orders/day) — not yet measured, and should be revisited after initial load testing rather than treated as permanent:

| Path | Target (p95) | Target (p99) | Notes |
|---|---|---|---|
| Browse / search (catalog-service) | < 500 ms | < 1,000 ms | Cache-assisted per ADR-0002: the catalog's listing cache is built (`WI-CAT-003`, 2026-11-07); locally the BFF listings query is p50 about 3 ms with it and about 20 ms without, one machine and a small catalog (`docs/evidence/WI-CAT-003/after-2026-11-07.md`) |
| Cart / customization (catalog-service, ordering-service) | < 500 ms | < 1,000 ms | The cart is held in the browser (no cart endpoint, first-slice decision D-2) |
| Checkout (ordering-service → Stripe) | < 1,500 ms | < 3,000 ms | Higher target — includes an external round-trip to Stripe (ADR-0005). Today the payment is a stub, so the target has never been tested with the call it was set for |
| Order status / queue display (ordering-service, event-fed read-model) | best-effort, not request/response | — | Bounded by event-delivery characteristics (ADR-0003's at-least-once, no cross-aggregate ordering guarantee), not a latency SLA in the traditional sense — see Known Failure Modes below |

## Measured so far (one local capture, not percentiles)

Source: `docs/evidence/slice-1/findings.md` and `docs/evidence/baseline-2026-10-30.md`. One developer machine, the local stack, a single user. These are single observations, not a p95 or p99, and not load.

| Path | Observed | Against the target |
|---|---|---|
| A server-rendered listing page (web server to BFF to catalog, to Cosmos) | 435 ms at the web server's call, 415 ms in the BFF, 357 ms in the catalog, in the captured trace | Under the 500 ms p95 target for this one sample; whether it was a cold or a warm request was not recorded |
| Checkout, first on a cold stack | 4,675 ms | Over the 3,000 ms p99 target. About 4 s of it was two fetches from a cold mock issuer (metadata, then a service token) |
| Checkout, later | 55 to 78 ms (eight samples), payment stubbed | Far under, but without the Stripe round-trip. The stub answers instantly; a variable delay is wanted so latency, timeouts and loading states can be tested (register 92) |
| First whole browser journey on a cold stack | about 9 s; later journeys 1 to 1.5 s | Not a request target; shown because a first demo order feels like this |

The timeouts that bound the worst case are configuration, not targets: the BFF waits 5 s for reads and 15 s for checkout, and `ordering-service` waits 5 s on the catalog.

**Nothing measures the targets yet.** The thresholds in `monitoring-alerting.md` are policy; no dashboard or alert rule implements them (`EPIC-OBSERVABILITY`), and Application Insights is not wired (register 37). The 99.0% availability target has no measurement because nothing is deployed.

## Known failure modes this SLA has to account for

Each traces to a specific ADR — these are accepted, named characteristics of the architecture, not surprises:

- **Cold start**: the first request after a restart or a scale-from-zero can take seconds, because token metadata and service tokens are fetched on first use (4.7 s observed for a checkout locally). A request like that breaches the checkout targets. How the real hosting and Entra behave is unknown (risk R-12 in `docs/management/risk-register.md`). A demo should warm the stack first.
- **Cache degradation**: on managed-Redis failure, the system falls back to per-replica local caching (ADR-0002). Under sustained failure with multiple replicas, cache hit rates drop and replicas can briefly disagree on cached values — degraded performance, not an outage. Counts against the error budget only if it measurably breaches the latency targets above, not merely because a fallback occurred.
- **Cosmos DB throughput ceiling**: shared 1,000 RU/s across all containers (ADR-0004). At the current target load this isn't the binding constraint (see `nfrs.md` §1), but a sustained approach toward this ceiling would first show up as elevated latency, not a hard failure — worth monitoring (feeds `OPS-003`) rather than waiting for a breach.
- **Gateway has no Azure-backed SLA at this tier**: APIM Consumption tier (ADR-0008) — this platform's 99.0% target already accounts for this by not assuming an inherited guarantee.
- **Event delivery is at-least-once, not instant**: the live order-queue display and any other event-fed read-model (ADR-0003, ADR-0004) have a real, bounded lag between an event occurring and the read-model reflecting it. This is accepted by design and explicitly not held to the same latency target as a direct request/response path. The lag was measured on 2026-11-02 to 11-03 on a local stack: from the request to the card on the vendor's screen p50 110 ms and p95 146 ms over 762 orders (`docs/evidence/WI-SEC-005/load-soak-2026-11-03.md`); the order events are consumed by the vendor read model, the fulfillment strategy and the notification service.
- **Events that cannot be read are dropped**: a malformed stream entry is acknowledged without dead-lettering (register 88), so a read-model could silently miss it.
- **Behavior when a dependency fails** is listed, with how each case was established, in `docs/architecture/patterns.md` section 14.

## Related

- `docs/architecture/nfrs.md` — source of the uptime and load numbers above
- `docs/operations/runbooks/` (`OPS-002`: a template and one runbook so far) — will reference this document's targets, not restate them
- `docs/operations/monitoring-alerting.md` (`OPS-003`, written as policy) — defines the thresholds; the implementation that measures them is not built
