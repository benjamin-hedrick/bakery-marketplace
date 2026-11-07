> **Status:** In progress · remaining: pickup windows are built (2026-10-28); `PickupFulfillment` itself is designed and agreed (2026-11-07) and is the first build of the next session; one decision is open (decision 2 below)

```
WI ID:               ORD-003
Title:                PickupFulfillment strategy implementation
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               In progress
Size:                 M
```

> **Rewritten 2026-11-07 to the current design (agreed with the lead the same day, option A: build it as ADR-0001 designed it).** Git keeps the original. What changed from the original text: "customer pickup confirmation" is the vendor's "Handed over" (that is what the product has); the strategy is its own event consumer; the vendor's "Handed over" becomes a request the strategy answers (eventual completion); the strategy's events feed the customer notifications. Earlier notes kept: `PickupSchedule` (the deterministic window source and the lead-time check, 8:00 to 17:00 Eastern in UTC) was built with `WI-ORD-001` because checkout must validate the window, and `GET /ordering/pickup-windows?vendorId=` is built on it (anonymous, `Cache-Control: no-store`, UTC, today's remaining slots plus two more days; 9 tests; per-vendor hours, per-slot capacity and stock tied to a window are deferred, `docs/architecture/first-slice-contract.md` D-3 and D-8). The event layering is from open item 59 (reconciliation note 2026-10-28): the Order raises business facts and the seam events, the strategy raises the pickup-specific ones.

**Context / Why**
ADR-0001 names one concrete strategy for v1, pickup, and says Ordering talks to any strategy **only through published domain events, never a direct synchronous call**. Today the seam is half built: the Order is fulfillment-agnostic and raises `OrderConfirmed` and `OrderReadyForFulfillment`, but no strategy exists, `PickupWindowScheduled` and `OrderReadyForPickup` are raised by nothing, and the vendor's "Handed over" calls `Order.Complete` directly (a comment in `OrderActionService` says it moves behind `PickupFulfillment` when this item lands). This item builds the strategy and moves completion behind the seam, so a reviewer can inspect the seam and judge whether it would hold for delivery.

**Design (agreed 2026-11-07)**
1. **`PickupFulfillment` is its own consumer** inside ordering-service (a hosted subscriber in a `Fulfillment/` module). It listens to three events:
   - `OrderConfirmed` of type Pickup with a window in its details: publishes `PickupWindowScheduled`. No window, or another type: nothing.
   - `OrderReadyForFulfillment` of type Pickup: publishes `OrderReadyForPickup`.
   - `OrderFulfillmentConfirmationRequested` (below): publishes `OrderFulfillmentCompleted`. For pickup the strategy accepts the vendor's confirmation; a delivery strategy would want courier proof.
   - The events it publishes carry **deterministic event ids** derived from the triggering event and the type, so a redelivery produces the same id and consumers dedupe. Its handlers are idempotent; a handler that fails is redelivered and then dead-lettered like any consumer.
