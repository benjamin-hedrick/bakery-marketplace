# Slice 1: project status

**As of 2026-10-28.** Companion documents: [plan and critical path](02-plan-and-critical-path.md), [prioritized backlog](03-prioritized-backlog.md). Scope is the first-slice contract (`docs/architecture/first-slice-contract.md`): **login, browse, customize, choose a pickup window, test checkout, confirmation and status**, through Next.js, the GraphQL BFF and the C# services, with CI and a trace.

Status words follow the repo rule: nothing is called working unless it was run. "Verified" says where.

## Summary

| | |
|---|---|
| **Overall** | Backend is complete for slice 1 and ahead of it. The customer-facing half (login, checkout, confirmation) is **not started**. |
| **Slice 1 remaining** | About **44 points** across 10 items (see the backlog). The critical path is about **29 points** (BFF order path, then checkout UI, then confirmation, then the full-stack journey test, then evidence). |
| **Biggest risk** | The authenticated browser path has never been run: no login code exists in `apps/web-customer`, and the BFF forwards no token. Everything on that path is first-time work. |
| **Decisions** | Four of five decided 2026-10-28 (D-A option 1, D-B, D-C header-only, D-E). One open: D-D (mock issuer allowlist), which blocks only part of `S1-06`. |
| **Pipeline** | The last pushed branch was green on Azure. The current branch (`feature/order-events`, 21 commits) is pushed and its PR is not yet opened or run. |

## Delivery status by layer

| Layer | Items | Status | Verified |
|---|---|---|---|
| Shared libraries (`tools/`) | cache, events, data, auth (incl. client credentials), secrets, logging, schemas | Done | 167+ library tests; Linux container with a real Redis |
| Catalog service | listings, stock fields, reserve and release, vendor-verification publish gate | Done (`CAT-001`, `005`, `006`) | 104 tests; real stack with Cosmos emulator and Redis |
| Ordering service | aggregate, persistence, checkout, pickup windows, outbox and events, order actions | Done (`ORD-001`, `002`, `005`, `006`, `007`; `ORD-003` partly) | 320 tests; Linux container; real stack incl. Placed to Completed on Redis and a Redis outage |
| Service-to-service auth | client credentials, mock issuer support | Phase 1 done (`AUTH-006`); DEV credential not started | Real stack, local only |
| GraphQL BFF | listings read, trace export | Read-only | 16+ tests (22 in the last full local run, before this branch) |
| Web customer app | listing page, listing detail, SSR and Relay handoff | Read-only | e2e 6/6 (mock BFF) and skeleton smoke 5/5 (real stack), run earlier this session, not re-run since |
| Web: login, checkout, confirmation | `CUST-003`, `CUST-004`, login (from superseded `WEB-001`) | **Not started** | n/a |
| Full-stack journey in CI | skeleton smoke covers browse only | **Not started** for ordering | n/a |
| Queue display, admin, notifications, vendor UI | out of slice 1 | Not started (by design) | n/a |

"Done" above means built and verified locally; the merged-to-main state differs (see next section).

## What has merged, and what is pending

- **Merged earlier:** auth, catalog work through `CAT-006`, ordering checkout and the first pickup-windows endpoint, formatter and lint gates, tracing.
- **Pushed, PR pending (`feature/order-events`):** the fake cross-partition query, `ORD-005` (outbox and relay), catalog's explicit `Events:Backend`, `ORD-007`, and docs. The human lead will rebase-merge it.
- **Not run:** this branch on Azure; anything on real Azure Cosmos or a managed Redis (never run).

## Verification summary (this session)

| Check | Result |
|---|---|
| Ordering tests | 320 passed, 3 emulator-gated skipped |
| Catalog tests | 104 passed |
| Linux container, real Redis (build, format gate, tools, catalog, ordering) | passed; Redis processed 132 commands (needs 50), finding A8 |
| `dotnet format` whitespace and style | clean |
| Mutation checks | 6 on `ORD-005`, 8 on `ORD-007` (+1 on item 73), all eventually caught; 1 survivor led to a new test |
| Real stack, `ORD-005` | 6 orders produced 6 `OrderPlaced` stream entries; with Redis stopped, checkout returned 201 after 2 s and the relay delivered within about 4 s of recovery |
| Real stack, `ORD-007` | full lifecycle on Redis, ownership and roles, stock release, 8 racing pairs each with one winner |

## Gaps that matter to slice 1

Full classification of all 76 register items is in the backlog appendix. The ones on the slice 1 path:

1. **Authenticated browser path missing end to end.** No PKCE login in the web app, no token forwarding in the BFF, no `placeOrder`, `pickupWindows` or `order` in the schema.
2. **No customer-visible stock state** (item 64): sold-out and low stock are in the REST responses but not the GraphQL schema or UI.
3. **Mock issuer login page injects unescaped parameters** (item 32). It is dev-only, but a real browser app will now use it.
4. **No full-stack order journey in CI.** The smoke stack has no ordering service or mock issuer in the journey.
5. **Trace across all hops not demonstrated** (items 42, 49), and the green Azure run has no recorded ID (item 44).
6. **Slice documents drift:** `first-slice-contract.md` still says "status is Placed only", `docs/management/project-plan.md` says Phase 1 is "Not started", and the older plan puts the queue display inside Phase 2 while the first-slice contract excludes it.

## Decisions (human lead)

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D-A | **Auto-confirm rule** for simple orders (no customization, no pickup window; see the plan for the open question about "has available quantity") | **APPROVED 2026-10-28, option 1:** the rule is "no customization and no pickup window"; it ignores whether the item has a stock counter. Item `ORD-008`; configuration switch now, per-item flag later | `ORD-008` (unblocked) |
| D-B | **Global-ID scope (item 41):** `Order` gets a global ID; `vendorId`, modifier ids and cursors stay raw | **APPROVED 2026-10-28** | BFF order path (`S1-01`) (unblocked) |
| D-C | **Session storage:** keep the header-only in-memory token (ADR-0006) for slice 1, or move to a server-side session with an HttpOnly cookie now | **DECIDED 2026-10-28: header-only for now.** The cookie-session stays planned as ADR-0019 after slice 1 (`N-01`) | Web login (`S1-02`) (unblocked) |
| D-D | **Mock issuer `redirect_uri` allowlist** (security-adjacent) | **Still open.** Only the optional allowlist half of `S1-06` waits on it; the output-encoding fix (item 32) does not | `S1-06` (allowlist part) |
| D-E | **Queue display in or out of slice 1** | **APPROVED 2026-10-28: out of slice 1.** The older project plan is to be updated (`S1-09`) | scope of the journey spec |

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Authenticated rewrite path drops or alters `Authorization` or `traceparent` | Low to medium | Medium | Add an explicit e2e test in `S1-01` before building on it |
| Login lost on reload (in-memory token) makes the demo awkward | Certain | Low | Document it (item 24); Playwright logs in per test; cookie-session as the follow-up |
| Full-stack CI job becomes slow or flaky once ordering, Cosmos and the issuer are added | Medium | Medium | Add the stack pieces first (`S1-07a`), measure, then the journey spec |
| Shared files (BFF schema, lockfiles, pipeline YAML) collide between branches | Medium | Low | One owner at a time (`07-shared-file-ownership-and-coordination.md`) |
| Estimates are relative and uncalibrated against a tracked velocity | Certain | Medium | Treat points as ordering aids, not forecasts; re-estimate after wave 1 |
| Real Azure Cosmos and Redis behavior differs from the emulators | Medium | Medium | Out of slice 1; listed under deployment readiness |
