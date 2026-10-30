# Ubiquitous Language Glossary

> **Status:** Current · checked 2026-10-30. Domain terms only; the process vocabulary is `docs/method/glossary.md`.

## Actors

| Term | Definition |
|---|---|
| **Customer** | An end user browsing and placing orders, with an associated Preference Profile |
| **Shop** | An established, brick-and-mortar bakery/coffee shop vendor |
| **Independent Vendor** | A home-based/niche food maker selling through the marketplace, subject to the same verification flow as Shops with an added compliance checklist step |
| **Admin / Moderator** | Platform staff overseeing vendor verification and listing moderation |
| **Courier** *(v2, not built)* | Delivery actor introduced only when the Delivery Fulfillment Strategy is implemented |

## Catalog & Customization

| Term | Definition |
|---|---|
| **Listing** | A sellable item owned by a Shop or Independent Vendor |
| **Modifier** | A customization option on a Listing (e.g., milk type, size, add-in) |
| **Allergy Flag** | A tag on a Listing or Modifier indicating the presence of a specific allergen |

## Preferences & Dietary Safety

| Term | Definition |
|---|---|
| **Preference Profile** | A Customer's stored dietary preferences and allergies |
| **Preference Snapshot** | The published, point-in-time view of a Preference Profile shared with Search and Ordering via Open Host Service |

## Ordering & Fulfillment

| Term | Definition |
|---|---|
| **Cart** | A pre-order collection of Line Items |
| **Line Item** | A Listing + selected Modifiers + quantity, within a Cart or Order |
| **Order** | The aggregate representing a placed purchase and its lifecycle |
| **Order Status** | Lifecycle state: `Pending → Placed → Confirmed → InPreparation → ReadyForPickup → Completed` (or `Cancelled`); `Pending` is the customer building the order, `Confirmed` is the vendor accepting it. In code and ADR-0001 the fulfillment-agnostic name for `ReadyForPickup` is `ReadyForFulfillment`. See `order-lifecycle.md` |
| **Pickup Window** | A scheduled time slot for order pickup |
| **Fulfillment Strategy** | The pluggable mechanism for getting an Order to the Customer. **Pickup** is the only implemented strategy in v1; **Delivery** is a designed-for, not-yet-built v2 strategy behind the same interface |

## Search & Discovery / Advertising

| Term | Definition |
|---|---|
| **Sponsored Slot** | A paid placement blended into otherwise-organic Search results |

## Vendor Onboarding & Verification

| Term | Definition |
|---|---|
| **Vendor Verification Status** | Compliance/trust state of a Vendor: `Pending → Verified` (or `Suspended`) |

## Payments & Payouts

| Term | Definition |
|---|---|
| **Commission** | The platform's percentage cut of an Order's value |
| **Payout** | Funds transferred to a Vendor after Commission deduction |

## Reviews / Trust

| Term | Definition |
|---|---|
| **Review** | Customer-submitted rating/feedback tied to a completed Order and a Vendor |

## Key domain events

`OrderPlaced` · `OrderConfirmed` · `OrderPreparationStarted` · `OrderReadyForFulfillment` / `OrderFulfillmentCompleted` (the Order-to-strategy seam, ADR-0001) · `OrderCompleted` · `OrderCancelled` · `PickupWindowScheduled` / `OrderReadyForPickup` (raised by the pickup strategy, not the Order; see `order-lifecycle.md`) · `OrderCustomized` (unused since 2026-10-28: customization happens while the order is Pending) · `VendorVerified` · `VendorSuspended` · `ListingPublished` · `ListingSponsored` · `ListingApproved` · `ListingRejected` · `ReviewSubmitted` · `PayoutReconciled` · `LowStockDetected` · `PreferenceSnapshotPublished`

`VendorSuspended` and `ListingPublished` were named when drafting `ARCH-003` (`data-model-api-contracts.md`) but should have been added here at the same time — corrected now rather than left as a small consistency gap. `ListingApproved`, `ListingRejected`, `ReviewSubmitted`, and `PayoutReconciled` are new to this event-storming exercise (`docs/architecture/ddd/event-storming.md`) — real business moments that existed before any document named them. `PreferenceSnapshotPublished` was named while detailing `WI-PREF-002.md` (Batch 5, 2026-09-13) — the bounded context map and this glossary's own **Preference Snapshot** entry had described this publication for some time, but no concrete event name existed anywhere until that item needed one; `data-model-api-contracts.md`'s `catalog-service`/`ordering-service` event lists were updated to match in the same pass, per this project's established discipline for newly-surfaced events.

## Explicitly scoped-out term

| Term | Definition |
|---|---|
| **Small Supplier (B2B)** | A hypothetical actor supplying raw ingredients *to* Shops (as opposed to selling finished goods to Customers). Considered during modeling and **explicitly scoped out of v1** — it is a distinct upstream context (Procurement/Supply, not Marketplace Listings) and was not folded into any built context. If pursued later, it would be modeled as its own bounded context upstream of Vendor Onboarding, not merged with Independent Vendor. |
