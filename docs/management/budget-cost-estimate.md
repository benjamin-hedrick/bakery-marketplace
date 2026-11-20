# Budget / Cost Estimate

> **Status:** Snapshot · the figures are the September 2026 estimate and were **not re-checked against current Azure pricing**, on 2026-10-30 or on 2026-11-08 (when the page was re-read against the code: the cache and images text was updated; no price was). Rows changed since September are marked, and the deployed dev environment's lines (registry, state storage, budget alert) were added on 2026-10-31. Nothing is deployed and nothing has been billed, so every figure is a forecast, not a measurement. **2026-11-20:** a section for the dev environment as built (per day while it is up, from rates taken that day from secondary sources) and for running it without Redis was added; the foundation (registry, budget alert) has been running since that day.

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

**Total fixed monthly cost: ~$0–32/month on these assumptions, plus about $5–6 for the registry and state storage once a dev environment is deployed (added 2026-10-31, unverified)**, driven by how many environments enable managed Redis (ADR-0002 — dev uses the free local cache by default; staging/prod may enable managed Redis at ~$16/month each). Today the catalog and the notification service use a cache, in process by default and the local cache Redis when asked (`WI-CAT-003`); nothing uses a managed Redis, and the managed-Redis vendor is under reconsideration (register 22), so the one non-zero line may change.

## The deployed dev environment as built (2026-11-20)

The table above is the September estimate for a production-like target load. The dev environment that `infra/environments/dev` creates is smaller and different, and it is what will be billed first. Rates are US East pay-as-you-go, taken on 2026-11-20 from secondary sources that quote Azure's prices ([TrustRadius](https://www.trustradius.com/products/azure-container-apps/pricing), [Microsoft Tech Community on idle usage](https://techcommunity.microsoft.com/blog/appsonazureblog/understanding-idle-usage-in-azure-container-apps/4419197), [nOps](https://www.nops.io/blog/azure-container-apps-cost-optimization-guide/), the [Container Registry tiers page](https://learn.microsoft.com/azure/container-registry/container-registry-skus)); Azure's own pricing pages did not show figures to an automated reader, so **check them in the Azure pricing calculator before relying on them**.

| What | How it runs | Rate | Per day while up | Source of the rate |
|---|---|---|---|---|
| **Three Redis container apps** (events, cache, sessions), 0.25 vCPU and 0.5 GiB each | **Always on** (`min_replicas = 1`: the data lives in memory) | vCPU $0.000024/s active, $0.000003/s idle; memory $0.000003/GiB-s | **$0.58 if idle, $1.94 if active** (0.75 vCPU, 1.5 GiB for 86,400 s) | Secondary sources above; idle applies under 0.01 vCPU and 1,000 bytes/s in |
| Catalog, ordering, BFF, web (0.5 vCPU, 1 GiB each) and the mock issuer (0.25, 0.5) | Scale to zero when idle | Same | About **$0.24 per hour** with all five running; nothing when scaled to zero | Same |
| Container Apps free grant | Per subscription per month | 180,000 vCPU-s, 360,000 GiB-s, 2 million requests | The Redis apps alone use the monthly vCPU grant in about 2.8 days | [Microsoft Learn, billing](https://learn.microsoft.com/en-us/azure/container-apps/billing) |
| Cosmos DB | Free tier (one account per subscription), 400 RU/s shared by the containers, in East US 2 (East US refused new Cosmos accounts for this subscription on 2026-11-20) | $0 inside 1,000 RU/s and 25 GB | $0 | Free tier as in the table above; the apps in East US reach it across regions, about $0.02 per GB of data transfer, negligible at dev volumes |
| Log Analytics | Daily cap 0.5 GB (`daily_quota_gb`) | Pay-as-you-go per GB; **rate not confirmed** on 2026-11-20 | At most the cap's cost (about $1.15 at the commonly quoted $2.30/GB, unverified) | Not confirmed |
| Key Vault | Per operation | Negligible | ~$0 | Table above |
| Container registry (foundation, already running) | Basic, 10 GB included | $0.167/day | $0.17 | Container Registry tiers page |

**Estimate:** the foundation costs about **$0.17 a day** (the registry) whether or not dev is up. The dev environment adds roughly **$1 to $4 a day** while it exists (the Redis apps, the apps while used, logs up to the cap), and nothing once torn down. Left up for a month it would be roughly $20 to $90 depending on activity and logs, which is why it is created, tested and destroyed in one sitting, and why it has its own budget alert (`budget-bakery-dev`, 10 a month, created and destroyed with the environment; Azure's cost data lags by hours, so the alert is a backstop, not a meter). Not a measurement: nothing has been billed yet; the first deployment's evidence records the actual charge from Cost Management a day or two later.

### Running dev without the Redis apps (the lead's goal 3)

The Redis apps are the only always-on cost. Whether they can be left out depends on the three uses, read from the code on 2026-11-20:

| Use | Setting | Without Redis | Follows the adapter-and-fallback pattern? |
|---|---|---|---|
| Listing cache (catalog) | `Cache:Backend` | `local`, the in-process cache: works, each replica has its own | Yes |
| Events (catalog, ordering) | `Events:Backend` (required, no default) | `inmemory`: works for the services deployed here, because **no event crosses a service boundary in dev**: ordering subscribes only to its own events (the vendor read model, fulfilment), catalog subscribes only to `VendorVerified`/`VendorSuspended`, which nothing deployed publishes (the admin service is a scaffold), and notification-service, the cross-service subscriber, is not deployed. The vendor live stream's broadcast is in-memory in ordering too. Limits: events are lost on a restart or scale to zero, and it holds only with one replica of each service (`max_replicas = 1` today). The code names `inmemory` for "tests and throwaway runs" and has no silent fallback, by design | Yes (an explicit choice, never a fallback) |
| Browser sessions (web) | `SESSION_REDIS_URL` | `memory` exists, but is **refused unless `APP_ORIGIN` is a loopback address** (`packages/web-session/src/config.ts`), a deliberate guard: sessions in one process are lost on restart and not shared between replicas. A deployed web app cannot use it as the code stands | Partly: a fallback exists but is fenced to local use |

Options, for the lead (register item 216): **(a)** keep only the sessions Redis and run events in memory and the cache locally: one always-on app instead of three, about a third of the Redis cost, no code change, only a switch in the dev stack; **(b)** no Redis at all: also needs the session store's guard widened for a named demo setting (a security-relevant change to the login path, so the lead's approval), with the web app kept at one replica and sessions lost whenever it scales to zero; **(c)** keep all three for the first full run (goal 2), so the deployed environment matches the local one, and try (a) on the repeat (goal 3).

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
- **Image storage beyond the registry line above, and container scanning:** the images exist (`WI-DEP-001`) and were built locally; none is in a registry, and no scanner has been run on them (`docs/evidence/WI-SEC-004/dependency-audit-2026-11-07.md`)
- **CI build minutes:** the Azure Pipelines runs are limited to pull requests and manual runs to save minutes (`docs/process/quality-gates.md`); not costed
- **Optional extras** (a custom domain, ~$12/year, is not required)

## Related

- `docs/architecture/tech-stack.md` — the per-service tier decisions this budget is a cost summary of
- `docs/architecture/nfrs.md` §1 — the target-load assumptions this budget is scoped to
