# Prioritized backlog with estimates

**As of 2026-10-28.** Companion to the [status](01-project-status.md) and the [plan and critical path](02-plan-and-critical-path.md). This is a planning view; the authoritative status of a work item stays in `docs/product/backlog/MASTER-BACKLOG-OUTLINE.md`, and unreconciled findings stay in `docs/governance/open-items-register.md`. New IDs here (`S1-xx`) are planning handles; each becomes a `WI-*.md` file (or maps onto an existing one) when picked up.

## Estimating scale

Relative story points (1, 2, 3, 5, 8, 13). They compare effort and risk against each other; there is no tracked velocity yet, so they are **not** a forecast and carry no dates. Rough anchors, judged after the fact on work already done:

| Points | Anchor |
|---|---|
| 2 | Add a field end to end with tests (for example stock status through the BFF and UI) |
| 3 | `GET /ordering/pickup-windows` with tests and docs |
| 5 | A service endpoint with its own rules and an HTTP test layer |
| 8 | `CAT-006` (reserve and release), `ORD-005` (outbox and relay), `ORD-007` (order actions) |
| 13 | A new subsystem with a design decision and unknowns (for example a first real payment integration) |

Estimates for items not yet refined (marked **rough**) are plus or minus 50%. Each point count includes tests, the mutation checks that fit, local and Linux verification, and the docs and register updates the repo requires.

Priority: **P0** slice 1 critical path, **P1** slice 1 off the critical path, **P2** next after slice 1, **P3** later, **P4** deferred or only on a trigger.

## A. Slice 1 (44 points)

