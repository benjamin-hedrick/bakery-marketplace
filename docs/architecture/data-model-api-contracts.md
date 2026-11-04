# Data Model / API Contracts

Concrete shapes for what ADR-0004 (containers) and ADR-0009 (service groupings) already decided. Field names match `docs/architecture/ddd/glossary.md` exactly. All Cosmos access goes through `Repository<T>` (ADR-0004); all endpoints route through Azure API Management (ADR-0008) with the usual zero-trust dual validation.

**API versioning note**: endpoint paths below are illustrative, not a decided versioning scheme — API endpoint/URL versioning through APIM is still an open item (`docs/product/backlog/PARKING-LOT.md`). Don't read `/catalog/...` as a committed URL scheme.

## Design note: where does the event-dedupe store live?

ADR-0003 requires every event consumer to dedupe on event ID with "a business-appropriate TTL" but never said where that dedupe set is stored. Resolved here: **the existing `CacheProvider` (ADR-0002)**, keyed by event ID, with a TTL matching how long a duplicate delivery is plausible (proposed: 48 hours). This reuses infrastructure that already exists rather than introducing a new mechanism — no new tradeoff space, just an application of a decision already made.

---

## First-slice mapping (WI-PORT-006 pass 2, 2026-10-28)

Moved from `first-slice-contract.md` §4 and §5; that file stays as the slice-scope record (scope, request path, error and state behavior, seed data, tests, decision log D-1 to D-10). The per-service shapes further down are the long-form domain model and are preserved. **Source-of-truth rules:** the C# REST shapes (here and in the per-service sections) are authoritative for behavior; the GraphQL schema is a composition contract over them and adds no business fields (ADR-0013). The implemented part of the schema is `services/graphql-bff/schema/schema.graphql`; the draft below is the full first-slice schema.

### Where the first slice differs from the per-service shapes

| Topic | Per-service sections say | First slice | Decision |
|---|---|---|---|
| Money naming | `price`, `priceDelta`, line `price` | `priceCents`, `priceDeltaCents`, line `priceCents`; plus `currency` (`USD`) on listings and orders, and `totalCents` on orders. Integer cents, no tax, fees or discounts. | D-1 |
| Payout money | `grossAmount`, `commission`, `netAmount` | Not in the slice. When payouts are built the fields should follow D-1 (`...Cents`); `PayoutReconciledPayload.NetAmount` is still `decimal` in code | D-1, open item 40 |
| Cart | `POST /ordering/cart` | Deferred; the cart lives in browser state and `checkout` takes line items | D-2 |
| Checkout | `POST /ordering/checkout` | Body has `vendorId`, `lineItems`, `pickupWindow` and an `Idempotency-Key` header; no price, total, `customerId` or status from the client. 1-20 per line, at most 10 lines. Idempotent on `(customerId, key)` | D-5, D-6 |
| Pickup windows | none | New `GET /ordering/pickup-windows?vendorId=`: deterministic 15-minute slots; selectable only if `start` is at least the lead time (default 30 min) ahead, checked again at checkout | D-3, D-8 |
| Stock | none | `stock` block on listings (see the note under the Listing shape); `POST /catalog/listings/{id}/stock/adjust` with a signed `delta`; public reads never show the exact count | ADR-0017 |
| Listing reads | role required | `GET /catalog/listings` and `GET /catalog/listings/{id}` are anonymous and return `Published` listings of verified vendors only | D-4 |
| Time | unspecified | UTC ISO 8601 `Z` in REST and events; display in the vendor's zone (no zone field exists yet, open item 39) | D-7 |
| IDs | service ids | REST ids unchanged; GraphQL `Listing.id` is a Relay global ID (base64 of `Type:serviceId`), produced and decoded only in the BFF. `vendorId`, `Modifier.id` and cursors stay raw (open item 41) | D-9 |

### REST shapes used by the slice

