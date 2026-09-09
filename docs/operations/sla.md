# SLA / SLO

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
| Browse / search (catalog-service) | < 500 ms | < 1,000 ms | Cache-assisted per ADR-0002; comfortably achievable at this load |
| Cart / customization (catalog-service, ordering-service) | < 500 ms | < 1,000 ms | |
| Checkout (ordering-service → Stripe) | < 1,500 ms | < 3,000 ms | Higher target — includes an external round-trip to Stripe (ADR-0005), not fully within this platform's control |
| Order status / queue display (ordering-service, event-fed read-model) | best-effort, not request/response | — | Bounded by event-delivery characteristics (ADR-0003's at-least-once, no cross-aggregate ordering guarantee), not a latency SLA in the traditional sense — see Known Failure Modes below |

## Known failure modes this SLA has to account for

Each traces to a specific ADR — these are accepted, named characteristics of the architecture, not surprises:

- **Cache degradation**: on managed-Redis failure, the system falls back to per-replica local caching (ADR-0002). Under sustained failure with multiple replicas, cache hit rates drop and replicas can briefly disagree on cached values — degraded performance, not an outage. Counts against the error budget only if it measurably breaches the latency targets above, not merely because a fallback occurred.
- **Cosmos DB throughput ceiling**: shared 1,000 RU/s across all containers (ADR-0004). At the current target load this isn't the binding constraint (see `nfrs.md` §1), but a sustained approach toward this ceiling would first show up as elevated latency, not a hard failure — worth monitoring (feeds `OPS-003`) rather than waiting for a breach.
- **Gateway has no Azure-backed SLA at this tier**: APIM Consumption tier (ADR-0008) — this platform's 99.0% target already accounts for this by not assuming an inherited guarantee.
- **Event delivery is at-least-once, not instant**: the live order-queue display and any other event-fed read-model (ADR-0003, ADR-0004) have a real, bounded lag between an event occurring and the read-model reflecting it. This is accepted by design and explicitly not held to the same latency target as a direct request/response path.

## Related

- `docs/architecture/nfrs.md` — source of the uptime and load numbers above
- `docs/operations/runbooks/` (`OPS-002`, not yet written) — will reference this document's targets, not restate them
- `docs/operations/monitoring-alerting.md` (`OPS-003`, not yet written) — will define how these targets are actually measured
