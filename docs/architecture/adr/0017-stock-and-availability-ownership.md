# ADR-0017: Stock and Availability Ownership

**Status:** Accepted (2026-10-28, human lead). Refines ADR-0009 (service mapping) for the stock counter. Not yet built.

## Context

Vendors list items either with a limited quantity or as made to order. A limited quantity must be tracked and enforced, so two customers cannot buy the last loaf. The listing lives in `catalog-service` and is edited by vendors; the order lives in `ordering-service`. Two services touch one number (open item 52). The model had no quantity at all: `Listing` has no stock field, `LowStockDetected` has no producer, and D-5's 1-20 / 10-line bounds are placeholders.

## Decision

1. **The listing carries the stock.** `availableQuantity` is an integer or absent. **Absent means made to order**: always orderable, never reserved. **A number means limited stock**: tracked, decreased by orders, enforced. A listing may also set `maxPerOrder` and an optional `lowStockThreshold`.
2. **`catalog-service` owns the counter**, because vendors edit it as a listing property. Vendors can **set it directly** (the existing listing update) or **increment/decrement it** by an amount. Both are atomic against the listing's version, so an edit and an order cannot overwrite each other. A decrement below zero is refused.
3. **The quantity is a running counter.** It is not tied to a day, a pickup window or an expiry. Stock per window or per day is deferred.
4. **Reserve at `Place`, release on any cancellation.** `ordering-service` asks catalog to reserve every line of the order in one request, idempotent by order id. All lines belong to one vendor, and listings are partitioned by vendor, so catalog applies the whole reservation in a single Cosmos transactional batch (decrement each listing and write a reservation record): all or nothing, no oversell, no partial reservation. A cancelled order's reservation is released (idempotent) and the counter goes back up. Completing an order changes nothing. Checkout already reads catalog for pricing, so this adds no new dependency.
5. **Customers see a status, not the count:** `in stock`, `low` or `sold out`. Low is `availableQuantity` at or below the listing's `lowStockThreshold` (a placeholder default of 5 until chosen). Made-to-order items are always in stock. Catalog publishes `LowStockDetected` when an item crosses into low.
6. **Release on vendor cancellation is the rule for now.** A prepared, especially customized, item may not be returnable to regular inventory. Day-old goods, seconds and defects, and prepared items are assumed to be removed from stock and handled outside this system; vendors can adjust the counter themselves. Tracking them is a possible future feature (open item 61).

## Consequences

**Positive**
- One owner and one atomic write path for the counter; no oversell; no cross-service ledger to reconcile.
- Uses the existing listing edit path, version check and vendor ownership rules.

**Negative / accepted**
- Ordering depends on catalog being up to place an order that has limited-stock lines (it already needs catalog for prices).
- A crash between reserving and saving the order leaves a reservation with no order. The order id is created first and the reservation is keyed by it, so a cleanup of reservations without a matching order is possible; the rule (age, who runs it) is not decided (open item 62).
- Ordering must authenticate to catalog's reservation endpoints as a service, which is a new auth path (open item 62; human approval required).
- A vendor-set value overrides reservations made since the vendor last looked; the version check turns a stale write into a conflict the vendor can retry.

## Alternatives considered

1. **Ordering owns a reservation ledger; catalog owns capacity; they sync by events.** Rejected: eventual consistency allows overselling and the number would have two sources.
2. **A separate inventory service.** Rejected: more moving parts than a four-service modular monolith needs.
3. **Stock per day or per pickup window.** Deferred, not rejected (D-3 already defers stock tied to a window).

## Related

- ADR-0004 (Cosmos, partition by vendor), ADR-0009, ADR-0001 (the Order stays fulfillment-agnostic; stock is not a fulfillment concern)
- `WI-CAT-005`, `WI-CAT-006`, `WI-ORD-001`; open items 51, 52, 61, 62
