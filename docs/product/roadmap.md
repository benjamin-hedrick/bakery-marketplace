# Roadmap

> **Status:** Current · written 2026-10-30, Now, Next and the sequence table refreshed 2026-11-08. A now, next and later view. It is a rough ordering, not a schedule: there are no dates, because pace depends on available hours, which have not been decided. The order is the lead's decision. Phases and their exit criteria are in [the project plan](../management/project-plan.md); what is built and what is next in detail is [the current plan](backlog/current-plan.md); item status is [STATUS.md](backlog/STATUS.md).

## Now

- **Slice 1 is done** (login, browse with stock, cart, test checkout, order status), running locally on a developer machine. See [local development](../operations/local-dev.md) to run it.
- **Built since slice 1, local only:** the live vendor queue with the vendor's actions and cancel buttons, notifications, order history, allergen personalization, rate limits, hardening and a security pass (threat model, soak, scan), an Android customer app, saved payment methods, a listing cache, the fulfillment strategy as a separate consumer, and a demo film. Detail: [the current plan](backlog/current-plan.md).
- **Open:** the deployed dev environment (`WI-DEP-001`, needs the lead to run the Azure bootstrap and approve IAM), the vendor's listing and stock screens (no spec yet), vendor onboarding, the admin console.

## Next (priority P2 in the slice-1 backlog, about 55 points)

Sized and sequenced in [the prioritized backlog](../management/slice-1/03-prioritized-backlog.md); listed here in its order.

| Item | What it gives | Needs the lead |
|---|---|---|
| N-01 Cookie session | Done (ADR-0019, `WI-AUTH-007`); the lead's review of the security phases is pending | Review |
| N-02 Service-to-service credential for a deployed environment | Gates any deployment | IAM approval (ADR-0018) |
| N-03 Vendor read side | Done (`WI-QUE-001`) | |
| N-04 Queue read model and display | Done (`QUE-002` to `QUE-004`) | |
| N-05 `PickupFulfillment` | Done locally (`WI-ORD-003`, In review): completes the order lifecycle design | Review of the `complete` path |
| N-06 Stock correctness follow-ups | Correctness under failure | |
| N-07 Outbox hardening | Needed before more events or consumers | |

## Later (priority P3, about 76 points)

Real payment (N-08), container images and a hosting decision (N-10; images built), tracing completion (N-11), vendor onboarding (N-13). Notifications (N-09), personalization (N-12) and the caching layers for the listing path (N-14, `WI-CAT-003` and `WI-PORT-004`) are built locally and In review; process hygiene (N-15) is partly done.

## Candidate order from the October documentation review (not agreed)

From the review's suggested order; the lead sets the priorities. Items are in the gap catalog (`backlog/gap-catalog/`) and `STATUS.md`.

1. **Honest and runnable:** mostly done (README, status, run path). The demo path is built (`docs/operations/demo.md`; its cold run and stranger test are open, `WI-DEMO-001`). Open: the public-readiness pass (register item 93, `WI-SEC-004`).
2. **Show the method:** done in `docs/method/`. Open: the remaining templates and standards (`WI-DOC-001`).
3. **Show the architecture:** done for the container, request-path and component diagrams and the patterns page. Open: `WI-DOC-002`, `WI-API-001`, `WI-DOC-003`.
4. **Show the quality work:** `WI-QA-001`, `WI-QA-002`, `WI-SEC-004`, then `WI-QA-003`.
5. **Close the data-fetching and cache story:** `WI-CAT-003` and `WI-PORT-004` are built (In review); `WI-DOC-003` and `WI-QA-002` remain.
6. **Operations and project artifacts:** the runbook (`WI-OPS-002`), the OKRs (`WI-PROD-004`), the postmortem (`WI-LAUNCH-002`), and the project board (register item 12).
7. **New capability:** the vendor read side and queue display (N-03, N-04) and personalization (`PREF-*`, `SRCH-001`) are built; dashboards and chaos scenarios (catalog `OBS-003`, `EVT-004`) are not.
8. **Deployment:** `WI-DEP-001`, behind the human approvals for identity and credentials.

## Deferred, with a trigger

A fresh second iteration of the product on a new stack was planned in September and deferred in favour of continuing this one: deferred, not cancelled. Delivery and dispatch is the next planned extension once the core is stable; the fulfillment seam exists for it (ADR-0001). Also deferred: the admin console, reviews, advertising, refunds and chargebacks, vendor staff accounts, and multi-region scale. The list with triggers is in section C of the backlog document and in [scope](scope.md).

## The original delivery sequence (September 2026) and where it stands

| Step | State |
|---|---|
| 1 Vision and personas | Done |
| 2 Capability map, bounded contexts, glossary | Done |
| 3 Key ADRs | Done (23 records) |
| 4 C4 context and container | Done |
| 5 Backlog, prioritization and definition of ready | Done, with prioritization partly (see [scope](scope.md)) |
| 6 Repository scaffolding, local environment, CI skeleton | Done |
| 7 Sprint 1: walking skeleton | Done |
| 8 Sprint 2: customization, dietary preferences, live queue display | Done locally: customization, the allergen profile and diet preferences, and the live queue display |
| 9 Sprint 3: vendor onboarding, admin console, notifications | Notifications built locally (no real provider); vendor onboarding and the admin console not started |
| 10 Go-live pass: SLA/SLO finalized, monitoring wired, runbook | Not started; the SLA exists as targets |
| 11 Refinement and support: incident, postmortem, a flagged iteration, roadmap naming delivery | Not started |