2. **A new seam event, `OrderFulfillmentConfirmationRequested`** (`OrderId`, `VendorId`, `CustomerId`, `FulfillmentType`, `RequestedAt`), a **plain integration event published by the `complete` endpoint** (lead's decision 3): the endpoint checks that the order is the vendor's and is `ReadyForFulfillment` (404 and 409 as today), publishes the event and returns; it changes nothing in the Order, so there is no outbox entry and no atomicity problem (a failed publish fails the request and the vendor presses again).
3. **An order-side handler** consumes `OrderFulfillmentCompleted` and calls `Order.Complete` (stored with its `OrderCompleted` event in one write, published through the outbox as now). It is idempotent (an order already completed is left alone), ignores an order that is no longer `ReadyForFulfillment` (cancelled in the meantime: logged, not an error) and an unknown order, and retries a lost write race like the action service does.
4. **Eventual completion (lead's decision 1, accepted).** `POST /ordering/orders/{id}/complete` returns **202** with the order as it is (`ReadyForFulfillment`); the order shows `Completed` moments later on the vendor's stream and the customer's next poll. The BFF client accepts 202 for the `COMPLETE` action (`VendorOrderActionDone.status` is then the status when the request was accepted; the schema comment says so), and the vendor screen's buttons, which already stay off until the order shows a new status, come back after a **timeout (about 15 seconds) with "Still waiting, try again"**, so a lost completion is never a dead card (the order is still `ReadyForFulfillment`, so pressing again works).
5. **Customer notifications follow the pickup events (lead's decision 4: now).** `OrderReadyForPickupPayload` gains optional `VendorId`, `CustomerId`, `WindowStart`, `WindowEnd` and `Instructions` (additive, like the lifecycle events did on 2026-11-01); `PickupWindowScheduledPayload` gains optional `VendorId` and `CustomerId`. notification-service's "ready" message moves from `OrderReadyForFulfillment` to `OrderReadyForPickup` (the customer-facing message belongs to the strategy), and "pickup window scheduled" becomes a message of its own. The vendor read model, the vendor queue and the customer pages keep following the Order's own events, unchanged.
6. **Consumer identity (OPEN, decision 2).** The event transport's consumer group is `cg:{serviceName}:{eventType}`, so two subscribers to one event type inside ordering-service would **split the messages** (each would miss some). Two ways to give the strategy its own group: (a) a second transport instance with `serviceName: "pickup-fulfillment"` (composition only; nothing shared changes; the in-memory transport ignores groups, so only Redis tests can catch a collision; dead-letter streams are per event and would not say which consumer failed); (b) a `consumerName` option on `IEventSubscriber.SubscribeAsync` (a change to the shared eventing library, both transports, the chaos decorator and the shared contract tests, about half a day; a duplicate group inside one process can fail at start-up; the in-memory transport can model groups; dead letters can name the consumer). **Recommendation: (b)**, because silent message splitting is the dangerous failure and (a) cannot be tested without Redis. The lead decides at the start of the build.

**Inputs / References**
- *Decisions*: ADR-0001 (the seam, events only), ADR-0003 (events, consumer groups, at-least-once), ADR-0009 (co-located contexts talk through the same interfaces they would if separate), register item 29 (consumer-group naming), item 59 (event layering).
- *Interfaces*: `FulfillmentType`, `FulfillmentDetails`, `OrderReadyForFulfillmentPayload`, `OrderFulfillmentCompletedPayload` (`tools/BakeryMarketplace.EventSchemas`), `IEventPublisher` and `IEventSubscriber`, `OrderStore`, `OrderActionService`, `docs/architecture/order-lifecycle.md`.

**You do not need to know about**
- Any future Delivery strategy: this item proves the seam works for exactly one implementation.

**Out of scope**
- A new order status or a change to the Order's state machine (it keeps `Placed, Confirmed, InPreparation, ReadyForFulfillment, Completed, Cancelled`); a customer's own pickup confirmation (the vendor confirms); a refund or a no-show rule; the notification provider (still a recording or logging sender).

**Requirements / Acceptance Criteria**
- `PickupFulfillment` is a separate consumer with the three subscriptions and the deterministic event ids of design 1; a Delivery order and a Pickup order without a window are left alone.
- `complete` publishes `OrderFulfillmentConfirmationRequested` and returns 202; 404 for another vendor's order and 409 when the order is not `ReadyForFulfillment`, as today; two presses give one completion.
- The order-side handler completes the order once; a cancelled or unknown order is ignored; a duplicate delivery changes nothing.
- The order reaches `Completed` through the events only: **a test shows that the Ordering core (`Orders`, `Checkout`, `Domain`) has no reference to the strategy's types**, and an end-to-end test (in-memory transport, and Redis where available) runs place, confirm, start, ready and hand over using the event contract only.
- Two consumers of one event type in ordering-service both receive every message (decision 2; shown on Redis).
- The BFF accepts 202 for `COMPLETE`; the vendor screen shows the "Still waiting" note after its timeout; the real-stack journeys that expect `COMPLETED` at once wait for it.
- notification-service sends the "ready" message from `OrderReadyForPickup` and a message for `PickupWindowScheduled`; its existing tests and Redis test are updated.
- `docs/architecture/order-lifecycle.md`, ADR-0001's amendment note and `WI-ORD-007` say what was built.

**Dependencies**
- Blocked by: `ORD-004` (done). Touches `ORD-007` (the `complete` endpoint) and `NOT-001`, `NOT-002` (the ready message).
- Needs the lead's decision 2 first; needs approval before any change to the core order path (given for the design on 2026-11-07).

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes for the strategy, the handler and the tests; the lead reviews the change to the `complete` path and the eventing library change if (b) is chosen.
