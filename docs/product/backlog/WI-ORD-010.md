> **Status:** Proposed · written 2026-11-06 from register item 150; the lead has approved the direction (data instead of a test switch) and the draft is waiting for the lead's approval before it becomes Ready

```
WI ID:               ORD-010
Title:                Payment methods as data: a customer's saved payment method is chosen at checkout, and the payment stub judges its token (replaces the decline switch and the X-Test-Payment header)
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  EPIC-WEB-CUSTOMER, EPIC-QUALITY-EVIDENCE
Hat/Owner:            Engineering/Build, Architect (contract change)
Status:               Proposed
Size:                 L
Verification class:   V2 (checkout contract and a payment-adjacent input; no card data, no real provider). Classes are proposed in `docs/process/verification-policy.md`.
```
ADRs and NFRs affected: ADR-0005 (the real design: card entry in the provider's hosted fields, so card data never reaches us; this item builds the stand-in for the token that step returns), ADR-0007 (nothing secret is stored), ADR-0013 (the BFF adds no business fields beyond a reference to a stored method), first-slice contract D-10 (replaced; a dated note is added, its text is not edited), NFR 3.7 (a payment method reference is personal data).

**Context / Why**
Today a test reaches the declined-payment path by sending `X-Test-Payment: decline`. The header is forwarded by the web app's proxy (`GRAPHQL_EXTRA_FORWARDED_HEADERS`), by the BFF only when started with `ENABLE_TEST_HOOKS=1`, and honoured by ordering outside Production; the Android app has a "Test: decline the payment" switch compiled in by `EXPO_PUBLIC_TEST_HOOKS=1`. That is a mechanism that exists only so a test can reach a path (register 150; `CLAUDE.md`: "Don't build functionality only to close a gap in testing"). Close the gap with **data**: each customer has saved payment methods, each with an opaque token and a description, as seed data. The customer picks one at checkout; the payment stub accepts valid tokens and rejects invalid ones. A declined payment is then reached by choosing a method whose token is invalid, exactly as a customer would in a real product, and no switch, header, flag or build variant is needed. This also gives the later Stripe integration (ADR-0005) its shape: the client sends a reference to a method, the provider token stays server-side.

**Inputs / References**
- *Decisions*: register 150 (the lead, 2026-11-06: a simple token plus description per customer, a dropdown at checkout, the stub rejects invalid tokens, at least one invalid token seeded); `CLAUDE.md` working conventions ("Test state a flow needs belongs in seed data with a named, self-describing fixture"); ADR-0005 and ADR-0007 (opaque token, no card data).
- *Where the old mechanism lives* (all to be removed): `CheckoutEndpoints.cs` (`TestPaymentHeader`, `forceDecline`), `CheckoutModels.cs` (`PaymentRequest.ForceDecline`, the stub's decline branch), `CheckoutService.cs` (`forcePaymentDecline`), BFF `config.ts` (`testHooks`), `ordering-client.ts` and `resolvers.ts` (`testPayment`), `server.ts` (the `x-test-payment` read), `packages/web-session/src/graphql-proxy.ts` and its tests, `scripts/lib/local-stack.mjs` (`GRAPHQL_EXTRA_FORWARDED_HEADERS`, the `testHooks` option), `scripts/ci/skeleton-smoke.mjs`, `scripts/dev/mobile-stack.mjs`, `scripts/dev/mobile-flows.mjs`, `scripts/lib/mobile.mjs` (`EXPO_PUBLIC_TEST_HOOKS`), `CheckoutScreen.tsx` (the switch), `apps/web-customer/mock-bff/server.mjs` and `playwright.config.ts`, and the tests listed under "Tests".
- *Seed pattern to copy*: the seeded customers' allergen profiles (`tools/BakeryMarketplace.Seed`, `SeedData.CustomerProfiles`, `SeedCustomerProfilesTests`, written only when absent).

**You do not need to know about**
- Real Stripe, Connect, webhooks or commission (ADR-0005, a later item); the vendor side; the orders' lifecycle.

**Out of scope**
- Adding, editing or deleting a payment method in the UI (the methods are seeded; a customer cannot create one); card entry of any kind; a real provider; refunds; showing the method on the order page or in notifications (see open questions).
- Any card number, expiry, CVC, last-four or brand field: the **description is free text written by the seed** (for example "Test card, accepted"), and nothing parses it.

**Design (proposed; the lead may amend)**
1. **Where the data lives.** Ordering owns payment, so ordering owns the data: a `payment-methods` container (partition key `/customerId`, created by ordering's start-up beside `orders`, and by the seed tool, as for `preferences`). One document per method: `id` (a stable, non-secret method id such as `pm-alice-ok`), `customerId` (the token's `sub`), `description` (shown to the customer), `token` (opaque; never returned by any API, never logged), `createdAt`. Read through `IRepository<T>` like the other containers.
2. **Reading the list.** `GET /ordering/payment-methods` (Customer role; the customer id comes from the token; own methods only; a missing document set is an empty list). It returns `[{ id, description }]`, **not the token**. Other customers' methods are not reachable (404-equivalent: not in the caller's partition).
3. **Checkout.** `CheckoutRequest` gains `paymentMethodId` (a string, the id above). The client never sends a token. Ordering loads the method **from the caller's own partition**, so an id that is missing, empty or belongs to someone else is a `validation_failed` problem on field `paymentMethodId` (same answer for "not yours" and "does not exist", no oracle). The method's token goes into `PaymentRequest` (replacing `ForceDecline`). The idempotency fingerprint includes the method id: a retry with the same key and a different method is `idempotency_key_reuse`, as for any other changed field.
4. **The stub.** `StubPaymentProcessor` judges the token with one fixed rule, written in the class and unit-tested: a token that does not start with the accepted prefix, or is in the small set of reserved declined tokens, is declined; all others are approved. It still logs a warning per call and never logs the token. A decline is the existing `payment_declined` / HTTP 402 path (the order is not stored, stock is released, the idempotency key is spent as today). No Production switch is needed any more: there is nothing to turn on.
5. **BFF.** A query `me { paymentMethods { id description } }` (or the nearest existing customer-scoped field; same style as the allergen profile) forwards to the new endpoint; `PlaceOrderInput` gains `paymentMethodId: ID!`. The BFF maps and forwards; it holds no rule about which token is valid. `PAYMENT_DECLINED` stays. `ENABLE_TEST_HOOKS` and the forwarded header are deleted from the BFF; if nothing else uses the flag, the flag goes too (confirm by search; otherwise only the payment part is removed).
6. **Apps.** Both customer apps show a "Payment method" dropdown (a select on the web, a picker on Android) on the checkout screen, filled from the query, **with the first method selected by default** (open question 2) and a visible description for each. With no methods the order cannot be placed and the screen says so. The existing "a banner says no payment is taken" stays. The Android switch and the `EXPO_PUBLIC_TEST_HOOKS` build variant are removed; the decline flow chooses the declined method from the picker.
7. **Seed data** (in `tools/BakeryMarketplace.Seed`, written only when absent, like the profiles; one named fixture list with a comment on each row): every seeded customer (the five mock customers) gets **an accepted method**; **Alice also gets a declined method** (and one customer, to be named, gets two accepted ones so a dropdown with a real choice is covered). Suggested: `pm-alice-ok` "Test card (accepted)", `pm-alice-declined` "Test card (always declined)", tokens `pm_test_ok_<n>` and `pm_test_declined_<n>`. A seed test keeps the list in step with the mock users (as `SeedCustomerProfilesTests` does) and checks that each accepted token is accepted and each declined token declined by the stub.

**Requirements / Acceptance Criteria**
- No code path, header, flag, environment variable, build variant or UI control remains whose only purpose is making the stub decline: a repository search for `X-Test-Payment`, `x-test-payment`, `ForceDecline`, `forcePaymentDecline`, `TestPaymentHeader`, `testPayment`, `declineTest`, `decline-test` and `EXPO_PUBLIC_TEST_HOOKS` finds nothing outside git history, the register and dated notes.
- A seeded customer's list returns exactly their own methods, with `id` and `description` and **no token field** (asserted on the HTTP body and on the GraphQL result); another customer's list does not contain them.
- Checkout with an accepted method places the order (201, then 200 on a repeat of the same key); with the declined method it answers 402 / `PAYMENT_DECLINED` and takes nothing from stock (the stock check the current tests make); with a missing, empty, unknown or **another customer's** method id it answers `validation_failed` on `paymentMethodId`, identically for the last two.
- The same key with a different method id is `idempotency_key_reuse`; the same key and method is a repeat.
- The token never appears in a response, a log line (assert on a captured logger), an error, a trace tag or an order document.
- Both apps: the dropdown lists the customer's methods; choosing the declined one shows "The payment was declined.", keeps the order and (as now) lets the customer choose another method and place it (with a new key where the existing rule requires it); with no methods the place button is disabled with a message.
- The existing journeys keep their meaning: every test that formerly sent the header now chooses the declined method; nothing that places an order without a method remains.
- Each new test group is shown to **fail** when the behaviour is broken (a one-line mutation per group, run and recorded), per `docs/process/verification-policy.md`.
- `docs/architecture/first-slice-contract.md` gets a dated note under D-10 (replaced by this item; decision text not edited), `data-model-api-contracts.md` and `docs/operations/local-dev.md` describe the new endpoint, field, container and the seeded methods, and register 150 part 2 is marked resolved with a pointer here.

**Tests (existing ones that change, new ones that are added)**
- Ordering (`services/ordering-service/tests`): `CheckoutTestSupport.cs` and `OrderingFactory.cs` stop using the header and seed a method per test customer; new tests for the list endpoint, the checkout cases above, the stub's rule and the logging; the 475-test count will change, so record the new number.
- BFF (`services/graphql-bff`, 221 tests): the `testPayment` tests go; new tests for the query, the input field and the mapping.
- `packages/web-session` (`graphql-proxy.ts`, `graphql-proxy.test.ts`, `fuzz.test.ts`): the forwarded-header allowance is removed with its tests; check the fuzz cases still mean something.
- `apps/web-customer`: `tests/e2e/checkout.spec.ts` and the mock BFF (`mock-bff/server.mjs`) serve and choose methods; `tests/skeleton/journey.spec.ts` and `stack.spec.ts` choose the declined method; `playwright.config.ts` and `scripts/ci/skeleton-smoke.mjs` lose the hook settings. The browser suites' counts change; record them. The accessibility scan covers the new control.
- `packages/customer-core`: a payment-method type and the checkout input carrying `paymentMethodId` (both apps use it); its tests.
- `apps/mobile-customer`: the picker; Maestro flow `04-declined-payment.yaml` chooses the declined method and then an accepted one; every flow that places an order keeps working with the default selection. The app's unit tests (25) are unaffected unless the API module changes. The thirteen flows must be run again; no claim of a pass without a run.
- The Docker `apps` profile and `--containers` smoke: seed runs before; confirm the `payment-methods` container is created in both places.

**Migration and removal**
One change set, no compatibility period: the system is local only and every client is in this repository. The header is removed in the same item that adds the field, so no state exists in which the stub can be made to decline both ways. Existing local data is reset by `docker compose down` (no migration of stored orders: orders do not store the method; see open question 4).

**Dependencies**
- Blocked by: the lead's approval of this spec and of the open questions below. Touches the checkout contract, the BFF schema and `packages/web-session` (shared files: `schema.graphql`, `package-lock`, root scripts; one branch at a time, `docs/management/portfolio-slice/07-shared-file-ownership-and-coordination.md`). Do not start before the register 137 branch lands or is deliberately sequenced: both edit the web proxy.
- Related: register 150 (this resolves part 2; part 1, the flow-control server, stays), `WI-MOB-003` (flow 04 and the fault-injection flows), ADR-0005.

**Definition of Done**
See `docs/process/definition-of-done.md`. Done also needs: the search in the first acceptance criterion run and shown; a full run of the customer browser suite (`npm run test:e2e`), `skeleton-smoke.mjs`, the BFF and ordering tests, and the thirteen Maestro flows, each reported as passed, failed or not run; the human lead's review of the checkout contract change.

**AI-agent suitability**
Yes for the build. Everything touching the checkout contract and the BFF schema goes to the lead before merge (shared contract); no auth logic changes (the new endpoint uses the existing customer policy and ownership by partition).

**Risks**
- *A payment-adjacent field in the contract.* Mitigation: only an id crosses the wire; the token stays in ordering; the test asserts no token in any output.
- *A stored token is a credential-like value.* In this stub it is a fake string; the real integration will store a provider token or only the provider's customer reference (ADR-0005); the document is shaped so that swap changes one field.
- *Oracle for other customers' method ids.* Mitigation: same answer for unknown and foreign ids.
- *Required field breaks every caller at once.* Accepted: local only, all callers in the repo; a forgotten caller fails loudly in its test.
- *The rule in the stub is itself a test mechanism.* It is not a switch: it is the stub's stand-in for a provider's verdict on a token, driven by the data. It is kept for review in the register as "the stub's token rule" rather than hidden.
- *Many files, one change.* Mitigation: build in this order and run each layer's tests before the next: ordering, BFF, customer-core, web, Android, scripts and docs.

**Open Points (for the lead)**
- [ ] 1. **The stub's rule.** Proposed: accept a token with the `pm_test_ok_` prefix, decline anything else (including the reserved `pm_test_declined_` tokens), so "invalid" is the default and a typo in the seed cannot silently approve. Alternative: decline only a named set. Which?
- [ ] 2. **Required or optional `paymentMethodId`, and a default.** Proposed: required in the contract, the apps preselect the first method. Alternative: optional, with the customer's first method used when absent (less to change, but hides the choice). Which?
- [ ] 3. **Where the list is read.** Proposed: ordering's own endpoint and container (it owns payment). Alternative: the catalog's `preferences` container beside the allergen profile (no new container, but payment data in the catalog service, against the context boundaries of ADR-0009).
- [ ] 4. **Record the chosen method on the order?** Proposed: no (the order keeps no payment detail, as now); the idempotency fingerprint carries the id. Alternative: store the method id on the order so the order page and support can show "paid with X" (adds a field to `Order` and its events, which `notification-service` consumes).
- [ ] 5. **Description wording and the invalid seeds.** Proposed names above; one declined method for Alice only, so the other four customers' flows cannot hit a decline by accident. Also: should one customer have no methods at all, to cover the "no methods" screen with data (one more seeded customer, or an existing one)?
- [ ] 6. **Is `ENABLE_TEST_HOOKS` removed entirely?** Proposed: yes if the search shows nothing else uses it; otherwise only the payment part. To be confirmed by search at build time, then the register entry for the BFF hook is closed.
- [ ] 7. **Sequence with register 137 and 152:** 137 also edits the web proxy; propose 137 first, then this item.
