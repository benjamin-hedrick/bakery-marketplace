> **Outcome note (2026-10-28):** built on `feature/slice-1-order-journey`. At checkout, after the order is placed, `AutoConfirmPolicy` confirms it in the same write when **no line has a modifier and no pickup window was requested**; otherwise the order stays `Placed` for the vendor. The stored order, its `OrderPlaced` (sequence 1) and its `OrderConfirmed` (sequence 2) leave the outbox together, in order. `OrderConfirmedPayload` gained an optional `Automatic` flag (default `false`, so older messages read as a vendor's acceptance) so consumers and the later vendor read model can tell the two apart. `Checkout:AutoConfirm` (default `true`) switches the rule off. Per **D-A, option 1** (human lead, 2026-10-28) the rule does not look at stock counters, so made-to-order and counted items are treated alike; a per-item or per-vendor control is the intended refinement.
>
> **What did not change:** cancel (a customer may cancel a `Confirmed` order, which releases the stock), the vendor's later steps, and the vendor's `confirm` endpoint (it answers `409` for an already-confirmed order). Payment is still a stub; item 53's "authorize at place, capture at confirm" collapses into one step for these orders and `PAY-001` must account for that.
>
> **Verified (local):** 337 ordering tests and 16 event-schema tests; the rule on both conditions, the switch, an options line among plain ones, repeat checkout (same order, no new events), declined payment (nothing stored or published, reservation released), a broker outage (both events delivered by the relay in order), cancel after auto-confirm, and over HTTP (a plain order returns `Confirmed`, an optioned one `Placed`). Five mutation checks (ignore modifiers, ignore the window, ignore the switch, drop the automatic marker, vendor-style confirm) each failed a test. Also run on Linux in a container beside a real Redis (build, format gate, tools, catalog, ordering: passed). **Real stack** (mock issuer, catalog and ordering on Cosmos and Redis, PKCE logins): a plain order returned `201 Confirmed`, one with an option `Placed`, one with a requested window `Placed`; the three orders added 3 `OrderPlaced` and 1 `OrderConfirmed` stream entries, the confirmation being sequence 2 of the plain order with `automatic: true`; stock fell by 3; the vendor's `confirm` on the auto-confirmed order was `409` (current status `Confirmed`); the customer cancelled it (`200 Cancelled`) and its unit of stock came back.
>
> **Not done:** a vendor-visible marker beyond the event flag (the vendor has no order list yet: open item 76); a per-item or per-vendor flag.

```
WI ID:               ORD-008
Title:                Automatic confirmation of simple orders
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Built 2026-10-28 (pending review/merge)
Size:                 S (3 points)
```

**Context / Why**
The lifecycle needs a vendor to confirm every order, so a customer who buys an uncustomized item with no pickup request would see `Placed` until a vendor acts, and a demo or an automated browser test could not show a confirmed order without a vendor action or a timer. The human lead proposed (2026-10-28) that orders needing nothing special from the vendor confirm themselves. Added to slice 1 (`S1-08` in `docs/management/slice-1/03-prioritized-backlog.md`).

**Inputs / References**
- *Decisions*: D-A (option 1), `docs/architecture/order-lifecycle.md`, ADR-0001, ADR-0003 (event ordering and ids)
- *Interfaces*: `Order.Confirm`, `OrderConfirmedPayload`, the outbox (`ORD-005`)

**Out of scope**
- A per-item or per-vendor flag; automatic confirmation based on stock counters or lead times; payment capture timing (items 53, 69); any vendor UI.

**Requirements / Acceptance Criteria**
- An order with no modifier on any line and no requested pickup window is `Confirmed` in the checkout response and in storage, with `OrderPlaced` then `OrderConfirmed` (`Automatic = true`) published in order.
- An order with a modifier on any line, or with a requested window, is `Placed` and publishes only `OrderPlaced`.
- The rule can be disabled by configuration.
- A repeated checkout returns the same order and publishes nothing new; a declined payment stores and publishes nothing.
- A customer can still cancel the order and the stock is released.

**Dependencies**
- Blocked by: `ORD-001`, `ORD-005`, `ORD-007` (all built)

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes.

**Open Points (working)**
- A vendor-facing way to see which orders confirmed themselves (read model, item 76).
