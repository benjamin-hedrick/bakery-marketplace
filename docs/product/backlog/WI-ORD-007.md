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
