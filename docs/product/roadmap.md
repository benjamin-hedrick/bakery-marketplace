# Roadmap

> **Status:** Current · written 2026-10-30. A now, next and later view. It is a rough ordering, not a schedule: there are no dates, because pace depends on available hours, which have not been decided. The order is the lead's decision. Phases and their exit criteria are in [the project plan](../management/project-plan.md); what is built and what is next in detail is [the current plan](backlog/current-plan.md); item status is [STATUS.md](backlog/STATUS.md).

## Now

- **Slice 1 is done** (login, browse with stock, cart, test checkout, order status), running locally on a developer machine. See [local development](../operations/local-dev.md) to run it.
- **Documentation reconciliation** (`WI-PORT-006` pass 2): making every document agree with what was built.

## Next (priority P2 in the slice-1 backlog, about 55 points)

Sized and sequenced in [the prioritized backlog](../management/slice-1/03-prioritized-backlog.md); listed here in its order.

| Item | What it gives | Needs the lead |
|---|---|---|
| N-01 Cookie session | Fixes the logout on reload; allows server-rendered authenticated pages | Auth design (ADR-0019 not yet written) |
| N-02 Service-to-service credential for a deployed environment | Gates any deployment | IAM approval (ADR-0018) |
| N-03 Vendor read side | Vendors can see what is waiting; groundwork for the queue display | |
| N-04 Queue read model and display (`QUE-001`, `QUE-002`) | Shows the event backbone working | |
| N-05 `PickupFulfillment` | Completes the order lifecycle design | |
| N-06 Stock correctness follow-ups | Correctness under failure | |
| N-07 Outbox hardening | Needed before more events or consumers | |

## Later (priority P3, about 76 points)

Real payment (N-08), notifications (N-09), container images and a hosting decision (N-10), tracing completion (N-11), personalization (N-12), vendor onboarding (N-13), caching layers (N-14), process hygiene (N-15).

## Candidate order from the October documentation review (not agreed)

From the review's suggested order; the lead sets the priorities. Items are in the gap catalog (`backlog/gap-catalog/`) and `STATUS.md`.

1. **Honest and runnable:** mostly done (README, status, run path). Open: the demo path (`WI-DEMO-001`) and the public-readiness pass (register item 93, `WI-SEC-004`).
2. **Show the method:** done in `docs/method/`. Open: the remaining templates and standards (`WI-DOC-001`).
3. **Show the architecture:** done for the container, request-path and component diagrams and the patterns page. Open: `WI-DOC-002`, `WI-API-001`, `WI-DOC-003`.
4. **Show the quality work:** `WI-QA-001`, `WI-QA-002`, `WI-SEC-004`, then `WI-QA-003`.
5. **Close the data-fetching and cache story:** `WI-CAT-003`, `WI-PORT-004`, then `WI-DOC-003` and `WI-QA-002`.
6. **Operations and project artifacts:** the runbook (`WI-OPS-002`), the OKRs (`WI-PROD-004`), the postmortem (`WI-LAUNCH-002`), and the project board (register item 12).
7. **New capability:** the vendor read side and queue display (backlog N-03, N-04), personalization (`PREF-*`, `SRCH-001`), dashboards and chaos scenarios (catalog `OBS-003`, `EVT-004`).
8. **Deployment:** `WI-DEP-001`, behind the human approvals for identity and credentials.

## Deferred, with a trigger

A fresh second iteration of the product on a new stack was planned in September and deferred in favour of continuing this one: deferred, not cancelled. Delivery and dispatch is the next planned extension once the core is stable; the fulfillment seam exists for it (ADR-0001). Also deferred: the admin console, reviews, advertising, refunds and chargebacks, vendor staff accounts, and multi-region scale. The list with triggers is in section C of the backlog document and in [scope](scope.md).

## The original delivery sequence (September 2026) and where it stands

| Step | State |
|---|---|
| 1 Vision and personas | Done |
| 2 Capability map, bounded contexts, glossary | Done |
| 3 Key ADRs | Done (18) |
| 4 C4 context and container | Done |
| 5 Backlog, prioritization and definition of ready | Done, with prioritization partly (see [scope](scope.md)) |
| 6 Repository scaffolding, local environment, CI skeleton | Done |
| 7 Sprint 1: walking skeleton | Done |
| 8 Sprint 2: customization, dietary preferences, live queue display | Customization done; preferences and the queue display not |
| 9 Sprint 3: vendor onboarding, admin console, notifications | Not started |
| 10 Go-live pass: SLA/SLO finalized, monitoring wired, runbook | Not started; the SLA exists as targets |
| 11 Refinement and support: incident, postmortem, a flagged iteration, roadmap naming delivery | Not started |
