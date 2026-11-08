# Order lifecycle (pickup v1)

Agreed with the human lead on 2026-10-28 from a review of the intended functionality. This is the behavior `WI-ORD-002` implements as an in-memory aggregate; persistence (`ORD-006`), publishing (`ORD-005`), checkout (`ORD-001`) and pickup windows (`ORD-003`) build on it. Status names follow ADR-0001 (fulfillment-agnostic) and `FulfillmentContracts.cs`.

```
Pending --Place--> Placed --Confirm--> Confirmed --StartPreparation--> InPreparation --MarkReady--> ReadyForFulfillment --Complete--> Completed
(customer arranging)  (options, customization,   (vendor accepts; the requested
                       requested window)          window is scheduled)

Cancel (actor and reason code):   Placed, Confirmed                    --> Cancelled   by the customer or the vendor
                                  InPreparation, ReadyForFulfillment   --> Cancelled   by the vendor only
```

## Rules

- **Pending** is the customer's order while it is being built: lines and their modifiers can be added or removed, and a pickup window can be set if the vendor or item allows one. A Pending order raises no events and has sequence number 0. In the first slice the cart lives in the browser (D-2), so checkout creates and places an order in one call.
- **Customization is part of building the order.** There is no change to a placed order, so no post-placement `Customize`; the glossary's `OrderCustomized` event is unused (retire it when nothing references it).
- **Place** requires 1 to 10 lines, each 1 to 20 units (D-5 placeholders until per-item maximums exist, open item 51). Prices are integer cents set by `ordering-service` (D-1); the aggregate checks that totals add up.
- **Confirm** is the vendor accepting the order. The strategy then schedules a requested pickup window (`PickupWindowScheduled`, raised by `PickupFulfillment`, not by the Order); there is no counter-offer in v1. An order with no window (the vendor or item does not use windows) confirms with nothing to schedule.
- **Automatic confirmation (`WI-ORD-008`, human lead, 2026-10-28).** An order with no modifier on any line and no requested pickup window needs nothing from the vendor, so checkout confirms it in the same write that places it: `OrderPlaced` then `OrderConfirmed` with `Automatic = true`. An order with an option or a requested window stays `Placed` for the vendor. The rule ignores stock counters (option 1); a per-item or per-vendor control is the intended refinement, and `Checkout:AutoConfirm` switches the rule off. A customer can still cancel a `Confirmed` order.
- **Cancel** carries an actor and a reason code, never free text (it may contain personal data):

| Actor | Allowed from | Reason codes |
|---|---|---|
| Customer | Placed, Confirmed | `CustomerRequested` |
| Vendor | Placed (a decline), Confirmed, InPreparation, ReadyForFulfillment | `VendorDeclined` (Placed only), `VendorCancelled` |

- **No system cancellation (2026-10-28).** A response timeout that auto-cancels a `Placed` order was considered and deferred (open item 55): it would need an owner (a timer in `ordering-service`) and a duration nobody has chosen. Until then a customer can cancel their own `Placed` order. A pickup no-show is handled by the vendor cancelling a `ReadyForFulfillment` order.
- A Pending order cannot be cancelled (it is abandoned), and Completed and Cancelled are final. Any other transition, including repeating the current one, throws `InvalidOrderTransitionException`.
- **Sequence numbers** count the Order's events. Each raised event takes the next number, so consumers (ADR-0003) see no gaps. Every transition raises exactly one event, so the numbers run 1 to 5 for a normal order.
- **Authorization is not in the aggregate.** It knows the actor of a cancellation, but who may call which transition (a vendor only for their own orders) is enforced by the service layer (ADR-0006).

## Events and who raises them (ADR-0001)

The Order is fulfillment-agnostic and talks to a fulfillment strategy only through events. Three layers, each fact with one producer:

| Layer | Event | Raised by | When |
|---|---|---|---|
| Business fact | `OrderPlaced` (with `TotalCents`, `Currency`) | Order | Place |
| Business fact | `OrderConfirmed` (carries `FulfillmentType` and `Details` for the strategy) | Order | Confirm |
| Business fact | `OrderPreparationStarted` | Order | StartPreparation |
| Seam, Order to strategy | `OrderReadyForFulfillment` (type and details) | Order | MarkReady |
| Seam, strategy to Order | `OrderFulfillmentCompleted` | strategy | the fulfillment is done (pickup confirmed) |
| Business fact | `OrderCompleted` | Order | Complete, called by the handler of `OrderFulfillmentCompleted` |
| Business fact | `OrderCancelled` (actor, reason) | Order | Cancel |
| Strategy-specific | `PickupWindowScheduled`, `OrderReadyForPickup` | `PickupFulfillment` (`ORD-003`) | on `OrderConfirmed` and `OrderReadyForFulfillment` |

