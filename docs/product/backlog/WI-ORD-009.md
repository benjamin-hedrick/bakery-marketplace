> **Status:** Ready

```
WI ID:               ORD-009
Title:                Allergens recorded on the order
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  EPIC-PREFERENCES, EPIC-QUEUE-DISPLAY
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

**Context / Why**
The north-star safety metric counts orders prepared in a way that did not match "the dietary constraints recorded on" the order (`docs/product/vision.md`, `docs/product/okrs.md` KR1.3), and NFR 3.7 lets the vendor who fulfils an order see them. Today nothing is recorded. The customer chooses, at checkout, which allergies the bakery should know about for this order; they are stored on the order and travel with it to the vendor's view. This replaces the standing-profile snapshot of `PREF-002` (superseded): only an order's own allergens leave the customer's profile, only when the customer sends them, and only to the vendor who has that order.

**Inputs / References**
- *Decisions*: ADR-0022 (ids; ordering reads the registry from the catalog and caches it, decision 9), ADR-0003 (event payloads change additively), ADR-0004, NFR 3.7, the first-slice contract's checkout rules (D-6 idempotency).
- *Interfaces*: `POST /ordering/checkout` and `CheckoutService`, the `Order` aggregate and `OrderDocument`, `OrderPlacedPayload`, `VendorOrderProjection` and `VendorOrderDto`, the catalog gateway, the BFF `placeOrder`, `Order` and `VendorOrder`.

**You do not need to know about**
- The customer's profile (it is not read here); how the checkout form offers the choice (`CUST-008`); how the queue display draws it (`QUE-005`).

**Out of scope**
- Changing allergens after the order is placed; the customer's `avoid` list (never sent); notification wording (the e-mail templates do not include allergens); any refusal of an order because of its allergens.

**Requirements / Acceptance Criteria**
- `CheckoutRequest` gains optional `allergens` (allergen ids). Each must be a public, active, non-retired allergen in the registry (ordering reads `GET /catalog/tags` through the catalog gateway and caches it with `ICacheProvider`, a few minutes); otherwise 422 `validation_failed` naming the field. Duplicates are removed; more than the number of allergens is refused. The field is part of the request fingerprint (the same key with different allergens is `idempotency_key_reuse`).
- The order stores the allergens (sorted, distinct) and they cannot change after placement. `OrderDto` carries `allergens`. An order placed before this change has none.
- `OrderPlacedPayload` gains `Allergens` as an additive field (default empty; no existing consumer changes, ADR-0003). The vendor read model keeps `allergens` from that event, and `VendorOrderDto`, the list, the single read and the live stream all carry it.
- BFF: `PlaceOrderInput.allergens: [String!]` (ids), `Order.allergens` and `VendorOrder.allergens: [String!]!` (ids; the screens map them to labels from the public `tags` query). The BFF validates nothing itself.
- **Privacy:** allergens are in no log line or span (ordering logs ids of orders, not their contents); the notification templates do not print them; only the order's customer and the vendor who has the order can read them (the existing ownership of each read, proved by tests).
- **Abuse cases:** an unknown, hidden, retired or non-allergen id is 422; a vendor or admin token cannot check out; another vendor's order read returns 404 as before; the stream and the list never show an order's allergens to another vendor; a replayed event does not change the stored allergens.
- **Tests:** checkout with none, one and several allergens; each refusal; the fingerprint; the stored order and the DTO; the event payload and the vendor read model; the stream payload; the two-vendor isolation; logs and spans captured around a checkout showing no allergen id; BFF mapping; a real-stack journey placing an order with an allergen and reading it as the customer and as the vendor.

**Dependencies**
- Blocks: `QUE-005`, the "tell the bakery" control of `CUST-008`.
- Blocked by: `TAG-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific: the contract document and the event schema notes list the new field.

**AI-agent suitability**
Yes; the privacy properties are acceptance criteria with tests, and the lead's review of them is wanted (NFR 3.7 data).

**Interfaces consumed**: the catalog gateway (registry read), `ICacheProvider`
**Events published/consumed**: `OrderPlaced` gains `Allergens` (additive)
**Data touched**: `orders` container (a new field), the vendor read model

**Open Points (working)**
- [ ] The event stream retains `OrderPlaced` payloads (`Events:MaxStreamLength` 100000); the allergens stay there as long as the order event does. Confirm that is acceptable for order-scoped, customer-chosen data, or shorten retention (register item to be opened when built).
