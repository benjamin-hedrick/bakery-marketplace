# Data Model / API Contracts

Concrete shapes for what ADR-0004 (containers) and ADR-0009 (service groupings) already decided. Field names match `docs/architecture/ddd/glossary.md` exactly. All Cosmos access goes through `Repository<T>` (ADR-0004); all endpoints route through Azure API Management (ADR-0008) with the usual zero-trust dual validation.

**API versioning note**: endpoint paths below are illustrative, not a decided versioning scheme — API endpoint/URL versioning through APIM is still an open item (`docs/product/backlog/PARKING-LOT.md`). Don't read `/catalog/...` as a committed URL scheme.

## Design note: where does the event-dedupe store live?

ADR-0003 requires every event consumer to dedupe on event ID with "a business-appropriate TTL" but never said where that dedupe set is stored. Resolved here: **the existing `CacheProvider` (ADR-0002)**, keyed by event ID, with a TTL matching how long a duplicate delivery is plausible (proposed: 48 hours). This reuses infrastructure that already exists rather than introducing a new mechanism — no new tradeoff space, just an application of a decision already made.

---

## `catalog-service`

**Hosts**: Catalog & Customization, Search & Discovery, Advertising/Promotions, Preferences & Dietary Safety (ADR-0009)

### Containers

**`catalog`** (partition key: `vendorId`)
```
Listing {
  id, vendorId, name, description, price, category,
  modifiers: [{ id, name, priceDelta, allergens: [] }],
  allergenFlags: [],
  sponsored: bool,
  status: "Draft" | "Published",
  createdAt, updatedAt
}
```

**`preferences`** (partition key: `customerId`)
```
PreferenceProfile {
  id, customerId,
  allergies: [], dietaryPreferences: [],
  updatedAt
}
```

### Events

- **Consumes**: `VendorVerified`, `VendorSuspended` (from `admin-service`) — gates whether a vendor's listings can be `Published`; `ListingApproved`, `ListingRejected` (from `admin-service`) — moderation outcome for a submitted listing
- **Publishes**: `ListingPublished` (consumed by `admin-service`'s moderation read-model), `ListingSponsored` (published even though Search consumes it in-process, per ADR-0009's modular monolith rule — the interface boundary is real even co-located), `PreferenceSnapshotPublished` (added by `WI-PREF-002.md`, Batch 5, 2026-09-13 — Open Host Service publication of a Preference Snapshot to Search (in-process, same modular-monolith rule as `ListingSponsored`) and to `ordering-service` (cross-service, over the real event backbone))

### API endpoints

- `GET /catalog/listings` — search/browse, filtered by dietary preference, blends sponsored placement
- `GET /catalog/listings/{id}`
- `POST /catalog/listings` — Vendor role required
- `PUT /catalog/listings/{id}` — Vendor role + resource-ownership check (ADR-0006)
- `GET /catalog/preferences/{customerId}` — Customer role + resource-ownership check
- `PUT /catalog/preferences/{customerId}` — Customer role + resource-ownership check; implicitly creates the profile on first write (`WI-PREF-001.md`)

---

## `ordering-service`

**Hosts**: Ordering & Fulfillment, Reviews/Trust, Payments/Payouts integration (ADR-0009)

### Containers

**`orders`** (partition key: `customerId`) — source of truth
```
Order {
  id, customerId, vendorId,
  lineItems: [{ listingId, modifiers: [], quantity, price }],
  status: "Placed" | "Confirmed" | "InPreparation" | "ReadyForFulfillment" | "Completed" | "Cancelled",
  fulfillmentType: "Pickup",
  pickupWindow: { start, end },
  sequenceNumber,
  createdAt, updatedAt
}
```

**`order-status-readmodel`** (partition key: `vendorId`) — **denormalized, event-fed**, per ADR-0004's explicit CQRS decision that vendor-side views (including the live queue display) never query `orders` directly. Populated by `ordering-service` consuming its own published events.
```
OrderStatusView {
  orderId, vendorId, customerName,
  status, lineItems (denormalized for display),
  pickupWindow,
  lastUpdatedAt
}
```

**`reviews`** (partition key: `vendorId`)
```
Review { id, orderId, customerId, vendorId, rating, comment, createdAt }
```

**`payouts`** (partition key: `vendorId`, Strong consistency per ADR-0004) — reconciliation read-model, Stripe is the actual source of truth (ADR-0005)
```
Payout { id, vendorId, orderId, grossAmount, commission, netAmount, stripeTransferId, status, reconciledAt }
```

