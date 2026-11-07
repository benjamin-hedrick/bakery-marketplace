> **Status:** In review · built and run locally 2026-11-07 on `feature/listing-cache` (web: browser tests; Android: unit tests and the cancel flow on the emulator); the lead chose polling for the customer the same day

```
WI ID:               CUST-010
Title:                The customer's order status stays current by polling
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-QUEUE-DISPLAY
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 S
```

> **Outcome note (2026-11-07):** the lead chose **polling** for the customer's order page (the vendor's queue screen already has the push mechanism, ADR-0021). The rules are one class in `packages/customer-core/src/orderPoller.ts` (`OrderPoller`, no React, Relay or network in it), used by the web order page and the Android order screen: read at once and then every 5 seconds while the order can still change; one read at a time (a slow read is never doubled by the next tick or by "Refresh status"); no read while the page is hidden (a background tab, an app that is not in front) and a read at once when it is shown again; stop for good once the order is completed or cancelled (a status it does not know is polled on); after a failed read keep what the page shows, say it could not refresh, and try again later, 2x, 4x, 8x the interval and at most 30 seconds, going back to the normal pace after one that works; the items' names are read once, not at every tick. **Changes to what the pages did before:** the web page used to read once and on "Refresh status" only, and a failed refresh replaced the whole page with an error; it now keeps the last status and says "We could not refresh just now" (an error page remains only when the first read fails). The Android screen already polled every 5 seconds but forever (a finished order too), re-read the names each time, and a single failed poll replaced a loaded order with "The order could not be loaded"; it now follows the same rules.
>
> **Verified (local):** 12 `OrderPoller` unit tests with a fake clock (113 in `customer-core`): the pace, stopping at completed and cancelled, a missing order, an unknown status polled on, no overlap, the backoff and the return to the normal pace, hidden and shown, `refreshNow` (even while hidden, not doubled, once after the order is final), and nothing delivered after `stop`; 6 web browser tests (the page follows the bakery through preparing, ready and completed without a refresh and then asks no more in two minutes; the names are read once; a failing read keeps the page and says so and the retry clears it; a hidden tab asks nothing and catches up the moment it is shown; "Refresh status" still works; plus the changed failure test in `orders.spec.ts`), with a fake clock and a mock BFF that can move an order on and fail its reads; the web mock-backed suite passed; the Android cancel flow (`13-cancel-order`) passed on the emulator with the new screen, 35 app unit tests pass. **Not done / limits:** the live behaviour on the real stack (a vendor acting while the customer's page is open) was not run: the unit and mock tests cover the rules, the real-stack journeys read the order on demand; the Android polling (hidden = app not in front) was not exercised by a flow that sends the app to the background; polling costs a read every 5 seconds per open order page (fine at demo scale; push, as the vendor screen has, is the alternative the lead did not choose).

**Context / Why**
The order page read the order once, so a customer watching it did not see the vendor accept, prepare or hand over the order until they pressed "Refresh status". The demo shows both halves (`scripts/dev/demo.mjs`), so the customer's page should follow the vendor's actions by itself.

**Requirements / Acceptance Criteria**
- The customer's order page and the Android order screen show a new status within a few seconds of the vendor's action, with no press.
- A background tab or an app that is not in front costs the service nothing, and the page catches up when it is shown.
- A finished order is not asked for again.
- A failed read never blanks a page that was loaded; the customer is told it could not refresh.

**Dependencies**
- Built on `WI-CUST-007` (the order page) and `WI-MOB-001` (the Android order screen).
