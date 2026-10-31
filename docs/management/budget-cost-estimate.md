# Budget / Cost Estimate

> **Status:** Snapshot · the figures are the September 2026 estimate and were **not re-checked against current Azure pricing** on 2026-10-30. Rows changed since then are marked. Nothing is deployed and nothing has been billed, so every figure is a forecast, not a measurement.

Infrastructure cost only. Labor/time investment is a separate axis this document doesn't estimate — see Open Points in `WI-MGMT-005`.

## Monthly infrastructure cost, at the target load in `nfrs.md` §1 (50 peak concurrent users, 200 orders/day)

| Service | Tier | Monthly cost | Source |
|---|---|---|---|
| Container Apps (services) | Consumption plan | $0 (assumed) | The free grant is expected to cover this target load; never tested, nothing runs there |
| Frontend and BFF hosting (Next.js server rendering and the GraphQL BFF) | Not decided; Container Apps consumption is the default candidate (register item 25) | $0 only if it fits the same free grant; unverified | **Changed 2026-10-26 (ADR-0012):** Static Web Apps, listed here in September at $0, no longer fits a server-rendered app |
| Cosmos DB | SQL API, free tier | $0 | 1,000 RU/s + 25GB free grant; target load uses a small fraction of this |
| Event Grid | Consumption | $0 | About 42% of the 100,000 ops/month free grant at target load, counting publishes only (`nfrs.md` §1); deliveries to subscribers also count and are not modelled, so this is a lower bound |
| API Management | Consumption | $0 | About 60% of the 1,000,000 calls/month free grant at target load (`nfrs.md` §1); the calls counted are now the BFF's downstream calls; unmeasured |
| Identity: Microsoft Entra External ID | Free tier | $0 (assumed) | **Changed:** Azure AD B2C, which this row named in September, no longer takes new tenants (ADR-0006 amendment). The free monthly-user allowance of Entra External ID was not verified |
| Observability: Application Insights | Free ingestion allowance (5 GB/month per `tech-stack.md`) | $0 (assumed) | Not wired yet (register 37); the OpenTelemetry Collector's own hosting is a cost line **not estimated** |
| Key Vault | Pay-per-operation | < $1/month | Negligible at this scale — charged per secret operation, not a flat fee |
| Container registry (foundation stack, ADR-0020) | Basic | ~$5/month (from memory, **not checked against current pricing**) | The one new fixed line for the deployed dev environment: the images must outlive the disposable environment stack, so the registry sits in a stack that is not torn down |
| Terraform state storage (ADR-0020) | Storage account, blob, locally redundant | < $1/month (assumed) | A few small state files, with versioning on |
| Budget alert (ADR-0020) | Azure cost budget | $0 | A notification only; it deletes nothing |
| **Cache (Redis)** | **Basic C0, if enabled** | **~$16/month per environment it's enabled in** | The one real, non-zero line item — see below |
| Stripe | Per-transaction, no monthly fee | $0 fixed / variable per transaction | Not a fixed budget line — scales with real transaction volume; $0 in test mode |

**Total fixed monthly cost: ~$0–32/month on these assumptions, plus about $5–6 for the registry and state storage once a dev environment is deployed (added 2026-10-31, unverified)**, driven by how many environments enable managed Redis (ADR-0002 — dev uses the free local cache by default; staging/prod may enable managed Redis at ~$16/month each). Today no service uses a cache at all (the catalog cache-aside is not built), and the managed-Redis vendor is under reconsideration (register 22), so the one non-zero line may change.

## The one real cost, precisely

Azure Cache for Redis Basic tier, C0 SKU (250MB): **$16.06/month**, confirmed against Azure's current published pricing at time of drafting, not carried forward as a vague earlier estimate. If enabled in both staging and prod (per ADR-0002's per-environment toggle), that's **~$32/month** total; if only prod, **~$16/month**.

## What would trigger a real cost increase

Tied directly to `nfrs.md` §1's stated assumption ceilings — this budget holds at the target load, not indefinitely:

- Sustained Cosmos throughput approaching 1,000 RU/s → per-container throughput provisioning becomes a real cost, not just a config change
- Event volume approaching ~475 orders/day (about 7 events per order once `PickupFulfillment` exists; publishes only) → Event Grid's free grant is exhausted
- API call volume approaching the free grant → APIM starts billing per call (~$3.50/million above the grant)

None of these are close at the current target load — this section exists so a future reviewer knows *where* the ceiling is, not because it's imminent.

## Explicitly not estimated here

- **Labor/time cost** — a personal/business decision about how many hours this project represents, which this document can't invent a number for
- **Container images and a registry:** none exist (register 71); a registry is a cost line once images do
- **CI build minutes:** the Azure Pipelines runs are limited to pull requests and manual runs to save minutes (`docs/process/quality-gates.md`); not costed
- **Optional extras** (a custom domain, ~$12/year, is not required)

## Related

- `docs/architecture/tech-stack.md` — the per-service tier decisions this budget is a cost summary of
- `docs/architecture/nfrs.md` §1 — the target-load assumptions this budget is scoped to
