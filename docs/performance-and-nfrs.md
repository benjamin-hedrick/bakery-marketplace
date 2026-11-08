# Performance, scalability and non-functional requirements

> **Status:** Current · written 2026-11-08 as a guide to documents that already exist; every figure below is quoted from its source record, which states the commit, the machine and the limits. All of it ran on one developer machine (Windows 11, Docker Desktop) with the stack local; nothing is deployed.

The requirements are written as targets with the decision or principle each traces to, then measured where a measurement could be made. Targets and measurements are kept apart: a target is a planning assumption, and a measurement says what was run.

## Targets

| Quality | Target | Source |
|---|---|---|
| Load | 50 peak concurrent users, 200 orders a day (planning assumptions, sized to the free-tier ceilings below) | [NFRs, scalability](architecture/nfrs.md) |
| Availability | 99.0% a month (about 7.3 hours of downtime), stated as a self-imposed design target, not a provider guarantee | [NFRs, availability](architecture/nfrs.md), [SLA/SLO](operations/sla.md) |
| Headroom | Cosmos DB free tier 1,000 RU/s shared (tens of RU/s needed at target load); Event Grid 100,000 operations a month (42% used at 200 orders a day); API Management 1,000,000 calls a month (60% used) | [NFRs](architecture/nfrs.md), ADR-0004, ADR-0003, ADR-0008 |
| Live updates | A vendor's screen reflects an order change within a stated time (proposed: p95 under 1 second, polling as the bound) | [NFRs 5.1](architecture/nfrs.md) |
| Abuse resistance | Per-caller limits on streams, request rate and body size | [NFRs 3.8](architecture/nfrs.md) |

## Measured

| What | Result | Record |
|---|---|---|
| Checkout, warm | 55 to 78 ms through the BFF, ordering and catalog; p50 63 ms and p95 75 ms over 20 orders | [latency](evidence/latency-2026-10-30.md) |
| Checkout, first after a cold start | about 4.7 s, of which about 4 s was two fetches from a cold mock issuer | [slice 1 findings](evidence/slice-1/findings.md) |
| Browse with the listing cache | BFF listings query p50 about 20 ms to about 3 ms; server-rendered home page about 24 ms to about 8 ms (three runs each) | [cache latency](evidence/WI-CAT-003/after-2026-11-07.md) |
| A 66-minute soak of the live vendor queue | 762 orders and none missed by any of five screens; order to screen p50 110 ms, p95 146 ms; 63,922 reads at p50 20 ms and p95 37 ms; memory flat after the first 5 minutes | [soak](evidence/WI-SEC-005/load-soak-2026-11-03.md) |
| An ordering restart in the middle of that run | back in 19 s; the only failures (154 reads, 4 orders) fell inside it; every screen reopened and caught up | [soak](evidence/WI-SEC-005/load-soak-2026-11-03.md) |
| Rate limiting under load, control and fix | with one shared counter 51 of 54 orders were refused; with per-client counting none | [client-address load](evidence/WI-SEC-005/client-address-load-2026-11-07.md) |
| Order-event delivery with the broker down | orders confirmed in about 2.1 s; events published within 6 s of recovery | [runbook run](evidence/runbook-event-broker-2026-10-30.md) |
| Concurrency | 200 of 200 concurrent server-rendered requests contained only their own data; twelve simultaneous identical checkouts made one order | [baseline](evidence/baseline-2026-10-30.md), [patterns](architecture/patterns.md) |

How they were taken: `scripts/dev/measure-latency.mjs` (sequential reads and checkout), `scripts/dev/load-test.mjs` (load and soak), `scripts/ci/repeat-suite.mjs` (repeated browser runs). Each record says what it does not show: for example the soak overlapped some of the author's own test runs, so its p99 is the weaker figure, and the cache numbers are for a small seeded catalog and the in-process provider.

## How it is designed to scale and to degrade

- **Capacity and cost are decided, not discovered:** serverless consumption tiers and free-tier ceilings with the arithmetic shown ([NFRs](architecture/nfrs.md), [ADR-0004](architecture/adr/0004-data-store-choice.md), [ADR-0008](architecture/adr/0008-api-gateway.md)); thirteen bounded contexts on four services with a modular-monolith rule so a service can split later ([ADR-0009](architecture/adr/0009-bounded-context-service-mapping.md)).
- **Events with at-least-once delivery, an outbox and idempotent consumers** so a slow or failed broker does not lose an order ([patterns 3](architecture/patterns.md), [ADR-0003](architecture/adr/0003-event-driven-backbone.md)).
- **Caching in three owned layers** with invalidation and a single flight against stampedes ([patterns 7](architecture/patterns.md), [ADR-0014](architecture/adr/0014-cache-layers.md)).
- **Push as a nudge with polling as the floor,** bounded streams and silence limits ([patterns 9](architecture/patterns.md), [ADR-0021](architecture/adr/0021-live-updates-to-the-vendor-queue.md)).
- **Idempotent writes, reserve and release, optimistic concurrency** ([patterns 4 to 6](architecture/patterns.md)).
- **What happens when a dependency fails,** with how each case was established, and where each technique is tested against the real dependency ([patterns 14 and 15](architecture/patterns.md)).
- **Observability:** OpenTelemetry traces with W3C trace context ([ADR-0016](architecture/adr/0016-opentelemetry-tracing.md)), a monitoring and alerting plan and a runbook ([monitoring](operations/monitoring-alerting.md), [runbooks](operations/runbooks/README.md)).

## Security as a quality attribute

Threat model, generated-input tests, an OWASP ZAP scan with no high finding, rate limits and browser hardening, a dependency audit and SBOMs, and a review statement: [threat model](architecture/threat-model.md), [security evidence](evidence/WI-SEC-005/load-soak-2026-11-03.md), [dependency audit](evidence/WI-SEC-004/dependency-audit-2026-11-07.md), [review statement](governance/review-statement.md).

## Read next

[NFRs](architecture/nfrs.md) (the requirements and section 8, everything measured) · [patterns](architecture/patterns.md) · [evidence index](evidence/README.md) · [testing](testing.md)
