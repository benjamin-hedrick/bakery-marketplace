# Current plan

> **Status:** Current · rewritten 2026-11-16 after the repository was made public, refreshed 2026-11-23. The status of every work item is in [`STATUS.md`](STATUS.md); this page says what is built, what is in flight and what is next. Keep it short: update it when the focus changes.

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
- **The deployment path, written, checked locally, and run against the dev environment on Azure through the pipelines (created, deployed to, smoke-tested, observed and torn down on demand; builds 88 to 123):** container images, a Compose profile for the whole stack, two Terraform stacks, two pipelines and a gate rehearsal (`WI-DEP-001`, ADR-0020).
- **The demo:** a one-command run with a checklist ([demo](../../operations/demo.md)) and a [demo film](../../operations/demo-film.md).

- **The vendor's listing and stock screens** (catalog and BFF, then the screens in the vendor's web app; built and In review, waiting for the lead's review): `WI-CAT-007`, `WI-CAT-008`. A review of them found five defects, fixed and merged (register 239).

**Not built:** the admin service and the admin web app (placeholders for a later phase); vendor onboarding (`VEN-001`, `VEN-002`); a real payment; iOS; a deployed environment that stays up (the dev environment exists only between a create and its teardown).

## In flight

- **`feature/pipeline-followups`** (for the lead's next PR): the first Azure Pipelines runs of the `audit` and `images` jobs finished "succeeded with issues" (register 240): the .NET SBOM tool name was case-sensitive on Linux (fixed), the image scan now removes each image after it is scanned (`--clean`), and the register records that the 80 `otelcol-contrib` findings belong to the Cosmos emulator image, not to our collector. Register 239 resolved.
- Merged since the last refresh: the dependency audit and image scan as non-blocking pipeline jobs, npm removed from the Node runtime images, Jaeger 2.23.0 and collector 0.165.0 (`WI-SEC-006`, `WI-SEC-007`, `WI-OBS-001`); DEV tracing shown working with no manual step (build 123, register 237 resolved).

## Next

In this order, the lead deciding:

1. **The next DEV deploy from `main`, then its teardown** (`WI-DEP-001`; the teardown runbook is [`dev-environment-teardown.md`](../../operations/runbooks/dev-environment-teardown.md)). It is the first deployed run of the images without npm and of collector 0.165.0 (the condition that reconciles register 240), the first teardown with the Smart Detection fix (register 238), and a fresh create for the concurrency test. Check first whether the build 123 environment is still up. Costs run while it is up.
2. **Decisions and reviews waiting on the lead:** whether the `audit` and `images` jobs become blocking once they have run green a few times (`WI-SEC-006` step 1, `WI-SEC-007`; register 162 stays open until then); register 236 (the outage fault missing from the observe counts, request metrics reading 0); the three In review items (`WI-CAT-007`, `WI-CAT-008`, `WI-SEC-007`).
3. **Hardening:** the soak and cache measurements (register 186); the three service test projects use xunit 2.5.3, which NuGet marks deprecated (to xunit.v3; noted in register 240, no decision yet); the 37 unfixed high findings in each Node image are reported only.
4. **Product:** vendor onboarding (`VEN-001`, `VEN-002`) and the admin screens come after the vendor screens are reviewed.

**Also waiting on the lead:** the other open decisions in the [register](../../governance/open-items-register.md) (filter by `Status: Open`). Security, authorization and IAM changes need approval before they are made (`CLAUDE.md`).

## Where the next work is

The candidate product work, with sizes and priorities, is the "Next after slice 1" table in [`03-prioritized-backlog.md`](../../management/slice-1/03-prioritized-backlog.md). Items with a Ready spec are in `STATUS.md` (filter by Ready); the deferred and proposed artifacts (RACI, hiring plan, competitive scan, monetization model, prioritization, sprint plan, postmortem) each have a spec (filter by Deferred or Proposed).

## How to find things

- Status of any item: `STATUS.md`; the status words: [`status-and-supersession.md`](../../method/status-and-supersession.md).
- The epics: [`epic-catalog.md`](epic-catalog.md).
- Unresolved findings and trade-offs: the [open-items register](../../governance/open-items-register.md).
- Decisions: [the ADRs](../../architecture/adr/README.md).
- How to run it locally: [local development](../../operations/local-dev.md).
- Earlier plans and how the work got here: [history](../../history/README.md).
