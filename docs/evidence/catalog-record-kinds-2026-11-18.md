# Catalog container: record kinds and time to live (2026-11-18)

> **Status:** Snapshot · 2026-11-18, `feature/hardening-followups` at `36f234a` plus the register 66 change (uncommitted at the time of the run); local stack, nothing deployed. Register item 66, `WI-CAT-006`. **Current result:** on a fresh local stack the `catalog` container has a default time to live of -1, every listing is stored with `docType` `listing`, and a document carrying its own `ttl` of 5 seconds was gone when read 5 seconds later. The 62 web journeys passed against the change.

## Environment

Windows 11, Docker Desktop. `node scripts/ci/skeleton-smoke.mjs --keep` from a stack with no data (the previous run had ended with `docker compose down`), which starts the Compose infrastructure, seeds, runs catalog, ordering, the BFF and both web apps from source and runs the Playwright journeys against them. The container was read afterwards with a throwaway console program using the Cosmos SDK (`Microsoft.Azure.Cosmos` 3.63.2, gateway mode), kept outside the repository.

## Observations

| Check | Observed |
|---|---|
| Skeleton smoke | 62 of 62 passed |
| `catalog` container properties | `DefaultTimeToLive` = -1 (expiry on, only for documents with their own `ttl`) |
| Documents by `docType` after the smoke | `listing` 10, `stockReservation` 41, none 2 (the two vendor-status documents, in their own partition `_vendor-status`, which no listing query reads) |
| A document `{ docType: "ttlProbe", ttl: 5 }` created at 14:47:05.86 in partition `ttl-probe` | Read back at 14:47:05.86; at 14:47:10.89 the read returned 404 |

The 30-day `ttl` of a released reservation itself was not waited out; the probe shows that the emulator honours a document's `ttl` in a container created with -1. The deployed container (Terraform, `default_ttl = -1`) has not been planned or applied.

## Teardown

`docker compose --profile with-redis down` after the runs.
