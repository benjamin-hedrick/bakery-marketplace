# Dev's deploy identity narrowed, and dev run 100, 2026-11-22

> **Current result (2026-11-22):** `bakery-deploy` no longer holds Contributor or the role-assignment right on `rg-bakery-foundation` ([`uat-environment.md`](../../operations/runbooks/uat-environment.md) section 0, register 231). Dev run 100 on `main` then passed every stage with the new set: both identity checks, a plan of 0 to add, 6 to change, 1 to destroy (the cache Redis app removed), the apply, the application deploy, the smoke and the observability step. Run 100 is the dev build UAT promotes.

Work items: `WI-DEP-002` (section 0 and the post-merge dev build UAT needs) and `WI-DEP-001` goal 3 (dev without the cache Redis, register 216 option d). The role change was run by the agent from the lead's signed-in Azure CLI (2.93.0) on the lead's go; the pipeline results are read from the step logs and stage summaries the lead pasted. No id, address, subscription or tenant appears here.

## What happened first: a destroy run refused at its first check

`feature/uat-environment` was merged into `main` (`1a8ff7b`) before section 0 was done. The lead then ran the dev pipeline on `main` with action `destroy`. Its plan identity checks the deploy identity's complete roles against `main`'s expected set, which the merge had narrowed, so it failed with four problems and stopped before any Terraform ran: Reader on `rg-bakery-foundation` missing, Managed Identity Operator on `id-bakery-dev-apps` missing, and Contributor and Role Based Access Control Administrator on `rg-bakery-foundation` unexpected. Nothing was destroyed; dev stayed up. This is the failure the runbook's "Order" paragraph describes (section 0 and the merge back to back, no dev run between them). Register 201 (45).

The lead then chose to keep dev rather than destroy it: UAT needs a dev build made after the merge in any case, and section 3 (side by side) needs both environments up.

## The role change

Listed before, from the lead's CLI: exactly the seven assignments the failed check printed (Contributor and the conditioned role-assignment right on `rg-bakery-dev`, Storage Blob Data Contributor on the `tfstate` container, AcrPush on the registry, Key Vault Secrets Officer on dev's vault, and Contributor and the conditioned role-assignment right on `rg-bakery-foundation`).

Changed, in this order: Reader added on `rg-bakery-foundation`; Managed Identity Operator added on `id-bakery-dev-apps` (the identity read first, to be sure of the scope); then the two foundation assignments deleted by their assignment ids, after the script checked that exactly two matched.

Listed after:

| Role | Scope | Condition |
|---|---|---|
| Contributor | `rg-bakery-dev` | none |
| Role Based Access Control Administrator | `rg-bakery-dev` | yes (dev's, unchanged) |
| Storage Blob Data Contributor | the `tfstate` container | none |
| AcrPush | the foundation's registry | none |
| Key Vault Secrets Officer | dev's Key Vault | none (the stack's; exists while dev does) |
| Reader | `rg-bakery-foundation` | none |
| Managed Identity Operator | `id-bakery-dev-apps` only | none |

Checked offline with the pipeline's own rule (`compareRoles` and `expectedRoles('deploy', 'dev')` of `scripts/ci/identity-check.mjs`, the deploy identity checked as the plan identity checks it): no problems. Run 100's identity checks then proved it in the pipeline. The environment stack needed nothing more: its only role assignments are on dev's own vault, in `rg-bakery-dev`.

## Dev run 100

Run parameters: action `deploy`, plan mode `real`, `chaosScenario` none, `cacheRedis` false, `seed` true, `issuerRoles` Customer, `issuerAllowedIps` none. Source: `main` at `1a8ff7b`.

**The plan** (read-only identity, from the state): **0 to add, 6 to change, 1 to destroy.** Each app's settings are an ordered list, so the plan showed most changes as one setting renamed into the next; read as before and after lists, the net changes were:

| Resource | Net change |
|---|---|
| `redis-cache` | destroyed (`cacheRedis` off) |
| catalog | `Cache__Backend` from redis to local; the cache Redis connection setting removed; the chaos settings removed |
| BFF, ordering, web | the chaos settings removed (dev's previous run, build 96, was on `dev-chaos`) |
| mock issuer | `MockOidc__AllowDeployedDev` replaced by `MockOidc__AllowDeployed` and `Deployment__Environment=dev` (`WI-DEP-002` step 4) |
| seed job | `Seed__AllowDeployedDev` replaced by `Seed__AllowDeployed` |
| mock issuer, seed job | empty `args` and `command` lists added (no effect) |

The events and sessions Redis, Cosmos, the Key Vault and its secrets' references were not in the plan.

**The apply, the application deploy and the smoke** passed (the lead's report and the stages' summaries; the application deploy took 4 min 36 s, the smoke 1 min 43 s). Their step logs were not read here, so neither the smoke's test count nor the deploy's per-app lines are recorded.

**Observability**, window 16:01:37 to 16:11:34 UTC:

| App | Requests | Replicas | Restarts | Replica started after |
|---|---:|---:|---:|---:|
| web | 0 | 1 | 0 | 41 s |
| graphql-bff | 0 | 1 | 0 | 17 s |
| catalog | 2 | 1 | 0 | 19 s |
| ordering | 0 | 1 | 0 | 19 s |
| mock-oidc | 3 | 1 | 0 | 42.1 s |

Error-like log lines 0; chaos scenarios on 0 and chaos injected 0; cold starts 5; **40 of 40** smoke correlation ids found in the console log. Five apps, the cache Redis no longer among them.

**Not explained:** web shows 0 requests in a window that contains the smoke, which went through web. A metric that lags the window is the likely reason, not checked.

## What this shows and what it does not

- Goal 3 of `WI-DEP-001` (dev without the cache Redis): the switch removed the app in place on a running environment and the smoke passed with the catalog caching in process. A create from empty with the switch off has not been run.
- Dev's deploy identity now holds nothing in the foundation group but Reader, and Managed Identity Operator on dev's apps identity only; run 100 deployed with exactly that set.
- Run 100's images read the renamed settings (`MockOidc:AllowDeployed`, `Seed:AllowDeployed`) that UAT sets, so it is the build to promote. The UAT rehearsal's promote check accepted it ([`uat-rehearsal-2026-11-22.md`](uat-rehearsal-2026-11-22.md)).
