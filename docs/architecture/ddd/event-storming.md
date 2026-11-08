# Event Storming Session Output

> **Status:** Snapshot · the session was run in September 2026; flow 2 was updated 2026-10-28 and the built-state table below on 2026-10-30. This is a design model: policies, notifications and payment steps are intended behavior, not all built.

Walks the main business processes end-to-end: Command → Aggregate → Domain Event → Policy/Reaction → Read Model, in process order. This exercise surfaced four events that existed as real business moments but had never been named anywhere — `ReviewSubmitted`, `PayoutReconciled`, `ListingApproved`, `ListingRejected` — added to `docs/architecture/ddd/glossary.md` and to the relevant services' event lists in `docs/architecture/data-model-api-contracts.md` as part of this exercise, not left living only in this document.

## Legend

🔵 Command · 🟨 Aggregate · 🟧 Domain Event · 🟪 Policy/Reaction · 🟩 Read Model · 🟥 External System

## Flow 1 — Vendor Onboarding & Listing Publication

```mermaid
graph LR
    classDef command fill:#4A90D9,color:#fff
    classDef aggregate fill:#F2D14C,color:#000
    classDef event fill:#E8873A,color:#fff
    classDef policy fill:#B07CC6,color:#fff
    classDef readmodel fill:#5CB85C,color:#fff

    C1[ApplyAsVendor]:::command --> A1[VendorProfile]:::aggregate
    A1 --> C2[VerifyVendor]:::command
    C2 --> E1[VendorVerified]:::event
    E1 --> P1["Policy: Catalog allows this vendor's listings to be Published"]:::policy

    C3[CreateListing]:::command --> A2[Listing]:::aggregate
    A2 --> C4[PublishListing]:::command
    C4 --> E2[ListingPublished]:::event
    E2 --> P2["Policy: Admin moderation queue picks up new listing"]:::policy
    P2 --> RM1[moderation-queue]:::readmodel
```

## Flow 2 — Order Lifecycle

> **Updated 2026-10-28** (`docs/architecture/order-lifecycle.md`): the flow now starts with the customer building a Pending order, adds the vendor's confirmation step, cancellation (including a vendor decline and a response timeout) and authorize-then-capture payment. `OrderCustomized` / `CustomizeOrder` are removed from the flow: customization happens while the order is Pending. Payment timing is a direction, not yet an ADR amendment (open item 53).

```mermaid
graph LR
    classDef command fill:#4A90D9,color:#fff
    classDef aggregate fill:#F2D14C,color:#000
    classDef event fill:#E8873A,color:#fff
    classDef policy fill:#B07CC6,color:#fff
    classDef readmodel fill:#5CB85C,color:#fff
    classDef external fill:#D9748A,color:#fff

    C1[PlaceOrder]:::command --> A1[Order]:::aggregate
    A1 --> E1[OrderPlaced]:::event
    E1 --> P1["Policy: Notification tells the vendor a new order awaits confirmation"]:::policy
    A1 --> S1["Stripe: authorize (capture at confirm)"]:::external

    C2[ConfirmOrder - vendor]:::command --> A1
    A1 --> E2[OrderConfirmed]:::event
    E2 --> P6["Policy: PickupFulfillment schedules the requested window"]:::policy
    P6 --> E3[PickupWindowScheduled]:::event
    E2 --> P2["Policy: Notification sends confirmation to the customer"]:::policy
    E2 --> S2["Stripe: capture"]:::external

    C3[StartPreparation - vendor]:::command --> A1
    A1 --> E4[OrderPreparationStarted]:::event
    E4 --> P3["Policy: order-status-readmodel updates"]:::policy
    P3 --> RM1[order-status-readmodel]:::readmodel

    C4[MarkReady - vendor]:::command --> A1
    A1 --> E5[OrderReadyForFulfillment]:::event
    E5 --> P7["Policy: PickupFulfillment tells the customer it is ready"]:::policy
    P7 --> E8[OrderReadyForPickup]:::event
    E5 --> P3

    C5[ConfirmPickup - vendor, handled by PickupFulfillment]:::command --> E9[OrderFulfillmentCompleted]:::event
    E9 --> A1
    A1 --> E6[OrderCompleted]:::event
    E6 --> P4["Policy: eligible for review; triggers payout reconciliation"]:::policy

    C6["CancelOrder - customer, or vendor (also a decline)"]:::command --> A1
    A1 --> E7[OrderCancelled]:::event
    E7 --> P5["Policy: release authorization and stock; notify the other party"]:::policy
    E7 --> P3
```

