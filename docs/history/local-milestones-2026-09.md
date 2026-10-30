# Local Run Functionality — Milestones

> **Status:** Historical · retired 2026-10-30. Replaced by `docs/product/demo-milestones.md`, which carries the milestones with their current state. Kept as the September record; its relative links no longer work.

Tracks what a fully-local `docker-compose up` (+ frontend dev server) actually
lets a person *do*, at each stage of the backlog being built out — distinct
from `docs/management/project-plan.md`'s phase-level view (which tracks epic
completion, not runnable functionality) and from `epic-catalog.md`'s
batch numbering (which tracks what's safe to hand an agent, not what a demo
can show). Established 2026-09-13/14 while reviewing how much of the
currently-planned backlog actually delivers browser-visible functionality
once built.

Status legend matches the rest of the project: **Scoped** (work items exist,
Ready) · **Partially scoped** (some items exist, some named but not detailed)
· **Named, not scoped** (acknowledged as a milestone, no work items yet).

## M1 — Environment up
**Status: Scoped.** Batch 3 (`DATA-002`, `CACHE-002`, `EVT-003`, `AUTH-002`, `AUTH-005`), Batch 3b (`DEV-002`, `DEV-004`), `WI-DEV-001`.
**Done looks like**: `docker-compose up` brings up all four (empty) services plus Redis Streams, the Cosmos emulator, and the mock OIDC issuer; each service's `/health` endpoint responds; no domain behavior exists yet.

## M2 — Backend walking skeleton
**Status: Scoped.** Batch 4 (`ORD-004`, `CAT-001`, `ORD-002`, `ORD-003`, `ORD-006`, `ORD-005`, `CAT-003`, `ORD-001`, `QUE-001`) + Batch 5 (`PREF-001`, `PREF-002`, `VEN-001`, `VEN-002`).
**Done looks like**: the full API surface for browsing, cart/checkout (payment stubbed), the order lifecycle, preferences, and vendor onboarding/verification all work, provable via integration tests and direct API calls — no browser UI involved yet.

## M3 — Browser-visible demo
**Status: Scoped.** `EPIC-WEB-CUSTOMER` (`WEB-001`, `CUST-002`, `CUST-003`, `CUST-004`) + `QUE-002`.
*(2026-10-26: `WEB-001` is superseded by `WI-PORT-001`/`WI-PORT-002` (Next.js SSR + GraphQL BFF, ADR-0012/0013); the other items are adjusted. The milestone's "done looks like" is unchanged. Full milestone re-sequencing is tracked in `WI-PORT-006` pass 2.)*
**Done looks like**: a person opens a browser, logs in via the mock issuer's PKCE flow, browses seeded listings, adds to cart, checks out (visibly stubbed payment), sees an order confirmation and history, and watches the corresponding vendor queue display update. This is the demo moment `portfolio-plan.md` originally scoped for Sprint 1/2.

## M4 — Preferences UI + dietary filtering
**Status: Scoped 2026-09-14.** `SRCH-001`, `CUST-005`, `CUST-006` — see those files for full detail; summarized below.
**Done looks like**: a customer can actually set their own allergies/dietary preferences through the browser (not just via direct API call, which is all M2/M3 support), and browsing the catalog reflects those preferences — conflicting items are visibly flagged, with an optional toggle to hide them outright rather than just warn. This is the milestone that actually delivers on vision principle 1 ("dietary safety is first-class... surfaced... not buried") for a real end user, rather than just making the data available.

**Why this was split out from M3 rather than folded into `CUST-002`**: `CUST-002` (browse/detail) is already Ready and has no dependency on `PREF-001`/`PREF-002`/`SRCH-001` — folding personalization into it retroactively would inject a new blocking dependency into an M3 item and put M3 behind M4's prerequisites. Building the personalization as new, additive items (`SRCH-001`, `CUST-006`) on top of the already-scoped `CUST-002` keeps M3 achievable on its own.

## M5 — Admin console UI
**Status: Named, not scoped.** Acknowledged as the next real milestone (vendor verification and listing moderation are API-only even after M2/M4 — `VEN-002`'s endpoints and the moderation-queue endpoints in `data-model-api-contracts.md` have no UI in front of them anywhere). Deliberately not detailed as part of this pass — `ADM-001`/`ADM-002` remain title-only in `epic-catalog.md`. Revisit when it's picked up.

## Explicitly deferred, not part of any milestone above

- **Vendor-facing listing-management UI** — nothing anywhere lets a vendor create/edit listings through a browser (`CAT-001`'s `POST`/`PUT /catalog/listings` endpoints are API-only); seed data (`DEV-004`) covers this for demo purposes. No epic currently even names this as a future app — worth a `PARKING-LOT.md` entry if it's wanted later, not invented here.
- Payment (real Stripe checkout), notifications, reviews, sponsored placement, `web-admin` beyond M5's console — all already named as deferred elsewhere in the backlog; not restated here.

## Related

- `docs/management/project-plan.md` — Phase 2 ("Core Domain Slice") is the phase-level container these milestones sit inside; this document is the finer-grained, runnable-functionality view that phase doesn't itself provide
- `epic-catalog.md` — batch numbering (agent-assignment safety) this file's milestones draw their constituent items from
- `docs/product/vision.md` principle 1 — the product goal M4 is specifically named to close the gap on
