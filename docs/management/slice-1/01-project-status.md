# Slice 1: project status

**As of 2026-10-28 (updated after `S1-07b`).** Companion documents: [plan and critical path](02-plan-and-critical-path.md), [prioritized backlog](03-prioritized-backlog.md). Scope is the first-slice contract (`docs/architecture/first-slice-contract.md`): **login, browse, customize, choose a pickup window, test checkout, confirmation and status**, through Next.js, the GraphQL BFF and the C# services, with CI and a trace.

Status words follow the repo rule: nothing is called working unless it was run. "Verified" says where.

## Summary

| | |
|---|---|
| **Overall** | **Slice 1 is complete: all 44 points are built and verified; only the documents of `S1-09` are still waiting for their PR.** The customer journey (login through the mock issuer, browse with stock states, customize, pick a pickup time, place a test order, see the confirmation in both states an order can start in) runs end to end on the real local stack, and the whole pipeline including that journey passed on Azure in run `#20261029.4` (reported by the human lead). |
| **Slice 1 remaining** | Nothing in scope. What follows is the next-after-slice work in `03-prioritized-backlog.md` (section B) and the register items marked "NEXT" or "before any deployment". |
| **Biggest risk** | **Nothing has been deployed, and nothing has run against real Azure Cosmos, a managed Redis or Application Insights.** Everything above is the local stack and the Azure build agent. The cookie-session and the DEV credentials (`N-01`, `N-02`) gate any deployed environment. |
| **Decisions** | All five decided 2026-10-28 (D-A option 1, D-B, D-C header-only, D-D allowlist built, D-E). Open for later: the cookie-session (`N-01`, ADR-0019). |
| **Pipeline** | Merged to `main`: all of the slice, the fix and the mock issuer hardening. Azure run `#20261029.4` (the PR build of `feature/slice-1-hardening`) passed; the run before it had failed on one test, which was a bug in the test. The evidence and plan documents are in `feature/slice-1-evidence`, awaiting its PR. |

## Delivery status by layer

| Layer | Items | Status | Verified |
|---|---|---|---|
| Shared libraries (`tools/`) | cache, events, data, auth (client credentials, mock issuer CORS), secrets, logging, schemas | Done | 167+ library tests, Auth suite 100; Linux container with a real Redis |
| Catalog service | listings, stock fields, reserve and release, vendor-verification publish gate | Done (`CAT-001`, `005`, `006`) | 104 tests; real stack |
| Ordering service | aggregate, persistence, checkout, pickup windows, outbox and events, order actions, automatic confirmation | Done (`ORD-001`, `002`, `005`, `006`, `007`, `008`; `ORD-003` partly) | 337 tests; Linux container; real stack incl. Placed to Completed on Redis |
| Service-to-service auth | client credentials, mock issuer support | Phase 1 done (`AUTH-006`); DEV credential not started | Real stack, local only |
| GraphQL BFF | listings, stock, pickup windows, order, `placeOrder`, token and trace forwarding | Done (`S1-01`) | 75 tests; real stack through the Next.js rewrite |
| Web: login | PKCE in the browser, in-memory token | Done (`S1-02`), merged | 25 unit tests, browser tests with a stubbed issuer, real issuer in the smoke |
| Web: browse, order, checkout, confirmation | stock states, options and quantity, cart, `/checkout`, `/orders/{id}` | Done (`S1-03`, `S1-04`, `S1-05`), merged | 53 unit tests; 57 browser tests against the mock BFF; the real-stack journey |
| Real-stack smoke | ordering and the issuer's client secret wired in; journey and wiring specs | Done (`S1-07a`, `S1-07b`) | 18 of 18 locally; two wiring mutations and two journey mutations caught |
| Mock issuer hardening | encoding, safe redirect, redirect_uri allowlist (`S1-06`) | Done | 133 Auth tests; real container in the smoke |
| Evidence, documents, trace | `S1-09` | Done; on `feature/slice-1-evidence`, awaiting its PR | A checkout and a page load each traced across their services; no secrets or identity in any span; `docs/evidence/slice-1/findings.md`; the Azure run id is recorded |
| Queue display, admin, notifications, vendor UI | out of slice 1 | Not started (by design) | n/a |

"Done" above means built and verified locally; the merged-to-main state is in the next section.

## What has merged, and what is pending

