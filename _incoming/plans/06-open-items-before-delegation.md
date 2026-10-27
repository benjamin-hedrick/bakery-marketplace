# Open items before broad agent delegation

## Must settle first

-   [ ] Confirm current branch, clean/dirty state, actual build/test
    commands.
-   [ ] Review/adopt ADRs; mark their status accurately.
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
