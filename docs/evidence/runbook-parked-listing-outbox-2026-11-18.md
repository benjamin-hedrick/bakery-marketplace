# Runbook test: a listing's outbox is parked (2026-11-18)

> **Status:** Snapshot · 2026-11-18, `feature/hardening-followups` at `52251ea` plus the register 203 change (the catalog outbox's counters, uncommitted at the time of the run); local stack, nothing deployed. Register item 203. **Current result:** a listing event whose payload could not be read was retried 5 times and the listing's outbox parked, with the error log line; the parked query found it; unparked without a fix it parked again after 5 more attempts; with the entry removed and unparked, the listing left the parked query and the catalog logged nothing more for it. Runbook: [`parked-listing-outbox.md`](../operations/runbooks/parked-listing-outbox.md).

## Environment

Windows 11, Docker Desktop. The stack of `scripts/lib/local-stack.mjs`, started by a throwaway runner kept outside the repository (the same calls as `scripts/dev/demo.mjs`, with the catalog on the Redis cache as `scripts/ci/chaos-smoke.mjs` starts it for the cache scenarios, and no vendor screen): the Compose infrastructure (Redis Streams, the Cosmos vNext emulator, the mock issuer, the cache and session Redis), the seed, catalog-service (relay on, the default `Outbox` options: sweep 5 s, idle back-off to 60 s, grace 3 s, 5 attempts), ordering-service, the BFF and the customer web app from source. The catalog log was `artifacts/run166/catalog.log` (git-ignored). The register 166 outage runs of the same day used the same stack ([`dependency-outages-2026-11-18.md`](dependency-outages-2026-11-18.md)); none of them touched the catalog while this test's entry was pending, except the issuer restarts, which the relay does not use.

The document edits were made with a throwaway console program using the Cosmos SDK (`Microsoft.Azure.Cosmos` 3.63.2, gateway mode, the emulator's public key), kept outside the repository: it read the document, a small script made the runbook's changes, and the program replaced it with an If-Match on the document's ETag. The Data Explorer screen itself was not used.

## Procedure and observations

| Step | Time (UTC) | Action | Observed |
|---|---|---|---|
| 1 | 16:40:46 | On `listing-lemon-loaf-001` (vendor `vendor-indep-001`, Published, version 1, no outbox), added one outbox entry: `eventType` `ListingPublished`, `sequenceNumber` 1, a new `eventId`, `occurredAt` ten seconds earlier, `payload` the string `not json`; set `pendingSince` to that time | Saved |
| 2 | 16:40:46 to 16:44:54 | Waited for the relay | Five warnings `Event ListingPublished #1 of listing listing-lemon-loaf-001 could not be published; it stays pending`, each with `System.Text.Json.JsonException: 'not json' is an invalid JSON literal`; each sweep logged `Catalog outbox relay: 1 listing(s) had unpublished events; 0 event(s) published`; then at error level `Listing listing-lemon-loaf-001: event ListingPublished #1 failed 5 times; the listing's outbox is parked and will not be retried until it is unparked` |
| 3 | 16:45 | Read the document | `parkedAt` 1795020294546 (16:44:54.5), `pendingSince` absent, the entry kept with `attempts` 5 |
| 4 | 16:45 | Runbook step 1: `SELECT c.id, c.vendorId, c.parkedAt, c.outbox FROM c WHERE c.docType = 'listing' AND c.parkedAt > 0` on `catalog` | One row: this listing |
| 5 | 16:45:48 | Runbook step 4 **without** step 3 (no fix): removed `parkedAt` and `attempts`, set `pendingSince` to the entry's `occurredAt` | Saved; the relay took the listing again |
| 6 | 16:45:48 to 16:50:20 | Waited | Five more warnings (10 in all) and a second error line; `parkedAt` 16:50:20.6, `attempts` 5 |
| 7 | 16:50:43 | Runbook steps 3 and 4: removed the entry (it should never have existed: the fix chosen for this reproduction), removed `parkedAt`; the outbox was then empty, so `outbox` and `pendingSince` were removed | Saved; the parked query returned no rows |
| 8 | 16:50:43 to 16:52 | Watched the catalog log for 75 s (longer than the relay's 60-second idle gap) | No new outbox line naming the listing (12 before, 12 after: the 10 warnings and 2 error lines); the only new lines with its id were the request log of the read below |

Throughout, the listing stayed readable: the home page listed it while its entry was pending (16:42), and `GET /catalog/listings/listing-lemon-loaf-001` answered 200 after the fix. No service subscribes to the two listing event types (read in the code), so nothing downstream could be observed.

## Not covered

- The counters `listing_outbox_publish_failed` and `listing_outbox_parked` were not read in this run: no OpenTelemetry collector was running, and fetching `dotnet-counters` to read them from the process was not allowed in this session. The unit test `ListingOutboxTests.TheMeterCountsEachFailedAttemptByKindAndTheParkingOnce` checks them, and a mutation check (the parking counter's line commented out) made it fail.
- The two other fixes in the runbook (deploy a version that reads the payload or knows the event type; repair the payload) were not run, and no later real event was shown waiting behind the failed one on the live stack (the unit test `APublishFailureLeavesThatEventAndLaterOnesPendingSoNothingOvertakesIt` covers the order).
- `UnparkAsync` was not called on the live stack (no caller exists); its unit test is `UnparkingClearsTheMarkerAndTheCountsAndTheRelayPublishesAgain`.
- Data Explorer was not used; a deployed environment does not exist.

## Teardown

The stack was stopped by the runner and `docker compose --profile with-redis down` removed the containers and their data, including the edited listing.
