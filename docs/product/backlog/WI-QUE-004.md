> **Status:** In review · evidence: the Outcome note under this banner; `docs/evidence/WI-QUE-004/`

> **Outcome note (2026-11-02):** built on `feature/vendor-actions`, not merged. The BFF serves `Mutation.vendorOrderAction` (17 tests, BFF 124 in all); each order card in the queue display offers the buttons its status allows, with the decline asked twice and the buttons off while the action is in flight and until the order shows its new status (12 browser tests and 4 unit tests; queue display 44 browser and 26 unit in all). The real-stack run (`skeleton-smoke.mjs`, 27 passed) works an order through the whole line from the buttons and checks the customer's own view of each step, a decline, another vendor's order (not found), a customer's token (forbidden), a repeated action (not allowed now) and a call without a token. The new browser tests also pass in Firefox and WebKit. Security-property tests were shown to fail with the check removed (the role mapping, the id decoding and the path encoding in the BFF; the in-flight disabling and the decline question in the browser tests); the CSRF refusal is the shared session package's check, exercised here by a test on the mutation, not mutated (that package needs the lead's approval to change). Not done: a vendor cancel after confirmation, the customer's pickup confirmation, rate limiting of actions (register item 128), any run on Azure or with a real identity provider. **Found by the real-stack run and not fixed here:** the board can replace a pushed change with an older list read (register item 133).


```
WI ID:                QUE-004
Title:                The vendor's actions in the queue display: confirm, decline, start, ready, complete
Type:                 Frontend (with a BFF mutation)
Epic:                 EPIC-QUEUE-DISPLAY
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 M
Verification class:   V3 + J (a state-changing action by a role, across the browser, the web app, the BFF and ordering). The classes are proposed in `docs/process/verification-policy.md` (register item 130) and not yet adopted; this item follows them as a trial.
```
ADRs and NFRs affected: ADR-0006 and ADR-0008 (the service still decides who may act), ADR-0013 (the BFF is composition and error mapping only), ADR-0019 (the action goes through the session and the CSRF checks of `/api/graphql`), ADR-0021 (the result reaches the screen by the stream); NFR 3.1 and 3.3.

**Context / Why**
The queue display shows a vendor their orders live (`WI-QUE-002`, `WI-QUE-003`) but the vendor cannot act on them. The endpoints exist (`WI-ORD-007`: confirm, decline, start-preparation, ready, complete). `WI-QUE-003` named this as the next product step. It completes the vendor's loop: an order arrives, the vendor accepts it, prepares it, marks it ready and hands it over.

**Inputs / References**
- *Decisions*: ADR-0013 (no business rules in the BFF), ADR-0006 (ownership and role are the service's), ADR-0019 (session, CSRF), ADR-0021 (the screen learns of the change from the stream or the poll).
- *Interfaces*: `POST /ordering/orders/{id}/{confirm|decline|start-preparation|ready|complete}` (`OrderActionEndpoints.cs`: 200 with the order, 404 for a non-owner or a missing order, 409 with the current status when the action is not allowed now); the BFF schema `services/graphql-bff/schema/schema.graphql`; `apps/web-queue-display/src/components/QueueBoard.tsx`.
- *Environment/tooling*: the queue display's mock BFF (`npm run mock`) and the fake issuer; for the real-stack run, `docs/operations/local-dev.md`.
- *Test/chaos methodology*: `docs/process/test-strategy.md`, `docs/process/verification-policy.md`, `docs/process/playwright-guide.md`.
- *Business context*: `docs/architecture/order-lifecycle.md` (which action is valid from which status).

**You do not need to know about**
- The order aggregate, the outbox and the stock release: ordering already does them on each action.
- The customer app.

**Out of scope**
- A vendor **cancel** of an order already confirmed or later. The endpoint exists, but cancelling after confirmation has stock and customer consequences nobody has designed in the UI: a later item.
- Pickup confirmed by the customer and the `PickupFulfillment` events (`WI-ORD-003`).
- Optimistic updates, undo, bulk actions, a sound, or telling the customer (`NOT-001`).

**Requirements / Acceptance Criteria**
1. The BFF serves `Mutation.vendorOrderAction(input: { orderId: ID!, action: VendorOrderAction! }): VendorOrderActionPayload!` with `VendorOrderAction` = `CONFIRM | DECLINE | START_PREPARATION | MARK_READY | COMPLETE`. The BFF maps the enum to the ordering path and forwards the caller's token unchanged. It holds no rule about which status allows which action.
2. The payload is a union. Success carries the order id and its new `status`. An expected refusal is `VendorOrderActionRejected` with a code (`NOT_FOUND` or `NOT_ALLOWED_NOW`), a fixed client-safe message and, for `NOT_ALLOWED_NOW`, the order's current status. No text from ordering reaches the client. A missing and a foreign order are both `NOT_FOUND` (ordering answers 404 for both and the BFF does not tell them apart). No token is `UNAUTHENTICATED`; a token without the vendor role is `FORBIDDEN`; any other downstream failure is a generic error, as for the other operations.
3. The order id is a global id and is decoded in the BFF; one that does not decode is `NOT_FOUND` without a call to ordering.
4. Each order card shows only the buttons its status allows. Placed: **Accept** and **Decline**. Confirmed: **Start preparing**. In preparation: **Mark ready**. Ready: **Handed over** (complete). The buttons are a hint; the service decides.
5. **Decline** asks for a second click ("Decline this order?") before it is sent; the other actions are one click.
6. While an action is in flight the card's buttons are disabled (no double send). A failure re-enables them and says what happened in words, not codes: the order changed (and the card refreshes), it could not be found, or the action failed and may be tried again.
7. The card moves column when the stream or the next poll delivers the new status; the action's own response does not edit the board (one source of truth; `sequence` still decides), and a success does not fetch the list (a list read that started before ordering's read model caught up could put the order back: register item 133). A refusal or a failure does ask for the list, because the screen was behind. The result is announced in the existing live region.
8. The buttons are real `<button>` elements with the order reference in the accessible name ("Accept order AB12"), reachable by keyboard, and the page has no automatically detectable accessibility violation with buttons showing.
9. **Abuse and failure cases, each with a test:** a repeated click, or two tabs racing the same action (one succeeds, the other shows the order changed, and there is no second effect); an action on another vendor's order (404 mapped to not found, in the BFF test and against the real ordering service); a customer's token (403); no token; a hostile order id; a large or malformed body to the mutation (the existing limits hold); ordering down or slow (a bounded wait and a message, not a hang); the action sent without the session's CSRF headers (refused by the web app, nothing reaches the BFF).
10. The security-property tests (role, ownership, CSRF) are shown to fail when the check is removed, and the outcome note says how.
11. An evidence run on the real stack from a stated starting state: a customer places an order with an option (so it needs the vendor), and the vendor accepts, starts, marks ready and completes it in the browser while the card moves through the columns; plus a decline, and the refusal of another vendor's order. Recorded with the commit, command, date and raw output under `docs/evidence/WI-QUE-004/`.
12. The Chromium suites pass; the new tests are also run once in Firefox and WebKit (`BROWSERS=all`, from `feature/cross-browser`) and any difference is recorded.

**Dependencies**
- Blocks: none.
- Blocked by: none (`WI-ORD-007`, `WI-QUE-002` and `WI-QUE-003` are Done).
- Can be worked in parallel with: the process review (`feature/process-review`) and the cross-browser work (`feature/cross-browser`).

**Verification**
Class V3 and J from `docs/process/verification-policy.md` section 2, with the abuse cases above as the limits checklist. This item adds no connection or resource; the rate of actions per caller is register item 128.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Full for the build. Flag, do not choose: any change to `packages/web-session` (shared and security-sensitive; needs the lead's approval) and any need to change ordering's authorization.

**Interfaces consumed**: ordering's five action endpoints; the queue display's existing `/api/graphql` route.
**Events published/consumed**: none new (ordering publishes the order events; the screen sees them through the existing stream).
**Data touched**: none directly.

**Open Points (working)**
- [ ] Register item 133 (the board's list can overwrite a newer pushed change): the lead decides whether to change `WI-QUE-003`'s board logic.
- [ ] Vendor cancel after confirmation: left out. The lead decides whether and when (stock and customer consequences).
- [ ] Whether "Handed over" should wait for the customer's pickup confirmation (`WI-ORD-003`). Until then the vendor's complete is the only completion.
- [ ] Should Decline take a reason? Ordering takes none in v1 (the reason code is fixed).