- **Merged:** auth, catalog work through `CAT-006`, ordering checkout, pickup windows, the outbox and events (`ORD-005`), the order actions (`ORD-007`), automatic confirmation (`ORD-008`), the BFF order path (`S1-01`), the web login (`S1-02`), stock states, the cart, the checkout and order status pages (`S1-03`, `S1-04`, `S1-05`), the real-stack wiring (`S1-07a`) and the browser journey (`S1-07b`), with the slice-1 planning documents.
- **Awaiting its PR (`feature/slice-1-evidence`):** the trace evidence and the slice findings (`S1-09`), the refreshed project plan, the outline's merge statuses, the first-slice contract reconciliation and the Azure run record.
- **Merged earlier:** the fix to the journey's pickup-time assertion and the mock issuer hardening (`S1-06`), in `feature/slice-1-hardening`.
- **Never run:** anything on real Azure Cosmos, a managed Redis, Application Insights or any deployed environment.

## Verification summary (this session, local)

| Check | Result |
|---|---|
| Ordering tests / catalog tests | 337 passed (3 emulator-gated skipped) / 104 passed |
| Linux container, real Redis (build, format gate, tools, catalog, ordering, Auth 133) | passed; Redis processed 128 commands (needs 50), finding A8 |
| BFF tests | 75 passed |
| Web unit tests / browser tests against the mock BFF | 53 passed / 57 passed |
| Real-stack smoke (login, issuer hardening, wiring, journey, walking skeleton) | 21 of 21 locally, and with tracing on; the same job passed on Azure in run `#20261029.4` (reported) |
| Trace across the hops, privacy scan of every exported span | a checkout through the BFF, ordering and the catalog; a page load through web, BFF and catalog; no token, key, secret, e-mail or customer identity exported (`docs/evidence/slice-1/findings.md`) |
| Mutation checks | about 90 across the session, all eventually caught; each survivor led to a new test or removed dead code |
| Bugs found by the real stack | a sold-out listing hid its options and allergens; a retry under a rejected checkout's key is refused (the client now uses a new key) |

## Gaps that matter to slice 1

Full classification of the register is in the backlog appendix. What is left on the slice-1 path:

1. **Nothing in scope remains.** Azure run `#20261029.4` is recorded (item 44, whose `ubuntu-26.04` half stays open); the trace evidence (items 42 and 49) and the document reconciliation are done.
2. **Known limitations, logged:** login lost on reload (item 24) and the follow-ups in item 77; order lines carry no item names (78); pickup times shown in the customer's zone (79); no order history (80); a rejected checkout's key is spent (81).

## Decisions (human lead)

| # | Decision | Status | Blocks |
|---|---|---|---|
| D-A | **Auto-confirm rule** for simple orders | **APPROVED 2026-10-28, option 1** (no customization and no pickup window; ignores stock counters). Built as `ORD-008` | done |
| D-B | **Global-ID scope (item 41)** | **APPROVED 2026-10-28.** `Order` and any field referring to a listing or an order is a global ID; `vendorId`, modifier ids and cursors stay raw | done |
| D-C | **Session storage** | **DECIDED 2026-10-28: header-only for now.** The cookie-session stays planned as ADR-0019 after slice 1 (`N-01`) | done |
| D-D | **Mock issuer `redirect_uri` allowlist** (security-adjacent) | **Built 2026-10-28 (`S1-06`)**, following "good to add". Exact match against `MockOidc:RedirectUris`, default the local web app's callback | done |
| D-E | **Queue display in or out of slice 1** | **APPROVED 2026-10-28: out of slice 1.** The older project plan is to be updated (`S1-09`) | done |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The pipeline's new smoke job fails on Azure for a reason a Windows machine cannot show (secret creation on a clean agent, start-up time of ordering-service, tzdata) | Medium | Medium | Push and read the first run before more is built on it; batch any fixes and push once |
| The smoke job becomes slow or flaky now that it carries ordering, Cosmos and a browser journey | Medium | Medium | Locally 18 tests run in about 20 s after about 3 minutes of start-up; measure on Azure, keep specs independent of each other's data |
| Login lost on reload (in-memory token) makes the demo awkward | Certain | Low | Documented (item 24); Playwright logs in per test; cookie-session as the follow-up |
| Shared files (BFF schema, lockfiles, pipeline YAML) collide between branches | Low now | Low | One owner at a time; the schema owner is finished |
| Estimates are relative and uncalibrated against a tracked velocity | Certain | Medium | Treat points as ordering aids, not forecasts; the 44-point plan has so far taken the order given, with extra work found by the real stack (the key rule, sold-out options) |
| Real Azure Cosmos and Redis behavior differs from the emulators | Medium | Medium | Out of slice 1; listed under deployment readiness |