| ID | Item | Pts | Pri | Depends on | Approval | Notes / acceptance summary |
|---|---|---|---|---|---|---|
| S1-01 | **BUILT 2026-10-28: S1-01a (read side) and S1-01b (placeOrder) are done and verified (75 BFF tests, real stack through the Next.js rewrite).** **BFF order path.** Read side (3): `Query.pickupWindows`, `Query.order`, `Listing.stock { status, maxPerOrder }` (item 64), `Order` as a node with a global ID. Write side (5): `Mutation.placeOrder` with the `PlaceOrderRejected` codes mapped from ordering's errors (`insufficient_stock`, `listing_unavailable`, `pickup_window_unavailable`, `payment_declined`, `invalid_modifier`, `invalid_quantity`, `idempotency_key_reuse`), forward the caller's `Authorization` and `traceparent` to ordering, an ordering client, resolver tests, an e2e test that the Next.js rewrite passes both headers. | 8 | P0 | D-B (approved) | Token forwarding is auth logic | Closes item 70 (BFF part) and item 64 (schema part). Domain rules stay in ordering; the BFF only composes and maps errors. `placeOrder` is one downstream call. Shared schema file: one owner. |
| S1-02 | **BUILT 2026-10-28 (verified: 25 unit tests, 12 browser tests with a stubbed issuer, 2 against the real mock issuer; needs the mock issuer CORS change).** **Web login.** PKCE redirect and callback page, access token in memory only, logout, an authenticated Relay fetch that sends the token, "login required" handling for `placeOrder` and `order`, expiry means re-login (item 24). | 5 | P0 | none (D-C decided: header-only) | Auth logic | Carries over the PKCE and in-memory-token requirements of the superseded `WEB-001`. Client-rendered authenticated pages only (item 26). Component and e2e tests against the mock issuer. |
| S1-03 | **BUILT 2026-10-28 (browser tests against the mock BFF; the real-stack journey is S1-07).** **Customize and checkout UI** (`CUST-003`). Option and quantity controls with client-side hints, pickup-window picker from `pickupWindows`, client-rendered checkout, an idempotency key per attempt (new UUID when the form opens), every error state of contract section 6, the demo-mode banner, Relay store updates. | 8 | P0 | S1-01, S1-02 | none | Server remains the validator. Accessible controls. |
| S1-04 | **BUILT 2026-10-28.** **Confirmation and status page** (`CUST-004`). `order(id)` view with status, lines, total, window, `private, no-store`, not-found for other users' orders, shows Placed versus Confirmed. | 3 | P0 | S1-01, S1-02, S1-03 | none | Order history list is optional and not required for slice 1. |
| S1-05 | **BUILT 2026-10-28.** **Stock states in the UI.** Show in stock, low and sold out on list and detail; disable ordering a sold-out item; respect `maxPerOrder`. | 2 | P1 | S1-01 | none | Closes item 64. |
| S1-06 | **BUILT 2026-10-28 (encoding, safe redirect and the allowlist; 133 Auth tests, 21/21 in the real-stack smoke).** **Mock issuer hardening.** HTML-encode the values the login page echoes (item 32, with a regression test); optional `redirect_uri` allowlist for the local web origins. | 2 | P1 | D-D (allowlist only) | Auth code | Dev-only component, but a real browser app now uses it. Also confirm item 33 (the `vendor-shop-001` mock user exists) and close it. |
| S1-07a | **BUILT 2026-10-28 (smoke 12/12 locally, incl. 5 new real-stack ordering checks; not yet run on Azure).** **Stack wiring in the smoke and pipeline.** Add the mock issuer, the ordering service (Cosmos, Redis, client secret via `init-env`) and its environment to `skeleton-smoke.mjs` and `azure-pipelines.yml`; update `local-dev.md`. | 3 | P1 | none | Pipeline YAML is a shared file | Do early to surface CI problems before the UI exists. Measure the added run time. |
| S1-07b | **BUILT 2026-10-28 (18/18 on the real stack locally incl. 6 journey tests; not yet on Azure).** **Journey spec and CI.** Playwright: browse, see stock states, log in, customize, choose a window, order; confirmation shows Placed (customized or windowed) and Confirmed (simple) with no vendor step; duplicate submit shows one order; declined test payment; expired login. Runs locally and in the pipeline. | 5 | P0 | S1-04, S1-05, S1-07a, S1-08 | none | Deterministic data from the seed; no sleeps. |
| S1-08 | **BUILT 2026-10-28** **`ORD-008` auto-confirm** (proposed, see the plan). Rule in ordering, configuration switch, `OrderPlaced` then `OrderConfirmed` from one write, record that the confirmation was automatic, tests including the outbox order and cancel-after-confirm stock release, lifecycle and contract docs updated. | 3 | P1 | D-A (approved, option 1) | Approved 2026-10-28 | The rule ignores stock-counter tracking, so no catalog change and no extra points. Needed by `S1-04` and `S1-07b` to show Confirmed. |
| S1-09 | **Evidence and reconciliation.** Trace across web, BFF, ordering and catalog (items 42, 49) captured; record the Azure run ID (item 44); update `first-slice-contract.md` (status, `placeOrder`, items 58 and 41), `WI-CUST-*`, `WI-PORT-002` and the outline; refresh `project-plan.md`; evidence file for the slice. | 5 | P0 | S1-07b | none | Last in the chain. |

**Slice 1 total: 44. Critical path: S1-01, S1-03, S1-04, S1-07b, S1-09 = 29.**

## B. Next after slice 1 (rough)

