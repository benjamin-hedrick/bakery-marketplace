# Open items before broad agent delegation

> **Status:** Snapshot · the boxes below were not kept up to date. State on 2026-10-30:
>
> - **Must settle first:** current state confirmed (`docs/evidence/facts-sheet-2026-10-29.md`); ADRs adopted; `WI-PORT-001` run; first query and contract defined (`first-slice-contract.md`, the BFF schema); owners assigned (`09`); Compose verified (`docs/operations/local-dev.md`); branch and PR workflow agreed (`docs/process/branching-strategy.md`). **Open:** the exact Node and tool pins.
> - **Before checkout:** all done. Order invariants and transitions (`order-lifecycle.md`), pricing and availability authority (the services), pickup zone and expiry (`PickupSchedule`), idempotency by a derived order id, the stub payment, a typed error taxonomy (`PlaceOrderRejected`), and duplicate-submission and stale-data tests.
> - **Before cloud deployment:** all open; nothing is deployed.

> **Adopted 2026-10-26** from the portfolio planning packet. Decisions referenced here are recorded in ADR-0012 to ADR-0016; this file holds the implementation approach, not the decisions. See `RECONCILIATION-DISPOSITIONS-2026-10-26.md`.

## Must settle first

-   [ ] Confirm current branch, clean/dirty state, actual build/test
    commands.
-   [x] Review/adopt ADRs; mark their status accurately. (2026-10-26:
    ADR-0012 to ADR-0016 accepted.)
-   [ ] Run WI-PORT-001 before broad frontend implementation.
-   [ ] Pin runtimes, package manager, and tool versions based on actual
    repo state.
-   [ ] Define the first GraphQL listing query and C# API contract.
-   [ ] Assign owners for shared schema, lockfile, root config, pipeline
    YAML, and central docs.
-   [ ] Verify local dependencies/Docker Compose rather than assuming
    placeholders work.
-   [ ] Agree branch/PR workflow and evidence artifact location.

## Before checkout

-   [ ] Order invariants/transitions; pricing and availability
    authority.
-   [ ] Pickup timezone/expiry; idempotency key scope/retention.
-   [ ] Test payment adapter behavior; client-safe error taxonomy.
-   [ ] Stale-data and duplicate-submission tests.

## Before cloud deployment

-   [ ] Azure subscription/cost limits; identity/service connection;
    secret management.
-   [ ] Environment separation and telemetry retention/sampling.
-   [ ] Deployment approval/rollback, TLS/domain, cache policy.

## Defer

Mobile/Maestro, real payments, distributed cache, production
notifications, rich recommendations, and broad multi-service deployment
unless the core slice needs them.

## Readiness rule

No task without one owner, bounded file scope, accepted dependencies,
objective acceptance criteria, and a required handoff. Serialize
shared-file work or assign an integration owner.