`OrderReadyForPickup` is the customer-facing "ready to collect" message and belongs to the pickup strategy; a delivery strategy would raise its own. The Order never reads a pickup window itself. `OrderFulfillmentCompleted` is the inbound seam event; `OrderCompleted` is the business fact everyone else (reviews, payouts, notifications) consumes.

## Order action endpoints (draft, approved 2026-10-28 to be iterated)

Implemented by `WI-ORD-007` (2026-10-28); they call the aggregate's methods and nothing else. As built: a refused or repeated action is `409` with the current status; a non-owner gets `404`; `decline` and every cancel release the held stock after the order is saved; `complete` is a direct vendor command until `PickupFulfillment` (`ORD-003`) takes it over.

| Action | Endpoint | Caller | Transition |
|---|---|---|---|
| Confirm | `POST /ordering/orders/{id}/confirm` | Vendor, owner | Placed → Confirmed |
| Decline | `POST /ordering/orders/{id}/decline` | Vendor, owner | Placed → Cancelled (`VendorDeclined`) |
| Start preparation | `POST /ordering/orders/{id}/start-preparation` | Vendor, owner | Confirmed → InPreparation |
| Mark ready | `POST /ordering/orders/{id}/ready` | Vendor, owner | InPreparation → ReadyForFulfillment |
| Complete | `POST /ordering/orders/{id}/complete` | Vendor, owner; **answers `202`** (since `WI-ORD-003`): it publishes `OrderFulfillmentConfirmationRequested`, `PickupFulfillment` answers with `OrderFulfillmentCompleted`, and its handler completes the Order moments later | ReadyForFulfillment → Completed (eventually) |
| Cancel | `POST /ordering/orders/{id}/cancel` | Vendor, owner (`VendorCancelled`; from Confirmed on) or Customer, owner (`CustomerRequested`; from Placed or Confirmed) | any allowed cancel |

- **The actor comes from the token, never the body.** Role plus ownership (the token subject equals the order's `vendorId` or `customerId`, ADR-0006) decide who is acting; the reason code is derived from the actor and the transition. Requests carry no body for these actions.
- **Responses:** `200` with the updated order (`202` with the order as it is for `complete`: the order shows `Completed` moments later); `404` when the order does not exist or the caller does not own it (no leak); `409` with the current status when the transition is not allowed (the aggregate's `InvalidOrderTransitionException`).
- **Concurrency:** the order document is saved with optimistic concurrency (`ORD-006`), so two simultaneous actions cannot both win.
- **Side effects, owned elsewhere:** each transition's events are published by `ORD-005`; releasing held stock and the payment steps follow items 52 and 53.
- Authorization and ownership are auth logic (human approval required): **approved for design and implementation on 2026-10-28, to be iterated.**

## Completion behind the fulfillment seam (`WI-ORD-003`, built 2026-11-07, local only)

Built on 2026-11-07 as agreed on 2026-11-07; this is what the `complete` row of the table above means and what the events table shows. It makes the events-only rule of ADR-0001 true in the running system: `PickupFulfillment` becomes its own event consumer; `POST /ordering/orders/{id}/complete` (the vendor's "Handed over") checks the order and publishes a new seam event, `OrderFulfillmentConfirmationRequested`, and returns **202** with the order as it is; the strategy answers with `OrderFulfillmentCompleted` (and raises `PickupWindowScheduled` on `OrderConfirmed` and `OrderReadyForPickup` on `OrderReadyForFulfillment`); the Order's handler of `OrderFulfillmentCompleted` calls `Complete`, which raises `OrderCompleted` as today. The Order's state machine and its own events do not change, so the vendor read model, the vendor queue and the customer pages are unaffected; a cancel that lands between the request and the completion wins (the handler ignores a completion for an order that is no longer `ReadyForFulfillment`). The customer's "ready for pickup" and "pickup window" messages are sent from the pickup events. The strategy is its own consumer under the consumer name `pickup-fulfillment` (its own Redis consumer group, so it receives every message beside the vendor read model); the Ordering side is `FulfillmentCompletionHandler`, and a test shows that `Orders`, `Checkout` and `Domain` have no reference to the strategy's namespace. What was built and what was run: `docs/product/backlog/WI-ORD-003.md`.

## Not defined yet

Availability windows and per-item pickup-window rules (open item 51), the stock design is ADR-0017, payment timing (53), vendor-response timeout (55, deferred), refunds (57). Pickup no-shows are handled by the vendor cancelling from ReadyForFulfillment (item 56, resolved). Open items 58 to 60 record the effects on the first-slice decisions, event schemas and accounts.