| ID | Item | Pts | Pri | Why next | Notes |
|---|---|---|---|---|---|
| N-01 | **Cookie-session / BFF session** (ADR-0019): HttpOnly `__Host-` cookie, server-side token store in Redis, CSRF defences, rotation and logout; replaces the in-memory token | 8 | P2 | Fixes reload logout (item 24), enables server-rendered authenticated pages (item 26); needs ADR-0006 and ADR-0012 amendments | Human approval (auth). Pull into slice 1 only if the human lead prefers avoiding the rework. |
| N-02 | **`AUTH-006` phase 2**: Entra app registrations, app-role assignment, DEV credential (federated identity preferred), `ADR-0018` verification list | 8 | P2 | Gates any deployed environment (item 62) | Human approval (IAM). |
| N-03 | **Vendor read side**: event-fed read model for vendor orders, "my orders" endpoint, own-listings read (items 63, 76); fix consumer-group naming first (item 29) | 13 | P2 | Vendors currently cannot see what is waiting; the vendor order lookup fans out across partitions | Prerequisite for any vendor UI and for `QUE-001`. |
| N-04 | **`QUE-001` + `QUE-002`** order-status read model and queue display | 8 | P2 | Showcases the event backbone; in the older plan's Phase 2 | Depends on N-03's read-model groundwork and item 29. |
| N-05 | **`ORD-003` remainder**: `PickupFulfillment` strategy, `PickupWindowScheduled`/`OrderReadyForPickup`, pickup-confirmed command that takes over `complete` | 5 | P2 | Completes the lifecycle design (item 59) | |
| N-06 | **Stock correctness follow-ups**: reservation records cleanup (item 66), release against a changed counter (item 67), orphan reservation cleanup (item 62), emulator concurrency tests in CI (item 65) | 8 | P2 | Correctness under failure; some are latent defects | Items 66 and 67 should be reviewed before any real vendor use. |
| N-07 | **Outbox hardening**: poison-entry handling and attempt counter (item 74), catalog outbox (item 30), stream retention (item 75) | 5 | P2 | Needed before more event types or consumers exist | |
| N-08 | **`PAY-001`**: real payment (Stripe Connect), void/idempotency (items 53, 69), ADR-0005 amendment | 13 | P3 | Replaces the stub | Rough; needs a design pass. |
| N-09 | **`NOT-001` + `NOT-002`**: notifications on order events | 8 | P3 | Needs a consumer (items 29, 75) | Rough. |
| N-10 | **Container images and hosting decision**: ordering and catalog images (item 71), BFF and web hosting (item 25), time-zone data | 8 | P3 | Deployment readiness | Rough; INFRA items not yet detailed. |
| N-11 | **Tracing completion**: SDK or collector decision, cloud trace pipeline (items 36, 37), per-service coverage | 5 | P3 | Operational proof beyond the skeleton | |
| N-12 | **Personalization (M4)**: `PREF-001` (5), `PREF-002` (3), `SRCH-001` (5), `CUST-005` (5), `CUST-006` (3) | 21 | P3 | Delivers vision principle 1 end to end | Detailed and Ready in the outline; blocked on slice 1's web foundation. |
| N-13 | **Vendor onboarding**: `VEN-001` (5), `VEN-002` (5) | 10 | P3 | Replaces the seed script's vendor-verification workaround | |
| N-14 | **Caching layers**: `CAT-003` cache-aside (5), `PORT-004` three-layer contract (3) | 8 | P3 | Demonstrates ADR-0014 | |
| N-15 | **Process hygiene**: refresh `project-plan.md`, roadmap and OKR stubs; stale register items (10, 11, 14); ACTIVITY-LOG decision (item 50); docs site publish (item 13); retire stale B2C references (item 23) | 3 | P3 | Planning documents contradict the repo | |

## C. Deferred or only on a trigger (not estimated)

Admin console (`ADM-*`), reviews (`REV-001`), advertising (`ADV-*`), delivery (`FUL-001`), refunds and chargebacks (items 6, 57), vendor staff users and account deletion (item 60), vendor-response timeout (item 55), second-quality/day-old goods (item 61), availability windows and per-item pickup rules (item 51), per-vendor time zone (item 39), policy engine (item 8), key rotation without restart (item 9), multi-currency (item 7).

## D. Totals

| Bucket | Points | Notes |
|---|---|---|
| Slice 1 | 44 | critical path 29 |
| Next after slice 1 (rough, N-01 to N-15) | 131 | N-12 and N-13 (31) are personalization and onboarding; the rest is hardening and deployment |

---

## Appendix: triage of the open-items register (76 items)

