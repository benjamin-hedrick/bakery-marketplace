# Runbook: a listing's outbox is parked

> **Status:** Current · written and tested 2026-11-18 on the local stack (nothing is deployed); the run is recorded in [`docs/evidence/runbook-parked-listing-outbox-2026-11-18.md`](../../evidence/runbook-parked-listing-outbox-2026-11-18.md). Template: [`template.md`](template.md). Register item 203; decision ADR-0003; pattern: [`patterns.md`](../../architecture/patterns.md) section 3. The order outbox has the same rule and its own runbook: [`parked-order-outbox.md`](parked-order-outbox.md).

`catalog-service` stores each listing and its events in one document in the `catalog` container; the events (`ListingPublished`, `LowStockDetected`) wait in the document's `outbox` until they are published, in sequence order. A publish that fails because the broker is unreachable is retried for as long as it takes. Any other failure, one that retrying may never fix, is counted on the entry (`attempts`); at 5 (`Outbox:MaxPublishAttempts`) the listing's outbox is **parked**: `parkedAt` is set, `pendingSince` is removed, and neither the relay nor the inline path tries it again. Later events of that listing wait behind the failed one; nothing is dropped. Only a person can take it out again: the service has an unpark operation (`ListingEventPublisher.UnparkAsync`) with no HTTP or admin action calling it yet (that waits for the admin epic), so the steps below edit the document.

## Symptom

`catalog-service` logs, at error level, `Listing <id>: event <type> #<n> failed 5 times; the listing's outbox is parked and will not be retried until it is unparked`. Before it, five warnings `Event <type> #<n> of listing <id> could not be published; it stays pending`, each with the exception (for example `System.Text.Json.JsonException` for a payload that cannot be read, or `InvalidOperationException: No payload type is known for event type '<type>'`), and the relay's `Catalog outbox relay: 1 listing(s) had unpublished events; 0 event(s) published` on each sweep.

## How it is detected

What exists today:

- The error log line above, and the warnings with the exception, in the `catalog-service` log.
- The counters `listing_outbox_parked` (one per listing parked, tagged with the event type) and `listing_outbox_publish_failed` (tagged with the event type and `kind`: `transport` or `other`), in the meter `CatalogService.Outbox`. They leave the process only when an OpenTelemetry endpoint is set (`OTEL_EXPORTER_OTLP_ENDPOINT`, ADR-0016); the threshold is in [`monitoring-alerting.md`](../monitoring-alerting.md) (any parking is critical).
- A query of the `catalog` container, which finds every parked listing (step 1).

What does not exist: an alert on the counter (no deployed monitoring), and a count of parked listings the service reports by itself.

## Customer impact

None today. The listing itself is stored and correct: customers see it, its stock and price, and can order it (checkout reads the listing, not its events). What falls behind is everything built from this listing's events, and nothing subscribes to `ListingPublished` or `LowStockDetected` yet (read in the code, 2026-11-18): when a consumer exists (a low-stock notice to the vendor, a search index), it misses this listing's events until the outbox is unparked, and then gets them in order. Other listings are not affected.

## Steps

1. **Find the parked listings.** In Data Explorer (locally `http://localhost:1234`, database `bakery`; deployed, the Azure portal's Data Explorer of the account), on the `catalog` container, which also holds stock reservations and the vendors' status, so the query names the record kind:
   ```sql
   SELECT c.id, c.vendorId, c.parkedAt, c.outbox FROM c WHERE c.docType = 'listing' AND c.parkedAt > 0
   ```
   Each row is one parked listing; `vendorId` is the partition key. `parkedAt` is Unix milliseconds. The entry that failed is the one with `attempts` 5 (the lowest `sequenceNumber`).
2. **Read the cause** from the warnings for that listing and event in the `catalog-service` log (the exception of each attempt). Do not unpark yet.
3. **Fix the cause.** Which fix depends on the exception:
   - **A payload the service cannot read** (a `JsonException`, for example written before a schema change): either deploy a version of `catalog-service` that reads it, or repair the entry's `payload` (a JSON string of the event's payload record) to the current shape. The owner of the event schema decides which (ADR-0003: a breaking change gets a new versioned event type).
   - **An event type the service does not know** (`No payload type is known`): the fix is in code (the publisher's list of event types), deployed before step 4.
   - **An entry that should never have existed:** remove it from `outbox`. Consumers will never see that event; record the decision and the event id in the incident notes.
   Only the last of the three was run (2026-11-18). The other two were read in the code, not run.
4. **Unpark**: edit the same document in Data Explorer, re-read just before you edit it, and save:
   - remove `parkedAt`;
   - remove `attempts` from every entry in `outbox`;
   - if `outbox` still has entries, set `pendingSince` to the smallest `occurredAt` among them, in Unix milliseconds; if it is empty, remove `outbox` and `pendingSince`.
   Change nothing else: not the `eventId`, `sequenceNumber` or order of the entries, and not the listing's own fields (`version`, stock, status). The same changes are what `UnparkAsync` makes.
5. **Wait for the relay.** It sweeps every 5 seconds while it finds work and backs off to 60 seconds while it does not, and it skips events newer than 3 seconds; it takes the listing on its next sweep.

## Verify recovery

- The query of step 1 no longer returns the listing.
- The listing's `outbox` is empty (or absent) within about a minute, and the log shows `Catalog outbox relay: <n> listing(s) had unpublished events; <m> event(s) published` with `<m>` above zero, unless the fix removed the only entry, in which case there is nothing to publish.
- No new `could not be published` warning names the listing. If one does, the cause is not fixed: it parks again after 5 more attempts.

## What not to do

- **Unpark without fixing the cause.** The relay tries again and the listing parks again after 5 more attempts (observed 2026-11-18).
- **Remove an entry to clear the alert** without deciding that its event should never reach a consumer: it is gone for good.
- **Change an entry's `eventId` or `sequenceNumber`, or reorder the entries.** Event ids are derived from the listing, its version and the event type, consumers deduplicate on them and rely on the per-listing order.
- **Change the listing's `version` or stock.** The version is the sequence number of the listing's next events, and stock is changed only by reservations and the vendor; the listing is fine, only its outbox needs attention.
- **Save over a newer version.** Data Explorer replaces the whole document, and a checkout reserving stock writes the same document; re-read it immediately before editing so a reservation or a vendor's edit in between is not lost.

## Escalate when

- More than one listing is parked, or the same event type parks again: the cause is probably in the code or a schema change, not in one document. Escalate to the engineer who owns `catalog-service` and the event schemas.
- The fix is a code change (an unknown event type, a payload the current version cannot read): the same owner.
- The payload repair is not obvious from the schema: do not guess; the same owner.

## Last tested

2026-11-18, local stack (Docker Compose infrastructure, the seed, catalog with the Redis cache, ordering, the BFF and the customer web app from source), nothing deployed. An entry with a payload that is not JSON was added to a published listing; the relay parked it after 5 attempts in about 4 minutes; it was found with the step 1 query; unparked without a fix it parked again after 5 more attempts; with the entry removed and unparked it stayed clear. The document edits of steps 1 and 4 were applied through the Cosmos SDK with the same changes, not through the Data Explorer screen. Evidence: [`runbook-parked-listing-outbox-2026-11-18.md`](../../evidence/runbook-parked-listing-outbox-2026-11-18.md).
