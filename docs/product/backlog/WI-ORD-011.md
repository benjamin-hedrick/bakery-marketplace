> **Status:** In review · built and run locally 2026-11-07 on `feature/listing-cache` (web customer and vendor, and the Android app); the lead asked for the buttons the same day and has not reviewed them

```
WI ID:               ORD-011
Title:                Cancel buttons: a customer cancels from the order page, a vendor cancels an accepted order from the queue
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  EPIC-WEB-CUSTOMER, EPIC-QUEUE-DISPLAY
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 M
```

> **Outcome note (2026-11-07):** the cancel endpoint already existed (`WI-ORD-007`: `POST /ordering/orders/{id}/cancel`, either role, the actor and the reason derived from the token and the order's owner, stock released); this item adds the buttons and the BFF path to them. **BFF:** `Mutation.cancelOrder(input: { orderId })` (an Order global id) answering `CancelOrderDone { orderId status }` or `CancelOrderRejected { code message currentStatus }` (`NOT_FOUND`, `NOT_ALLOWED_NOW`; fixed text, never ordering's), and `VendorOrderAction.CANCEL`; both only map the call and forward the caller's token, ordering decides the role, the ownership and the status (ADR-0006, ADR-0013). **Customer** (`OrderStatusView`): a "Cancel order" button while the order is placed or confirmed (`customerMayCancel` in `packages/customer-core`), a question first ("Cancel this order?", "Yes, cancel the order" or "Keep it"), then the cancel; the page then reads the order again from the network, so it shows what ordering says whatever the answer was: cancelled; "can no longer be cancelled" when the bakery moved on (the page then shows where the order is); "could not cancel, it has not changed" on a failure (the button stays, trying again works). **Vendor** (`apps/web-queue-display`): a "Cancel" button beside the next step on an accepted order (confirmed, in preparation, ready), with the same second click; a new order is declined, never cancelled, and an accepted one cannot be declined. The cancelled order leaves the live queue.
>
> **Verified (local):** BFF 245 tests pass (11 new: the mapping and the token, a refusal, an unknown status, a missing order, an id of another type, a hostile id, no token, 401, 403, a failing ordering); `customer-core` 101 (6 new); `web-customer` mock-backed browser suite (5 new: a confirmed order cancelled after the question and "Keep it" sends nothing; an order waiting for the bakery; too late, the page shows where the order is; a failed cancel and a retry; no button once the bakery has started or finished); the queue display suite 63 passed (2 new, and the accessibility check with the new buttons); real stack `skeleton-smoke.mjs` on the host 62 of 62 (4 new: a customer cancels and the held stock comes back, another customer's cancel looks like a missing order, a second cancel gives nothing back twice; a customer is refused once the bakery has started and the vendor can still cancel it; the vendor cancels an accepted order from the real queue screen and the customer sees it cancelled; the customer cancels from the real order page in a browser).
>
> **Changes from the original plan:** none (new item, written as built). A first label "Cancel order" read to a screen reader as "Cancel order order AAA111" (the accessible name is the label, "order" and the reference), so the button says "Cancel". **Android (added the same day):** the order screen has "Cancel order" while the order is placed or confirmed, with the same question first ("Yes, cancel the order", "Keep it") and the same words, through `src/cancel.ts` (`cancelOrder`, 5 unit tests: the id and the login are sent, done, missing, too late, and any failure is "failed"); the Maestro flow `13-cancel-order` (a plain order confirms itself, "Keep it" sends nothing, then the cancel shows "Order cancelled" and the note) **passed on the emulator on 2026-11-07**. Its first run failed on a flaw in the flow (a tap landed on a payment button that had moved when the list of saved payment methods loaded, selecting the refused card), so the flow now waits for the list and chooses the accepted card; the same layout jump could catch a person who taps the place button at that instant, which is recorded here and not fixed. **Not done / limits:** the customer's page now follows the vendor's cancel by polling (`WI-CUST-010`); no refund or payment void (the payment is a stub and a cancel takes no money back); a customer cancelling a confirmed order that the vendor was about to start is a race ordering decides (the loser is told "can no longer be cancelled").

**Context / Why**
The order lifecycle (`docs/architecture/order-lifecycle.md`) lets a customer cancel while an order is placed or confirmed and a vendor cancel from confirmed on, and the endpoint was built, but neither side had a button, so the demo could not show a cancel.

**Requirements / Acceptance Criteria**
- A customer sees a cancel button on their order only while it can be cancelled, is asked before it is sent, and is told what happened in plain words.
- A vendor sees a cancel button on an accepted order only, is asked before it is sent, and the order leaves the queue.
- Ordering stays the authority for who may cancel what and from which status; the BFF and the screens only map and hint.
- A cancel gives the held stock back (ordering's rule, shown on the real stack).

**Dependencies**
- Built on `WI-ORD-007` (the endpoint), `WI-QUE-004` (the vendor buttons) and `WI-CUST-007` (the order page).