Buckets: **S1** needed for slice 1; **NEXT** planned after slice 1; **DEP** needed before any deployed environment; **DEF** deferred by decision or an accepted limitation; **DONE** resolved or built (some register entries are stale and should be reconciled in `N-15`).

| # | Item (short) | Bucket | Action / pointer |
|---|---|---|---|
| 1 | Redis Basic tier has no AAD data-plane auth | DEP | Cloud cache decision (item 22) |
| 2 | Cosmos Linux emulator partial coverage | DEF | Mitigated by the vNext emulator |
| 3 | Cosmos shared RU budget | DEP | Capacity planning when deploying |
| 4 | Cosmos per-container resource tokens | DEF | Accepted blast radius |
| 5 | Partition keys are v1 guesses | DEP | Validate under load (orders by customer; item 76 shows the vendor cost) |
| 6 | Chargebacks deferred | DEF | With `PAY-001` follow-ups |
| 7 | Single currency | DEF | |
| 8 | No central policy engine | DEF | |
| 9 | Secret rotation needs a restart | DEF | |
| 10 | `docker-compose.yml` is a stub | DONE | Stale; compose exists (`WI-DEV-002`). N-15 |
| 11 | Tooling packages not scaffolded | DONE | Stale; `tools/` exists. N-15 |
| 12 | GitHub Projects board not created | DEF | This backlog is the interim view |
| 13 | Docs site not published | NEXT | N-15 |
| 14 | CI workflow is a placeholder | DONE | Stale; Azure Pipelines is the CI (ADR-0015). N-15 |
| 15 | No ephemeral/preview environment | DEP | |
| 16 | Delivery fulfillment deferred | DEF | |
| 17 | Ad-bidding platform deferred | DEF | |
| 18 | B2B supplier flow scoped out | DEF | |
| 19 | Work-item template | DONE | |
| 20 | API gateway / BFF layer | DONE | ADR-0013 |
| 21 | AAD B2C to Entra External ID | DEP | N-02 |
| 22 | Redis vendor reconsideration | DEP | |
| 23 | Stale B2C references in old docs | NEXT | N-15 |
| 24 | No refresh token / silent renewal | S1 | Accepted for slice 1 (`S1-02`); N-01 |
| 25 | Frontend/BFF hosting undecided | DEP | N-10 |
| 26 | SSR of authenticated pages deferred | DEF | Revisit with N-01 |
| 27 | No per-user throttling at the BFF | DEP | |
| 28 | Catalog public reads probe a partition per vendor | DEP | Performance at scale |
| 29 | Consumer groups named per event type | NEXT | Before the first subscriber (N-03/N-04) |
| 30 | No outbox for publish-after-save | NEXT | Ordering done; catalog gap in N-07 |
| 31 | Cosmos adapter tests may miss the serializer path | NEXT | N-06 area |
| 32 | Mock issuer login page injects unescaped values | S1 | `S1-06` |
| 33 | Mock users and seed vendor ids do not line up | S1 | The `vendor-shop-001` mock user exists; confirm and close in `S1-06` |
| 34 | Cosmos SDK/emulator versions coupled | DEF | |
| 35 | Eventing Redis tests not repeatable on one Redis | NEXT | Partly mitigated by the Linux check and finding A8 |
| 36 | Node tiers use hand-rolled OTLP | NEXT | N-11 |
| 37 | Cloud trace pipeline not built | DEP | N-11 |
| 38 | Catalog span records `url.query` | DONE | |
| 39 | No per-vendor time zone | DEF | Partly resolved |
| 40 | Money representation not uniform | NEXT | Doc/code alignment, small; `S1-09` can fold in the doc part |
| 41 | Scope of the global-ID rule | S1 | Decision D-B; `S1-01` |
| 42 | Remaining tracing gaps in the skeleton | S1 | `S1-09` |
| 43 | Mock e2e and smoke share `.next` | DONE | |
| 44 | Green Azure run has no recorded ID | S1 | `S1-09` |
| 45 | Azure check is a soft gate | DEF | Accepted (GitHub plan limits) |
| 46 | `PORT-006` pass 2 / `PORT-007` | DONE | |
| 47 | `CorrelationId` alias has no retirement date | DEF | |
| 48 | D-10 beyond the hook, window endpoint | DONE | Both exist; reconcile the entry in N-15 |
| 49 | Other C# services do not call `AddBakeryTelemetry` | S1 | Verify ordering and catalog in `S1-09`; admin/notification are empty |
| 50 | Role of `ACTIVITY-LOG.md` | NEXT | N-15 |
| 51 | Availability windows / per-item pickup rules | DEF | Placeholders acceptable for slice 1 |
| 52 | Who owns stock | DONE | ADR-0017 |
| 53 | Payment timing vs vendor confirmation | NEXT | N-08; note `ORD-008` interaction |
| 54 | Vendor order-action endpoints | DONE | `ORD-007`, pending merge |
| 55 | Vendor-response timeout | DEF | |
| 56 | Pickup no-show rule | DONE | |
| 57 | Customer cancellation window and refunds | DEF | |
| 58 | First-slice decisions shifted by lifecycle | S1 | `S1-09` |
| 59 | `OrderPlaced` total / event families | DONE | |
| 60 | Vendor staff users, account deletion | DEF | |
| 61 | Prepared, day-old, defective items | DEF | |
| 62 | Service auth DEV credential and orphan reservations | DEP | N-02, N-06 |
| 63 | Vendors cannot read their own listings | NEXT | N-03 |
| 64 | Stock status not in the GraphQL schema | S1 | `S1-01`, `S1-05` |
| 65 | Emulator concurrency tests not in CI | NEXT | N-06 |
| 66 | Reservation records never cleaned up | NEXT | N-06 |
| 67 | A release adds to whatever the counter is now | NEXT | N-06 (latent correctness defect) |
| 68 | `OrderPlaced` never published | DONE | `ORD-005` |
| 69 | Payment stub needs void and its own idempotency key | NEXT | N-08 |
| 70 | No BFF `placeOrder` / web checkout | S1 | `S1-01` to `S1-04` |
| 71 | No container image for ordering | DEP | N-10 |
| 72 | Outbox relay at scale | DEF | Lease or change feed if needed |
| 73 | Catalog silent in-memory events default | DONE | |
| 74 | Poison outbox entry blocks later events | NEXT | N-07 |
| 75 | Redis streams have no retention; no consumer yet | NEXT | N-07 |
| 76 | Vendor lookup fans out; no "my orders" | NEXT | N-03 |

Counts (computed from the table above, 76 items): **S1 = 10** (24, 32, 33, 41, 42, 44, 49, 58, 64, 70), **NEXT = 18**, **DEP = 12**, **DEF = 21**, **DONE = 15**. Re-derive them if the table changes.

## Appendix: gaps outside the register

These came from comparing the plan documents with the repo and are not yet register items:

1. **Planning documents contradict the repo.** `docs/management/project-plan.md` reports Phase 1 and Phase 2 as "Not started"; `roadmap.md` and `okrs.md` are stubs. Fix in `S1-09` (status line) and N-15.
2. **Scope disagreement on the queue display.** The older plan puts the queue display in Phase 2; the first-slice contract excludes it. Decision D-E.
3. **No automated test of the authenticated browser path** exists yet, and the Next.js rewrite's handling of `Authorization` and `traceparent` has not been checked by test (covered in `S1-01`).
4. **No recorded performance or load baseline** for any path (the register and NFRs name targets). Not needed for slice 1; needed for any claim about scale.
5. **Vendor experience is entirely absent** (no listing management UI, no order inbox, no read APIs for either). This is a deliberate slice exclusion but the largest product gap for a "marketplace" demonstration; see N-03.
