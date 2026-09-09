# Budget / Cost Estimate

Infrastructure cost only. Labor/time investment is a separate axis this document doesn't estimate — see Open Points in `WI-MGMT-005`.

## Monthly infrastructure cost, at the target load in `nfrs.md` §1 (50 peak concurrent users, 200 orders/day)

| Service | Tier | Monthly cost | Source |
|---|---|---|---|
| Container Apps (compute) | Consumption plan | $0 | Free grant covers this target load comfortably |
| Static Web Apps (frontend hosting) | Free tier | $0 | Permanent free tier |
| Cosmos DB | SQL API, free tier | $0 | 1,000 RU/s + 25GB free grant; target load uses a small fraction of this |
| Event Grid | Consumption | $0 | ~30% of the 100,000 ops/month free grant at target load (`nfrs.md` §1) |
| API Management | Consumption | $0 | ~60% of the 1,000,000 calls/month free grant at target load (`nfrs.md` §1) |
| Azure AD B2C | Free tier | $0 | Free up to 50,000 MAU, far above target load |
| Key Vault | Pay-per-operation | < $1/month | Negligible at this scale — charged per secret operation, not a flat fee |
| **Cache (Redis)** | **Basic C0, if enabled** | **~$16/month per environment it's enabled in** | The one real, non-zero line item — see below |
| Stripe | Per-transaction, no monthly fee | $0 fixed / variable per transaction | Not a fixed budget line — scales with real transaction volume; $0 in test mode |

**Total fixed monthly cost: ~$0–32/month**, entirely driven by how many environments enable managed Redis (ADR-0002 — dev uses the free local cache by default; staging/prod may enable managed Redis at ~$16/month each).

## The one real cost, precisely

Azure Cache for Redis Basic tier, C0 SKU (250MB): **$16.06/month**, confirmed against Azure's current published pricing at time of drafting, not carried forward as a vague earlier estimate. If enabled in both staging and prod (per ADR-0002's per-environment toggle), that's **~$32/month** total; if only prod, **~$16/month**.

## What would trigger a real cost increase

Tied directly to `nfrs.md` §1's stated assumption ceilings — this budget holds at the target load, not indefinitely:

- Sustained Cosmos throughput approaching 1,000 RU/s → per-container throughput provisioning becomes a real cost, not just a config change
- Event volume approaching ~600 orders/day → Event Grid's free grant is exhausted
- API call volume approaching the free grant → APIM starts billing per call (~$3.50/million above the grant)

None of these are close at the current target load — this section exists so a future reviewer knows *where* the ceiling is, not because it's imminent.

## Explicitly not estimated here

- **Labor/time cost** — a personal/business decision about how many hours this project represents, which this document can't invent a number for
- **Optional extras** (a custom domain, ~$12/year, is not required — Static Web Apps' default hostname works fine)

## Related

- `docs/architecture/tech-stack.md` — the per-service tier decisions this budget is a cost summary of
- `docs/architecture/nfrs.md` §1 — the target-load assumptions this budget is scoped to