**Design note**: `ordering-service` trusts that `catalog-service` has already filtered unverified/suspended vendors' listings out of what's ordered — it does not re-check vendor verification status at order-placement time. If a vendor is suspended mid-order-lifecycle, that's handled as an operational exception, not a per-order check.

### Events

- **Publishes**: `OrderPlaced`, `OrderCustomized`, `PickupWindowScheduled`, `OrderReadyForPickup`, `OrderCompleted`, `ReviewSubmitted`, `PayoutReconciled` (all per glossary — the last two named during the event-storming exercise, `docs/architecture/ddd/event-storming.md`)
- **Consumes**: its own published events, to populate `order-status-readmodel`; `PreferenceSnapshotPublished` (from `catalog-service`, added by `WI-PREF-002.md` — stored per-`customerId` for future checkout-time use; the actual consumption logic, e.g. an allergy warning at checkout, is out of scope of `PREF-002` and not yet built)

### API endpoints

- `POST /ordering/cart`
- `POST /ordering/checkout` — triggers Stripe destination charge (ADR-0005)
- `GET /ordering/orders/{id}` — Customer (own) or Vendor (own, via read-model) role + ownership
- `GET /ordering/orders?customerId=` — customer's own orders, queries `orders` directly (same partition key)
- `GET /ordering/orders?vendorId=` — **served from `order-status-readmodel`, not `orders`** — this is the endpoint the live queue display calls
- `POST /ordering/reviews` — Customer role, must reference a `Completed` order they placed
- `GET /ordering/reviews?vendorId=` — public

---

## `admin-service`

**Hosts**: Admin/Moderation, Vendor Onboarding & Verification (ADR-0009)

### Containers

**`vendors`** (partition key: `vendorId`)
```
VendorProfile {
  id, vendorId, name, vendorType: "Shop" | "Independent",
  verificationStatus: "Pending" | "Verified" | "Suspended",
  contactInfo, complianceChecklist: {},
  createdAt, updatedAt
}
```

**`moderation-queue`** (read-model, fed by `catalog-service`'s `ListingPublished` events)
```
ModerationItem { listingId, vendorId, submittedAt, reviewStatus: "Pending" | "Approved" | "Rejected" }
```

### Events

- **Consumes**: `ListingPublished` (from `catalog-service`)
- **Publishes**: `VendorVerified`, `VendorSuspended` (consumed by `catalog-service`), `ListingApproved`, `ListingRejected` (consumed by `catalog-service` — named during the event-storming exercise, `docs/architecture/ddd/event-storming.md`)

### API endpoints

- `POST /admin/vendors` — Vendor role required, creates a `VendorProfile` in `Pending` status (added by `WI-VEN-001.md`, Batch 5, 2026-09-13 — the `ApplyAsVendor` command named in `event-storming.md`'s Flow 1 had no corresponding endpoint anywhere until this item; small resolved gap, not a new decision)
- `GET /admin/vendors/{vendorId}` — Vendor role + resource-ownership check (`WI-VEN-001.md`) — a vendor reads their own profile
- `PUT /admin/vendors/{vendorId}` — Vendor role + resource-ownership check (`WI-VEN-001.md`) — `name`/`contactInfo`/`complianceChecklist` only; `verificationStatus` is server-controlled, not client-writable
- `GET /admin/vendors/pending` — Admin role
- `POST /admin/vendors/{id}/verify` — Admin role
- `POST /admin/vendors/{id}/suspend` — Admin role
- `GET /admin/moderation-queue`
- `POST /admin/moderation-queue/{listingId}/approve`
- `POST /admin/moderation-queue/{listingId}/reject`

---

## `notification-service`

**Hosts**: Notifications only (ADR-0009) — generic, event-triggered dispatcher, no business logic

### Containers

None — no owned business data. Uses `CacheProvider` for its own event-dedupe set (see Design Note above), same as every other service.

### Events

- **Consumes**: `OrderPlaced`, `OrderCompleted`, `LowStockDetected`, and any other event with a notification template
- **Publishes**: none

### API endpoints

**None exposed via APIM.** This service is a pure event consumer with no direct customer/vendor/admin-facing surface — consistent with its role as a thin, generic subdomain (bounded context map).

## Related

- ADR-0004 — containers and consistency levels this document makes concrete
- ADR-0009 — service groupings this document is organized by
- `docs/architecture/ddd/glossary.md` — source of every field/event name
- `docs/product/backlog/PARKING-LOT.md` — API versioning, still undecided
- `docs/product/backlog/WI-PREF-002.md`, `WI-VEN-001.md` — sources of the two small additive updates made to this document on 2026-09-13 (`PreferenceSnapshotPublished`, vendor self-application endpoints)
