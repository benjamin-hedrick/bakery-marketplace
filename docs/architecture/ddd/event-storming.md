# Event Storming Session Output

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
    A1 --> E3[PickupWindowScheduled]:::event
    E2 --> P2["Policy: Notification sends confirmation to the customer"]:::policy
    E2 --> S2["Stripe: capture"]:::external

    C3[StartPreparation - vendor]:::command --> A1
    A1 --> E4[OrderPreparationStarted]:::event
    E4 --> P3["Policy: order-status-readmodel updates"]:::policy
    P3 --> RM1[order-status-readmodel]:::readmodel

    C4[MarkReadyForPickup - vendor]:::command --> A1
    A1 --> E5[OrderReadyForPickup]:::event
    E5 --> P3

    C5[CompleteOrder - vendor]:::command --> A1
    A1 --> E6[OrderCompleted]:::event
    E6 --> P4["Policy: eligible for review; triggers payout reconciliation"]:::policy

    C6["CancelOrder - customer, or vendor (also a decline)"]:::command --> A1
    A1 --> E7[OrderCancelled]:::event
    E7 --> P5["Policy: release authorization and stock; notify the other party"]:::policy
    E7 --> P3
```

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

Consistent with `project-process-framework/core/context-completeness.md`'s framing — this isn't a gap to be embarrassed about, it's exactly what the exercise is for. Four real business moments (a review being submitted, a payout actually reconciling, a moderation decision going either way) existed operationally but had no named event anywhere before this document was written. Both `glossary.md` and `data-model-api-contracts.md` were corrected as part of this same item, not left for a future cleanup pass.

## Related

- `docs/architecture/ddd/glossary.md` — updated with the 4 new events
- `docs/architecture/data-model-api-contracts.md` — `ordering-service` and `admin-service` event lists updated to match
- ADR-0003 — the delivery semantics (at-least-once, per-aggregate sequencing) these new events follow, same as every other event
