# Runbook: an order's outbox is parked

> **Status:** Current · written and tested 2026-11-18 on the local stack (nothing is deployed); the run is recorded in [`docs/evidence/runbook-parked-order-outbox-2026-11-18.md`](../../evidence/runbook-parked-order-outbox-2026-11-18.md). Template: [`template.md`](template.md). Register item 74; decision ADR-0003; pattern: [`patterns.md`](../../architecture/patterns.md) section 3.

`ordering-service` stores each order and its events in one document; the events wait in the document's `outbox` until they are published, in sequence order. A publish that fails because the broker is unreachable is retried for as long as it takes (the [broker runbook](event-broker-unavailable-during-checkout.md)). Any other failure, one that retrying may never fix, is counted on the entry (`attempts`); at 5 (`Outbox:MaxPublishAttempts`) the order's outbox is **parked**: `parkedAt` is set, `pendingSince` is removed, and neither the relay nor the inline path tries it again. Later events of that order wait behind the failed one, so nothing overtakes it, and nothing is dropped. Only a person can take it out again; there is no HTTP or admin action for it (that waits for the admin epic).

## Symptom

`ordering-service` logs, at error level, `Order <id>: event <type> #<n> failed 5 times; the order's outbox is parked and will not be retried until it is unparked`. Before it, five warnings `Event <type> #<n> of order <id> could not be published; it stays pending`, each with the exception (for example `System.Text.Json.JsonException` for a payload that cannot be read, or `InvalidOperationException: No payload type is known for event type '<type>'`).

## How it is detected

What exists today:

- The error log line above, and the warnings with the exception, in the `ordering-service` log.
- The counter `order_outbox_parked` (one per order parked, tagged with the event type) and `order_outbox_publish_failed` (tagged with the event type and `kind`: `transport` or `other`), in the meter `OrderingService.Outbox`. They leave the process only when an OpenTelemetry endpoint is set (`OTEL_EXPORTER_OTLP_ENDPOINT`, ADR-0016); the threshold is in [`monitoring-alerting.md`](../monitoring-alerting.md) (any parking is critical).
- A query of the `orders` container, which finds every parked order (step 1).

What does not exist: an alert on the counter (no deployed monitoring), and a count of parked orders the service reports by itself.

## Customer impact

The order document itself is stored and correct. What falls behind is everything built from this order's events, until it is unparked: the vendor's view of the order (the `vendor-orders` read model behind the vendor queue) keeps the status it had before the failed event, pickup fulfillment does not react to the order's later events, and the customer's notifications for them are not sent. They catch up after the fix, in order. Other orders are not affected. (Read in the code from the event subscriptions; the test checked the order and its outbox, not the consumers.)

## Steps

1. **Find the parked orders.** In Data Explorer (locally `http://localhost:1234`, database `bakery`; deployed, the Azure portal's Data Explorer of the account), on the `orders` container:
   ```sql
   SELECT c.id, c.customerId, c.parkedAt, c.outbox FROM c WHERE c.parkedAt > 0
   ```
   Each row is one parked order; `customerId` is the partition key. `parkedAt` is Unix milliseconds. The entry that failed is the one with `attempts` 5 (the lowest `sequenceNumber`).
2. **Read the cause** from the warnings for that order and event in the `ordering-service` log (the exception of each attempt). Do not unpark yet.
3. **Fix the cause.** Which fix depends on the exception:
   - **A payload the service cannot read** (a `JsonException`, for example written before a schema change): either deploy a version of `ordering-service` that reads it, or repair the entry's `payload` (a JSON string of the event's payload record) to the current shape. The owner of the event schema decides which (ADR-0003: a breaking change gets a new versioned event type).
   - **An event type the service does not know** (`No payload type is known`): the fix is in code (the publisher's list of event types), deployed before step 4.
   - **An entry that should never have existed:** remove it from `outbox`. Consumers will never see that event; record the decision and the event id in the incident notes.
   Only the last of the three was run (2026-11-18). The other two were read in the code, not run.
4. **Unpark**: edit the same document in Data Explorer, re-read just before you edit it, and save:
   - remove `parkedAt`;
   - remove `attempts` from every entry in `outbox`;
   - if `outbox` still has entries, set `pendingSince` to the smallest `occurredAt` among them, in Unix milliseconds; if it is empty, remove `pendingSince`.
   Change nothing else: not the `eventId`, `sequenceNumber` or order of the entries, and not the order's own fields.
5. **Wait for the relay.** It sweeps every 5 seconds while it finds work and backs off to 60 seconds while it does not, and it skips events newer than 3 seconds; it takes the order on its next sweep.

## Verify recovery

- The query of step 1 no longer returns the order.
- The order's `outbox` is empty (or absent) within about a minute, and the log shows `Outbox relay: <n> order(s) had unpublished events; <m> event(s) published` with `<m>` above zero, unless the fix removed the only entry, in which case there is nothing to publish.
- No new `could not be published` warning names the order. If one does, the cause is not fixed: it parks again after 5 more attempts (seen in the test).

## What not to do

- **Unpark without fixing the cause.** The relay tries again and the order parks again after 5 more attempts (observed 2026-11-18: about 5 minutes later, 10 failures in all).
- **Remove an entry to clear the alert** without deciding that its event should never reach a consumer: it is gone for good.
- **Change an entry's `eventId` or `sequenceNumber`, or reorder the entries.** Consumers deduplicate on the event id and rely on the per-order order.
- **Delete or rewrite the order.** The order is fine; only its outbox needs attention.
- **Save over a newer version.** Data Explorer replaces the whole document; re-read it immediately before editing so a vendor's action in between is not lost.

## Escalate when

- More than one order is parked, or the same event type parks again: the cause is probably in the code or a schema change, not in one document. Escalate to the engineer who owns `ordering-service` and the event schemas.
- The fix is a code change (an unknown event type, a payload the current version cannot read): the same owner.
- The payload repair is not obvious from the schema: do not guess; the same owner.

## Last tested

2026-11-18, local stack (Docker Compose infrastructure, catalog, ordering and the BFF from source via `node scripts/dev/mobile-stack.mjs`), nothing deployed. An entry with a payload that is not JSON was added to a confirmed order; the relay parked it after 5 attempts in about 4 minutes; it was found with the step 1 query; unparked without a fix it parked again after 5 more attempts; with the entry removed and unparked it stayed clear. The document edits of steps 1 and 4 were applied through the Cosmos SDK with the same changes, not through the Data Explorer screen. Evidence: [`runbook-parked-order-outbox-2026-11-18.md`](../../evidence/runbook-parked-order-outbox-2026-11-18.md).
