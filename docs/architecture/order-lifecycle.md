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
- **Confirm** is the vendor accepting the order. If a pickup window was requested it is scheduled at the same time (`PickupWindowScheduled`); there is no counter-offer in v1. An order with no window (the vendor or item does not use windows) confirms without that event.
- **Cancel** carries an actor and a reason code, never free text (it may contain personal data):

| Actor | Allowed from | Reason codes |
|---|---|---|
| Customer | Placed, Confirmed | `CustomerRequested` |
| Vendor | Placed (a decline), Confirmed, InPreparation, ReadyForFulfillment | `VendorDeclined` (Placed only), `VendorCancelled` |

- **No system cancellation (2026-10-28).** A response timeout that auto-cancels a `Placed` order was considered and deferred (open item 55): it would need an owner (a timer in `ordering-service`) and a duration nobody has chosen. Until then a customer can cancel their own `Placed` order. A pickup no-show is handled by the vendor cancelling a `ReadyForFulfillment` order.
- A Pending order cannot be cancelled (it is abandoned), and Completed and Cancelled are final. Any other transition, including repeating the current one, throws `InvalidOrderTransitionException`.
- **Sequence numbers** count events, not transitions. Each raised event takes the next number, so consumers (ADR-0003) see no gaps. `Place` raises event 1; `Confirm` raises two (`OrderConfirmed`, then `PickupWindowScheduled` when there is a window).
- **Authorization is not in the aggregate.** It knows the actor of a cancellation, but who may call which transition (a vendor only for their own orders) is enforced by the service layer (ADR-0006).

## Events

| Transition | Event(s) | Payload |
|---|---|---|
| Place | `OrderPlaced` | existing |
| Confirm | `OrderConfirmed`, then `PickupWindowScheduled` if a window exists | `OrderConfirmed` new; scheduled existing |
| StartPreparation | `OrderPreparationStarted` | new |
| MarkReady | `OrderReadyForPickup` | existing |
| Complete | `OrderCompleted` | existing |
| Cancel | `OrderCancelled` (actor, reason) | new |

## Not defined yet

Stock and availability (open items 51, 52), payment timing (53), vendor endpoints (54), vendor-response timeout (55), no-shows (56), refunds (57). Open items 58 to 60 record the effects on the first-slice decisions, event schemas and accounts.
