> **Outcome note (2026-10-28):** built on `feature/order-events`. `POST /ordering/orders/{id}/` `confirm`, `decline`, `start-preparation`, `ready`, `complete` (policy `VendorRole`) and `cancel` (a `Customer` or `Vendor` token; other roles `403`, no token `401`). **Ownership:** a vendor acts only on an order whose `vendorId` equals the token subject, a customer only on their own; anyone else gets `404`, byte for byte the same body as an order that does not exist. The service also checks the role itself, so owning the vendor id without the Vendor role is not enough. **Actor and reason come from who owns the order, never the request:** a customer cancel is `CustomerRequested`; a vendor cancel of a `Placed` order is `VendorDeclined` and later `VendorCancelled`; `decline` is Placed only. The aggregate decides every transition: a refused one (including repeating the current step) is `409 invalid_transition` carrying `currentStatus`, and nothing is stored or published. The order and its event are one write; an ETag conflict re-reads and decides again (up to three attempts, then `409 concurrent_update`). `decline` and every cancel release the order's stock at the catalog **after** the save (ADR-0017); a failed release is logged for cleanup (item 62) and does not undo the cancellation. The event is published inline, with the relay as fallback (`ORD-005`).
>
> **Decisions (human lead, 2026-10-28):** repeat of an action is `409`, not an idempotent `200`; stock is released after saving; `complete` is a direct vendor command for now and moves behind `PickupFulfillment` when `ORD-003` lands (open item 59). No payment void or capture yet (items 53, 69).
>
> **Verified (local):** 320 ordering tests, also on Linux in a container beside a real Redis: ownership and roles for every endpoint (own, other vendor, other customer, wrong role, admin, anonymous), every allowed and refused transition, actor/reason mapping, release on decline and cancel and never otherwise, a failed release, a broker outage with relay recovery, a lost race retried, endless conflict ending in `concurrent_update`, 20 rounds of racing confirm against decline (one winner, correct event and release counts), and the real host over HTTP including the service-token release call reaching the catalog. Eight mutation checks (vendor id dropped from the lookup, cancel actor, no release, release on every action, vendor-role check, open cancel policy, no retry, vendor policy removed) each failed a test; one survived at first (the in-service role check, since the endpoint policy also guards it) and now has its own test. **Real stack** (mock issuer, catalog and ordering on Cosmos and Redis, PKCE logins as the seed shop vendor, the mock vendor and the mock customer): a vendor walked an order Placed→Completed on **Redis**, producing exactly one entry for each of the five event types for that order; other vendor `404`, customer `403`, anonymous `401`; a skipped step `409` with the current status; stock went 11→10 on placing, back to 11 on a customer cancel and on a decline, and stayed sold on completion; a repeated cancel `409` without a second release; a customer could not cancel `InPreparation`, the vendor could; 8 simultaneous confirm-and-decline pairs each had one winner. Closes the `ORD-005` gap "Placed→Completed on Redis".
>
> **Not done:** the other-customer case on the real stack (the mock issuer has one customer; covered in-process), GraphQL mutations for these actions, a vendor "my orders" list (open item 76), a vendor-response timeout (item 55), refunds and payment capture/void (items 53, 57, 69), staff users per vendor (item 60), an admin override for cancellation, a run on Azure.

```
WI ID:               ORD-007
Title:                Order action endpoints (confirm, decline, start, ready, complete, cancel)
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  EPIC-AUTH
Hat/Owner:            Engineering/Build
Status:               Ready for design iteration (added 2026-10-28; approved by the human lead; auth details to be iterated)
Size:                 M
```

**Context / Why**
The lifecycle in `docs/architecture/order-lifecycle.md` needs vendors (and customers, for cancellation) to move an order through it. No endpoint did this: the ordering API lists only checkout and order reads. Open item 54.

**Inputs / References**
- *Decisions*: `order-lifecycle.md` (endpoint table and rules), ADR-0006 (role plus ownership), ADR-0008 (the service validates tokens itself), ADR-0013 (the BFF adds no rules)
- *Interfaces*: the `Order` aggregate (`ORD-002`), order persistence (`ORD-006`), `Auth` library policies
- *Environment/tooling*: the mock OIDC issuer; note open item 33 (mock vendor ids)

**You do not need to know about**
- Stock reservation and payment steps (items 52, 53), which hook into these transitions later
- The queue display and notifications that consume the resulting events (`ORD-005`)

**Out of scope**
- A vendor-response timeout (open item 55, deferred) and refund rules (item 57)
- The GraphQL mutations for these actions (a follow-up once the REST behavior is settled)

**Requirements / Acceptance Criteria**
- The endpoints in `order-lifecycle.md`, each calling the corresponding aggregate method
- The actor and reason come from the token; a vendor can act only on their own orders and a customer only on their own; others get `404`
- A disallowed transition returns `409` with the current status; the stored order is unchanged
- Concurrent actions on one order are resolved by optimistic concurrency
- Tests: ownership (own, other vendor, other customer, anonymous), every allowed and disallowed transition over HTTP, events raised once per action

**Dependencies**
- Blocked by: `ORD-002` (built), `ORD-006` (persistence), `ORD-003` for `complete`
- Blocks: the vendor side of the walking skeleton's order-status path (open item 58)

**Definition of Done**
See `docs/process/definition-of-done.md`. Auth changes need human approval before merge.

**AI-agent suitability**
Partly: the behavior is specified, but the authorization design is to be iterated with the human lead.

**Open Points (working)**
- `complete` is a pickup-confirmed command handled by `PickupFulfillment` (`ORD-003`), not a direct aggregate call (open item 59, resolved)
- Whether a repeated action on an already-moved order should be `409` or an idempotent `200`
