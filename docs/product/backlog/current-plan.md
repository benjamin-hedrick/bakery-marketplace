# Current plan

> **Status:** Current · rewritten 2026-11-16, after the repository was made public. The status of every work item is in [`STATUS.md`](STATUS.md); this page says what is built, what is in flight and what is next. Keep it short: update it when the focus changes.

## What is built

Everything below runs on a developer machine (Docker Compose for Redis Streams, the Cosmos emulator and the mock identity issuer; the services, the BFF and the web apps as host processes or containers). **Nothing is deployed.** The detail and the evidence for each item are in its spec and in [`docs/evidence/`](../../evidence/README.md).

- **Slice 1:** a customer logs in, browses listings with stock, builds a cart, places a test order (the payment is a stub: no money moves) and watches its status (`WI-PORT-001` to `007`, `WI-CUST-002` to `004`, `WI-ORD-001` to `008`).
- **The vendor's side:** the order read side and a live queue display with push and polling (`WI-QUE-001` to `QUE-004`, ADR-0021); accept, decline, start, ready and hand over from the queue; cancel for the customer and the vendor (`WI-ORD-011`); the fulfillment strategy as its own event consumer (`WI-ORD-003`).
- **Sessions, limits and hardening:** server-side browser sessions (`WI-AUTH-007`, ADR-0019); rate limits per address and per login with a backstop at the BFF (`WI-RATE-001`); browser hardening headers; a threat model, generated-input tests, a soak, an OWASP ZAP scan and a review statement (`WI-SEC-005`); a dependency audit and SBOMs (`WI-SEC-004`).
- **Notifications:** a notification service that consumes the order events and sends through a sender adapter; no real provider (`WI-NOT-001`, `NOT-002`).
- **Order history and personalization:** the customer's order list; a catalog-owned tag registry with the closed allergen list (ADR-0022); an allergen profile; conflict warnings on browse, detail and cart; the acknowledgement at checkout; allergens recorded on the order and shown on the vendor's card (`WI-CUST-005` to `008`, `WI-TAG-001` to `004`, `WI-PREF-001`, `WI-SRCH-001`, `WI-ORD-009`, `WI-QUE-005`).
- **Android customer app** (Expo, Android only): PKCE sign-in with the refresh token in the Keystore (ADR-0023), menu, cart, checkout, order status and allergy warnings, with Maestro flows on an emulator against the real stack (`WI-MOB-001` to `MOB-003`).
- **Payments as data, a cache, and fresh data:** saved payment methods judged by the stub's token rule (`WI-ORD-010`); the catalog's listing cache with invalidation and a single flight (`WI-CAT-003`, `WI-PORT-004`); a stock check when an item is added (`WI-CUST-009`); order status by polling (`WI-CUST-010`).
- **Chaos scenarios** (ADR-0024): seeded fault injection at the existing interfaces of the C# services and the BFF, a journal of what was injected, and a gate that allows it only locally and in dev. Each scenario has its own spec run on the whole local stack, and the runs found and fixed defects in the outbox, the event consumers and checkout (`WI-CHAOS-001` to `003`, `WI-EVT-004`; [the runs](../../evidence/WI-CHAOS-003/README.md)).
- **The deployment path, written and checked locally, never applied to Azure:** container images, a Compose profile for the whole stack, two Terraform stacks, two pipelines and a gate rehearsal (`WI-DEP-001`, ADR-0020).
- **The demo:** a one-command run with a checklist ([demo](../../operations/demo.md)) and a [demo film](../../operations/demo-film.md).

**Not built:** the admin service and the admin web app (placeholders for a later phase); vendor onboarding (`VEN-001`, `VEN-002`); the vendor's own listing and stock screens (no spec yet); a real payment; iOS; any deployed environment.

## In flight

- **`feature/register-184-vendor-screens`**: register 199 closed (the picomatch advisory was withdrawn), the cache invalidation gap (register 184), and the specs of the vendor's listing and stock screens (`WI-CAT-007`, `CAT-008`). `WI-CAT-007` (catalog and BFF) and `WI-CAT-008` (the screens in the vendor's web app) are built and In review on the same branch (registers 208, 210 and 211 resolved). (`feature/hardening-followups`, registers 200, 202 to 207, 66, 74 and 166, merged 2026-11-18.)

