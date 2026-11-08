# Current plan

> **Status:** Current · written 2026-10-30, rewritten 2026-11-08. The status of every work item is in `STATUS.md`; this page says what is built, what is in flight and where the next work is. Keep it short: update it when the focus changes.

## What is built

Everything below runs on a developer machine (Docker Compose for Redis Streams, the Cosmos emulator and the mock identity issuer; the services, the BFF and the web apps as host processes or containers). **Nothing is deployed.** The detail and the evidence for each item are in its spec and in [`docs/evidence/`](../../evidence/README.md).

- **Slice 1** (merged): a customer logs in, browses listings with stock, builds a cart, places a test order (the payment is a stub: no money moves) and watches its status. `WI-PORT-001` to `WI-PORT-007`, `WI-CUST-002` to `004`, `WI-ORD-001` to `008`.
- **The vendor's side:** the order read side and a live queue display with push and polling (`WI-QUE-001` to `QUE-004`, ADR-0021); accept, decline, start, ready and hand over from the queue; cancel buttons for the customer and the vendor (`WI-ORD-011`); the fulfillment strategy as its own event consumer, with `complete` answering 202 (`WI-ORD-003`).
- **Sessions, limits and hardening:** server-side browser sessions (`WI-AUTH-007`, ADR-0019); rate limits per address and per login with a per-client backstop at the BFF (`WI-RATE-001`); browser hardening headers; a threat model, generated-input tests, a 66-minute soak, an OWASP ZAP scan and a review statement (`WI-SEC-005`); a dependency audit and SBOMs (`WI-SEC-004`, in progress for the pipeline part).
- **Notifications:** a notification service that consumes the order events in batches and sends through a sender adapter; no real provider (`WI-NOT-001`, `NOT-002`).
- **Order history and personalization:** the customer's order list; a catalog-owned tag registry with the closed allergen list (ADR-0022); an allergen profile; matching and conflict warnings on browse, detail and cart; the acknowledgement at checkout; allergens recorded on the order and shown on the vendor's card (`WI-CUST-005` to `008`, `WI-TAG-001` to `004`, `WI-PREF-001`, `WI-SRCH-001`, `WI-ORD-009`, `WI-QUE-005`).
- **Android customer app** (Expo, Android only): PKCE sign-in with the refresh token in the Keystore (ADR-0023), menu, cart, checkout, order status, allergy warnings; fifteen Maestro flows on an emulator (a cold run of fourteen passed twelve on 2026-11-07 and the other two passed on their own; all fifteen in one run: not yet); 25 unit tests of the session and API logic that run in the pipeline's `mobile` job (`WI-MOB-001` to `MOB-003`).
- **Payments as data, a cache, and fresh data:** a saved payment method chosen at checkout, judged by the stub's token rule, replacing the decline switch (`WI-ORD-010`); the catalog's listing cache with invalidation and a single flight, and the cache contract for all three layers (`WI-CAT-003`, `WI-PORT-004`); a stock check when an item is added (`WI-CUST-009`); order status by polling (`WI-CUST-010`).
- **The deployment path, written and checked locally, never applied to Azure:** container images, a Compose profile that runs the whole stack, two Terraform stacks, two pipelines and a gate rehearsal (`WI-DEP-001`, ADR-0020; `docs/evidence/WI-DEP-001/`).
- **The demo:** a one-command run with a checklist (`docs/operations/demo.md`), and a demo film made on 2026-11-08: a web customer, a phone customer and the vendor's queue at once, 104 seconds ([`docs/operations/demo/demo-film.mp4`](../../operations/demo/demo-film.mp4), made by `scripts/dev/film/`).

**Not built:** the admin service (a scaffold) and the admin web app; vendor onboarding (`VEN-001`, `VEN-002`: Ready, not started); a real payment; the vendor's own listing and stock screens (no spec yet); iOS; any deployed environment.

## What is in flight

- **`feature/demo-film`** (pushed; the lead opens the PR): the dependency audit and SBOMs, the Android checkout layout fix (register 161), the film scripts and the film, and the sanitized usage records.
- **`feature/docs-front-door`** (local): this documentation pass, which started on 2026-11-08: the factual refresh of the ADR index, the decision timeline, patterns (with register item 89), the NFRs, the evidence index and the test strategy, then a front door and hub pages for testing, NFRs and performance, and delivery practice, code-coverage tooling, and a generated test-count table.
- **Verification gaps still open:** all fifteen Maestro flows in one cold run; the container smoke of the newest journeys; the first Azure run of the `queue`, `session` and `mobile` jobs; the cold-machine run and a stranger's reading of the demo (`WI-DEMO-001`); register 165 and 166 (a catalog failure during checkout has no typed code, and three failures have not been run against a real outage).

## Next

In this order, the lead deciding:

1. **Close the documentation pass** (above), then the [pre-publish gaps](../../governance/pre-publish-gaps.md), before the repository is made public (the flip-day settings, register 93).
2. **The vendor's listing and stock screens** are the largest product gap and have no spec yet: decide, then write one. Vendor onboarding (`VEN-001`, `VEN-002`) and the admin screens stay last.
3. **The deployed dev environment** (`WI-DEP-001`, `N-02`): the next step is the lead's: run the bootstrap on Azure and approve the Entra and IAM work (ADR-0018 phase 2, `WI-AUTH-006`); costs start there. A manual, approved teardown with a runbook follows it.
4. **Hardening and process:** the outbox and stock follow-ups (register 66, 67, 74), a latency budget (100), the decisions listed in register 162 (dependency upgrades, the pipeline audit job and its fail policy, container scanning), and the process-review proposals (register 130).

**Waiting on the lead:** the reviews of the In review items (`STATUS.md`, filter by In review), the open decisions in the register (filter by `Status: Open`), and the approvals above. Security, authorization and IAM changes need approval before they are made (`CLAUDE.md`).

**Priorities (set 2026-10-29, amended 2026-10-31):** 1. a polished, consistent repository that can be public, showing AI collaboration, architecture and software, and business and project work; 2. it builds and runs locally; 3. more evidence and coverage; 4. deploy and tear down a dev environment; 5. a public demo.

## Where the next work is

The candidate product work, with sizes and priorities, is the "Next after slice 1" table in `docs/management/slice-1/03-prioritized-backlog.md` (N-01 to N-15). Items that already have a Ready spec are listed in `STATUS.md` (filter by status Ready). The deferred and proposed artifacts (RACI, hiring plan, competitive scan, monetization model, prioritization, sprint plan, postmortem) each have a spec; filter `STATUS.md` by Deferred or Proposed.

## How to find things

- Status of any item: `STATUS.md`. Definitions of the status words: `docs/method/status-and-supersession.md`.
- The epics and what each contains: `epic-catalog.md`.
- Unresolved findings and trade-offs: `docs/governance/open-items-register.md`.
- Decisions: `docs/architecture/adr/`.
- How to run it locally: `docs/operations/local-dev.md`.
- Earlier sequencing (queue, batches, build order): `docs/history/backlog-outline-2026-10-29.md`.
- What the documentation review found and where each finding went: `docs/product/backlog/gap-catalog/` (open) and `docs/history/review-2026-10/closing-record.md` (all).
