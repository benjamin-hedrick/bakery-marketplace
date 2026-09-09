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

```mermaid
graph LR
    classDef command fill:#4A90D9,color:#fff
    classDef aggregate fill:#F2D14C,color:#000
    classDef event fill:#E8873A,color:#fff
    classDef policy fill:#B07CC6,color:#fff
    classDef readmodel fill:#5CB85C,color:#fff
    classDef external fill:#D9748A,color:#fff

    C1[Checkout]:::command --> A1[Order]:::aggregate
    A1 --> E1[OrderPlaced]:::event
    E1 --> P1["Policy: Notification sends confirmation"]:::policy
    A1 --> S1[Stripe: charge]:::external

    C2[CustomizeOrder]:::command --> A1
    A1 --> E2[OrderCustomized]:::event

    C3[SchedulePickup]:::command --> A1
    A1 --> E3[PickupWindowScheduled]:::event

    C4[MarkReadyForPickup]:::command --> A1
    A1 --> E4[OrderReadyForPickup]:::event
    E4 --> P2["Policy: order-status-readmodel updates"]:::policy
    P2 --> RM1[order-status-readmodel]:::readmodel

    C5[CompleteOrder]:::command --> A1
    A1 --> E5[OrderCompleted]:::event
    E5 --> P3["Policy: eligible for review; triggers payout reconciliation"]:::policy
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