### Flow 2: what is built (table of 2026-10-30, rows added to 2026-11-07)

| Element | State |
|---|---|
| Commands `PlaceOrder`, `ConfirmOrder`, `StartPreparation`, `MarkReady`, `CancelOrder` and the events `OrderPlaced`, `OrderConfirmed`, `OrderPreparationStarted`, `OrderReadyForFulfillment`, `OrderCompleted`, `OrderCancelled` | Built in the Order aggregate and the vendor and customer action endpoints. Orders with no option and no requested window confirm themselves at checkout |
| `ConfirmPickup` and `OrderFulfillmentCompleted`, `PickupWindowScheduled`, `OrderReadyForPickup` (the `PickupFulfillment` policies) | Built 2026-11-07 (`WI-ORD-003`, In review): `PickupFulfillment` is a separate consumer inside ordering; the vendor's hand-over answers 202 and the order completes on `OrderFulfillmentCompleted` |
| Policy "order-status-readmodel updates" and the read model | Built (`WI-QUE-001`, with the live queue, `WI-QUE-003`) |
| Policies that notify the vendor or the customer | The customer's messages are built (`notification-service`, `WI-NOT-001`, `NOT-002`, local sender only); the vendor is notified by the live queue, not a message |
| Stripe authorize and capture | Not built; a named stub judges a saved payment method's token (`WI-ORD-010`) and no money moves |
| "release authorization and stock" on cancel | Stock release is built; there is no authorization to release |
| "eligible for review; triggers payout reconciliation" | Not built |

## Flow 3 — Review & Payout *(this exercise named 2 new events here)*

```mermaid
graph LR
    classDef command fill:#4A90D9,color:#fff
    classDef aggregate fill:#F2D14C,color:#000
    classDef event fill:#E8873A,color:#fff
    classDef policy fill:#B07CC6,color:#fff
    classDef external fill:#D9748A,color:#fff

    C1[SubmitReview]:::command --> A1[Review]:::aggregate
    A1 --> E1["ReviewSubmitted (NEW)"]:::event

    S1[Stripe webhook]:::external --> C2[ReconcilePayout]:::command
    C2 --> A2[Payout]:::aggregate
    A2 --> E2["PayoutReconciled (NEW)"]:::event
    E2 --> P1["Policy: available for observability/audit trail (OBS-001)"]:::policy
```

## Flow 4 — Listing Moderation *(this exercise named 2 new events here)*

```mermaid
graph LR
    classDef command fill:#4A90D9,color:#fff
    classDef aggregate fill:#F2D14C,color:#000
    classDef event fill:#E8873A,color:#fff
    classDef policy fill:#B07CC6,color:#fff

    C1[ApproveListing]:::command --> A1[Listing]:::aggregate
    A1 --> E1["ListingApproved (NEW)"]:::event

    C2[RejectListing]:::command --> A1
    A1 --> E2["ListingRejected (NEW)"]:::event
    E2 --> P1["Policy: Listing reverts to Draft status"]:::policy
```

## What this exercise found

This is context completeness at work (`docs/method/glossary.md`): finding events that existed operationally but had never been named isn't a gap to be embarrassed about, it's exactly what the exercise is for. Four real business moments (a review being submitted, a payout actually reconciling, a moderation decision going either way) existed operationally but had no named event anywhere before this document was written. Both `glossary.md` and `data-model-api-contracts.md` were corrected as part of this same item, not left for a future cleanup pass.

## Related

- `docs/architecture/ddd/glossary.md` — updated with the 4 new events
- `docs/architecture/data-model-api-contracts.md` — `ordering-service` and `admin-service` event lists updated to match
- ADR-0003 — the delivery semantics (at-least-once, per-aggregate sequencing) these new events follow, same as every other event