Money follows D-1: **integer cents, USD**. To avoid unit ambiguity the REST fields are named `priceCents` / `priceDeltaCents` (a rename of the model's `price` / `priceDelta`, applied in the per-service shapes below by notes dated 2026-10-28).

```jsonc
// GET /catalog/listings/{id}  → Listing (as implemented by WI-CAT-001; adds "currency").
// GET /catalog/listings?limit=&after=  → { "items": [Listing], "nextCursor": "<last id>" | null }  (limit 1-100, default 20; ordered by id)
{
  "id": "listing-sourdough-001", "vendorId": "vendor-shop-001",
  "name": "Country Sourdough", "description": "...", "category": "Bread",
  "priceCents": 800, "currency": "USD",
  "modifiers": [ { "id": "mod-seeds", "name": "Seed crust", "priceDeltaCents": 100, "allergens": ["sesame"] } ],
  "allergenFlags": ["gluten"],
  "sponsored": false, "status": "Published"
}

// POST /ordering/checkout
// Headers: Authorization: Bearer <jwt>, Idempotency-Key: <client uuid>, traceparent
{
  "vendorId": "vendor-shop-001",
  "lineItems": [ { "listingId": "listing-sourdough-001", "modifierIds": ["mod-seeds"], "quantity": 2 } ],
  "pickupWindow": { "start": "2026-11-02T09:00:00Z", "end": "2026-11-02T09:15:00Z" }
}
// NOTE: no price, total, customerId or status is accepted from the client.
// customerId comes from the token's subject claim.

// 201 → Order (persisted, authoritative)
{
  "id": "order-…", "customerId": "<from token>", "vendorId": "vendor-shop-001",
  "lineItems": [ { "listingId": "listing-sourdough-001", "modifiers": ["mod-seeds"], "quantity": 2, "priceCents": 1800 } ],
  "totalCents": 1800, "currency": "USD",
  "status": "Placed", "fulfillmentType": "Pickup",
  "pickupWindow": { "start": "…", "end": "…" },
  "sequenceNumber": 1, "createdAt": "…", "updatedAt": "…"
}
```

**Pricing rule:** `unitCents = listing.priceCents + Σ modifier.priceDeltaCents`; `line.priceCents = unitCents × quantity`; `totalCents` = Σ `line.priceCents`. All integer arithmetic, so no rounding occurs in the slice. Computed only by `ordering-service`, using catalog data read at checkout. No tax, fees or discounts (D-1).

### GraphQL schema draft (minimum for the walking skeleton and first checkout)

Relay-compliant: global `ID`s, `Node` interface, cursor connections. The BFF maps global IDs to service IDs; it adds no business fields.

```graphql
interface Node { id: ID! }

type Query {
  node(id: ID!): Node
  listings(first: Int = 20, after: String): ListingConnection!
  listing(id: ID!): Listing
  pickupWindows(vendorId: ID!): [PickupWindow!]!
  order(id: ID!): Order            # requires auth; owner only
}

type Listing implements Node {
  id: ID!
  vendorId: ID!
  name: String!
  description: String
  category: String!
  price: Money!
  modifiers: [Modifier!]!
  allergenFlags: [String!]!
}
type Modifier { id: ID! name: String! priceDelta: Money! allergens: [String!]! }
type Money { cents: Int! currency: String! }        # D-1: integer cents, currency "USD"

type PickupWindow { start: DateTime! end: DateTime! }

# Standard Relay connection types (added after WI-PORT-001, which proved them)
type ListingConnection { edges: [ListingEdge!]! pageInfo: PageInfo! }
type ListingEdge { cursor: String! node: Listing! }
type PageInfo { hasNextPage: Boolean! endCursor: String }

type Order implements Node {
  id: ID!
  status: OrderStatus!
  vendorId: ID!
  lineItems: [OrderLineItem!]!
  total: Money!
  pickupWindow: PickupWindow!
  createdAt: DateTime!
}
type OrderLineItem { listingId: ID! modifierIds: [ID!]! quantity: Int! price: Money! }
enum OrderStatus { PLACED CONFIRMED IN_PREPARATION READY_FOR_FULFILLMENT COMPLETED CANCELLED }
# Maps 1:1 to the existing OrderStatus enum; no new states are introduced.

type Mutation { placeOrder(input: PlaceOrderInput!): PlaceOrderPayload! }
input PlaceOrderInput {
  idempotencyKey: String!
  vendorId: ID!
  lineItems: [LineItemInput!]!
  pickupWindow: PickupWindowInput!
}
input LineItemInput { listingId: ID! modifierIds: [ID!]! quantity: Int! }
input PickupWindowInput { start: DateTime! end: DateTime! }

union PlaceOrderPayload = PlaceOrderSuccess | PlaceOrderRejected
type PlaceOrderSuccess { order: Order! }
type PlaceOrderRejected { code: PlaceOrderErrorCode! message: String! }   # client-safe text
enum PlaceOrderErrorCode {
  LISTING_UNAVAILABLE INVALID_MODIFIER INVALID_QUANTITY
  PICKUP_WINDOW_UNAVAILABLE PAYMENT_DECLINED VALIDATION_FAILED
}
```

Expected failures (the codes above) are **typed payloads**, so Relay can render them without error boundaries. Unexpected failures (downstream down, timeout, unhandled) become a top-level GraphQL error with `extensions.code = "INTERNAL"`, a fixed safe message, and `extensions.reference = <trace id>` (ADR-0016). Stack traces, downstream URLs and raw payloads never reach the client.

*As built, read side (S1-01a, 2026-10-28; the authoritative schema is `services/graphql-bff/schema/schema.graphql`):* `Listing.stock { status maxPerOrder }` is added (`IN_STOCK`, `LOW`, `SOLD_OUT`; item 64). `Order.pickupWindow` is **nullable** (the window is optional, D-3). `OrderStatus` also has `PENDING`, one value per ordering-service status. `DateTime` is a declared scalar (ISO 8601, UTC, as the service sent it). `OrderLineItem.price` is the line total in cents. `Order` has a Relay global id (`Order:<id>`, D-B), and `node(id)` resolves a `Listing` or an `Order`. `pickupWindows(vendorId)` is public; `order(id)` and `node` for an `Order` need a bearer token, forwarded unchanged to ordering-service and to nothing else. Errors meant for the client carry `extensions.code`: `UNAUTHENTICATED` (no token, or ordering answered 401) and `FORBIDDEN` (ordering answered 403, for a role that may not read orders). An order that does not exist, or is not the caller's, is `null`. A stock or order status the BFF does not recognize is an `INTERNAL` error, never a guess.

*As built, write side (S1-01b, 2026-10-28):* `Mutation.placeOrder(input)` takes `idempotencyKey`, `vendorId`, `lineItems { listingId modifierIds quantity }` and an **optional** `pickupWindow`; there is no price, total, customer or status in the input. Listing ids are Listing global ids on the way in (`LineItemInput.listingId`, decoded in the BFF) and on the way out (`OrderLineItem.listingId`, `StockShortfall.listingId`). The result is `PlaceOrderSuccess { order }` (HTTP 201, or 200 for a repeat of the same checkout, so a retry shows the original order) or `PlaceOrderRejected { code message fields shortfalls }`. `message` is fixed client-safe text chosen by the BFF, never ordering's; `fields` carries ordering's per-field problems (shortened, at most 20); `shortfalls` lists each short item with the quantity available. Codes, by ordering's error code: `invalid_quantity` to `INVALID_QUANTITY`, `invalid_modifier` to `INVALID_MODIFIER`, `validation_failed` and `idempotency_key_reuse` to `VALIDATION_FAILED`, `listing_unavailable` to `LISTING_UNAVAILABLE`, `insufficient_stock` to `INSUFFICIENT_STOCK` (added), `pickup_window_unavailable` to `PICKUP_WINDOW_UNAVAILABLE`, `conflict` (the stock changed while placing) to `CONFLICT` (added), `payment_declined` to `PAYMENT_DECLINED`. A missing or rejected token is `UNAUTHENTICATED`/`FORBIDDEN`; a 5xx, `downstream_unavailable`, a code the BFF does not know, or a body that is not JSON is `INTERNAL` with the trace id as reference. A timeout is `INTERNAL` too, and is safe to retry with the same key. The BFF forwards the `X-Test-Payment: decline` hook (D-10) to ordering only when started with `ENABLE_TEST_HOOKS=1`.

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

*First slice (2026-10-28): `price` and `priceDelta` are `priceCents` and `priceDeltaCents`, with `currency: "USD"` added (D-1). Stock (ADR-0017, `WI-CAT-005`): `availableQuantity` (absent = made to order), `maxPerOrder` and `lowStockThreshold` are stored on the listing, plus the store's ETag for optimistic concurrency. The REST shape carries them in a `stock` block: `{ status: inStock|low|soldOut, maxPerOrder }` publicly, and also `availableQuantity` and `lowStockThreshold` in the owner's responses. A request's `stock` block replaces all three settings; omitting it on an edit leaves them unchanged. See First-slice mapping.*

**`preferences`** (partition key: `customerId`)
```
PreferenceProfile {
  id, customerId,
  allergies: [], avoid: [],      // allergen ids from the tag registry (ADR-0022); dietaryPreferences moved to WI-TAG-004
  updatedAt
}
```
*Designed 2026-11-04 (`WI-PREF-001`, not yet built); the earlier shape had two free-text arrays.*

**Tag registry** (not a container): the catalog's tags are versioned data embedded in the service (ADR-0022, `WI-TAG-001`). An entry has `id` (a stable slug), `kind` (`allergen`, `diet`, `occasion`, `season`, `theme`), `label`, `visibility` (`public` or `hidden`), `assignableBy` (`vendor` or `platform`), optional `activeFrom` and `activeTo` (UTC dates), `sortOrder` and `retired`. `allergenFlags` and each modifier's `allergens` on a listing hold allergen ids and are validated against the registry as a closed list.

### Events

- **Consumes**: `VendorVerified`, `VendorSuspended` (from `admin-service`) — gates whether a vendor's listings can be `Published`; `ListingApproved`, `ListingRejected` (from `admin-service`) — moderation outcome for a submitted listing
- **Publishes**: `ListingPublished` (consumed by `admin-service`'s moderation read-model), `ListingSponsored` (published even though Search consumes it in-process, per ADR-0009's modular monolith rule — the interface boundary is real even co-located), `PreferenceSnapshotPublished` (added by `WI-PREF-002.md`, Batch 5, 2026-09-13 — Open Host Service publication of a Preference Snapshot to Search (in-process, same modular-monolith rule as `ListingSponsored`) and to `ordering-service` (cross-service, over the real event backbone))

> **2026-11-04:** `PreferenceSnapshotPublished` is dropped (`WI-PREF-002` superseded): catalog neither publishes nor consumes it here, and ordering does not consume it (see `ordering-service` below). Allergens a customer chooses to tell a bakery travel on the order (`WI-ORD-009`).

### API endpoints

- `GET /catalog/tags?kind=` — the public tag registry: tags that are public, not retired and inside their window today (anonymous, `public, max-age=300`; ADR-0022, built by `WI-TAG-001`)
- `GET /catalog/listings` — search/browse, filtered by dietary preference, blends sponsored placement
- `GET /catalog/listings/{id}`
*(First slice, D-4: both reads are anonymous and return `Published` listings of verified vendors only.)*
- `POST /catalog/listings` — Vendor role required
- `PUT /catalog/listings/{id}` — Vendor role + resource-ownership check (ADR-0006)
- `POST /catalog/stock/reservations` and `DELETE /catalog/stock/reservations/{orderId}?vendorId=` — service-to-service only: an app-only token with the `Stock.Reserve` role (ADR-0018); atomic reserve and release of an order's stock; not routed through API Management (ADR-0017, `WI-CAT-006`, 2026-10-28)
- `POST /catalog/listings/{id}/stock/adjust` — Vendor role + ownership; atomic increment or decrement of a limited-stock listing; `409` when it would go below zero or the listing is made to order (added 2026-10-28, `WI-CAT-005`)
- `GET /catalog/preferences` — Customer role; the customer is the token's subject, there is no customer id in the path (designed 2026-11-04, `WI-PREF-001`)
- `PUT /catalog/preferences` — Customer role, same rule; replaces the profile and creates it on first write (`WI-PREF-001`)
- *(listings in the vendor API: `allergenFlags` and option `allergens` are a closed list of allergen ids since `WI-TAG-001`; an unknown value is a 422 naming the allowed ids)*

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

*First slice (2026-10-28): line `price` is `priceCents`; `totalCents` and `currency` are added (D-1); `pickupWindow` is UTC (D-7). See First-slice mapping.*

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

> **2026-11-04:** the `PreferenceSnapshotPublished` consumption above is dropped with `WI-PREF-002` (superseded); ordering holds no copy of a customer's profile. `OrderPlaced` gains an additive `Allergens` field instead (`WI-ORD-009`).

### API endpoints

- `POST /ordering/cart` — *deferred in the first slice (D-2)*
- `GET /ordering/pickup-windows?vendorId=` — *added for the first slice (D-3, D-8)*
- `POST /ordering/checkout` — triggers Stripe destination charge (ADR-0005)
- `POST /ordering/orders/{id}/confirm`, `/decline`, `/start-preparation`, `/ready`, `/complete`, `/cancel` — order actions by the owning Vendor (and `/cancel` by the owning Customer); see `order-lifecycle.md` (added 2026-10-28, draft)
- `GET /ordering/orders/{id}` — Customer (own) or Vendor (own, via read-model) role + ownership
- `GET /ordering/orders?limit=&after=` — customer's own orders, newest first, cursor-paged, queries `orders` directly in the customer's partition; the customer is the token's subject, there is no `customerId` parameter (built 2026-11-04, `WI-CUST-007`)
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
