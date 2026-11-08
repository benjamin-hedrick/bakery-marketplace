# ADR-0001: Fulfillment Strategy Extensibility — Pickup-Only v1, Delivery Deferred

**Status:** Accepted, amended 2026-10-30

## Context

The marketplace connects customers to shops and independent vendors for pickup of baked goods and coffee. A stated priority is fast, focused time-to-market on a small MVP — but the business direction is clear that **delivery/dispatch is a near-certain future requirement**, not a speculative one.

Delivery introduces real complexity: a new Courier actor, geolocation-based dispatch matching, ETA computation, cold-chain/time-sensitive handling, and a fulfillment state machine layered on top of the Order lifecycle. Building it in v1 would double scope and risk diluting the two things that actually differentiate this product — dietary-safety-first discovery and low-friction small/home vendor onboarding.

The risk we want to avoid is the opposite failure mode: building pickup-only with no seam, then having to rework the Order aggregate, event contracts, and client apps when delivery is eventually added.

## Decision

Introduce a **Fulfillment Strategy** abstraction as the boundary between Ordering and however an order actually reaches the customer.

- The `Order` aggregate owns only fulfillment-agnostic concepts: a `FulfillmentType` (`Pickup` | `Delivery`), a `FulfillmentDetails` value object whose internal shape is strategy-specific, and a status vocabulary that doesn't assume pickup: `Placed → Confirmed → InPreparation → ReadyForFulfillment → Completed` (or `Cancelled`).
- v1 implements exactly **one** concrete strategy: `PickupFulfillment` — schedules a Pickup Window, transitions `ReadyForFulfillment → Completed` on customer pickup confirmation.
- Ordering communicates with any Fulfillment Strategy **only through published domain events** (`OrderReadyForFulfillment`, `OrderFulfillmentCompleted`), never a direct synchronous call. This is the Anticorruption Layer boundary named in the bounded context map — a future `DeliveryFulfillment` strategy (introducing Courier, dispatch, ETA) subscribes to the same events without Ordering ever needing to know it exists.
- No courier/dispatch code, schema, or UI is built in v1. The only v1 artifact representing delivery is this ADR plus a minimal `FulfillmentStrategy` interface with a single implementation.

## Consequences

**Positive**
- v1 scope stays small — pickup only — supporting the time-to-market priority.
- Extensibility is demonstrated architecturally without paying the cost of building it: a reviewer can inspect the seam and judge whether it would actually hold.
- The Order aggregate stays fulfillment-agnostic, so adding Delivery later should require only additive changes (a new `FulfillmentDetails` shape, new event subscribers) rather than a breaking change to the core state machine.

**Negative / risks**
- A single-implementation interface risks looking like premature abstraction if the reasoning isn't visible — mitigated by this ADR being explicit that the driver is a known future requirement, not speculative generality.
- The seam is a guess until delivery is actually built; it may need revisiting once real dispatch requirements are known. This ADR should be revisited (not silently reworked) if that happens.

## Alternatives considered

1. **Build delivery in v1 alongside pickup.** Rejected — doubles scope, dilutes the core differentiators, risks not shipping a demoable product on time.
2. **Hard-code pickup-only, no abstraction, revisit entirely later.** Rejected — this is the failure mode we're specifically trying to avoid; without the event-based seam, adding delivery later would likely require touching the Order aggregate's core state machine, and it wouldn't demonstrate any extensibility story at all.
3. **Model both Pickup and Delivery now, implement Delivery as a UI/API stub.** Rejected — adds surface area without adding real functionality; a documented ADR plus a real interface communicates the same intent more honestly and more cheaply.

## Related

- Bounded context map — Ordering → Fulfillment Strategy (ACL edge)
- Glossary — `Fulfillment Strategy` term
- `docs/product/scope.md` — MVP line (Fulfillment: delivery/dispatch listed as Deferred)

## Amendment note (2026-10-30: as built)

The decision is unchanged. What exists, checked against the code and `docs/architecture/order-lifecycle.md`:

- The seam is built: the Order is fulfillment-agnostic, raises `OrderReadyForFulfillment`, and accepts `OrderFulfillmentCompleted` as the inbound event; the contracts are in `tools/BakeryMarketplace.EventSchemas/FulfillmentContracts.cs`.
- `PickupFulfillment` (`WI-ORD-003`) is **not built**. `PickupWindowScheduled` and `OrderReadyForPickup`, which the lifecycle assigns to it, are raised by nothing yet. Until it exists, a vendor completes an order through a direct command (`POST /ordering/orders/{id}/complete`), so the events-only contract holds in the design but not yet on the complete path.
- The status vocabulary gained `Pending` (the customer building the order, before `Placed`), and cancellation follows an actor and reason table instead of "any state". Both are in the lifecycle document.

## Amendment note (2026-11-07: how `PickupFulfillment` will be built)

The decision is unchanged. Agreed with the lead on 2026-11-07 (not built yet; the design and the open decision are in `WI-ORD-003`): `PickupFulfillment` becomes a real, separate event consumer inside ordering-service, so the events-only rule holds in the running system and not only in the design. The vendor's "Handed over" no longer calls the Order directly: the `complete` endpoint checks the order and publishes a new seam event, `OrderFulfillmentConfirmationRequested`; the strategy answers with `OrderFulfillmentCompleted`; the Order's handler of that event completes the order. Completion is therefore eventual (the endpoint answers 202), and a test will show that the Ordering core has no reference to the strategy's types. The strategy also raises `PickupWindowScheduled` and `OrderReadyForPickup`, and the customer notifications are sent from the pickup events. One thing the build must settle, because the event transport's consumer group is per service and event type: how a second consumer inside one service gets its own group (a second transport identity, or a consumer name on the subscription interface).

## Amendment note (2026-11-07: `PickupFulfillment` built)

The decision is unchanged. `PickupFulfillment` is built as agreed on 2026-11-07 (`WI-ORD-003`; local only): a separate event consumer inside ordering-service, with its own consumer group through a new optional `consumerName` on `IEventSubscriber.SubscribeAsync` and `SubscribeBatchAsync` (the lead's decision of 2026-11-07; a duplicate name on one transport throws at subscription, and dead letters name the consumer). The `complete` endpoint publishes `OrderFulfillmentConfirmationRequested` and answers 202; the strategy answers with `OrderFulfillmentCompleted`; the Order's handler completes the order. The strategy raises `PickupWindowScheduled` and `OrderReadyForPickup` with deterministic event ids, and the customer notifications follow those events. A test shows the Ordering core has no reference to the strategy's types. The seam is proved for exactly one strategy; whether it would hold for delivery is still a judgement, not something this build shows.
