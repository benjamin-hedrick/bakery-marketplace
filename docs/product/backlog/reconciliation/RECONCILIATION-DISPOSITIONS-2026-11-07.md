# Reconciliation Dispositions — 2026-11-07

**Status:** Reconciliation record (the lead's decisions of 2026-11-07, given in conversation and recorded here the same day)
**Source:** the lead's picture of the demo ("customer: browse, customize, add to cart, order, see order history including order status; vendor: a live queue to see orders placed, confirm an order and update it through the status; most order events drive the vendor display, one combined view for the demo"), checked against the code on `feature/listing-cache`
**Tracking:** `WI-ORD-003`, `WI-ORD-011`, `WI-CUST-010`, `WI-CAT-003`, `WI-CUST-009`, `WI-PORT-004`, register 158 and 160

This record reconciles three things: the demo the lead pictured against what is built, `WI-ORD-003` against the product, and the decisions taken in this session. Nothing in it claims more than was run; what was not run is listed in section D.

## A. The demo as pictured, against what is built (2026-11-07)

| Piece | State | Evidence and limits |
|---|---|---|
| Customer: browse with stock, allergens and tags; filter by tag | Built | Web and Android. Real-stack journeys. |
| Customer: customize (options, quantity, allergens), add to the order | Built | A fresh stock read at add (`WI-CUST-009`): a sold-out item is refused with words. |
| Customer: order, saved payment method, optional pickup time | Built (payment is a stub) | `WI-ORD-010`. |
| Customer: order status | Built, updates by polling | `WI-CUST-010`: every 5 s while the order can change. Unit and browser tests; **not run against the real stack with a vendor acting at the same time**. |
| Customer: order history with status | Built | `WI-CUST-007` (web). |
| Customer: cancel an order | Built (web and Android) | `WI-ORD-011`: while placed or confirmed, after a question; the held stock comes back (real stack). |
| Customer: allergen profile, warnings and the acknowledgement at checkout | Built | Web; Android shows the warnings from seeded profiles (no profile screen). |
| Vendor: live queue of placed orders | Built | Push with polling as the fallback (`WI-QUE-003`), allergens on the card. |
| Vendor: accept or decline, start, mark ready, hand over, cancel an accepted order | Built | `WI-QUE-004`, `WI-ORD-011`; real-stack journeys. |
| Order events drive the vendor display | Built | A read model fed by the six Order events feeds the board; the notification service consumes the same events (local sender only logs). |
| One combined vendor view | Built | The queue display is the live board and the action surface in one app. |
| One command starts both halves | Built, partly checked | `demo.mjs` starts customer and vendor screens (both answered; the vendor steps were not clicked by hand). `mobile-demo.mjs` does the same by default (`--phone-only` skips it): **not run**. |
| Vendor screens for listings and stock; vendor onboarding; admin screens | **Not built, not planned for the demo** | Backend REST exists (listings, stock, own reads); `VEN-001`, `VEN-002` are Ready; `ADM-*` not started. The vendor stays on seeded data. |
| Delivery, a real payment, a deployed environment | Not built | Deployed dev environment is its own track (`WI-DEP-001`). |

## B. `WI-ORD-003` (the fulfillment strategy)

**Disposition: option A, build it as ADR-0001 designed it.** The strategy is a real, separate event consumer; the vendor's "Handed over" becomes a request the strategy answers; the Order completes on the strategy's answer. The design, the tests and the risks are in `WI-ORD-003.md` (rewritten today); ADR-0001, `order-lifecycle.md` and `WI-ORD-007` carry dated notes that this is agreed and not built.

| # | Decision | Answer |
|---|---|---|
| 1 | "Handed over" completes eventually (202), with a "still waiting, try again" note after about 15 s on the vendor screen | **Accepted** |
| 2 | How a second consumer inside ordering-service gets its own consumer group: a second transport identity, or a consumer name on `SubscribeAsync` | **Decided and built 2026-11-07:** the consumer name (`WI-ORD-003`; recorded in the note of 2026-11-08 on ADR-0003). Was open when this record was written. |
| 3 | The confirmation request is a plain integration event published by the endpoint, not an Order event through the outbox | **Accepted** (plain event) |
| 4 | The customer's "ready" message moves to `OrderReadyForPickup` now (payload gains optional fields) | **Accepted** (now) |
| 5 | ADR-0001's amendment note, `order-lifecycle.md`, `WI-ORD-003` and `WI-ORD-007` are updated | **Done today** (as plans, not as built) |

## C. Other decisions of this session (details in each item)

- **Customer order status: polling**, not push (the vendor screen already demonstrates push). Built (`WI-CUST-010`).
- **Cancel buttons** for the customer (order page, web and Android) and the vendor (an accepted order): built (`WI-ORD-011`).
- **The demos start the vendor screen**, web by default (`--customer-only` skips) and mobile by default (`--phone-only` skips).
- **No "hide out of stock" option**; a sold-out item stays visible with its status; stock is checked at add and at checkout (register 158).
- **Listing cache** (`WI-CAT-003`: source-data cache, invalidated on a status change, with stampede protection), the fresh stock read (`WI-CUST-009`) and the per-layer record (`WI-PORT-004`) are built; the session proxy's own responses now carry `no-store` (register 159, option 2).
- **Demo video:** feasible (below); the lead will plan the captures with me in a later session. Web clips: Playwright records 1280 x 720 VP9 webm through `apps/web-customer/playwright.video.config.ts` (a real clip was recorded and a frame checked). The phone: `adb shell screenrecord` (not tried here; `show_touches` needs turning on). `ffmpeg` is **not installed**; Playwright's own copy encodes VP9 only, so MP4 and side-by-side video need a real `ffmpeg` (the lead's approval to install). Captions or narration would be added separately (no audio is recorded).

## D. Not run, not decided, still open

- **Not run:** all fifteen Maestro flows in one cold run (flows 07, 13 and 14 and the new cancel flow passed on their own); the container smoke of the new journeys (the host smoke passed 62 of 62); polling on the real stack; `mobile-demo.mjs` with the vendor screen; a person clicking through the vendor steps of the demo.
- **Open decision:** none now: `WI-ORD-003` decision 2 was decided and built the same day.
- **Found, recorded in `WI-ORD-011`, not fixed:** on Android, the checkout's saved payment methods load after the screen opens and push the place button down; a tap at that instant can land on a payment button (register 161).
- **Register:** 158 (listing cache, stock-path review by the lead), 159 (resolved), 160 (this record's open items), 161 (the layout jump).