## Next

In this order, the lead deciding:

1. **The vendor's listing and stock screens:** the largest product gap; [`WI-CAT-007`](WI-CAT-007.md) built and In review (catalog and BFF: an edit precondition, stock settings without the quantity, an idempotent create; register 208) then [`WI-CAT-008`](WI-CAT-008.md) (the screens in the vendor's web app), decided 2026-11-18; both built and In review, waiting for the lead's review. Vendor onboarding (`VEN-001`, `VEN-002`) and the admin screens come after.
2. **The deployed dev environment** (`WI-DEP-001`): run the bootstrap on Azure and approve the Entra and IAM work (ADR-0018 phase 2, `WI-AUTH-006`); costs start there. A manual, approved teardown with a runbook follows.
   **Update 2026-11-22 (later), what is done and what is next:** (a) to (c) done by build 117 (`docs/evidence/WI-CHAOS-006/dev-chaos-deployed-2026-11-22.md`: 15 passed, 1 skipped), and (d) done for build 117 with both latency tables in that record; the open questions are register 236. Test 11 (concurrency) skipped because the lemonade is sold out on a long-lived environment; it runs on a fresh create, so the next create is the one to run it on. [`WI-OBS-001`](WI-OBS-001.md) (traces to Application Insights through a collector; the lead asked for the chaos scenarios' traces) is built through steps 1 to 5 and 7, offline only; **next: the lead's teardown, then one create with `dev-chaos` on, `cacheRedis` off (goal 3) and `tracing` on (the default), then step 6, the evidence of the traces, and the teardown with its record.** Pre-push gates for the branch were run on 2026-11-22 (node gates with tests, terraform checks, secret scan); the .NET tests are not owed, no .NET code changed.
   **Deployed dev evidence still to capture (decided 2026-11-22, a later session; UAT is dropped for now, register 235):** one dev run, `chaosScenario: dev-chaos`, then the evidence the runs so far lack. (a) Run dev with `dev-chaos` (`WI-CHAOS-006` step 7; build 96 passed but has no record and its logs were not read). (b) Read the smoke and observe artifacts or step logs (TF400813 blocks the download; use the step logs), keeping the observe counts (scenarios started, faults per layer and fault) and the suite's per-test "fault injected" list. (c) Write `docs/evidence/WI-CHAOS-006/dev-chaos-deployed-<date>.md` and update the `WI-CHAOS-006` banner; step 7's UAT half cannot run, so the spec needs a dated note. (d) Run `scripts/ci/deployed-latency.mjs` from the agent and from the lead's machine in the same session, for a second latency table beside build 88's. (e) Optional: a create from empty with `cacheRedis` off (goal 3 of `WI-DEP-001`; only shown in place so far). (f) Run the pipeline-side gates and the teardown after, as dev's runbook says.
3. **Hardening** (registers 166, 203, 204, 205 and 206 were done 2026-11-18): a latency budget (register 100), the dependency decisions of register 162, the cache invalidation gap (register 184), and the soak and cache measurements (register 186).

**Waiting on the lead:** the reviews of the In review items (`STATUS.md`, filter by In review) and the open decisions in the [register](../../governance/open-items-register.md) (filter by `Status: Open`). Security, authorization and IAM changes need approval before they are made (`CLAUDE.md`).

## Where the next work is

The candidate product work, with sizes and priorities, is the "Next after slice 1" table in [`03-prioritized-backlog.md`](../../management/slice-1/03-prioritized-backlog.md). Items with a Ready spec are in `STATUS.md` (filter by Ready); the deferred and proposed artifacts (RACI, hiring plan, competitive scan, monetization model, prioritization, sprint plan, postmortem) each have a spec (filter by Deferred or Proposed).

## How to find things

- Status of any item: `STATUS.md`; the status words: [`status-and-supersession.md`](../../method/status-and-supersession.md).
- The epics: [`epic-catalog.md`](epic-catalog.md).
- Unresolved findings and trade-offs: the [open-items register](../../governance/open-items-register.md).
- Decisions: [the ADRs](../../architecture/adr/README.md).
- How to run it locally: [local development](../../operations/local-dev.md).
- Earlier plans and how the work got here: [history](../../history/README.md).
