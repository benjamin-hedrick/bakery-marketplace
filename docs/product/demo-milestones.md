# Demo milestones: what a person can do locally, at each stage

> **Status:** Current · written 2026-10-30. This replaces two September documents (`LOCAL-MILESTONES.md` and `local-demo-execution-plan.md`, both now in `docs/history/`). It is a different axis from [the project plan](../management/project-plan.md), which tracks epics by phase: this one asks what a person can actually do with the stack running on their machine. Item status words come from [STATUS.md](backlog/STATUS.md).

## M1: Environment up: done

Redis Streams, the Cosmos emulator and the mock identity issuer start with `docker compose`; the catalog and ordering services answer `/health`. Items: `AUTH-005`, `DEV-001`, `DEV-002`, `DEV-004`, `DATA-002`, `EVT-003`, `CACHE-002`, `AUTH-002`. The original exit test also named all four services; `admin-service` and `notification-service` are empty scaffolds and run nothing.

**How to see it:** [Run slice 1](../operations/local-dev.md), verified in a fresh clone on 2026-10-30.

## M2: Backend walking skeleton: done (2026-11-08: the last items In review)

**Update 2026-11-08:** `ORD-003` (`PickupFulfillment`, as its own consumer) and `CAT-003` (the listing cache) are built and In review; the "not done" column below is the state of 2026-10-30.

The API surface for browsing, checkout (payment stubbed) and the order lifecycle works and is provable by integration tests and calls.

| Done | Not done |
|---|---|
| `CAT-001` listings, `CAT-005` and `CAT-006` stock, `ORD-001` checkout, `ORD-002` aggregate, `ORD-004` seam, `ORD-005` events through an outbox, `ORD-006` persistence, `ORD-007` vendor and customer actions, `ORD-008` automatic confirmation | `ORD-003` `PickupFulfillment` (In progress), `CAT-003` cache-aside, `QUE-001` order-status read model, `PREF-001` and `PREF-002` preferences, `VEN-001` and `VEN-002` vendor onboarding (all Ready) |

## M3: Browser-visible demo: done (2026-11-08)

**Update 2026-11-08:** the order history, cancel buttons, order-status polling and the vendor's live queue are built; the lists below are the state of 2026-10-30.

A person opens a browser, logs in with the mock issuer, browses seeded listings with stock, orders (visibly stubbed payment), and sees the confirmation and status. The customer app, BFF and login are done (`PORT-001`, `PORT-002`, `PORT-007`, `CUST-002`, `CUST-003`, `CUST-004`). **Not done:** the order history list (`CUST-007`, Ready) and the live vendor queue display (`QUE-002` and `QUE-001`, Ready), which the original exit test included. Taking the queue display out of slice 1 was decision D-E in the first-slice contract. `WEB-001` is superseded.

## M4: Preferences and dietary filtering: built (In review)

A customer sets allergies and preferences in the browser and browsing flags conflicting items, with an optional hide toggle. This is what delivers vision principle 1 end to end. Built locally 2026-11-03 to 11-04 and In review: `PREF-001`, `SRCH-001`, `CUST-005`, `CUST-006` and the tags and allergen items around them (`TAG-*`, `CUST-008`, `ORD-009`, `QUE-005`); `PREF-002` is superseded. The Android app has the same warnings (`MOB-002`). It was kept separate from M3 so that M3 did not gain new blocking dependencies.

## M5: Admin console: named, not scoped

**Update 2026-11-08:** the vendor now has a live order-queue screen with the order actions (`QUE-003`, `QUE-004`); listing management and verification are still API-only and seed-only.

Vendor verification and listing moderation are API-only even after M2 and M4. No items beyond titles (`ADM-001`, `ADM-002`). A vendor-facing listing-management UI is not part of any milestone: nothing lets a vendor create or edit listings in a browser, and the seed script covers that for demos.

## Not part of any milestone

Real payment, notifications, reviews, sponsored placement and `web-admin` beyond M5 are deferred (see [scope](scope.md)).

## What the September notes said to be careful about

The two source documents warned that some "Done" items had never run against real infrastructure. State on 2026-10-30: the Redis and Cosmos adapter tests can still fall back to fakes without saying so (register items 31 and 35), but the real adapters have since run: the catalog and ordering services use the Cosmos emulator and Redis Streams in the real-stack journeys (21 passing in each of 3 runs on 2026-10-30; 62 of 62 on 2026-11-07). The September limitation that the environment could not reach `nuget.org` no longer applies: a clean clone builds and tests on Windows and in the Linux container check.
