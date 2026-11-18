# Runbook test: an order's outbox is parked (2026-11-18)

> **Status:** Snapshot · 2026-11-18, `feature/hardening-followups` at `36f234a` plus the register 74 and 66 changes (uncommitted at the time of the run); local stack, nothing deployed. Register item 74, `WI-ORD-005`. **Current result:** an order event whose payload could not be read was retried 5 times and the order's outbox parked, with the error log line; the parked query found it; unparked without a fix it parked again after 5 more attempts; with the entry removed and unparked, the order left the parked query and the relay logged nothing more for it. Runbook: [`parked-order-outbox.md`](../operations/runbooks/parked-order-outbox.md).

## Environment

Windows 11, Docker Desktop. `node scripts/ci/skeleton-smoke.mjs --keep` first (62 of 62 journeys passed; it left Docker up with the orders its journeys placed), then `node scripts/dev/mobile-stack.mjs --keep`: the Compose infrastructure (Redis Streams, the Cosmos vNext emulator, the mock issuer, the cache and session Redis), the seed, catalog-service, ordering-service (relay on, the default `Outbox` options: sweep 5 s, idle back-off to 60 s, grace 3 s, 5 attempts) and the BFF from source. The ordering log was `artifacts/mobile/ordering.log` (git-ignored). The `orders` container held 41 orders, every one with its outbox empty (the field is left out when empty).

The document edits were made with a throwaway console program using the Cosmos SDK (`Microsoft.Azure.Cosmos` 3.63.2, gateway mode, the emulator's public key), kept outside the repository: it made the same changes the runbook gives for Data Explorer, with an If-Match on the document's ETag. The Data Explorer screen itself was not used.

## Procedure and observations

| Step | Time (UTC) | Action | Observed |
|---|---|---|---|
| 1 | 14:48:55 | On `order-2533ac9d9497c9cc7b4543c08041cd52` (customer `user-customer-1`, status Confirmed, outbox empty), added one outbox entry: `eventType` `OrderPlaced`, `sequenceNumber` 3, a new `eventId`, `occurredAt` ten seconds earlier, `payload` the string `not json`; set `pendingSince` to that time | Saved |
| 2 | 14:48:55 to 14:53:05 | Waited for the relay | Five warnings `Event OrderPlaced #3 of order order-2533… could not be published; it stays pending`, each with `System.Text.Json.JsonException: 'not json' is an invalid JSON literal`; each sweep logged `Outbox relay: 1 order(s) had unpublished events; 0 event(s) published`; then at error level `Order order-2533…: event OrderPlaced #3 failed 5 times; the order's outbox is parked and will not be retried until it is unparked` |
| 3 | 14:53 | Read the document | `parkedAt` 1795013585615 (14:53:05.6), `pendingSince` absent, the entry kept with `attempts` 5 |
| 4 | 14:53 | Runbook step 1: `SELECT c.id, c.customerId, c.parkedAt FROM c WHERE c.parkedAt > 0` on `orders` | One row: this order |
| 5 | 14:54:03 | Runbook step 4 **without** step 3 (no fix): removed `parkedAt` and `attempts`, set `pendingSince` to the entry's `occurredAt` | Saved; the relay took the order again |
| 6 | 14:54 to 14:59:23 | Waited | Five more warnings (10 in all) and a second error line; `parkedAt` 1795013963512 (14:59:23.5), `attempts` 5 |
| 7 | 14:59:37 | Runbook steps 3 and 4: removed the entry (it should never have existed: the fix chosen for this reproduction), removed `parkedAt`; the outbox was then empty, so `pendingSince` was removed | Saved; the parked query returned no rows |
| 8 | 14:59:48 to 15:01:03 | Watched the ordering log for 75 s (longer than the relay's 60-second idle gap) | No new line naming the order (12 before, 12 after) |

The failed attempts did not count as transport failures: a `JsonException` counts toward parking, a broker outage does not (`OutboxPublishResult.CountsTowardParking`).

## Not covered

- The metrics `order_outbox_publish_failed` and `order_outbox_parked` were not read in this run (no OpenTelemetry collector was running); the unit test `OutboxTests.TheMeterCountsEachFailedAttemptByKindAndTheParkingOnce` checks them.
- The two other fixes in the runbook (deploy a version that reads the payload or knows the event type; repair the payload) were not run, and no later real event was shown waiting behind the failed one on the live stack (the unit test `NewEventsAddedToAParkedOrderWaitBehindTheFailedOneAndDoNotUnparkIt` covers that).
- The consumers (the vendor read model, pickup fulfillment, notifications) were not observed.
- Data Explorer was not used; a deployed environment does not exist.

## Teardown

The stack was stopped (`artifacts/mobile/STOP`) and `docker compose --profile with-redis down` removed the containers and their data, including the edited order.
